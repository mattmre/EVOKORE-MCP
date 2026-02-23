#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const SESSIONS_DIR = path.join(os.homedir(), '.evokore', 'sessions');

const RESET = '\x1b[0m';
const C = {
  HEADER: '\x1b[38;2;59;130;246m',    // blue
  INDEX: '\x1b[38;2;100;116;139m',     // slate
  TIME: '\x1b[38;2;96;165;250m',       // light blue
  TOOL: '\x1b[38;2;74;222;128m',       // emerald
  SUMMARY: '\x1b[38;2;203;213;225m',   // slate light
  DIM: '\x1b[38;2;71;85;105m',         // slate dark
  WARN: '\x1b[38;2;251;146;60m',       // orange
  ERR: '\x1b[38;2;251;113;133m'        // rose
};

function findLatestReplay() {
  if (!fs.existsSync(SESSIONS_DIR)) return null;
  const files = fs.readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith('-replay.jsonl'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(SESSIONS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return files.length > 0 ? files[0].name.replace('-replay.jsonl', '') : null;
}

function padRight(str, len) {
  if (str.length >= len) return str.slice(0, len);
  return str + ' '.repeat(len - str.length);
}

function padLeft(str, len) {
  if (str.length >= len) return str.slice(0, len);
  return ' '.repeat(len - str.length) + str;
}

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const filteredArgs = args.filter(a => a !== '--json');

let sessionId = filteredArgs[0];

if (sessionId === '--latest' || !sessionId) {
  sessionId = findLatestReplay();
  if (!sessionId) {
    console.error(`${C.ERR}No replay sessions found in ${SESSIONS_DIR}${RESET}`);
    process.exit(0);
  }
}

const sanitized = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
const logPath = path.join(SESSIONS_DIR, `${sanitized}-replay.jsonl`);

if (!fs.existsSync(logPath)) {
  console.error(`${C.ERR}Session replay not found: ${logPath}${RESET}`);
  process.exit(0);
}

const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);

if (jsonMode) {
  lines.forEach(l => console.log(l));
  process.exit(0);
}

// Render table
const entries = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

if (entries.length === 0) {
  console.log(`${C.WARN}No entries in session ${sanitized}${RESET}`);
  process.exit(0);
}

const width = process.stdout.columns || 100;
const summaryWidth = Math.max(20, width - 30);

console.log();
console.log(`${C.HEADER}  Session Replay: ${sanitized}${RESET}`);
console.log(`${C.HEADER}  ${entries.length} events recorded${RESET}`);
console.log(`${C.DIM}${'─'.repeat(Math.min(width, 100))}${RESET}`);
console.log(`${C.DIM}  ${padRight('#', 5)} ${padRight('TIME', 10)} ${padRight('TOOL', 16)} SUMMARY${RESET}`);
console.log(`${C.DIM}${'─'.repeat(Math.min(width, 100))}${RESET}`);

entries.forEach((e, i) => {
  const idx = padLeft(String(i + 1), 4);
  const time = e.ts ? new Date(e.ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '??:??:??';
  const tool = padRight(e.tool || '?', 15);
  const summary = (e.summary || '').slice(0, summaryWidth);

  console.log(`  ${C.INDEX}${idx}${RESET}  ${C.TIME}${time}${RESET}  ${C.TOOL}${tool}${RESET} ${C.SUMMARY}${summary}${RESET}`);
});

console.log(`${C.DIM}${'─'.repeat(Math.min(width, 100))}${RESET}`);
console.log();
