import fs from "fs";
import path from "path";
import os from "os";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

const TELEMETRY_DIR = path.join(os.homedir(), ".evokore", "telemetry");
const METRICS_FILE = path.join(TELEMETRY_DIR, "metrics.json");
const DEFAULT_FLUSH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Aggregate telemetry metrics. No PII is collected.
 */
export interface TelemetryMetrics {
  /** Schema version for future evolution. */
  telemetryVersion: number;

  toolCallCount: number;
  toolErrorCount: number;
  sessionCount: number;
  avgLatencyMs: number;
  startTime: string;
  uptime: number;

  /** Session lifecycle metrics. */
  sessions: {
    activeCount: number;
    totalCreated: number;
    totalResumed: number;
    totalExpired: number;
  };

  /** Authentication metrics. */
  auth: {
    successCount: number;
    failureCount: number;
    rateLimitedCount: number;
  };
}

/**
 * Internal mutable state for latency tracking.
 */
interface LatencyAccumulator {
  totalMs: number;
  count: number;
}

/**
 * TelemetryManager collects opt-in, privacy-first usage metrics.
 *
 * Design principles:
 * - Disabled by default; enable with EVOKORE_TELEMETRY=true.
 * - No PII collection ever.
 * - Only aggregate metrics: tool call counts, error rates, session counts, latency.
 * - Local storage only -- metrics are never sent externally.
 * - Periodic flush to disk (every 5 minutes when enabled).
 * - Exposed via get_telemetry and reset_telemetry native tools.
 */
/** Current telemetry schema version. Increment when TelemetryMetrics shape changes. */
const TELEMETRY_VERSION = 2;

export class TelemetryManager {
  private enabled: boolean;
  private toolCallCount: number = 0;
  private toolErrorCount: number = 0;
  private sessionCount: number = 0;
  private latency: LatencyAccumulator = { totalMs: 0, count: 0 };
  private startTime: string;
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private flushIntervalMs: number;

  // Session lifecycle counters
  private sessionsCreated: number = 0;
  private sessionsResumed: number = 0;
  private sessionsExpired: number = 0;
  private sessionsActive: number = 0;

  // Auth counters
  private authSuccess: number = 0;
  private authFailure: number = 0;
  private authRateLimited: number = 0;

  constructor(flushIntervalMs: number = DEFAULT_FLUSH_INTERVAL_MS) {
    this.enabled = process.env.EVOKORE_TELEMETRY === "true";
    this.startTime = new Date().toISOString();
    this.flushIntervalMs = flushIntervalMs;
  }

  /**
   * Initialize telemetry: load persisted metrics and start periodic flush.
   * Safe to call even when disabled (no-ops).
   */
  initialize(): void {
    if (!this.enabled) return;

    this.loadFromDisk();
    this.startPeriodicFlush();

    console.error("[EVOKORE] Telemetry enabled. Metrics stored locally at " + METRICS_FILE);
  }

  /**
   * Shut down: flush final metrics and stop the periodic timer.
   */
  shutdown(): void {
    if (!this.enabled) return;

    this.stopPeriodicFlush();
    this.flushToDisk();
  }

  /**
   * Record a tool call. Optionally include latency in milliseconds.
   */
  recordToolCall(latencyMs?: number): void {
    if (!this.enabled) return;

    this.toolCallCount++;

    if (typeof latencyMs === "number" && latencyMs >= 0) {
      this.latency.totalMs += latencyMs;
      this.latency.count++;
    }
  }

  /**
   * Record a tool error.
   */
  recordToolError(): void {
    if (!this.enabled) return;

    this.toolErrorCount++;
  }

  /**
   * Record a session start.
   */
  recordSessionStart(): void {
    if (!this.enabled) return;

    this.sessionCount++;
    this.sessionsCreated++;
    this.sessionsActive++;
  }

  /**
   * Record a session resume (reattachment).
   */
  recordSessionResume(): void {
    if (!this.enabled) return;

    this.sessionsResumed++;
  }

  /**
   * Record a session expiry or close.
   */
  recordSessionExpire(): void {
    if (!this.enabled) return;

    this.sessionsExpired++;
    if (this.sessionsActive > 0) this.sessionsActive--;
  }

  /**
   * Record a successful authentication event.
   */
  recordAuthSuccess(): void {
    if (!this.enabled) return;

    this.authSuccess++;
  }

  /**
   * Record a failed authentication event.
   */
  recordAuthFailure(): void {
    if (!this.enabled) return;

    this.authFailure++;
  }

  /**
   * Record a rate-limited authentication attempt.
   */
  recordAuthRateLimited(): void {
    if (!this.enabled) return;

    this.authRateLimited++;
  }

  /**
   * Get the current metrics snapshot.
   */
  getMetrics(): TelemetryMetrics {
    return {
      telemetryVersion: TELEMETRY_VERSION,
      toolCallCount: this.toolCallCount,
      toolErrorCount: this.toolErrorCount,
      sessionCount: this.sessionCount,
      avgLatencyMs: this.latency.count > 0
        ? Math.round(this.latency.totalMs / this.latency.count)
        : 0,
      startTime: this.startTime,
      uptime: Date.now() - new Date(this.startTime).getTime(),
      sessions: {
        activeCount: this.sessionsActive,
        totalCreated: this.sessionsCreated,
        totalResumed: this.sessionsResumed,
        totalExpired: this.sessionsExpired,
      },
      auth: {
        successCount: this.authSuccess,
        failureCount: this.authFailure,
        rateLimitedCount: this.authRateLimited,
      },
    };
  }

