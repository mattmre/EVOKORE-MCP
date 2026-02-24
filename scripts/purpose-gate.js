#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const SESSIONS_DIR = path.join(os.homedir(), '.evokore', 'sessions');

function sanitizeId(id) {
  return String(id || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function ensureDir() {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

let input = '';
process.stdin.on('data', (chunk) => input += chunk);
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(input);
    const sessionId = sanitizeId(payload.session_id);
    const userMessage = payload.user_message || payload.tool_input?.user_message || '';

    ensureDir();
    const stateFile = path.join(SESSIONS_DIR, `${sessionId}.json`);

    let state = null;
    if (fs.existsSync(stateFile)) {
      try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { state = null; }
    }

    if (!state) {
      // First prompt — ask for purpose
      fs.writeFileSync(stateFile, JSON.stringify({ purpose: null, created: new Date().toISOString() }));
      const result = {
        additionalContext: [
          '[EVOKORE Purpose Gate] This is a new session.',
          'Before proceeding, ask the user: "What is the goal for this session?"',
          'Frame it naturally — e.g., "What are we working on today?"',
          'Wait for their response before doing anything else.'
        ].join(' ')
      };
      console.log(JSON.stringify(result));
    } else if (state.purpose === null) {
      // Second prompt — save purpose
      const purpose = userMessage.slice(0, 500);
      state.purpose = purpose;
      state.set_at = new Date().toISOString();
      fs.writeFileSync(stateFile, JSON.stringify(state));
      const result = {
        additionalContext: [
          `[EVOKORE Purpose Gate] Session purpose recorded: "${purpose}".`,
          'Acknowledge the goal briefly and proceed with the task.'
        ].join(' ')
      };
      console.log(JSON.stringify(result));
    } else {
      // Subsequent prompts — remind of purpose
      const result = {
        additionalContext: `[EVOKORE Purpose Gate] Session purpose: "${state.purpose}". Stay focused on this goal.`
      };
      console.log(JSON.stringify(result));
    }
  } catch {
    // Never fail
  }
  process.exit(0);
});
