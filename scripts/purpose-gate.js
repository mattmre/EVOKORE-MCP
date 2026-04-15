#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { writeHookEvent, sanitizeId } = require('./hook-observability');
const { readSessionState, resolveCanonicalRepoRoot, SESSIONS_DIR } = require('./session-continuity');
const { buildStatusSnapshot, renderStatusLine } = require('./status-runtime');

// ---------------------------------------------------------------------------
// Wave 2 Phase 2-A: context-hash dedup for SOUL/mode injection.
//
// Each prompt, purpose-gate builds a "session continuity" context string that
// pins the session purpose, mode focus, and SOUL values into the model's
// working context via `additionalContext`. That string is ~5-30K tokens
// depending on mode, and for an unchanged session it is byte-identical from
// one prompt to the next. Re-injecting the identical payload every prompt
// wastes tokens; for long sessions this is the single largest source of
// avoidable input spend.
//
// The dedup strategy stores a short hash of the last-injected payload in a
// sibling file (`{sessionId}-purpose-hash.txt`) next to the session manifest.
// On each subsequent prompt we compute the same hash before injecting and
// short-circuit to a minimal "continuity maintained" marker when it matches.
// The marker is small enough (~50 tokens) that context routing still sees
// purpose-gate participated, but we skip the large SOUL/mode payload.
//
// Guarantees:
//  - Fail-open: any FS error reverts to the old behavior (always inject).
//  - Scoped: dedup only applies to the "subsequent prompts — remind of
//    purpose" branch. First-prompt and purpose-recording paths always
//    inject fresh content.
//  - Invalidates on mode / purpose change: the hash is derived from the
//    full payload, so switching modes or editing SOUL.md naturally busts
//    the cache on the next prompt.
// ---------------------------------------------------------------------------
function purposeHashPath(sessionId) {
  const safeId = String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(SESSIONS_DIR, `${safeId}-purpose-hash.txt`);
}

function computeContextHash(content) {
  return crypto.createHash('sha256').update(String(content)).digest('hex').slice(0, 16);
}

function readLastPurposeHash(sessionId) {
  try {
    const p = purposeHashPath(sessionId);
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf8').trim();
    return raw || null;
  } catch {
    return null; // fail-open
  }
}

function writeLastPurposeHash(sessionId, hash) {
  try {
    fs.writeFileSync(purposeHashPath(sessionId), String(hash), 'utf8');
  } catch {
    // fail-open — skipping the write just means the next prompt re-injects.
  }
}

// Phase 0-C: dual-write to append-only JSONL manifest alongside the legacy
// `{sessionId}.json` snapshot. The JSONL module never throws; the require
// itself is wrapped so a missing or broken dist build still fails open and
// leaves the legacy writer in place.
let appendEvent = () => {};
try {
  // eslint-disable-next-line global-require
  ({ appendEvent } = require('../dist/SessionManifest.js'));
} catch {
  // Fail open — continue with legacy writeSessionState only.
}

// Wave 2 Phase 2.5-B: worker dispatcher for keyword-triggered background
// runs and result injection. Wrapped so a missing/broken dispatcher fails
// open and leaves purpose-gate's core flow intact.
let workerDispatcher = null;
try {
  // eslint-disable-next-line global-require
  workerDispatcher = require('./workers/worker-dispatcher.js');
} catch {
  workerDispatcher = null;
}

// 30 minutes — debounce window for keyword-triggered re-dispatch so we
// don't spawn a fresh test_run worker on every prompt.
const WORKER_AUTOTRIGGER_WINDOW_MS = 30 * 60 * 1000;

function detectAutoDispatchTriggers(prompt) {
  const p = String(prompt || '').toLowerCase();
  const triggered = new Set();
  if (/\bperformance\b|\bbenchmark\b/.test(p)) triggered.add('benchmark');
  if (/\btest\b|\bfailing\b/.test(p)) triggered.add('test_run');
  if (/\bsecurity\b/.test(p)) triggered.add('security_scan');
  return Array.from(triggered);
}

function maybeAutoDispatchWorkers(sessionId, prompt) {
  if (!workerDispatcher || typeof workerDispatcher.dispatchWorker !== 'function') return [];
  if (process.env.EVOKORE_WORKER_AUTODISPATCH === 'false') return [];
  const triggered = detectAutoDispatchTriggers(prompt);
  if (triggered.length === 0) return [];
  const dispatched = [];
  const now = Date.now();
  for (const workerType of triggered) {
    try {
      const recent = workerDispatcher.getMostRecentWorker(sessionId, workerType);
      if (recent && recent.startedAt && (now - Date.parse(recent.startedAt) < WORKER_AUTOTRIGGER_WINDOW_MS)) {
        // Recently dispatched -- skip to avoid thrashing.
        continue;
      }
      const { workerId } = workerDispatcher.dispatchWorker(sessionId, workerType, { autoTriggered: true });
      dispatched.push({ workerType, workerId });
    } catch {
      // Fail open per worker -- skip and continue.
    }
  }
  return dispatched;
}

