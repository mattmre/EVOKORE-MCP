/**
 * TelemetryIndex — Append-only JSONL sink for routing telemetry.
 *
 * Records every `resolveWorkflow()` invocation: the raw query, the top-ranked
 * candidate, and the top-5 candidate names. Optional execution outcomes are
 * patched back onto a prior entry via `recordExecution(ts, skillName, success)`
 * so the reranker can learn from observed success rates.
 *
 * Storage: `~/.evokore/routing-telemetry.jsonl` (one JSON object per line).
 * Append is process-safe via `fs.appendFileSync(..., { flag: "a" })` (the same
 * O_APPEND pattern used in `SessionManifest.ts`).
 */

import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as readline from "node:readline";

export interface RoutingTelemetryEntry {
  ts: string;
  sessionId?: string;
  query: string;
  topCandidate: string;
  candidates: string[];
  success?: boolean;
  executedSkill?: string;
}

export interface SkillSuccessData {
  rate: number;
  count: number;
}

function resolveDefaultPath(): string {
  const home = process.env.EVOKORE_HOME ?? path.join(os.homedir(), ".evokore");
  return path.join(home, "routing-telemetry.jsonl");
}

export class TelemetryIndex {
  private readonly filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? resolveDefaultPath();
  }

  getFilePath(): string {
    return this.filePath;
  }

  /**
   * Append one routing telemetry entry. Never throws — routing must not be
   * blocked by a telemetry I/O failure.
   */
  async append(entry: RoutingTelemetryEntry): Promise<void> {
    try {
      await fsp.mkdir(path.dirname(this.filePath), { recursive: true });
      fs.appendFileSync(
        this.filePath,
        JSON.stringify(entry) + "\n",
        { flag: "a" },
      );
    } catch {
      // Swallow — telemetry is best-effort.
    }
  }

  /**
   * Read every entry. Returns an empty array when the file does not exist or
   * cannot be parsed.
   */
  async readAll(): Promise<RoutingTelemetryEntry[]> {
    if (!fs.existsSync(this.filePath)) return [];

    return new Promise((resolve) => {
      const entries: RoutingTelemetryEntry[] = [];
      let stream: fs.ReadStream;
      try {
        stream = fs.createReadStream(this.filePath);
      } catch {
        resolve([]);
        return;
      }
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
      rl.on("line", (raw) => {
        const trimmed = raw.trim();
        if (!trimmed) return;
        try {
          const parsed = JSON.parse(trimmed) as RoutingTelemetryEntry;
          if (parsed && typeof parsed === "object") entries.push(parsed);
        } catch {
          // Skip corrupt lines.
        }
      });
      rl.on("close", () => resolve(entries));
      rl.on("error", () => resolve(entries));
    });
  }

  async readRecent(n: number): Promise<RoutingTelemetryEntry[]> {
    if (n <= 0) return [];
    const all = await this.readAll();
    if (all.length <= n) return all;
    return all.slice(all.length - n);
  }

  async totalRows(): Promise<number> {
    const all = await this.readAll();
    return all.length;
  }

  /**
   * Patch the entry with matching `ts` to record an execution outcome. Rewrites
   * the file atomically (write-to-tmp, rename). Intended for infrequent use.
   */
  async recordExecution(ts: string, skillName: string, success: boolean): Promise<void> {
    const all = await this.readAll();
    if (all.length === 0) return;

    let patched = false;
    for (const entry of all) {
      if (entry.ts === ts) {
        entry.executedSkill = skillName;
        entry.success = success;
        patched = true;
      }
    }
    if (!patched) return;

    const tmpPath = `${this.filePath}.tmp`;
    const body = all.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await fsp.writeFile(tmpPath, body, "utf-8");
    await fsp.rename(tmpPath, this.filePath);
  }

  /**
   * Compute success rates keyed by `topCandidate`. Only entries with `success`
   * set (true/false) are folded; queries without an observed outcome are
   * skipped.
   */
  async getSuccessRates(): Promise<Map<string, SkillSuccessData>> {
    const all = await this.readAll();
    const counts = new Map<string, { successes: number; count: number }>();

    for (const entry of all) {
      if (typeof entry.success !== "boolean") continue;
      const key = entry.topCandidate;
      if (!key) continue;
      const prev = counts.get(key) ?? { successes: 0, count: 0 };
      prev.count += 1;
      if (entry.success) prev.successes += 1;
      counts.set(key, prev);
    }

    const out = new Map<string, SkillSuccessData>();
    for (const [name, { successes, count }] of counts) {
      out.set(name, {
        rate: count > 0 ? successes / count : 0,
        count,
      });
    }
    return out;
  }
}
