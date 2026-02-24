#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOOK_LOGS_DIR = path.join(os.homedir(), '.evokore', 'logs');
const HOOK_LOG_PATH = path.join(HOOK_LOGS_DIR, 'hooks.jsonl');

function sanitizeId(id) {
  return String(id || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function writeHookEvent(event) {
  try {
    if (!fs.existsSync(HOOK_LOGS_DIR)) {
      fs.mkdirSync(HOOK_LOGS_DIR, { recursive: true });
    }

    const payload = Object.assign(
      { ts: new Date().toISOString() },
      event || {}
    );

    if (payload.session_id !== undefined && payload.session_id !== null) {
      payload.session_id = sanitizeId(payload.session_id);
    }

    fs.appendFileSync(HOOK_LOG_PATH, `${JSON.stringify(payload)}\n`);
  } catch {
    // Never throw from observability path
  }
}

module.exports = {
  writeHookEvent,
  sanitizeId
};

