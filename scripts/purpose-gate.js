#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { writeHookEvent, sanitizeId } = require('./hook-observability');
const { readSessionState, writeSessionState, resolveCanonicalRepoRoot, SESSIONS_DIR } = require('./session-continuity');
const { buildStatusSnapshot, renderStatusLine } = require('./status-runtime');

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

module.exports = { loadSoulValues, loadSteeringModes, selectMode };

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
    const hasExistingState = fs.existsSync(path.join(SESSIONS_DIR, `${sessionId}.json`));
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
      writeSessionState(sessionId, {
        workspaceRoot,
        canonicalRepoRoot,
        repoName,
        purpose: null,
        status: 'awaiting-purpose',
        lastPromptAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString()
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
      writeSessionState(sessionId, {
        workspaceRoot: process.cwd(),
        canonicalRepoRoot: resolveCanonicalRepoRoot(process.cwd()),
        repoName: path.basename(process.cwd()),
        purpose,
        set_at: purposeSetAt,
        purposeSetAt,
        status: 'active',
        lastPromptAt: purposeSetAt,
        lastActivityAt: purposeSetAt,
        mode: selectedMode,
        modeSetAt: Date.now()
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
      appendEvent(sessionId, {
        type: 'purpose_reminder',
        payload: { lastPromptAt: reminderAt }
      });
      writeSessionState(sessionId, {
        workspaceRoot: process.cwd(),
        canonicalRepoRoot: resolveCanonicalRepoRoot(process.cwd()),
        repoName: path.basename(process.cwd()),
        status: 'active',
        lastPromptAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString()
      });
      writeHookEvent({
        hook: 'purpose-gate',
        event: 'purpose_reminder',
        session_id: sessionId
      });
      const statusLine = getStatusLine(payload);
      const contextParts = [`[EVOKORE Purpose Gate] Session purpose: "${state.purpose}". Stay focused on this goal.`];
      if (statusLine) contextParts.push(statusLine);
      const modes = loadSteeringModes();
      // Self-heal legacy sessions that predate ECC Phase 1 (no mode persisted)
      const currentMode = state.mode || selectMode(state.purpose, modes);
      if (modes[currentMode] && modes[currentMode].focus) {
        contextParts.push(`\n\n[SESSION MODE: ${currentMode.toUpperCase()}]\n${modes[currentMode].focus}`);
      }
      const result = { additionalContext: contextParts.join(' ') };
      console.log(JSON.stringify(result));
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
