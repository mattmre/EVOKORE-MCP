#!/usr/bin/env node
'use strict';

// Hook audit log writer — appends one JSONL entry per hook decision to a
// per-day file under ~/.claude/logs/hooks/YYYY-MM-DD.jsonl.
//
// Audit reference (workflow-audit-2026-04-24.md, §5 risk #2 "Hooks compound
// silently"). The general-purpose hook event log already exists at
// ~/.evokore/logs/hooks.jsonl via hook-observability.js. This module is a
// dedicated companion that:
//   1. Lives at the path the audit specifies (~/.claude/logs/hooks/), where
//      hook-stats.js can find it without a heuristic.
//   2. Rotates by date instead of by size, so a quick "last 24h" query is a
//      file open + parse rather than a tail scan.
//   3. Captures only PreToolUse decisions (allow/block) — not noisy lifecycle
//      events — so block counts are meaningful at a glance.
//
// Never throws. Failures are silent — observability must not gate execution.

const fs = require('fs');
const path = require('path');
const os = require('os');

const AUDIT_LOG_DIR = path.join(os.homedir(), '.claude', 'logs', 'hooks');

function todayStamp(date) {
  const d = date instanceof Date ? date : new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dailyLogPath(date) {
  return path.join(AUDIT_LOG_DIR, `${todayStamp(date)}.jsonl`);
}

function writeAuditHookEvent(entry) {
  try {
    if (!fs.existsSync(AUDIT_LOG_DIR)) {
      fs.mkdirSync(AUDIT_LOG_DIR, { recursive: true });
    }
    const payload = Object.assign({ ts: new Date().toISOString() }, entry || {});
    fs.appendFileSync(dailyLogPath(), JSON.stringify(payload) + '\n', 'utf8');
  } catch {
    // Never throw from observability path
  }
}

module.exports = {
  AUDIT_LOG_DIR,
  todayStamp,
  dailyLogPath,
  writeAuditHookEvent
};
