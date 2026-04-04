import crypto from "crypto";
import http from "http";
import https from "https";
import { TelemetryManager } from "./TelemetryManager";
import { WebhookManager } from "./WebhookManager";
import { isPrivateAddress } from "./httpUtils";

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500;
const DELIVERY_TIMEOUT_MS = 10000;
const MIN_INTERVAL_MS = 10000;
const DEFAULT_INTERVAL_MS = 60000;

/**
 * Configuration options for TelemetryExporter.
 */
export interface TelemetryExporterOptions {
  /** HTTP(S) URL to POST metrics to. Required when export is enabled. */
  exportUrl?: string;
  /** Export interval in milliseconds. Default 60000, minimum 10000. */
  intervalMs?: number;
  /** HMAC-SHA256 signing secret. Optional. */
  secret?: string;
}

/**
 * The payload envelope sent to the telemetry endpoint.
 */
export interface TelemetryExportPayload {
  id: string;
  timestamp: string;
  event: "telemetry_export";
  version: number;
  metrics: ReturnType<TelemetryManager["getMetrics"]>;
  instanceId: string;
}

/**
 * Result of a single delivery attempt.
 */
interface DeliveryResult {
  success: boolean;
  statusCode?: number;
  error?: string;
}

/**
 * TelemetryExporter periodically pushes TelemetryMetrics snapshots to a
 * configurable HTTP(S) endpoint.
 *
 * Design principles:
 * - Double opt-in: requires both EVOKORE_TELEMETRY=true AND
 *   EVOKORE_TELEMETRY_EXPORT=true.
 * - Metrics only: never exports audit entries, tool names, arguments, or
 *   session IDs.
 * - Privacy first: only aggregate counters, no PII.
 * - Backpressure: skips cycle if previous delivery is still in-flight.
 * - HMAC-SHA256 signing reuses the WebhookManager pattern.
 * - Timer is unref'd to not block process exit.
 */
export class TelemetryExporter {
  private telemetryManager: TelemetryManager;
  private exportUrl: string | undefined;
  private intervalMs: number;
  private secret: string | undefined;
  private enabled: boolean = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight: boolean = false;
  private instanceId: string;
  private readonly httpAgent = new http.Agent({ keepAlive: true });
  private readonly httpsAgent = new https.Agent({ keepAlive: true });

  constructor(telemetryManager: TelemetryManager, options?: TelemetryExporterOptions) {
    this.telemetryManager = telemetryManager;
    this.exportUrl = options?.exportUrl;
    this.secret = options?.secret;
    this.instanceId = crypto.randomUUID();

    // Clamp interval to minimum
    const rawInterval = options?.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.intervalMs = Number.isFinite(rawInterval) && rawInterval >= MIN_INTERVAL_MS
      ? rawInterval
      : DEFAULT_INTERVAL_MS;
  }

  /**
   * Initialize the exporter: validate config, start the periodic timer.
   *
   * No-ops if the double opt-in conditions are not met or the URL is invalid.
   */
  initialize(): void {
    // Double opt-in check
    const telemetryEnabled = process.env.EVOKORE_TELEMETRY === "true";
    const exportEnabled = process.env.EVOKORE_TELEMETRY_EXPORT === "true";

    if (!telemetryEnabled) {
      if (exportEnabled) {
        console.error(
          "[EVOKORE] Telemetry export enabled but EVOKORE_TELEMETRY is not true. Export disabled."
        );
      }
      return;
    }

    if (!exportEnabled) {
      return;
    }

    // Validate URL
    if (!this.exportUrl) {
      console.error("[EVOKORE] Telemetry export enabled but EVOKORE_TELEMETRY_EXPORT_URL is not set. Export disabled.");
      return;
    }

    if (!this.isValidUrl(this.exportUrl)) {
      console.error(
        `[EVOKORE] Telemetry export URL is invalid or not HTTP/HTTPS: ${this.exportUrl}. Export disabled.`
      );
      return;
    }

    this.enabled = true;
    this.startPeriodicExport();

    console.error(
      `[EVOKORE] Telemetry export enabled. Pushing to ${this.exportUrl} every ${this.intervalMs}ms.`
    );
  }

