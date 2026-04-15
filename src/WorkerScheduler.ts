// @AI:NAV[SEC:imports] Import declarations
import fs from "fs";
import path from "path";
import os from "os";
import { ClaimsManager } from "./ClaimsManager";
// @AI:NAV[END:imports]

const DEFAULT_DLQ_PATH = path.join(os.homedir(), ".evokore", "workers", "dead-letter.jsonl");
const CLAIMS_JANITOR_INTERVAL_MS = 300_000; // 5 minutes

// @AI:NAV[SEC:interface-dlqentry] interface DLQEntry
export interface DLQEntry {
  ts: string;
  workerName: string;
  error: string;
  stack?: string;
  attempt: number;
}
// @AI:NAV[END:interface-dlqentry]

/**
 * WorkerScheduler runs background maintenance intervals (e.g. the
 * claims janitor) and routes their failures to a dead-letter queue.
 *
 * - Kill switch: EVOKORE_WORKERS_ENABLED=false disables all intervals.
 * - DLQ lives at ~/.evokore/workers/dead-letter.jsonl and rotates at 5 MB
 *   using the shared scripts/log-rotation.js helper.
 * - All intervals are unref()'d so they never keep the Node process alive.
 * - writeDLQ never throws -- DLQ write failures are swallowed by design.
 *
 * This is distinct from WorkerManager (src/WorkerManager.ts) which exposes
 * the MCP tool surface (`worker_dispatch`, `worker_context`) for on-demand
 * forked worker scripts. WorkerScheduler is the always-on interval runner.
 */
// @AI:NAV[SEC:class-workerscheduler] class WorkerScheduler
export class WorkerScheduler {
  private intervals: ReturnType<typeof setInterval>[] = [];
  private readonly dlqPath: string;
  private readonly enabled: boolean;
  private readonly attemptCounts: Map<string, number>;
  private readonly claimsManager?: ClaimsManager;

  constructor(claimsManager?: ClaimsManager, dlqPath?: string) {
    this.claimsManager = claimsManager;
    this.dlqPath = dlqPath ?? DEFAULT_DLQ_PATH;
    this.enabled = (process.env.EVOKORE_WORKERS_ENABLED ?? "true") !== "false";
    this.attemptCounts = new Map<string, number>();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getDLQPath(): string {
    return this.dlqPath;
  }

  getIntervalCount(): number {
    return this.intervals.length;
  }

  start(): void {
    if (!this.enabled) return;
    // Avoid double-start leaking intervals.
    if (this.intervals.length > 0) return;
    this.startClaimsJanitor();
  }

  stop(): void {
    for (const interval of this.intervals) {
      try {
        clearInterval(interval);
      } catch {
        /* ignore */
      }
    }
    this.intervals = [];
  }

  private startClaimsJanitor(): void {
    const interval = setInterval(async () => {
      await this.runClaimsJanitorTick();
    }, CLAIMS_JANITOR_INTERVAL_MS);
    // Never keep the process alive just for the janitor.
    if (typeof (interval as any).unref === "function") {
      (interval as any).unref();
    }
    this.intervals.push(interval);
  }

  // Exposed for test fake-timer invocations.
  async runClaimsJanitorTick(): Promise<void> {
    const workerName = "claims-janitor";
    try {
      if (this.claimsManager) {
        await this.claimsManager.sweep();
      }
      this.attemptCounts.set(workerName, 0);
    } catch (e) {
      const prev = this.attemptCounts.get(workerName) ?? 0;
      const attempt = prev + 1;
      this.attemptCounts.set(workerName, attempt);
      const err = e as Error;
      this.writeDLQ({
        ts: new Date().toISOString(),
        workerName,
        error: err?.message ?? String(e),
        stack: err?.stack,
        attempt,
      });
    }
  }

  getAttemptCount(workerName: string): number {
    return this.attemptCounts.get(workerName) ?? 0;
  }

  private writeDLQ(entry: DLQEntry): void {
    try {
      fs.mkdirSync(path.dirname(this.dlqPath), { recursive: true });
      // Lazy require so tests/environments without the helper don't explode at import time.
      // __dirname at runtime is dist/, and scripts/log-rotation.js is one level up.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { rotateIfNeeded } = require(path.resolve(__dirname, "..", "scripts", "log-rotation.js"));
      rotateIfNeeded(this.dlqPath);
      const line = JSON.stringify(entry) + "\n";
      fs.appendFileSync(this.dlqPath, line, { flag: "a" });
    } catch {
      /* never throw from DLQ write */
    }
  }
}
// @AI:NAV[END:class-workerscheduler]