function getCompletedWorkerResultsForInject(sessionId, max = 5) {
  if (!workerDispatcher || typeof workerDispatcher.getCompletedWorkerResults !== 'function') return [];
  try {
    const all = workerDispatcher.getCompletedWorkerResults(sessionId);
    return all.slice(0, max);
  } catch {
    return [];
  }
}

function clip(text, max) {
  const s = String(text == null ? '' : text);
  return s.length > max ? s.slice(0, max) + `...[truncated ${s.length - max}]` : s;
}

function buildWorkerResultsContext(results) {
  if (!Array.isArray(results) || results.length === 0) return null;
  const parts = ['## Background Worker Results'];
  for (const r of results) {
    const status = r.status || 'unknown';
    const summary = r.error
      ? `error: ${clip(r.error, 200)}`
      : clip(JSON.stringify(r.result == null ? null : r.result), 800);
    parts.push(`**${r.workerScript}** [${status}] ${summary}`);
  }
  return parts.join('\n');
}

// Wave 2 Phase 2.5-C: surface newly-unblocked tasks from tilldone state.
let tilldoneHelpers = null;
try {
  // eslint-disable-next-line global-require
  tilldoneHelpers = require('./tilldone.js');
} catch {
  tilldoneHelpers = null;
}

function buildUnblockedTasksContext(sessionId) {
  if (!tilldoneHelpers || typeof tilldoneHelpers.loadTasks !== 'function') return null;
  try {
    const tasks = tilldoneHelpers.loadTasks(sessionId);
    if (!Array.isArray(tasks) || tasks.length === 0) return null;
    tilldoneHelpers.recomputeBlocked(tasks);
    // Newly-unblocked = incomplete tasks with depends_on declared but no
    // remaining blockers. We surface these so the model knows which deps
    // recently cleared without scanning task state itself.
    const ready = tasks.filter(t =>
      !t.done &&
      Array.isArray(t.depends_on) && t.depends_on.length > 0 &&
      (!Array.isArray(t.blocked_by) || t.blocked_by.length === 0)
    );
    if (ready.length === 0) return null;
    const lines = ['## Newly-Unblocked Tasks'];
    for (const t of ready.slice(0, 10)) {
      const tag = t.domain ? ` [${t.domain}]` : '';
      lines.push(`- ${t.text}${tag}`);
    }
    return lines.join('\n');
  } catch {
    return null;
  }
}

/**
 * Build a compact status line from cached data only (no network calls).
 * Returns null if the feature is disabled or no cache is available.
 * Controlled by EVOKORE_STATUS_HOOK=true (opt-in, default off).
 */
