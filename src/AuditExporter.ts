import crypto from "crypto";
import http from "http";
import https from "https";
import { AuditEntry, AuditLog } from "./AuditLog";
import { WebhookManager } from "./WebhookManager";

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500;
const DELIVERY_TIMEOUT_MS = 10000;
const MIN_INTERVAL_MS = 10000;
const DEFAULT_INTERVAL_MS = 60000;
const DEFAULT_BATCH_SIZE = 100;

export interface AuditExporterOptions {
  exportUrl?: string;
  intervalMs?: number;
  secret?: string;
  batchSize?: number;
}

export interface AuditExportPayload {
  id: string;
  timestamp: string;
  event: "audit_export";
  version: number;
  entries: AuditEntry[];
  instanceId: string;
}

interface DeliveryResult {
  success: boolean;
  statusCode?: number;
  error?: string;
}

export class AuditExporter {
  private auditLog: AuditLog;
  private exportUrl: string | undefined;
  private intervalMs: number;
  private secret: string | undefined;
  private batchSize: number;
  private enabled: boolean = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight: boolean = false;
  private instanceId: string;
  private nextOffset: number = 0;

  constructor(auditLog: AuditLog, options?: AuditExporterOptions) {
    this.auditLog = auditLog;
    this.exportUrl = options?.exportUrl;
    this.secret = options?.secret;
    this.instanceId = crypto.randomUUID();

    const rawInterval = options?.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.intervalMs = Number.isFinite(rawInterval) && rawInterval >= MIN_INTERVAL_MS
      ? rawInterval
      : DEFAULT_INTERVAL_MS;

    const rawBatchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;
    this.batchSize = Number.isFinite(rawBatchSize) && rawBatchSize > 0
      ? Math.floor(rawBatchSize)
      : DEFAULT_BATCH_SIZE;
  }

  initialize(): void {
    const auditEnabled = process.env.EVOKORE_AUDIT_LOG === "true";
    const exportEnabled = process.env.EVOKORE_AUDIT_EXPORT === "true";

    if (!auditEnabled || !this.auditLog.isEnabled()) {
      if (exportEnabled) {
        console.error(
          "[EVOKORE] Audit export enabled but the local AuditLog is not active. Export disabled."
        );
      }
      return;
    }

    if (!exportEnabled) {
      return;
    }

    if (!this.exportUrl) {
      console.error("[EVOKORE] Audit export enabled but EVOKORE_AUDIT_EXPORT_URL is not set. Export disabled.");
      return;
    }

    if (!this.isValidUrl(this.exportUrl)) {
      console.error(
        `[EVOKORE] Audit export URL is invalid or not HTTP/HTTPS: ${this.exportUrl}. Export disabled.`
      );
      return;
    }

    this.nextOffset = this.auditLog.getEntryCount();
    this.enabled = true;
    this.startPeriodicExport();

    console.error(
      `[EVOKORE] Audit export enabled. Pushing to ${this.exportUrl} every ${this.intervalMs}ms (batch size ${this.batchSize}).`
    );
  }

  async shutdown(): Promise<void> {
    this.stopPeriodicExport();

    if (this.enabled) {
      try {
        await this.exportOnce();
      } catch (err: any) {
        console.error(`[EVOKORE] Final audit export failed: ${err?.message || err}`);
      }
    }

    this.enabled = false;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  buildPayload(entries: AuditEntry[]): AuditExportPayload {
    return {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      event: "audit_export",
      version: 1,
      entries,
      instanceId: this.instanceId,
    };
  }

  getIntervalMs(): number {
    return this.intervalMs;
  }

  getBatchSize(): number {
    return this.batchSize;
  }

  getInstanceId(): string {
    return this.instanceId;
  }

  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  private startPeriodicExport(): void {
    if (this.timer) return;

    this.timer = setInterval(() => {
      this.tick();
    }, this.intervalMs);

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
    if (this.inFlight) {
      return;
    }

    this.exportOnce().catch((err) => {
      console.error(`[EVOKORE] Audit export failed: ${err?.message || err}`);
    });
  }

  private async exportOnce(): Promise<void> {
    if (!this.exportUrl) return;

    this.inFlight = true;
    try {
      while (true) {
        const currentCount = this.auditLog.getEntryCount();
        if (currentCount < this.nextOffset) {
          this.nextOffset = 0;
        }

        const entries = this.auditLog.getEntriesChronological(this.batchSize, this.nextOffset);
        if (entries.length === 0) {
          return;
        }

        const payload = this.buildPayload(entries);
        await this.deliverWithRetry(payload);
        this.nextOffset += entries.length;

        if (entries.length < this.batchSize) {
          return;
        }
      }
    } finally {
      this.inFlight = false;
    }
  }

  private async deliverWithRetry(payload: AuditExportPayload): Promise<void> {
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
        `[EVOKORE] Audit export attempt ${attempt + 1}/${MAX_RETRIES} failed: ${lastError}`
      );
    }

    throw new Error(lastError || "Unknown delivery error");
  }

  private deliver(payload: AuditExportPayload): Promise<DeliveryResult> {
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
          "User-Agent": "EVOKORE-MCP/AuditExporter",
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
        };

        const transport = url.protocol === "https:" ? https : http;

        const req = transport.request(options, (res) => {
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
