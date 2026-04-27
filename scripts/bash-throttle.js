#!/usr/bin/env node
'use strict';

// PreToolUse + PostToolUse hook: cap the number of concurrent Bash calls
// per session at N (default 2, configurable via CLAUDE_BASH_MAX_CONCURRENT).
//
// Audit reference (workflow-audit-2026-04-24.md, Theme B + Week-1 item #8):
//   4,913 "Sibling tool call errored" + 2,377 user-cancelled parallel `cd`
//   calls = the dominant tool-call failure mode. Throttling is the band-aid
//   the audit explicitly endorses ("a 20-line PR shouldn't wait for a
//   quarterly schema redesign").
//
// State model
// -----------
// Per-session state file at ~/.evokore/state/bash-throttle/<session>.json:
//   { inflight: number, ids: { [toolUseId]: <iso-ts> } }
//
// We track per tool_use_id rather than just a counter so a missed
// PostToolUse (process kill, hook crash) doesn't permanently raise the
// floor. A reaper sweep at the top of every PreToolUse drops any inflight
// id older than INFLIGHT_TTL_MS — the same mechanism makes cold-start
// behavior idempotent (missing state file => empty {ids} => fresh decision).
//
// Decision contract:
//   - PreToolUse Bash, would-exceed limit => exit 2, stderr message.
//   - PreToolUse Bash, within limit => increment, exit 0.
//   - PostToolUse Bash => decrement (best effort), exit 0.
//   - Anything else => no-op, exit 0.
//
// Override:
//   CLAUDE_BASH_MAX_CONCURRENT=N  (default 2). Set to 0 to disable.
//   CLAUDE_HOOK_SKIP_BASH_THROTTLE=1 short-circuits to allow.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { writeHookEvent, sanitizeId } = require('./hook-observability');
const { writeAuditHookEvent } = require('./hook-audit-log');

const STATE_DIR = path.join(os.homedir(), '.evokore', 'state', 'bash-throttle');
const HOOK_NAME = 'bash-throttle';
const DEFAULT_MAX_CONCURRENT = 2;

// Inflight entries older than this are considered stuck and reaped on the
// next PreToolUse sweep. 5 minutes is generous for typical bash invocations
// and short enough that a crashed PostToolUse doesn't permanently leak slots.
const INFLIGHT_TTL_MS = 5 * 60 * 1000;

function ensureStateDir() {
  try {
    if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
  } catch {
    // best effort
  }
}

function statePathFor(sessionId) {
  return path.join(STATE_DIR, `${sanitizeId(sessionId)}.json`);
}

