import fs from "fs/promises";
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
  async initialize(): Promise<void> {
    if (!this.enabled) return;

    await this.loadFromDiskAsync();
    this.startPeriodicFlush();

    console.error("[EVOKORE] Telemetry enabled. Metrics stored locally at " + METRICS_FILE);
  }

  /**
   * Shut down: flush final metrics and stop the periodic timer.
   */
  async shutdown(): Promise<void> {
    if (!this.enabled) return;

    this.stopPeriodicFlush();
    await this.flushToDiskAsync();
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
   * Render the current telemetry snapshot in Prometheus text exposition format.
   */
  getPrometheusMetrics(): string {
    const metrics = this.getMetrics();
    const processStartTimeSeconds = Math.floor(new Date(metrics.startTime).getTime() / 1000);
    const lines = [
      "# HELP evokore_telemetry_enabled Whether EVOKORE telemetry collection is enabled.",
      "# TYPE evokore_telemetry_enabled gauge",
      `evokore_telemetry_enabled ${this.enabled ? 1 : 0}`,
      "# HELP evokore_telemetry_schema_version Telemetry schema version exposed by the runtime.",
      "# TYPE evokore_telemetry_schema_version gauge",
      `evokore_telemetry_schema_version ${metrics.telemetryVersion}`,
      "# HELP evokore_tool_calls_total Total MCP tool calls recorded by telemetry.",
      "# TYPE evokore_tool_calls_total counter",
      `evokore_tool_calls_total ${metrics.toolCallCount}`,
      "# HELP evokore_tool_errors_total Total MCP tool call errors recorded by telemetry.",
      "# TYPE evokore_tool_errors_total counter",
      `evokore_tool_errors_total ${metrics.toolErrorCount}`,
      "# HELP evokore_tool_latency_average_milliseconds Average MCP tool latency in milliseconds.",
      "# TYPE evokore_tool_latency_average_milliseconds gauge",
      `evokore_tool_latency_average_milliseconds ${metrics.avgLatencyMs}`,
      "# HELP evokore_sessions_started_total Total EVOKORE sessions started since telemetry reset.",
      "# TYPE evokore_sessions_started_total counter",
      `evokore_sessions_started_total ${metrics.sessionCount}`,
      "# HELP evokore_sessions_active Current number of active EVOKORE sessions.",
      "# TYPE evokore_sessions_active gauge",
      `evokore_sessions_active ${metrics.sessions.activeCount}`,
      "# HELP evokore_sessions_created_total Total EVOKORE sessions created since telemetry reset.",
      "# TYPE evokore_sessions_created_total counter",
      `evokore_sessions_created_total ${metrics.sessions.totalCreated}`,
      "# HELP evokore_sessions_resumed_total Total EVOKORE session resumptions since telemetry reset.",
      "# TYPE evokore_sessions_resumed_total counter",
      `evokore_sessions_resumed_total ${metrics.sessions.totalResumed}`,
      "# HELP evokore_sessions_expired_total Total EVOKORE session expirations since telemetry reset.",
      "# TYPE evokore_sessions_expired_total counter",
      `evokore_sessions_expired_total ${metrics.sessions.totalExpired}`,
      "# HELP evokore_auth_success_total Total successful auth checks recorded by telemetry.",
      "# TYPE evokore_auth_success_total counter",
      `evokore_auth_success_total ${metrics.auth.successCount}`,
      "# HELP evokore_auth_failure_total Total failed auth checks recorded by telemetry.",
      "# TYPE evokore_auth_failure_total counter",
      `evokore_auth_failure_total ${metrics.auth.failureCount}`,
      "# HELP evokore_auth_rate_limited_total Total rate-limited auth checks recorded by telemetry.",
      "# TYPE evokore_auth_rate_limited_total counter",
      `evokore_auth_rate_limited_total ${metrics.auth.rateLimitedCount}`,
      "# HELP evokore_process_start_time_seconds Unix time when telemetry counters were last initialized or reset.",
      "# TYPE evokore_process_start_time_seconds gauge",
      `evokore_process_start_time_seconds ${processStartTimeSeconds}`,
      "# HELP evokore_uptime_milliseconds Telemetry runtime uptime in milliseconds.",
      "# TYPE evokore_uptime_milliseconds gauge",
      `evokore_uptime_milliseconds ${metrics.uptime}`,
    ];

    return `${lines.join("\n")}\n`;
  }

  /**
   * Reset all metrics to zero.
   */
  async resetMetrics(): Promise<void> {
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
      await this.flushToDiskAsync();
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
   * Force a flush of current metrics to disk (async).
   */
  async flushToDiskAsync(): Promise<void> {
    try {
      const dirExists = await fs.access(TELEMETRY_DIR).then(() => true).catch(() => false);
      if (!dirExists) {
        await fs.mkdir(TELEMETRY_DIR, { recursive: true });
      }

      const metrics = this.getMetrics();
      const data = JSON.stringify({
        ...metrics,
        latencyTotalMs: this.latency.totalMs,
        latencyCount: this.latency.count,
      }, null, 2);
      await fs.writeFile(METRICS_FILE, data, "utf-8");
    } catch (err: any) {
      console.error("[EVOKORE] Failed to flush telemetry metrics: " + (err?.message || err));
    }
  }

  /**
   * Load persisted metrics from disk (async).
   */
  async loadFromDiskAsync(): Promise<void> {
    try {
      const fileExists = await fs.access(METRICS_FILE).then(() => true).catch(() => false);
      if (!fileExists) return;

      const raw = await fs.readFile(METRICS_FILE, "utf-8");
      const data = JSON.parse(raw);

      if (typeof data.toolCallCount === "number") this.toolCallCount = data.toolCallCount;
      if (typeof data.toolErrorCount === "number") this.toolErrorCount = data.toolErrorCount;
      if (typeof data.sessionCount === "number") this.sessionCount = data.sessionCount;
      if (typeof data.startTime === "string") this.startTime = data.startTime;

      // Restore precise latency accumulator if available
      if (typeof data.latencyTotalMs === "number" && typeof data.latencyCount === "number") {
        this.latency.totalMs = data.latencyTotalMs;
        this.latency.count = data.latencyCount;
      } else if (typeof data.avgLatencyMs === "number" && data.avgLatencyMs > 0) {
        // backward compat: reconstruct from average (imprecise but OK for old data)
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

      this.resetMetrics().catch((err: any) => console.error('[TelemetryManager] reset failed:', err));
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
      this.flushToDiskAsync().catch((err: any) => {
        console.error("[EVOKORE] Periodic telemetry flush failed: " + (err?.message || err));
      });
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
