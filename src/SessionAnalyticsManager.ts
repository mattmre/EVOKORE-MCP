import fs from "fs/promises";
import { createReadStream } from "fs";
import readline from "readline";
import path from "path";
import os from "os";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { TrustLedger } from "./TrustLedger";

// Anthropic Sonnet pricing (USD per 1M tokens)
const SONNET_CACHE_READ_PER_MTOK = 0.3;
const SONNET_CACHE_CREATE_PER_MTOK = 3.75;
const SONNET_INPUT_PER_MTOK = 3.0;
const SONNET_OUTPUT_PER_MTOK = 15.0;

// Context pressure thresholds (estimated total tokens)
const COMPACT_STRONG_THRESHOLD = 80_000;
const COMPACT_RECOMMENDED_THRESHOLD = 60_000;
const COMPACT_CONSIDER_THRESHOLD = 40_000;

const DEFAULT_CLAUDE_PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");
const DEFAULT_EVOKORE_SESSIONS_DIR = path.join(os.homedir(), ".evokore", "sessions");

interface ContextTokens {
  cache_read: number;
  cache_creation: number;
  input: number;
  output: number;
  total_estimated: number;
}

interface UsageSnapshot {
  cache_read: number;
  cache_creation: number;
  input: number;
  output: number;
  timestamp: string | null;
  turnCount: number;
}

/**
 * SessionAnalyticsManager exposes token-efficiency analytics over Claude Code
 * session files and EVOKORE replay/evidence JSONL artifacts.
 *
 * Tools:
 * - `session_context_health`: current context pressure + compact suggestions
 * - `session_analyze_replay`: tool usage frequency + retry signals
 * - `session_work_ratio`: evidence-to-replay ratio per session
 *
 * All JSONL reads stream line-by-line via `readline` for memory safety.
 */
