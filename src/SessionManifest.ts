/**
 * SessionManifest — Append-only JSONL session state for EVOKORE-MCP.
 *
 * Replaces the pre-v3.1 `{sessionId}.json` read-modify-write pattern with an
 * append-only JSONL log. Each hook process appends one JSON line per event;
 * the folded `SessionManifestState` is reconstructed on read.
 *
 * See `docs/adr/0001-session-manifest-jsonl.md` for the architectural
 * decision and `scripts/session-continuity.js` `buildBaseState()` for the
 * legacy folded shape this module reproduces.
 *
 * Contract:
 *   - `appendEvent` never throws — hook scripts MUST NOT crash Claude Code.
 *   - `readManifest` folds lines left-to-right; later values win for the
 *     same key; corrupt lines are silently skipped.
 *   - `compactIfNeeded` atomically rewrites the JSONL file as a single
 *     `__snapshot__` line when the file exceeds `maxBytes` (default 1 MB),
 *     and also writes a legacy `{sessionId}.json` snapshot for reader
 *     compatibility during the Phase 0-C / 0-D migration window.
 */

// @AI:NAV[SEC:imports] Import declarations
import * as fs from "node:fs";
import * as readline from "node:readline";
import * as os from "node:os";
import * as path from "node:path";

import {
// @AI:NAV[END:imports]
  SCHEMA_VERSION,
  SessionEvent,
  SessionEventType,
  SessionManifestState,
} from "./SessionManifest.schema";

const SNAPSHOT_TYPE = "__snapshot__";
const DEFAULT_COMPACT_THRESHOLD_BYTES = 1_000_000; // 1 MB

// @AI:NAV[SEC:function-resolveevokorehome] function resolveEvokoreHome
function resolveEvokoreHome(): string {
  return process.env.EVOKORE_HOME ?? path.join(os.homedir(), ".evokore");
}
// @AI:NAV[END:function-resolveevokorehome]

// @AI:NAV[SEC:function-resolvesessionsdir] function resolveSessionsDir
function resolveSessionsDir(): string {
  return path.join(resolveEvokoreHome(), "sessions");
}
// @AI:NAV[END:function-resolvesessionsdir]

// @AI:NAV[SEC:function-ensuresessionsdir] function ensureSessionsDir
function ensureSessionsDir(): void {
  fs.mkdirSync(resolveSessionsDir(), { recursive: true });
}
// @AI:NAV[END:function-ensuresessionsdir]

// @AI:NAV[SEC:function-sanitizesessionid] function sanitizeSessionId
function sanitizeSessionId(sessionId: string): string {
  return String(sessionId).replace(/[^a-zA-Z0-9_-]/g, "_");
}
// @AI:NAV[END:function-sanitizesessionid]

// @AI:NAV[SEC:function-getmanifestpath] function getManifestPath
export function getManifestPath(sessionId: string): string {
  return path.join(resolveSessionsDir(), `${sanitizeSessionId(sessionId)}.jsonl`);
}
// @AI:NAV[END:function-getmanifestpath]

// @AI:NAV[SEC:function-getlegacysnapshotpath] function getLegacySnapshotPath
export function getLegacySnapshotPath(sessionId: string): string {
  return path.join(resolveSessionsDir(), `${sanitizeSessionId(sessionId)}.json`);
}
// @AI:NAV[END:function-getlegacysnapshotpath]

/**
 * Append one event to the session manifest. Never throws.
 *
 * The caller supplies only `type` and `payload`; this function stamps
 * `schemaVersion`, `ts`, and `sessionId` before serializing.
 */
// @AI:NAV[SEC:function-appendevent] function appendEvent
export function appendEvent(
  sessionId: string,
  event: Omit<SessionEvent, "schemaVersion" | "ts" | "sessionId">,
): void {
  try {
    ensureSessionsDir();
    const line: SessionEvent = {
      schemaVersion: SCHEMA_VERSION,
      ts: new Date().toISOString(),
      sessionId,
      type: event.type,
      payload: event.payload,
    };
    fs.appendFileSync(
      getManifestPath(sessionId),
      JSON.stringify(line) + "\n",
      { flag: "a" },
    );
  } catch {
    // Swallow — hooks must never crash Claude Code.
  }
}
// @AI:NAV[END:function-appendevent]

/**
 * Read the full session manifest and return the folded state, or `null`
 * if no manifest exists for this session.
 */
// @AI:NAV[SEC:async-function-readmanifest] async function readManifest
export async function readManifest(
  sessionId: string,
): Promise<SessionManifestState | null> {
  const manifestPath = getManifestPath(sessionId);
  if (!fs.existsSync(manifestPath)) return null;

  return new Promise((resolve) => {
    const state: SessionManifestState = {
      continuityVersion: SCHEMA_VERSION,
      sessionId: sanitizeSessionId(sessionId),
    };
    let stream: fs.ReadStream;
    try {
      stream = fs.createReadStream(manifestPath);
    } catch {
      resolve(null);
      return;
    }
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    rl.on("line", (raw) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      try {
        const evt = JSON.parse(trimmed) as SessionEvent;
        foldEvent(state, evt);
      } catch {
        // Skip corrupt lines.
      }
    });
    rl.on("close", () => resolve(state));
    rl.on("error", () => resolve(null));
    stream.on("error", () => {
      rl.close();
      resolve(null);
    });
  });
}
// @AI:NAV[END:async-function-readmanifest]

