#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { writeHookEvent, sanitizeId } = require('./hook-observability');

const SESSIONS_DIR = path.join(os.homedir(), '.evokore', 'sessions');

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
      writeHookEvent({
        hook: 'purpose-gate',
        event: 'state_initialized',
        session_id: sessionId
      });
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
      writeHookEvent({
        hook: 'purpose-gate',
        event: 'purpose_recorded',
        session_id: sessionId
      });
      const result = {
        additionalContext: [
          `[EVOKORE Purpose Gate] Session purpose recorded: "${purpose}".`,
          'Acknowledge the goal briefly and proceed with the task.'
        ].join(' ')
      };
      console.log(JSON.stringify(result));
    } else {
      // Subsequent prompts — remind of purpose
      writeHookEvent({
        hook: 'purpose-gate',
        event: 'purpose_reminder',
        session_id: sessionId
      });
      const result = {
        additionalContext: `[EVOKORE Purpose Gate] Session purpose: "${state.purpose}". Stay focused on this goal.`
      };
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
