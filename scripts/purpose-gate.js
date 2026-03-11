#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { writeHookEvent, sanitizeId } = require('./hook-observability');
const { readSessionState, writeSessionState, resolveCanonicalRepoRoot, SESSIONS_DIR } = require('./session-continuity');
const { buildStatusSnapshot, renderStatusLine } = require('./status-runtime');

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
      writeSessionState(sessionId, {
        workspaceRoot: process.cwd(),
        canonicalRepoRoot: resolveCanonicalRepoRoot(process.cwd()),
        repoName: path.basename(process.cwd()),
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
      const result = { additionalContext: contextParts.join(' ') };
      console.log(JSON.stringify(result));
    } else if (state.purpose === null) {
      // Second prompt — save purpose
      const purpose = userMessage.slice(0, 500);
      const purposeSetAt = new Date().toISOString();
      writeSessionState(sessionId, {
        workspaceRoot: process.cwd(),
        canonicalRepoRoot: resolveCanonicalRepoRoot(process.cwd()),
        repoName: path.basename(process.cwd()),
        purpose,
        set_at: purposeSetAt,
        purposeSetAt,
        status: 'active',
        lastPromptAt: purposeSetAt,
        lastActivityAt: purposeSetAt
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
      const result = { additionalContext: contextParts.join(' ') };
      console.log(JSON.stringify(result));
    } else {
      // Subsequent prompts — remind of purpose
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
      let context = `[EVOKORE Purpose Gate] Session purpose: "${state.purpose}". Stay focused on this goal.`;
      if (statusLine) context += ' ' + statusLine;
      const result = { additionalContext: context };
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
