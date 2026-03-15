import crypto from "crypto";
import http from "http";
import https from "https";
import fs from "fs";
import path from "path";

/**
 * Supported webhook event types.
 */
export type WebhookEventType =
  | "tool_call"
  | "tool_error"
  | "session_start"
  | "session_end"
  | "approval_requested"
  | "approval_granted";

export const WEBHOOK_EVENT_TYPES: readonly WebhookEventType[] = [
  "tool_call",
  "tool_error",
  "session_start",
  "session_end",
  "approval_requested",
  "approval_granted",
] as const;

/**
 * A single webhook subscription from mcp.config.json.
 */
export interface WebhookConfig {
  url: string;
  events: WebhookEventType[];
  secret?: string;
}

/**
 * The payload envelope sent to each webhook endpoint.
 */
export interface WebhookPayload {
  id: string;
  timestamp: string;
  event: WebhookEventType;
  data: Record<string, unknown>;
}

/**
 * Result of a single delivery attempt (used internally for retry logic).
 */
interface DeliveryResult {
  success: boolean;
  statusCode?: number;
  error?: string;
}

const CONFIG_PATH = path.resolve(__dirname, "../mcp.config.json");
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500;
const DELIVERY_TIMEOUT_MS = 10000;

/**
 * WebhookManager dispatches event payloads to configured webhook URLs.
 *
 * Design principles:
 * - Fire-and-forget: emitting an event never blocks the caller.
 * - Retry with exponential backoff: failed deliveries retry up to 3 times.
 * - HMAC signatures: if a webhook has a secret, the payload is signed with
 *   HMAC-SHA256 and the signature is sent in the X-EVOKORE-Signature header.
 * - Opt-in: disabled unless EVOKORE_WEBHOOKS_ENABLED=true.
 */
export class WebhookManager {
  private webhooks: WebhookConfig[] = [];
  private enabled: boolean = false;

  constructor() {
    this.enabled = process.env.EVOKORE_WEBHOOKS_ENABLED === "true";
  }

  /**
   * Load webhook configurations from mcp.config.json.
   * Safe to call even if the config file is missing or has no webhooks key.
   */
  loadWebhooks(configPath: string = CONFIG_PATH): void {
    if (!this.enabled) {
      return;
    }

    try {
      const raw = fs.readFileSync(configPath, "utf8");
      const config = JSON.parse(raw);

      if (!Array.isArray(config.webhooks)) {
        this.webhooks = [];
        return;
      }

      this.webhooks = config.webhooks
        .filter((entry: any) => this.isValidWebhookConfig(entry))
        .map((entry: any) => ({
          url: String(entry.url),
          events: (entry.events as string[]).filter((e) =>
            (WEBHOOK_EVENT_TYPES as readonly string[]).includes(e)
          ) as WebhookEventType[],
          secret: entry.secret ? String(entry.secret) : undefined,
        }));

      if (this.webhooks.length > 0) {
        console.error(
          `[EVOKORE] Loaded ${this.webhooks.length} webhook subscription(s).`
        );
      }
    } catch (error: any) {
      console.error(
        `[EVOKORE] Failed to load webhook config: ${error?.message || error}`
      );
      this.webhooks = [];
    }
  }

  /**
   * Emit an event to all matching webhook subscriptions.
   * This method is fire-and-forget -- it never throws and never blocks.
   */
  emit(event: WebhookEventType, data: Record<string, unknown>): void {
    if (!this.enabled || this.webhooks.length === 0) {
      return;
    }

    const payload: WebhookPayload = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      event,
      data,
    };

    for (const webhook of this.webhooks) {
      if (!webhook.events.includes(event)) {
        continue;
      }

      // Fire-and-forget: launch delivery in the background
      this.deliverWithRetry(webhook, payload).catch((err) => {
        console.error(
          `[EVOKORE] Webhook delivery to ${webhook.url} failed after retries: ${err?.message || err}`
        );
      });
    }
  }

  /**
   * Compute HMAC-SHA256 signature for a payload body.
   */
  static computeSignature(body: string, secret: string): string {
    return crypto
      .createHmac("sha256", secret)
      .update(body, "utf8")
      .digest("hex");
  }

  /**
   * Whether webhooks are enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get loaded webhook configs (for diagnostics).
   */
  getWebhooks(): ReadonlyArray<WebhookConfig> {
    return this.webhooks;
  }

  /**
   * Manually set the enabled state (useful for testing).
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Manually set webhook configs (useful for testing without a config file).
   */
  setWebhooks(webhooks: WebhookConfig[]): void {
    this.webhooks = webhooks;
  }

  // ---- Private ----

  private isValidWebhookConfig(entry: any): boolean {
    if (!entry || typeof entry !== "object") return false;
    if (typeof entry.url !== "string" || !entry.url) return false;
    if (!Array.isArray(entry.events) || entry.events.length === 0) return false;
    return true;
  }

  private async deliverWithRetry(
    webhook: WebhookConfig,
    payload: WebhookPayload
  ): Promise<void> {
    let lastError: string | undefined;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
        await this.sleep(backoff);
      }

      const result = await this.deliver(webhook, payload);
      if (result.success) {
        return;
      }

      lastError = result.error || `HTTP ${result.statusCode}`;
      console.error(
        `[EVOKORE] Webhook delivery attempt ${attempt + 1}/${MAX_RETRIES} to ${webhook.url} failed: ${lastError}`
      );
    }

    throw new Error(lastError || "Unknown delivery error");
  }

  private deliver(
    webhook: WebhookConfig,
    payload: WebhookPayload
  ): Promise<DeliveryResult> {
    return new Promise((resolve) => {
      try {
        const body = JSON.stringify(payload);
        const url = new URL(webhook.url);

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "Content-Length": String(Buffer.byteLength(body)),
          "User-Agent": "EVOKORE-MCP-Webhook/3.0",
        };

        if (webhook.secret) {
          headers["X-EVOKORE-Signature"] = WebhookManager.computeSignature(
            body,
            webhook.secret
          );
        }

        const options: http.RequestOptions = {
          hostname: url.hostname,
          port: url.port || (url.protocol === "https:" ? 443 : 80),
          path: url.pathname + url.search,
          method: "POST",
          headers,
          timeout: DELIVERY_TIMEOUT_MS,
        };

        const transport = url.protocol === "https:" ? https : http;

        const req = transport.request(options, (res) => {
          // Drain the response body
          res.resume();
          res.on("end", () => {
            const statusCode = res.statusCode ?? 0;
            if (statusCode >= 200 && statusCode < 300) {
              resolve({ success: true, statusCode });
            } else {
              resolve({
                success: false,
                statusCode,
                error: `HTTP ${statusCode}`,
              });
            }
          });
        });

        req.on("error", (err) => {
          resolve({ success: false, error: err.message });
        });

        req.on("timeout", () => {
          req.destroy(new Error("Request timeout"));
          resolve({ success: false, error: "Request timeout" });
        });

        req.write(body);
        req.end();
      } catch (err: any) {
        resolve({ success: false, error: err?.message || String(err) });
      }
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
