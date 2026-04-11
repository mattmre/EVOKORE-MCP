#!/usr/bin/env node
'use strict';

// PostToolUse hook: Captures an `edit-trace` evidence entry whenever the agent
// uses Edit/Write/MultiEdit. Complements evidence-capture.js (which records
// `file-change` for higher-level file-change evidence) by adding a lightweight
// per-edit trace that the Extended Continuity Core can consume for replay
// reconstruction and diff lineage.
//
// Always exits 0 — fail-safe, never blocks the tool call.

const fs = require('fs');
const { sanitizeId, writeHookEvent } = require('./hook-observability');
const {
  writeSessionState,
  getSessionPaths,
  SESSIONS_DIR
} = require('./session-continuity');
const { pruneOldSessions } = require('./log-rotation');

const WATCHED_TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);

let inputData = '';
process.stdin.on('data', (chunk) => { inputData += chunk; });
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(inputData || '{}');
    const toolName = payload.tool_name || '';
    if (!WATCHED_TOOLS.has(toolName)) {
      process.exit(0);
      return;
    }

    const rawId = payload.session_id || '';
    const sessionId = sanitizeId(rawId);
    const toolInput = payload.tool_input || {};
    const filePath = toolInput.file_path || toolInput.path || '';
    const isError = !!(payload.tool_response && payload.tool_response.is_error);
    const ts = new Date().toISOString();

    const paths = getSessionPaths(sessionId);

    if (!fs.existsSync(SESSIONS_DIR)) {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }

    // Sequential evidence ID based on current evidence JSONL line count
    let lineCount = 0;
    try {
      if (fs.existsSync(paths.evidenceLogPath)) {
        const existing = fs.readFileSync(paths.evidenceLogPath, 'utf8').trim();
        lineCount = existing ? existing.split('\n').length : 0;
      }
    } catch {
      lineCount = 0;
    }
    const evidenceId = 'E-' + String(lineCount + 1).padStart(3, '0');

    const entry = {
      evidence_id: evidenceId,
      type: 'edit-trace',
      ts,
      tool: toolName,
      file: filePath,
      is_error: isError
    };

    try {
      fs.appendFileSync(paths.evidenceLogPath, JSON.stringify(entry) + '\n', 'utf8');
    } catch {
      // best effort — never block the tool call
    }

    try {
      writeSessionState(sessionId, {
        lastEditedFile: filePath,
        lastEditAt: ts,
        lastActivityAt: ts
      });
    } catch {
      // best effort
    }

    try {
      writeHookEvent({
        hook: 'after-edit',
        event: 'edit_traced',
        session_id: sessionId,
        tool: toolName,
        file: filePath
      });
    } catch {
      // best effort
    }

    try { pruneOldSessions(SESSIONS_DIR); } catch { /* best effort */ }
  } catch (err) {
    try {
      writeHookEvent({
        hook: 'after-edit',
        event: 'fail_safe_error',
        error: String(err && err.message ? err.message : err)
      });
    } catch { /* never throw from fail-safe path */ }
  }
  process.exit(0);
});
