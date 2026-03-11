#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { writeHookEvent, sanitizeId } = require('./hook-observability');
const { pruneOldSessions } = require('./log-rotation');
const { writeSessionState, resolveCanonicalRepoRoot, SESSIONS_DIR } = require('./session-continuity');

function summarize(toolName, toolInput) {
  if (!toolInput) return '';
  switch (toolName) {
    case 'Bash':
      return (toolInput.command || '').slice(0, 200);
    case 'Edit':
    case 'Write':
    case 'Read':
      return toolInput.file_path || '';
    case 'Grep':
      return `pattern:${toolInput.pattern || ''} ${toolInput.path || ''}`.trim();
    case 'Glob':
      return `${toolInput.pattern || ''} ${toolInput.path || ''}`.trim();
    case 'Task':
      return (toolInput.description || '').slice(0, 100);
    case 'WebFetch':
      return toolInput.url || '';
    case 'WebSearch':
      return toolInput.query || '';
    default:
      return JSON.stringify(toolInput).slice(0, 150);
  }
}

let input = '';
process.stdin.on('data', (chunk) => input += chunk);
process.stdin.on('end', () => {
  try {
    try { pruneOldSessions(SESSIONS_DIR); } catch { /* best effort */ }

    const payload = JSON.parse(input);
    const sessionId = sanitizeId(payload.session_id);
    const toolName = payload.tool_name || 'unknown';
    const toolInput = payload.tool_input || {};

    const entry = {
      ts: new Date().toISOString(),
      tool: toolName,
      summary: summarize(toolName, toolInput)
    };

    if (!fs.existsSync(SESSIONS_DIR)) {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }

    const logPath = path.join(SESSIONS_DIR, `${sessionId}-replay.jsonl`);
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
    writeSessionState(sessionId, {
      workspaceRoot: process.cwd(),
      canonicalRepoRoot: resolveCanonicalRepoRoot(process.cwd()),
      repoName: path.basename(process.cwd()),
      status: 'active',
      lastToolName: toolName,
      lastReplayAt: entry.ts,
      lastActivityAt: entry.ts
    });
    writeHookEvent({
      hook: 'session-replay',
      event: 'replay_entry_written',
      session_id: sessionId,
      tool: toolName
    });
  } catch (error) {
    // Never fail — always exit 0
    writeHookEvent({
      hook: 'session-replay',
      event: 'fail_safe_error',
      error: String(error && error.message ? error.message : error)
    });
  }
  process.exit(0);
});
