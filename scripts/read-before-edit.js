#!/usr/bin/env node
'use strict';

// PreToolUse hook: enforce that any file targeted by Edit/Write/NotebookEdit
// has been Read at least once during the current session, AND has not been
// modified on disk since the last Read.
//
// Audit reference (workflow-audit-2026-04-24.md, Theme B + Week-1 item #7):
//   ~1,200 Read-before-Edit/Write race errors over 30 days. Same root cause
//   as the Codex apply_patch 35% failure rate — file mutated between read and
//   patch. This hook closes the TOCTOU window.
//
// Decision contract (matches existing PreToolUse hooks like damage-control):
//   - Allow: exit 0, no stdout body required.
//   - Block: exit 2, write a human-readable reason to stderr.
//   - Fail-open on any unexpected error: exit 0 + observability event.
//
// Override:
//   CLAUDE_HOOK_SKIP_READ_CHECK=1 short-circuits to allow. Useful for CI
//   bootstrapping and one-off scripted runs.

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { writeHookEvent, sanitizeId } = require('./hook-observability');
const { writeAuditHookEvent } = require('./hook-audit-log');

const STATE_DIR = path.join(os.homedir(), '.evokore', 'state', 'read-before-edit');
const HOOK_NAME = 'read-before-edit';
const TARGET_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit']);

function ensureStateDir() {
  try {
    if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
  } catch {
    // best effort — state failures fall through to fail-open in caller
  }
}

function statePathFor(sessionId) {
  return path.join(STATE_DIR, `${sanitizeId(sessionId)}.json`);
}

function fileKey(filePath) {
  // Normalize separators so the same file looked up via two different
  // representations resolves to one bucket. Hash for filename safety.
  const normalized = path.resolve(String(filePath || '')).replace(/\\/g, '/');
  return crypto.createHash('sha1').update(normalized).digest('hex').slice(0, 16);
}

function loadSessionState(sessionId) {
  try {
    const p = statePathFor(sessionId);
    if (!fs.existsSync(p)) return { reads: {} };
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object' && parsed.reads) ? parsed : { reads: {} };
  } catch {
    return { reads: {} };
  }
}

function saveSessionState(sessionId, state) {
  try {
    ensureStateDir();
    fs.writeFileSync(statePathFor(sessionId), JSON.stringify(state), 'utf8');
  } catch {
    // best effort
  }
}

function getMtimeMs(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
}

// Record a Read event into per-session state. Called when the incoming
// PreToolUse payload is for the `Read` tool — we observe reads here so we
// don't depend on a separate PostToolUse hook.
function recordRead(sessionId, filePath) {
  if (!filePath) return;
  const state = loadSessionState(sessionId);
  const key = fileKey(filePath);
  state.reads[key] = {
    path: filePath,
    mtime: getMtimeMs(filePath),
    at: new Date().toISOString()
  };
  saveSessionState(sessionId, state);
}

// Decide whether an Edit/Write/NotebookEdit against `filePath` is allowed.
// Returns { allow: bool, reason?: string }.
function evaluateEdit(sessionId, filePath) {
  if (!filePath) {
    // Tool input had no file_path — not our problem to enforce. Allow.
    return { allow: true };
  }
  const state = loadSessionState(sessionId);
  const key = fileKey(filePath);
  const record = state.reads[key];

  if (!record) {
    return {
      allow: false,
      reason: `File ${filePath} must be Read first before Edit/Write/NotebookEdit (set CLAUDE_HOOK_SKIP_READ_CHECK=1 to override)`
    };
  }

  // If the file currently exists on disk, check that its mtime hasn't
  // advanced since our last Read snapshot. If the file doesn't exist (e.g.,
  // a Write to a brand-new path that was previously deleted between read
  // and write), allow — there's nothing to corrupt.
  const currentMtime = getMtimeMs(filePath);
  if (currentMtime !== null && record.mtime !== null && currentMtime > record.mtime) {
    return {
      allow: false,
      reason: `File ${filePath} must be re-Read because it was modified since last seen at ${record.at}`
    };
  }

  return { allow: true };
}

module.exports = {
  STATE_DIR,
  HOOK_NAME,
  TARGET_TOOLS,
  fileKey,
  statePathFor,
  loadSessionState,
  saveSessionState,
  recordRead,
  evaluateEdit
};

// Only attach the stdin loop when invoked directly (either as the script
// itself or through the canonical fail-safe wrapper). Tests `require()` this
// module to exercise the helpers and must not have stdin captured.
const __mainFilename = (require.main && require.main.filename) ? require.main.filename : '';
const __mainBase = path.basename(__mainFilename);
const __isDirectInvocation =
  require.main === module ||
  (__mainBase === 'read-before-edit.js' && path.basename(path.dirname(__mainFilename)) === 'hooks');

if (!__isDirectInvocation) {
  return;
}

let inputData = '';
process.stdin.on('data', (chunk) => { inputData += chunk; });
process.stdin.on('end', () => {
  let payload;
  let toolName = '';
  let sessionId = 'unknown';
  let filePath = '';

  function emit(decision, reason) {
    const entry = {
      hook: HOOK_NAME,
      tool: toolName,
      decision,
      session_id: sessionId,
      file: filePath || undefined,
      reason: reason || undefined
    };
    try { writeHookEvent(Object.assign({ event: decision }, entry)); } catch {}
    try { writeAuditHookEvent(entry); } catch {}
  }

  try {
    payload = JSON.parse(inputData || '{}');
    toolName = payload.tool_name || '';
    sessionId = sanitizeId(payload.session_id || 'unknown');
    const toolInput = payload.tool_input || {};
    filePath = toolInput.file_path || toolInput.path || toolInput.notebook_path || '';

    // Override switch — allow operators to bypass for bootstrapping / CI.
    if (process.env.CLAUDE_HOOK_SKIP_READ_CHECK === '1') {
      emit('allow', 'override:CLAUDE_HOOK_SKIP_READ_CHECK');
      process.exit(0);
    }

    // Observe reads — when Claude reads a file, record it into session state
    // so the subsequent Edit/Write check has something to compare against.
    if (toolName === 'Read' && filePath) {
      recordRead(sessionId, filePath);
      emit('allow', 'observed:read');
      process.exit(0);
    }

    // Only gate Edit/Write/NotebookEdit/MultiEdit. Anything else passes.
    if (!TARGET_TOOLS.has(toolName)) {
      // Don't even log — keeps the JSONL log focused on relevant events.
      process.exit(0);
    }

    const verdict = evaluateEdit(sessionId, filePath);
    if (verdict.allow) {
      emit('allow');
      process.exit(0);
    }

    emit('block', verdict.reason);
    process.stderr.write(`READ-BEFORE-EDIT BLOCKED: ${verdict.reason}\n`);
    process.exit(2);
  } catch (error) {
    // Fail-open on any unexpected error. Never block the model on a hook
    // implementation bug.
    try {
      writeHookEvent({
        hook: HOOK_NAME,
        event: 'fail_open',
        reason: 'unexpected_error',
        error: String(error && error.message ? error.message : error)
      });
    } catch {}
    process.exit(0);
  }
});