  /**
   * Shut down the exporter: perform a final export and stop the timer.
   */
  async shutdown(): Promise<void> {
    this.stopPeriodicExport();

    if (this.enabled) {
      // Final flush -- best effort
      try {
        await this.exportOnce();
      } catch (err: any) {
        console.error(
          `[EVOKORE] Final telemetry export failed: ${err?.message || err}`
        );
      }
    }

    this.enabled = false;
    this.httpAgent.destroy();
    this.httpsAgent.destroy();
  }

  /**
   * Whether the exporter is active.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Build the export payload from the current metrics snapshot.
   * Exposed for testing.
   */
  buildPayload(): TelemetryExportPayload {
    const metrics = this.telemetryManager.getMetrics();
    return {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      event: "telemetry_export",
      version: metrics.telemetryVersion,
      metrics,
      instanceId: this.instanceId,
    };
  }

  /**
   * Get the configured interval in milliseconds.
   * Exposed for testing.
   */
  getIntervalMs(): number {
    return this.intervalMs;
  }

  /**
   * Get the stable instance ID for this process.
   * Exposed for testing.
   */
  getInstanceId(): string {
    return this.instanceId;
  }

  // ---- Private ----

  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
      // SSRF protection: block private/loopback/link-local addresses to prevent
      // telemetry data from being exfiltrated to internal endpoints.
      if (isPrivateAddress(parsed.hostname)) return false;
      return true;
    } catch {
      return false;
    }
  }

  private startPeriodicExport(): void {
    if (this.timer) return;

    this.timer = setInterval(() => {
      this.tick();
    }, this.intervalMs);

    // Unref so the timer doesn't prevent process exit
    if (this.timer && typeof this.timer.unref === "function") {
      this.timer.unref();
    }
  }

  private stopPeriodicExport(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick(): void {
    // Backpressure: skip if previous delivery is still in-flight
    if (this.inFlight) {
      return;
    }

    this.exportOnce().catch((err) => {
      console.error(
        `[EVOKORE] Telemetry export failed: ${err?.message || err}`
      );
    });
  }

  private async exportOnce(): Promise<void> {
    if (!this.exportUrl) return;

    this.inFlight = true;
    try {
      const payload = this.buildPayload();
      await this.deliverWithRetry(payload);
    } finally {
      this.inFlight = false;
    }
  }

  private async deliverWithRetry(payload: TelemetryExportPayload): Promise<void> {
    let lastError: string | undefined;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
        await this.sleep(backoff);
      }

      const result = await this.deliver(payload);
      if (result.success) {
        return;
      }

      lastError = result.error || `HTTP ${result.statusCode}`;
      console.error(
        `[EVOKORE] Telemetry export attempt ${attempt + 1}/${MAX_RETRIES} failed: ${lastError}`
      );
    }

    throw new Error(lastError || "Unknown delivery error");
  }

  private deliver(payload: TelemetryExportPayload): Promise<DeliveryResult> {
    return new Promise((resolve) => {
      let settled = false;
      const settle = (result: DeliveryResult) => {
        if (!settled) {
          settled = true;
          resolve(result);
        }
      };

      try {
        const body = JSON.stringify(payload);
        const url = new URL(this.exportUrl!);
        const timestamp = Math.floor(Date.now() / 1000);

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "Content-Length": String(Buffer.byteLength(body)),
          "User-Agent": "EVOKORE-MCP/TelemetryExporter",
          "X-EVOKORE-Timestamp": String(timestamp),
        };

        if (this.secret) {
          headers["X-EVOKORE-Signature"] = WebhookManager.computeSignature(
            body,
            this.secret,
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
          agent: url.protocol === "https:" ? this.httpsAgent : this.httpAgent,
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
