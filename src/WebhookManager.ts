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
  | "session_resumed"
  | "approval_requested"
  | "approval_granted"
  | "plugin_loaded"
  | "plugin_unloaded"
  | "plugin_load_error";

export const WEBHOOK_EVENT_TYPES: readonly WebhookEventType[] = [
  "tool_call",
  "tool_error",
  "session_start",
  "session_end",
  "session_resumed",
  "approval_requested",
  "approval_granted",
  "plugin_loaded",
  "plugin_unloaded",
  "plugin_load_error",
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
  /** Maximum age (in milliseconds) for replay protection. Defaults to 5 minutes. */
  static readonly REPLAY_WINDOW_MS = 300_000;

  private webhooks: WebhookConfig[] = [];
  private enabled: boolean = false;
  private subscribers: Map<string, Array<{ pluginId: string; handler: (event: WebhookPayload) => void }>> = new Map();

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
    const hasSubscribers = this.subscribers.has(event) && this.subscribers.get(event)!.length > 0;
    const hasWebhooks = this.enabled && this.webhooks.length > 0;

    if (!hasWebhooks && !hasSubscribers) {
      return;
    }

    const payload: WebhookPayload = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      event,
      data,
    };

    // Deliver to configured HTTP webhook endpoints
    if (hasWebhooks) {
      for (const webhook of this.webhooks) {
        if (!webhook.events.includes(event)) {
          continue;
        }

        // Fire-and-forget: launch delivery in the background
        this.deliverWithRetry(webhook, payload).catch((err) => {
          const safeUrl = (() => { try { const u = new URL(webhook.url); return `${u.origin}${u.pathname}`; } catch { return '[invalid-url]'; } })();
          console.error(
            `[EVOKORE] Webhook delivery to ${safeUrl} failed after retries: ${err?.message || err}`
          );
        });
      }
    }

    // Notify plugin subscribers (fire-and-forget, errors logged)
    if (hasSubscribers) {
      const subs = this.subscribers.get(event)!;
      for (const sub of subs) {
        try {
          sub.handler(payload);
        } catch (err: any) {
          console.error(`[EVOKORE] Plugin ${sub.pluginId} webhook handler error:`, err);
        }
      }
    }
  }

  /**
   * Compute HMAC-SHA256 signature for a payload body.
   *
   * When `timestamp` is provided, the HMAC is computed over `${timestamp}.${body}`
   * to bind the signature to a specific point in time (replay protection).
   * When omitted, the HMAC is computed over `body` alone (backward compatible).
   */
  static computeSignature(body: string, secret: string, timestamp?: number): string {
    const message = timestamp !== undefined ? `${timestamp}.${body}` : body;
    return crypto
      .createHmac("sha256", secret)
      .update(message, "utf8")
      .digest("hex");
  }

  /**
   * Verify an HMAC-SHA256 signature using timing-safe comparison.
   *
   * When `timestamp` is provided, the method also enforces a replay-protection
   * window: if the timestamp is older (or newer) than `maxAgeMs` (defaults to
   * `REPLAY_WINDOW_MS`, 5 minutes), the signature is rejected.
   *
   * When `timestamp` is omitted, verification falls back to body-only HMAC
   * comparison for backward compatibility.
   *
   * @param body - The raw request body string to verify.
   * @param secret - The shared HMAC secret.
   * @param receivedSignature - The signature received in the request header.
   * @param timestamp - Unix epoch in seconds (not milliseconds).
   * @param maxAgeMs - Maximum age in milliseconds (not seconds). Defaults to
   *   REPLAY_WINDOW_MS (300 000 ms / 5 minutes) if null or undefined. Clamped
   *   to a maximum of 1 hour (3 600 000 ms) to prevent excessively wide
   *   replay windows.
   * @returns `true` if the signature is valid and within the replay window.
   */
  static verifySignature(
    body: string,
    secret: string,
    receivedSignature: string,
    timestamp?: number,
    maxAgeMs?: number,
  ): boolean {
    if (timestamp !== undefined) {
      const ts = Math.floor(timestamp);
      const nowSeconds = Date.now() / 1000;
      const effectiveMaxAge = maxAgeMs ?? WebhookManager.REPLAY_WINDOW_MS;
      if (effectiveMaxAge > 3_600_000) {
        console.warn(`[WebhookManager] verifySignature maxAgeMs=${effectiveMaxAge} exceeds 1 hour — clamped to 3600000ms`);
      }
      const windowSeconds = Math.min(effectiveMaxAge, 3_600_000) / 1000;
      if (Math.abs(nowSeconds - ts) > windowSeconds) {
        return false;
      }
    }

    const expected = WebhookManager.computeSignature(body, secret, timestamp);
    const expectedBuf = Buffer.from(expected, 'hex');
    const receivedBuf = Buffer.from(receivedSignature, 'hex');
    if (expectedBuf.length !== receivedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
  }

  /**
   * Whether webhooks are enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get loaded webhook configs (for diagnostics).
   * Secrets are omitted; only a boolean `hasSecret` flag is exposed.
   */
  getWebhooks(): ReadonlyArray<Omit<WebhookConfig, 'secret'> & { hasSecret: boolean }> {
    return this.webhooks.map(w => ({
      url: w.url,
      events: [...w.events],
      hasSecret: !!w.secret,
    }));
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

  /**
   * Subscribe a plugin to a specific webhook event type.
   * The handler is called synchronously (fire-and-forget) whenever the event is emitted.
   */
  subscribe(eventType: string, pluginId: string, handler: (event: WebhookPayload) => void): void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, []);
    }
    this.subscribers.get(eventType)!.push({ pluginId, handler });
  }

  /**
   * Remove all subscriptions for a given plugin (used during plugin unload/reload).
   */
  unsubscribeAll(pluginId: string): void {
    for (const [eventType, handlers] of this.subscribers.entries()) {
      this.subscribers.set(eventType, handlers.filter(h => h.pluginId !== pluginId));
    }
  }

  // ---- Private ----

  private isValidWebhookConfig(entry: any): boolean {
    if (!entry || typeof entry !== "object") return false;
    if (typeof entry.url !== "string" || !entry.url) return false;
    if (!Array.isArray(entry.events) || entry.events.length === 0) return false;
    try {
      const u = new URL(entry.url);
      if (u.protocol !== "http:" && u.protocol !== "https:") return false;
      // Block SSRF via private/loopback addresses
      const hostname = u.hostname.toLowerCase();
      const isPrivate = hostname === 'localhost' ||
        /^127\./.test(hostname) ||
        /^10\./.test(hostname) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
        /^192\.168\./.test(hostname) ||
        /^169\.254\./.test(hostname) ||
        hostname === '0.0.0.0' ||
        hostname === '::1' ||
        /^::ffff:/i.test(hostname) ||
        /^fc00:/i.test(hostname) ||
        /^fe80:/i.test(hostname);
      if (isPrivate && process.env.EVOKORE_WEBHOOKS_ALLOW_PRIVATE !== 'true') return false;
    } catch {
      return false;
    }
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
      const safeUrl = (() => { try { const u = new URL(webhook.url); return `${u.origin}${u.pathname}`; } catch { return '[invalid-url]'; } })();
      console.error(
        `[EVOKORE] Webhook delivery attempt ${attempt + 1}/${MAX_RETRIES} to ${safeUrl} failed: ${lastError}`
      );
    }

    throw new Error(lastError || "Unknown delivery error");
  }

  private deliver(
    webhook: WebhookConfig,
    payload: WebhookPayload
  ): Promise<DeliveryResult> {
    return new Promise((resolve) => {
      let settled = false;
      const settle = (result: DeliveryResult) => {
        if (!settled) { settled = true; resolve(result); }
      };

      try {
        const body = JSON.stringify(payload);
        const url = new URL(webhook.url);
        const timestamp = Math.floor(Date.now() / 1000);

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "Content-Length": String(Buffer.byteLength(body)),
          "User-Agent": "EVOKORE-MCP-Webhook/3.0",
          "X-EVOKORE-Timestamp": String(timestamp),
          "X-EVOKORE-Nonce": payload.id,
        };

        if (webhook.secret) {
          headers["X-EVOKORE-Signature"] = WebhookManager.computeSignature(
            body,
            webhook.secret,
            timestamp,
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
              settle({ success: true, statusCode });
            } else {
              settle({
                success: false,
                statusCode,
                error: `HTTP ${statusCode}`,
              });
            }
          });
        });

        req.on("error", (err) => {
          settle({ success: false, error: err.message });
        });

        req.on("timeout", () => {
          req.destroy(new Error("Request timeout"));
          settle({ success: false, error: "Request timeout" });
        });

        req.write(body);
        req.end();
      } catch (err: any) {
        settle({ success: false, error: err?.message || String(err) });
      }
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