function loadSessionState(sessionId) {
  try {
    const p = statePathFor(sessionId);
    if (!fs.existsSync(p)) return { ids: {} };
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.ids) return { ids: {} };
    return parsed;
  } catch {
    // Corrupt or unreadable state — treat as cold start. Idempotent on
    // missing state per the contract.
    return { ids: {} };
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

function reapStuckInflight(state, now) {
  const cutoff = now - INFLIGHT_TTL_MS;
  let reaped = 0;
  for (const id of Object.keys(state.ids)) {
    const startedMs = Date.parse(state.ids[id]);
    if (!Number.isFinite(startedMs) || startedMs < cutoff) {
      delete state.ids[id];
      reaped++;
    }
  }
  return reaped;
}

function getMaxConcurrent() {
  const raw = process.env.CLAUDE_BASH_MAX_CONCURRENT;
  if (raw === undefined || raw === '') return DEFAULT_MAX_CONCURRENT;
  const parsed = parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_MAX_CONCURRENT;
  return parsed;
}

// `event` = 'PreToolUse' | 'PostToolUse' (auto-detected from payload shape).
// Returns { allow: bool, reason?: string, inflight?: number, max?: number }.
function evaluate(sessionId, toolUseId, event) {
  const max = getMaxConcurrent();
  const state = loadSessionState(sessionId);
  const now = Date.now();
  reapStuckInflight(state, now);

  if (event === 'PostToolUse') {
    if (toolUseId && state.ids[toolUseId]) {
      delete state.ids[toolUseId];
      saveSessionState(sessionId, state);
    }
    return { allow: true, inflight: Object.keys(state.ids).length, max };
  }

  // PreToolUse path.
  if (max === 0) {
    // Disabled — every call passes through but we still increment so an
    // operator who flips the limit back on doesn't see a spurious clean
    // slate.
    if (toolUseId) state.ids[toolUseId] = new Date(now).toISOString();
    saveSessionState(sessionId, state);
    return { allow: true, inflight: Object.keys(state.ids).length, max };
  }

  const inflight = Object.keys(state.ids).length;
  if (inflight >= max) {
    return {
      allow: false,
      reason: `Parallel Bash limit (${max}) reached; serialize this call (${inflight} inflight)`,
      inflight,
      max
    };
  }

  if (toolUseId) state.ids[toolUseId] = new Date(now).toISOString();
  saveSessionState(sessionId, state);
  return { allow: true, inflight: inflight + 1, max };
}

// Heuristic: PostToolUse payloads always include a tool_response field.
// PreToolUse payloads don't. Some Claude Code versions also stamp
// hook_event_name; honor it when present.
function detectEventKind(payload) {
  if (payload && typeof payload.hook_event_name === 'string') {
    return payload.hook_event_name;
  }
  if (payload && payload.tool_response !== undefined) {
    return 'PostToolUse';
  }
  return 'PreToolUse';
}

module.exports = {
  STATE_DIR,
  HOOK_NAME,
  DEFAULT_MAX_CONCURRENT,
  INFLIGHT_TTL_MS,
  statePathFor,
  loadSessionState,
  saveSessionState,
  reapStuckInflight,
  getMaxConcurrent,
  evaluate,
  detectEventKind
};

const __mainFilename = (require.main && require.main.filename) ? require.main.filename : '';
const __mainBase = path.basename(__mainFilename);
const __isDirectInvocation =
  require.main === module ||
  (__mainBase === 'bash-throttle.js' && path.basename(path.dirname(__mainFilename)) === 'hooks');

if (!__isDirectInvocation) {
  return;
}

let inputData = '';
process.stdin.on('data', (chunk) => { inputData += chunk; });
process.stdin.on('end', () => {
  let toolName = '';
  let sessionId = 'unknown';
  let toolUseId = '';
  let eventKind = 'PreToolUse';

  function emit(decision, reason, extras) {
    const entry = Object.assign({
      hook: HOOK_NAME,
      tool: toolName,
      decision,
      session_id: sessionId,
      tool_use_id: toolUseId || undefined,
      event_kind: eventKind,
      reason: reason || undefined
    }, extras || {});
    try { writeHookEvent(Object.assign({ event: decision }, entry)); } catch {}
    try { writeAuditHookEvent(entry); } catch {}
  }

  try {
    const payload = JSON.parse(inputData || '{}');
    toolName = payload.tool_name || '';
    sessionId = sanitizeId(payload.session_id || 'unknown');
    toolUseId = String(payload.tool_use_id || payload.tool_call_id || '');
    eventKind = detectEventKind(payload);

    if (process.env.CLAUDE_HOOK_SKIP_BASH_THROTTLE === '1') {
      // Still decrement on PostToolUse if we're tracking, but never block.
      if (eventKind === 'PostToolUse' && toolName === 'Bash') {
        evaluate(sessionId, toolUseId, eventKind);
      }
      emit('allow', 'override:CLAUDE_HOOK_SKIP_BASH_THROTTLE');
      process.exit(0);
    }

    if (toolName !== 'Bash') {
      // Non-Bash tools are not gated and not interesting to log.
      process.exit(0);
    }

    const verdict = evaluate(sessionId, toolUseId, eventKind);
    if (verdict.allow) {
      emit('allow', undefined, { inflight: verdict.inflight, max: verdict.max });
      process.exit(0);
    }

    emit('block', verdict.reason, { inflight: verdict.inflight, max: verdict.max });
    process.stderr.write(`BASH-THROTTLE BLOCKED: ${verdict.reason}\n`);
    process.exit(2);
  } catch (error) {
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
