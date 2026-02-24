#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const SESSIONS_DIR = path.join(os.homedir(), '.evokore', 'sessions');

function sanitizeId(id) {
  return String(id || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
}

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
  } catch {
    // Never fail — always exit 0
  }
  process.exit(0);
});
