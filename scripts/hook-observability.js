#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOOK_LOGS_DIR = path.join(os.homedir(), '.evokore', 'logs');
const HOOK_LOG_PATH = path.join(HOOK_LOGS_DIR, 'hooks.jsonl');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_ROTATED_FILES = 3;

function sanitizeId(id) {
  return String(id || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Rotate hooks.jsonl when it exceeds MAX_LOG_SIZE.
 * Keeps up to MAX_ROTATED_FILES rotated copies (.1, .2, .3).
 * Uses synchronous fs operations since this runs in a hook context.
 */
function rotateIfNeeded() {
  try {
    if (!fs.existsSync(HOOK_LOG_PATH)) return;

    const stat = fs.statSync(HOOK_LOG_PATH);
    if (stat.size < MAX_LOG_SIZE) return;

    // Shift existing rotated files: .2 -> .3, .1 -> .2
    for (let i = MAX_ROTATED_FILES - 1; i >= 1; i--) {
      const older = `${HOOK_LOG_PATH}.${i}`;
      const newer = `${HOOK_LOG_PATH}.${i + 1}`;
      if (fs.existsSync(older)) {
        fs.renameSync(older, newer);
      }
    }

    // Rotate current file to .1
    fs.renameSync(HOOK_LOG_PATH, `${HOOK_LOG_PATH}.1`);
  } catch {
    // Never throw from observability path
  }
}

function writeHookEvent(event) {
  try {
    if (!fs.existsSync(HOOK_LOGS_DIR)) {
      fs.mkdirSync(HOOK_LOGS_DIR, { recursive: true });
    }

    rotateIfNeeded();

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
  sanitizeId,
  rotateIfNeeded,
  HOOK_LOG_PATH,
  MAX_LOG_SIZE,
  MAX_ROTATED_FILES
};