function getStatusLine(payload) {
  if (process.env.EVOKORE_STATUS_HOOK !== 'true') return null;

  try {
    const snapshot = buildStatusSnapshot(
      Object.assign({}, payload || {}, {
        workspace: Object.assign({}, payload && payload.workspace ? payload.workspace : {}, {
          current_dir: process.cwd()
        })
      }),
      { cwd: process.cwd() }
    );
    return renderStatusLine(snapshot, { ansi: false, width: 120 });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// ECC Phase 1: SOUL.md + steering-modes.json integration
// Fail-open on read/parse errors — never block the purpose-gate flow.
// ---------------------------------------------------------------------------
const SOUL_PATH = path.resolve(__dirname, '..', 'SOUL.md');
const MODES_PATH = path.resolve(__dirname, 'steering-modes.json');

function loadSoulValues() {
  try {
    const raw = fs.readFileSync(SOUL_PATH, 'utf8');
    const match = raw.match(/## 2\. Values Hierarchy\s*\n([\s\S]*?)\n## 3\./);
    return match ? match[1].trim() : '';
  } catch {
    try { writeHookEvent({ hook: 'purpose-gate', event: 'soul_load_failed', error: 'read_error' }); } catch {}
    return '';
  }
}

function loadSteeringModes() {
  try {
    const raw = fs.readFileSync(MODES_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed.modes || {};
  } catch {
    try { writeHookEvent({ hook: 'purpose-gate', event: 'modes_load_failed', error: 'read_error' }); } catch {}
    return {};
  }
}

function selectMode(purpose, modes) {
  if (!purpose || !modes) return 'dev';
  const p = String(purpose).toLowerCase();
  // Precedence order: security-audit > debug > review > research > dev
  const checks = [
    { mode: 'security-audit', keywords: ['audit', 'security', 'vulnerability', 'hitl', 'rbac', 'pentest'] },
    { mode: 'debug', keywords: ['debug', ' bug', 'failing', 'error', 'reproduce', 'root cause', 'broken', 'crash'] },
    { mode: 'review', keywords: ['review', ' pr ', 'pull request', 'diff', 'feedback', 'approve'] },
    { mode: 'research', keywords: ['research', 'explore', 'analyze', 'map ', 'find ', 'understand', 'investigate'] },
  ];
  for (const { mode, keywords } of checks) {
    if (keywords.some(k => p.includes(k)) && modes[mode]) return mode;
  }
  return modes['dev'] ? 'dev' : Object.keys(modes)[0] || 'dev';
}

module.exports = {
  loadSoulValues,
  loadSteeringModes,
  selectMode,
  // Wave 2 Phase 2-A dedup helpers — exported for tests.
  purposeHashPath,
  computeContextHash,
  readLastPurposeHash,
  writeLastPurposeHash,
  // Wave 2 Phase 2.5-B/C: worker auto-dispatch + tilldone unblock surfacing.
  detectAutoDispatchTriggers,
  maybeAutoDispatchWorkers,
  getCompletedWorkerResultsForInject,
  buildWorkerResultsContext,
  buildUnblockedTasksContext,
};

// The stdin hook loop only runs when invoked as a script — either directly
// (`node scripts/purpose-gate.js`) or through the canonical fail-safe
// wrapper (`node scripts/hooks/purpose-gate.js`). Tests `require()` this
// module to exercise the exported helpers and must not attach stdin
// listeners that could consume the worker's stdin and trigger the error
// branch's `process.exit(0)` mid-test.
const mainFilename = (require.main && require.main.filename) ? require.main.filename : '';
const mainBase = path.basename(mainFilename);
const isDirectInvocation =
  require.main === module ||
  (mainBase === 'purpose-gate.js' && path.basename(path.dirname(mainFilename)) === 'hooks');

if (!isDirectInvocation) {
  return;
}

let input = '';
process.stdin.on('data', (chunk) => input += chunk);
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(input);
    const sessionId = sanitizeId(payload.session_id);
    const userMessage = payload.user_message || payload.tool_input?.user_message || '';
    // Phase 0-D: JSONL manifest is the canonical write path. readSessionState
    // now folds the manifest first, falling back to legacy .json so the
    // "has existing state" check works for both.
    const manifestExists = fs.existsSync(path.join(SESSIONS_DIR, `${sessionId}.jsonl`));
    const legacyExists = fs.existsSync(path.join(SESSIONS_DIR, `${sessionId}.json`));
    const hasExistingState = manifestExists || legacyExists;
    const state = readSessionState(sessionId);

    if (!state || !hasExistingState) {
      // First prompt — ask for purpose
      const workspaceRoot = process.cwd();
      const canonicalRepoRoot = resolveCanonicalRepoRoot(workspaceRoot);
      const repoName = path.basename(workspaceRoot);
      appendEvent(sessionId, {
        type: 'session_initialized',
        payload: { workspaceRoot, canonicalRepoRoot, repoName }
      });
      writeHookEvent({
        hook: 'purpose-gate',
        event: 'state_initialized',
        session_id: sessionId
      });
      const statusLine = getStatusLine(payload);
      const contextParts = [
        '[EVOKORE Purpose Gate] This is a new session.',
        'Before proceeding, ask the user: "What is the goal for this session?"',
        'Frame it naturally — e.g., "What are we working on today?"',
        'Wait for their response before doing anything else.'
      ];
      if (statusLine) contextParts.push(statusLine);
      const soulValues = loadSoulValues();
      if (soulValues) {
        contextParts.push(`\n\n[EVOKORE VALUES HIERARCHY]\n${soulValues}`);
      }
      const result = { additionalContext: contextParts.join(' ') };
      console.log(JSON.stringify(result));
    } else if (state.purpose === null) {
      // Second prompt — save purpose
      const purpose = userMessage.slice(0, 500);
      if (purpose.trim().length < 10) {
        writeHookEvent({
          hook: 'purpose-gate',
          event: 'purpose_too_short',
          session_id: sessionId,
          length: purpose.trim().length
        });
        const result = {
          additionalContext: '[EVOKORE Purpose Gate] Session purpose is too short. Please describe your goal in at least 10 characters (e.g., "fix auth bug in login flow").'
        };
        console.log(JSON.stringify(result));
        process.exit(0);
      }
      const purposeSetAt = new Date().toISOString();
      const modes = loadSteeringModes();
      const selectedMode = selectMode(purpose, modes);
      appendEvent(sessionId, {
        type: 'purpose_recorded',
        payload: {
          purpose,
          mode: selectedMode,
          modeSetAt: purposeSetAt,
          purposeSetAt
        }
      });
      writeHookEvent({
        hook: 'purpose-gate',
        event: 'purpose_recorded',
        session_id: sessionId
      });
      const statusLine = getStatusLine(payload);
      const contextParts = [
        `[EVOKORE Purpose Gate] Session purpose recorded: "${purpose}".`,
        'Acknowledge the goal briefly and proceed with the task.'
      ];
      if (statusLine) contextParts.push(statusLine);
      if (modes[selectedMode] && modes[selectedMode].focus) {
        contextParts.push(`\n\n[SESSION MODE: ${selectedMode.toUpperCase()}]\n${modes[selectedMode].focus}`);
      }
      const result = { additionalContext: contextParts.join(' ') };
      console.log(JSON.stringify(result));
    } else {
      // Subsequent prompts — remind of purpose
      const reminderAt = new Date().toISOString();
      const statusLine = getStatusLine(payload);
      const modes = loadSteeringModes();
      // Self-heal legacy sessions that predate ECC Phase 1 (no mode persisted)
      const currentMode = state.mode || selectMode(state.purpose, modes);

      // Wave 2 Phase 2.5-B: keyword-triggered worker auto-dispatch.
      // Fire-and-forget — workers persist results to disk and are surfaced
      // on the *next* prompt (or this one if they finish in time).
      const autoDispatched = maybeAutoDispatchWorkers(sessionId, userMessage);
      if (autoDispatched.length > 0) {
        appendEvent(sessionId, {
          type: 'worker_auto_dispatched',
          payload: { workers: autoDispatched, prompt: userMessage.slice(0, 200) }
        });
      }

      // Wave 2 Phase 2-A: build the full payload first so we can hash and
      // compare against the last-injected payload for this session.
      const contextParts = [`[EVOKORE Purpose Gate] Session purpose: "${state.purpose}". Stay focused on this goal.`];
      if (statusLine) contextParts.push(statusLine);
      if (modes[currentMode] && modes[currentMode].focus) {
        contextParts.push(`\n\n[SESSION MODE: ${currentMode.toUpperCase()}]\n${modes[currentMode].focus}`);
      }
      const soulValues = loadSoulValues();
      if (soulValues) {
        contextParts.push(`\n\n[EVOKORE VALUES HIERARCHY]\n${soulValues}`);
      }
      // Wave 2 Phase 2.5-B/C: surface completed worker results and newly
      // unblocked tasks. These are appended *outside* the dedup hash basis
      // (below) so they always inject when present — they're cheap and
      // signal new state the model needs to see.
      const workerResults = getCompletedWorkerResultsForInject(sessionId, 5);
      const workerCtx = buildWorkerResultsContext(workerResults);
      const unblockedCtx = buildUnblockedTasksContext(sessionId);
      const fullContext = contextParts.join(' ');
      // Hash only the steering/values portion, excluding the volatile status
      // line. Status changes every prompt (cost/turn, tool counts) and would
      // defeat dedup if hashed.
      const dedupBasis = [
        state.purpose || '',
        currentMode || '',
        modes[currentMode] && modes[currentMode].focus ? modes[currentMode].focus : '',
        soulValues || '',
      ].join('|');
      const contentHash = computeContextHash(dedupBasis);
      const lastHash = readLastPurposeHash(sessionId);
      const isDuplicate = lastHash === contentHash;

      appendEvent(sessionId, {
        type: 'purpose_reminder',
        payload: { lastPromptAt: reminderAt, contentHash, dedup: isDuplicate ? 'skipped' : 'injected' }
      });
      writeHookEvent({
        hook: 'purpose-gate',
        event: isDuplicate ? 'purpose_reminder_deduped' : 'purpose_reminder',
        session_id: sessionId
      });

      const tail = [];
      if (workerCtx) tail.push(`\n\n${workerCtx}`);
      if (unblockedCtx) tail.push(`\n\n${unblockedCtx}`);
      if (autoDispatched.length > 0) {
        tail.push(`\n\n[EVOKORE Purpose Gate] Auto-dispatched workers: ${autoDispatched.map(w => `${w.workerType} (${w.workerId})`).join(', ')}. Poll with worker_context.`);
      }
      const tailText = tail.join('');

      if (isDuplicate) {
        // Same content as last prompt — emit a compact marker instead of the
        // full SOUL/mode payload. Saves ~25K tokens on long sessions.
        const compactParts = [`[EVOKORE Purpose Gate] Purpose unchanged: "${state.purpose}" (mode: ${currentMode}).`];
        if (statusLine) compactParts.push(statusLine);
        const result = { additionalContext: compactParts.join(' ') + tailText };
        console.log(JSON.stringify(result));
      } else {
        writeLastPurposeHash(sessionId, contentHash);
        const result = { additionalContext: fullContext + tailText };
        console.log(JSON.stringify(result));
      }
    }
  } catch (error) {
    writeHookEvent({
      hook: 'purpose-gate',
      event: 'fail_safe_error',
      error: String(error && error.message ? error.message : error)
    });
  }
  process.exit(0);
});