// @AI:NAV[SEC:function-foldevent] function foldEvent
function foldEvent(state: SessionManifestState, evt: SessionEvent): void {
  if (!evt || typeof evt !== "object") return;

  // Snapshot lines produced by compaction replace state wholesale.
  if ((evt.type as string) === SNAPSHOT_TYPE) {
    const snap = evt.payload as SessionManifestState | undefined;
    if (snap && typeof snap === "object") {
      Object.assign(state, snap);
    }
    return;
  }

  if (typeof evt.ts === "string" && evt.ts) {
    state.updatedAt = evt.ts;
  }

  switch (evt.type) {
    case "session_initialized": {
      const p = (evt.payload ?? {}) as {
        workspaceRoot?: string;
        canonicalRepoRoot?: string;
        repoName?: string;
      };
      if (!state.createdAt) {
        state.created = evt.ts;
        state.createdAt = evt.ts;
      }
      if (p.workspaceRoot) state.workspaceRoot = p.workspaceRoot;
      if (p.canonicalRepoRoot) state.canonicalRepoRoot = p.canonicalRepoRoot;
      if (p.repoName) state.repoName = p.repoName;
      state.status = "awaiting-purpose";
      if (state.purpose === undefined) state.purpose = null;
      break;
    }
    case "purpose_recorded": {
      const p = (evt.payload ?? {}) as {
        purpose?: string;
        mode?: string;
        modeSetAt?: string;
        purposeSetAt?: string;
      };
      state.purpose = p.purpose ?? null;
      state.status = "active";
      state.lastActivityAt = evt.ts;
      state.lastPromptAt = evt.ts;
      if (p.purposeSetAt) state.purposeSetAt = p.purposeSetAt;
      if (p.modeSetAt) state.set_at = p.modeSetAt;
      break;
    }
    case "purpose_reminder": {
      state.status = "active";
      state.lastPromptAt = evt.ts;
      state.lastActivityAt = evt.ts;
      break;
    }
    case "tool_invoked": {
      const p = (evt.payload ?? {}) as { tool?: string };
      state.lastToolName = p.tool;
      state.lastReplayAt = evt.ts;
      state.lastActivityAt = evt.ts;
      break;
    }
    case "evidence_captured": {
      const p = (evt.payload ?? {}) as {
        evidence_id?: string;
        evidence_type?: string;
        tool?: string;
      };
      state.lastEvidenceId = p.evidence_id;
      state.lastEvidenceType = p.evidence_type;
      state.lastToolName = p.tool ?? state.lastToolName;
      state.lastEvidenceAt = evt.ts;
      state.lastActivityAt = evt.ts;
      break;
    }
    case "task_action": {
      const p = (evt.payload ?? {}) as { action?: string };
      state.lastTaskAction = p.action;
      state.lastActivityAt = evt.ts;
      break;
    }
    case "stop_check": {
      const p = (evt.payload ?? {}) as { result?: string };
      state.lastStopCheckAt = evt.ts;
      state.lastStopCheckResult = p.result;
      state.lastActivityAt = evt.ts;
      break;
    }
    case "subagent_tracked": {
      const p = (evt.payload ?? {}) as {
        subagent_id?: string;
        subagent_type?: string | null;
      };
      state.lastSubagentAt = evt.ts;
      state.lastSubagentId = p.subagent_id;
      const prev =
        typeof state.activeSubagentCount === "number"
          ? state.activeSubagentCount
          : 0;
      state.activeSubagentCount = prev + 1;
      state.lastActivityAt = evt.ts;
      break;
    }
    case "pre_compact": {
      state.preCompactAt = evt.ts;
      state.lastActivityAt = evt.ts;
      break;
    }
    default:
      // Unknown event types are ignored forward-compatibly.
      break;
  }
}
// @AI:NAV[END:function-foldevent]

/**
 * Compact the JSONL manifest to a single `__snapshot__` line when it
 * exceeds `opts.maxBytes`. Returns `true` if compaction happened.
 *
 * Also writes a legacy `{sessionId}.json` pretty-printed snapshot for
 * reader compatibility during the hook migration window.
 */
// @AI:NAV[SEC:async-function-compactifneeded] async function compactIfNeeded
export async function compactIfNeeded(
  sessionId: string,
  opts?: { maxBytes?: number },
): Promise<boolean> {
  const manifestPath = getManifestPath(sessionId);
  const maxBytes = opts?.maxBytes ?? DEFAULT_COMPACT_THRESHOLD_BYTES;

  try {
    if (!fs.existsSync(manifestPath)) return false;
    const stat = fs.statSync(manifestPath);
    if (stat.size < maxBytes) return false;

    const state = await readManifest(sessionId);
    if (!state) return false;

    const snapshot: SessionEvent = {
      schemaVersion: SCHEMA_VERSION,
      ts: new Date().toISOString(),
      sessionId,
      type: SNAPSHOT_TYPE as SessionEventType,
      payload: state as unknown as Record<string, unknown>,
    };

    const tmp = manifestPath + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(snapshot) + "\n", "utf8");
    fs.renameSync(tmp, manifestPath);

    // Legacy JSON snapshot for readers that have not migrated yet.
    fs.writeFileSync(
      getLegacySnapshotPath(sessionId),
      JSON.stringify(state, null, 2),
      "utf8",
    );
    return true;
  } catch {
    return false;
  }
}
// @AI:NAV[END:async-function-compactifneeded]
