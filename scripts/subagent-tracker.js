#!/usr/bin/env node
'use strict';

// PostToolUse hook: tracks Task (subagent) invocations as durable entries
// on the session manifest. Each Task call becomes a `SA-NNN` record with
// description, truncated prompt, subagent_type, and outcome. The status
// line reads `sessionState.subagents` to render an `agents:N` segment.
//
// Always exits 0 — fail-safe, never blocks the tool call.

const { sanitizeId, writeHookEvent } = require('./hook-observability');
const {
  readSessionState,
  writeSessionState,
  SESSIONS_DIR
} = require('./session-continuity');
const { pruneOldSessions } = require('./log-rotation');

let inputData = '';
process.stdin.on('data', (chunk) => { inputData += chunk; });
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(inputData || '{}');
    const toolName = payload.tool_name || '';
    if (toolName !== 'Task') {
      process.exit(0);
      return;
    }

    const rawId = payload.session_id || '';
    const sessionId = sanitizeId(rawId);
    const toolInput = payload.tool_input || {};
    const toolResponse = payload.tool_response || {};

    const description = String(toolInput.description || '').slice(0, 200);
    const rawPrompt = String(toolInput.prompt || '');
    const prompt = rawPrompt.slice(0, 300);
    const subagentType = toolInput.subagent_type || toolInput.subagentType || null;
    const outcome = toolResponse.is_error ? 'error' : 'ok';
    const ts = new Date().toISOString();

    // Read existing manifest for current subagents array
    const existingState = readSessionState(sessionId) || {};
    const existingAgents = Array.isArray(existingState.subagents)
      ? existingState.subagents
      : [];

    const subagentId = 'SA-' + String(existingAgents.length + 1).padStart(3, '0');

    const entry = {
      id: subagentId,
      ts,
      type: subagentType,
      description,
      prompt,
      outcome,
      worktree: null
    };

    const nextAgents = existingAgents.concat([entry]);

    try {
      writeSessionState(sessionId, {
        subagents: nextAgents,
        activeSubagentCount: nextAgents.length,
        lastSubagentAt: ts,
        lastActivityAt: ts
      });
    } catch {
      // best effort
    }

    try {
      writeHookEvent({
        hook: 'subagent-tracker',
        event: 'subagent_traced',
        session_id: sessionId,
        subagent_id: subagentId,
        subagent_type: subagentType,
        outcome
      });
    } catch {
      // best effort
    }

    try { pruneOldSessions(SESSIONS_DIR); } catch { /* best effort */ }
  } catch (err) {
    try {
      writeHookEvent({
        hook: 'subagent-tracker',
        event: 'fail_safe_error',
        error: String(err && err.message ? err.message : err)
      });
    } catch { /* never throw from fail-safe path */ }
  }
  process.exit(0);
});