export class SessionAnalyticsManager {
  getTools(): Tool[] {
    return [
      {
        name: "session_context_health",
        description:
          "Report current session context pressure: cache read/create tokens, per-turn USD cost, projected cost for next 100 turns, and whether /compact is suggested. Auto-detects the most recently active Claude Code session if no path is provided.",
        inputSchema: {
          type: "object" as const,
          properties: {
            session_path: {
              type: "string",
              description:
                "Optional absolute path to a Claude Code session JSONL file. If omitted, auto-detects the most recently modified session.",
            },
          },
          required: [],
        },
        annotations: {
          title: "Session Context Health",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      } as Tool,
      {
        name: "session_analyze_replay",
        description:
          "Analyze EVOKORE session replay JSONL files to produce tool frequency stats and retry signals (consecutive same-tool repeats that may indicate inefficient read patterns).",
        inputSchema: {
          type: "object" as const,
          properties: {
            project_filter: {
              type: "string",
              description: "Optional substring filter applied to session file names",
            },
            days_back: {
              type: "number",
              description: "Only include session files modified within the last N days (default 30)",
              default: 30,
            },
            min_tool_calls: {
              type: "number",
              description: "Only analyze sessions with at least this many tool calls (default 5)",
              default: 5,
            },
          },
          required: [],
        },
        annotations: {
          title: "Analyze Session Replay",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      } as Tool,
      {
        name: "session_work_ratio",
        description:
          "Compute the ratio of non-empty evidence entries to total replay entries per session. Low ratios indicate many tool calls producing little meaningful work (retry storms, excessive re-reads).",
        inputSchema: {
          type: "object" as const,
          properties: {
            project_filter: {
              type: "string",
              description: "Optional substring filter applied to session file names",
            },
            days_back: {
              type: "number",
              description: "Only include session files modified within the last N days (default 30)",
              default: 30,
            },
            threshold_pct: {
              type: "number",
              description: "Flag sessions whose work_ratio_pct falls below this threshold (default 10)",
              default: 10,
            },
          },
          required: [],
        },
        annotations: {
          title: "Session Work Ratio",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      } as Tool,
      {
        name: "session_trust_report",
        title: "Session Trust Report",
        description:
          "Returns per-agent trust scores, tiers, and multipliers for the current session.",
        inputSchema: {
          type: "object" as const,
          properties: {
            session_id: {
              type: "string",
              description:
                "Session ID to report trust for (defaults to 'default' when omitted).",
            },
          },
          required: [],
        },
        annotations: {
          title: "Session Trust Report",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      } as Tool,
    ];
  }

  isSessionAnalyticsTool(name: string): boolean {
    return (
      name === "session_context_health" ||
      name === "session_analyze_replay" ||
      name === "session_work_ratio" ||
      name === "session_trust_report"
    );
  }

  async handleToolCall(toolName: string, args: any): Promise<any> {
    if (toolName === "session_context_health") {
      return this.handleContextHealth(args);
    }
    if (toolName === "session_analyze_replay") {
      return this.handleAnalyzeReplay(args);
    }
    if (toolName === "session_work_ratio") {
      return this.handleWorkRatio(args);
    }
    if (toolName === "session_trust_report") {
      return this.handleTrustReport(args);
    }
    return null;
  }

  // ---- session_trust_report ----

  private async handleTrustReport(args: any): Promise<any> {
    const sessionId: string = (args && typeof args.session_id === "string" && args.session_id)
      ? args.session_id
      : (process.env.EVOKORE_SESSION_ID || "default");
    const ledger = new TrustLedger(sessionId);
    const report = ledger.getTrustReport();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ session_id: sessionId, ...report }, null, 2),
        },
      ],
    };
  }

  // ---- session_context_health ----

  private async handleContextHealth(args: any): Promise<any> {
    let sessionPath: string | undefined = args?.session_path;

    if (!sessionPath) {
      const autodetected = await this.autoDetectSessionFile();
      if (!autodetected) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `No session file found. Searched ${DEFAULT_CLAUDE_PROJECTS_DIR}. Provide an explicit session_path or ensure Claude Code has created a session.`,
            },
          ],
        };
      }
      sessionPath = autodetected;
    }

    try {
      await fs.access(sessionPath);
    } catch {
      return {
        isError: true,
        content: [{ type: "text", text: `Session file not found: ${sessionPath}` }],
      };
    }

    const usage = await this.readLastUsage(sessionPath);
    if (!usage) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `No usage data found in session file: ${sessionPath}. The session may be empty or malformed.`,
          },
        ],
      };
    }

    const contextTokens: ContextTokens = {
      cache_read: usage.cache_read,
      cache_creation: usage.cache_creation,
      input: usage.input,
      output: usage.output,
      total_estimated:
        usage.cache_read + usage.cache_creation + usage.input + usage.output,
    };

    const costPerTurnUsd =
      (usage.cache_read * SONNET_CACHE_READ_PER_MTOK +
        usage.cache_creation * SONNET_CACHE_CREATE_PER_MTOK +
        usage.input * SONNET_INPUT_PER_MTOK +
        usage.output * SONNET_OUTPUT_PER_MTOK) /
      1_000_000;

    const projected = costPerTurnUsd * 100;

    const { suggested, reason } = this.computeCompactSuggestion(contextTokens.total_estimated);

    const totalCacheInputs = usage.cache_read + usage.cache_creation + usage.input;
    const cacheHitRate =
      totalCacheInputs > 0
        ? Math.round((usage.cache_read / totalCacheInputs) * 1000) / 10
        : 0;

    const parsed = path.parse(sessionPath);
    const result = {
      session_id: parsed.name,
      session_file: sessionPath,
      turn_count: usage.turnCount,
      context_tokens: contextTokens,
      cost_per_turn_usd: Math.round(costPerTurnUsd * 10000) / 10000,
      projected_cost_next_100_turns_usd: Math.round(projected * 100) / 100,
      compact_suggested: suggested,
      compact_reason: reason,
      cache_hit_rate_pct: cacheHitRate,
      last_turn_timestamp: usage.timestamp,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }

  private computeCompactSuggestion(total: number): { suggested: boolean; reason: string } {
    if (total > COMPACT_STRONG_THRESHOLD) {
      return {
        suggested: true,
        reason:
          "Context exceeds 80K threshold. /compact strongly recommended — would reduce per-turn cost ~90%.",
      };
    }
    if (total > COMPACT_RECOMMENDED_THRESHOLD) {
      return {
        suggested: true,
        reason: "Context exceeds 60K. /compact recommended to reduce per-turn cost.",
      };
    }
    if (total > COMPACT_CONSIDER_THRESHOLD) {
      return {
        suggested: true,
        reason: "Context exceeds 40K. Consider /compact if the session continues much longer.",
      };
    }
    return { suggested: false, reason: "Context well below compact threshold." };
  }

  private async autoDetectSessionFile(): Promise<string | null> {
    let projectDirs: string[];
    try {
      const entries = await fs.readdir(DEFAULT_CLAUDE_PROJECTS_DIR, { withFileTypes: true });
      projectDirs = entries
        .filter((e) => e.isDirectory())
        .map((e) => path.join(DEFAULT_CLAUDE_PROJECTS_DIR, e.name));
    } catch {
      return null;
    }

    let best: { file: string; mtime: number } | null = null;
    for (const dir of projectDirs) {
      let files: string[];
      try {
        files = await fs.readdir(dir);
      } catch {
        continue;
      }
      for (const f of files) {
        if (!f.endsWith(".jsonl")) continue;
        const full = path.join(dir, f);
        try {
          const stat = await fs.stat(full);
          const mtime = stat.mtimeMs;
          if (!best || mtime > best.mtime) {
            best = { file: full, mtime };
          }
        } catch {
          // ignore
        }
      }
    }
    return best ? best.file : null;
  }

  private async readLastUsage(sessionPath: string): Promise<UsageSnapshot | null> {
    const stream = createReadStream(sessionPath, { encoding: "utf8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let lastUsage: UsageSnapshot | null = null;
    let turnCount = 0;

    for await (const line of rl) {
      if (!line.trim()) continue;
      let obj: any;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      turnCount++;
      const usage = obj?.message?.usage;
      if (usage && typeof usage === "object") {
        lastUsage = {
          cache_read: toNum(usage.cache_read_input_tokens),
          cache_creation: toNum(usage.cache_creation_input_tokens),
          input: toNum(usage.input_tokens),
          output: toNum(usage.output_tokens),
          timestamp: typeof obj.timestamp === "string" ? obj.timestamp : null,
          turnCount: 0,
        };
      }
    }

    if (lastUsage) {
      lastUsage.turnCount = turnCount;
    }
    return lastUsage;
  }

  // ---- session_analyze_replay ----

  private async handleAnalyzeReplay(args: any): Promise<any> {
    const projectFilter: string | undefined = args?.project_filter;
    const daysBack: number = typeof args?.days_back === "number" ? args.days_back : 30;
    const minToolCalls: number =
      typeof args?.min_tool_calls === "number" ? args.min_tool_calls : 5;

    const replayFiles = await this.listSessionFiles("replay", projectFilter, daysBack);
    if (replayFiles.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                sessions_analyzed: 0,
                period: this.periodLabel(daysBack),
                tool_frequency: {},
                retry_signals: [],
                sessions_with_zero_evidence: 0,
                sessions_with_zero_evidence_pct: 0,
                message: `No replay files found in ${DEFAULT_EVOKORE_SESSIONS_DIR}.`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    const toolCounts = new Map<string, number>();
    const consecutiveRepeats = new Map<string, number>();
    let totalCalls = 0;
    let sessionsAnalyzed = 0;
    let sessionsWithZeroEvidence = 0;

    for (const replayFile of replayFiles) {
      const stats = await this.summarizeReplayFile(replayFile);
      if (stats.toolCalls < minToolCalls) continue;
      sessionsAnalyzed++;
      totalCalls += stats.toolCalls;

      for (const [tool, count] of stats.toolCounts.entries()) {
        toolCounts.set(tool, (toolCounts.get(tool) || 0) + count);
      }
      for (const [tool, count] of stats.consecutiveRepeats.entries()) {
        consecutiveRepeats.set(tool, (consecutiveRepeats.get(tool) || 0) + count);
      }

      // Check for matching evidence file
      const evidenceFile = replayFile.replace(/-replay\.jsonl$/, "-evidence.jsonl");
      try {
        const stat = await fs.stat(evidenceFile);
        if (stat.size === 0) sessionsWithZeroEvidence++;
      } catch {
        sessionsWithZeroEvidence++;
      }
    }

    const toolFrequency: Record<string, { total: number; pct: number; consecutive_repeats: number }> = {};
    for (const [tool, count] of toolCounts.entries()) {
      toolFrequency[tool] = {
        total: count,
        pct: totalCalls > 0 ? Math.round((count / totalCalls) * 1000) / 10 : 0,
        consecutive_repeats: consecutiveRepeats.get(tool) || 0,
      };
    }

    const retrySignals = Array.from(consecutiveRepeats.entries())
      .filter(([, n]) => n > 0)
      .map(([tool, n]) => ({
        tool,
        consecutive_count: n,
        interpretation: this.interpretRepeats(tool, n),
      }))
      .sort((a, b) => b.consecutive_count - a.consecutive_count);

    const zeroPct =
      sessionsAnalyzed > 0
        ? Math.round((sessionsWithZeroEvidence / sessionsAnalyzed) * 1000) / 10
        : 0;

    const result = {
      sessions_analyzed: sessionsAnalyzed,
      period: this.periodLabel(daysBack),
      tool_frequency: toolFrequency,
      retry_signals: retrySignals,
      sessions_with_zero_evidence: sessionsWithZeroEvidence,
      sessions_with_zero_evidence_pct: zeroPct,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }

  private interpretRepeats(tool: string, count: number): string {
    if (tool === "Read" && count > 100) {
      return "High — file re-read pattern. Check for missing @AI:NAV anchors.";
    }
    if (count > 50) {
      return `Moderate — ${tool} repeated ${count} times in a row. Consider batching.`;
    }
    return `Low — ${tool} repeated ${count} times in a row.`;
  }

  private async summarizeReplayFile(filePath: string): Promise<{
    toolCalls: number;
    toolCounts: Map<string, number>;
    consecutiveRepeats: Map<string, number>;
  }> {
    const toolCounts = new Map<string, number>();
    const consecutiveRepeats = new Map<string, number>();
    let toolCalls = 0;
    let prevTool: string | null = null;

    try {
      const stream = createReadStream(filePath, { encoding: "utf8" });
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
      for await (const line of rl) {
        if (!line.trim()) continue;
        let obj: any;
        try {
          obj = JSON.parse(line);
        } catch {
          continue;
        }
        const tool = typeof obj.tool === "string" ? obj.tool : null;
        if (!tool) continue;
        toolCalls++;
        toolCounts.set(tool, (toolCounts.get(tool) || 0) + 1);
        if (prevTool !== null && prevTool === tool) {
          consecutiveRepeats.set(tool, (consecutiveRepeats.get(tool) || 0) + 1);
        }
        prevTool = tool;
      }
    } catch {
      // Unreadable file — return empty stats
    }

    return { toolCalls, toolCounts, consecutiveRepeats };
  }

  // ---- session_work_ratio ----

  private async handleWorkRatio(args: any): Promise<any> {
    const projectFilter: string | undefined = args?.project_filter;
    const daysBack: number = typeof args?.days_back === "number" ? args.days_back : 30;
    const thresholdPct: number =
      typeof args?.threshold_pct === "number" ? args.threshold_pct : 10;

    const replayFiles = await this.listSessionFiles("replay", projectFilter, daysBack);
    if (replayFiles.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                sessions_scored: 0,
                median_work_ratio_pct: 0,
                flagged_sessions: [],
                high_efficiency_sessions: [],
                improvement_signal: `No replay files found in ${DEFAULT_EVOKORE_SESSIONS_DIR}.`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    const scored: Array<{
      session_id: string;
      replay_entries: number;
      evidence_entries: number;
      work_ratio_pct: number;
    }> = [];

    for (const replayFile of replayFiles) {
      const replayCount = await this.countJsonlLines(replayFile);
      if (replayCount === 0) continue;
      const evidenceFile = replayFile.replace(/-replay\.jsonl$/, "-evidence.jsonl");
      const evidenceCount = await this.countJsonlLines(evidenceFile);
      const ratio = Math.round((evidenceCount / replayCount) * 1000) / 10;
      const sessionId = path.basename(replayFile).replace(/-replay\.jsonl$/, "");
      scored.push({
        session_id: sessionId,
        replay_entries: replayCount,
        evidence_entries: evidenceCount,
        work_ratio_pct: ratio,
      });
    }

    const ratios = scored.map((s) => s.work_ratio_pct).sort((a, b) => a - b);
    const median =
      ratios.length === 0
        ? 0
        : ratios.length % 2 === 1
        ? ratios[Math.floor(ratios.length / 2)]
        : Math.round(((ratios[ratios.length / 2 - 1] + ratios[ratios.length / 2]) / 2) * 10) / 10;

    const flagged = scored
      .filter((s) => s.work_ratio_pct < thresholdPct)
      .map((s) => ({
        ...s,
        diagnosis: `Very low evidence density. ${s.replay_entries} tool calls produced only ${s.evidence_entries} significant operations.`,
      }));

    const highEfficiency = scored.filter((s) => s.work_ratio_pct >= 30);

    const improvementSignal =
      flagged.length === 0
        ? "All sessions above threshold — healthy work ratios."
        : `${flagged.length} of ${scored.length} sessions below ${thresholdPct}% work ratio. Investigate replay patterns for inefficient read loops.`;

    const result = {
      sessions_scored: scored.length,
      median_work_ratio_pct: median,
      flagged_sessions: flagged,
      high_efficiency_sessions: highEfficiency,
      improvement_signal: improvementSignal,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }

  private async countJsonlLines(filePath: string): Promise<number> {
    try {
      await fs.access(filePath);
    } catch {
      return 0;
    }
    let count = 0;
    try {
      const stream = createReadStream(filePath, { encoding: "utf8" });
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
      for await (const line of rl) {
        if (line.trim()) count++;
      }
    } catch {
      return 0;
    }
    return count;
  }

  // ---- Shared helpers ----

  private async listSessionFiles(
    kind: "replay" | "evidence",
    projectFilter: string | undefined,
    daysBack: number
  ): Promise<string[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(DEFAULT_EVOKORE_SESSIONS_DIR);
    } catch {
      return [];
    }

    const suffix = kind === "replay" ? "-replay.jsonl" : "-evidence.jsonl";
    const cutoff = daysBack > 0 ? Date.now() - daysBack * 86_400_000 : 0;

    const selected: string[] = [];
    for (const name of entries) {
      if (!name.endsWith(suffix)) continue;
      if (projectFilter && !name.includes(projectFilter)) continue;
      const full = path.join(DEFAULT_EVOKORE_SESSIONS_DIR, name);
      try {
        const stat = await fs.stat(full);
        if (cutoff > 0 && stat.mtimeMs < cutoff) continue;
        selected.push(full);
      } catch {
        // ignore
      }
    }
    return selected;
  }

  private periodLabel(daysBack: number): string {
    const end = new Date();
    const start = new Date(end.getTime() - daysBack * 86_400_000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    return `${fmt(start)} to ${fmt(end)}`;
  }
}

function toNum(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