  /**
   * Reset all metrics to zero.
   */
  resetMetrics(): void {
    this.toolCallCount = 0;
    this.toolErrorCount = 0;
    this.sessionCount = 0;
    this.latency = { totalMs: 0, count: 0 };
    this.startTime = new Date().toISOString();

    this.sessionsCreated = 0;
    this.sessionsResumed = 0;
    this.sessionsExpired = 0;
    this.sessionsActive = 0;

    this.authSuccess = 0;
    this.authFailure = 0;
    this.authRateLimited = 0;

    if (this.enabled) {
      this.flushToDisk();
    }
  }

  /**
   * Whether telemetry collection is enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Manually set the enabled state (useful for testing).
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Force a flush of current metrics to disk.
   */
  flushToDisk(): void {
    try {
      if (!fs.existsSync(TELEMETRY_DIR)) {
        fs.mkdirSync(TELEMETRY_DIR, { recursive: true });
      }

      const metrics = this.getMetrics();
      const data = JSON.stringify(metrics, null, 2);
      fs.writeFileSync(METRICS_FILE, data, "utf-8");
    } catch (err: any) {
      console.error("[EVOKORE] Failed to flush telemetry metrics: " + (err?.message || err));
    }
  }

  /**
   * Load persisted metrics from disk (if any exist).
   */
  loadFromDisk(): void {
    try {
      if (!fs.existsSync(METRICS_FILE)) return;

      const raw = fs.readFileSync(METRICS_FILE, "utf-8");
      const data = JSON.parse(raw);

      if (typeof data.toolCallCount === "number") this.toolCallCount = data.toolCallCount;
      if (typeof data.toolErrorCount === "number") this.toolErrorCount = data.toolErrorCount;
      if (typeof data.sessionCount === "number") this.sessionCount = data.sessionCount;
      if (typeof data.startTime === "string") this.startTime = data.startTime;

      // Reconstruct latency accumulator from avgLatencyMs and toolCallCount
      if (typeof data.avgLatencyMs === "number" && data.avgLatencyMs > 0) {
        this.latency.totalMs = data.avgLatencyMs * this.toolCallCount;
        this.latency.count = this.toolCallCount;
      }

      // Load v2 session/auth counters (backward compatible)
      if (data.sessions && typeof data.sessions === "object") {
        if (typeof data.sessions.totalCreated === "number") this.sessionsCreated = data.sessions.totalCreated;
        if (typeof data.sessions.totalResumed === "number") this.sessionsResumed = data.sessions.totalResumed;
        if (typeof data.sessions.totalExpired === "number") this.sessionsExpired = data.sessions.totalExpired;
        if (typeof data.sessions.activeCount === "number") this.sessionsActive = data.sessions.activeCount;
      }
      if (data.auth && typeof data.auth === "object") {
        if (typeof data.auth.successCount === "number") this.authSuccess = data.auth.successCount;
        if (typeof data.auth.failureCount === "number") this.authFailure = data.auth.failureCount;
        if (typeof data.auth.rateLimitedCount === "number") this.authRateLimited = data.auth.rateLimitedCount;
      }
    } catch (err: any) {
      console.error("[EVOKORE] Failed to load telemetry metrics: " + (err?.message || err));
    }
  }

  /**
   * Get MCP Tool definitions for telemetry tools.
   */
  getTools(): Tool[] {
    return [
      {
        name: "get_telemetry",
        description: "Get current telemetry metrics. Telemetry must be enabled via EVOKORE_TELEMETRY=true. Returns aggregate tool call counts, error rates, session counts, and latency.",
        inputSchema: {
          type: "object" as const,
          properties: {},
          required: []
        },
        annotations: {
          title: "Get Telemetry Metrics",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false
        }
      } as Tool,
      {
        name: "reset_telemetry",
        description: "Reset all telemetry metrics to zero. This clears both in-memory and persisted metrics.",
        inputSchema: {
          type: "object" as const,
          properties: {},
          required: []
        },
        annotations: {
          title: "Reset Telemetry Metrics",
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: false
        }
      } as Tool,
    ];
  }

  /**
   * Handle a tool call for telemetry tools.
   * Returns null if the tool name is not owned by this manager.
   */
  handleToolCall(toolName: string): any | null {
    if (toolName === "get_telemetry") {
      if (!this.enabled) {
        return {
          content: [{
            type: "text",
            text: "Telemetry is disabled. Set EVOKORE_TELEMETRY=true to enable."
          }]
        };
      }

      const metrics = this.getMetrics();
      return {
        content: [{
          type: "text",
          text: JSON.stringify(metrics, null, 2)
        }]
      };
    }

    if (toolName === "reset_telemetry") {
      if (!this.enabled) {
        return {
          content: [{
            type: "text",
            text: "Telemetry is disabled. Set EVOKORE_TELEMETRY=true to enable."
          }]
        };
      }

      this.resetMetrics();
      return {
        content: [{
          type: "text",
          text: "Telemetry metrics have been reset."
        }]
      };
    }

    return null;
  }

  /**
   * Check if a tool name belongs to TelemetryManager.
   */
  isTelemetryTool(toolName: string): boolean {
    return toolName === "get_telemetry" || toolName === "reset_telemetry";
  }

  /**
   * Get the path to the metrics file (for diagnostics/testing).
   */
  static getMetricsFilePath(): string {
    return METRICS_FILE;
  }

  /**
   * Get the telemetry directory path (for diagnostics/testing).
   */
  static getTelemetryDir(): string {
    return TELEMETRY_DIR;
  }

  // ---- Private ----

  private startPeriodicFlush(): void {
    if (this.flushInterval) return;

    this.flushInterval = setInterval(() => {
      this.flushToDisk();
    }, this.flushIntervalMs);

    // Unref so the timer doesn't prevent process exit
    if (this.flushInterval && typeof this.flushInterval.unref === "function") {
      this.flushInterval.unref();
    }
  }

  private stopPeriodicFlush(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }
}
