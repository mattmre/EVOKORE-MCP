#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOOK_LOGS_DIR = path.join(os.homedir(), '.evokore', 'logs');
const HOOK_LOG_PATH = path.join(HOOK_LOGS_DIR, 'hooks.jsonl');

const RESET = '\x1b[0m';
const C = {
  HEADER: '\x1b[38;2;59;130;246m',    // blue
  INDEX: '\x1b[38;2;100;116;139m',     // slate
  TIME: '\x1b[38;2;96;165;250m',       // light blue
  HOOK: '\x1b[38;2;74;222;128m',       // emerald
  EVENT: '\x1b[38;2;203;213;225m',     // slate light
  SESSION: '\x1b[38;2;168;162;232m',   // purple
  DIM: '\x1b[38;2;71;85;105m',         // slate dark
  WARN: '\x1b[38;2;251;146;60m',       // orange
  ERR: '\x1b[38;2;251;113;133m',       // rose
  STAT: '\x1b[38;2;129;230;217m'       // teal
};

function padRight(str, len) {
  if (str.length >= len) return str.slice(0, len);
  return str + ' '.repeat(len - str.length);
}

function padLeft(str, len) {
  if (str.length >= len) return str.slice(0, len);
  return ' '.repeat(len - str.length) + str;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseArgs(argv) {
  const opts = { hook: null, since: null, session: null, json: false, tail: 50 };
  const args = argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--hook':
        opts.hook = args[++i] || null;
        break;
      case '--since':
        opts.since = args[++i] || null;
        break;
      case '--session':
        opts.session = args[++i] || null;
        break;
      case '--json':
        opts.json = true;
        break;
      case '--tail':
        opts.tail = parseInt(args[++i], 10) || 50;
        break;
      case '--all':
        opts.tail = 0;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return opts;
}

function printHelp() {
  console.log(`
${C.HEADER}  Hook Log Viewer${RESET}
${C.DIM}  View and filter EVOKORE hook observability events${RESET}

  Usage: node scripts/hook-log-view.js [options]

  Options:
    --hook <name>     Filter by hook name (damage-control, purpose-gate, etc.)
    --since <date>    Show events since date (ISO 8601 or partial, e.g. 2026-02-26)
    --session <id>    Filter by session ID (partial match)
    --tail <n>        Show last N events (default: 50)
    --all             Show all events (no tail limit)
    --json            Output raw JSONL
    -h, --help        Show this help
`);
}

function run() {
  const opts = parseArgs(process.argv);

  if (!fs.existsSync(HOOK_LOG_PATH)) {
    console.error(`${C.ERR}No hook log found at ${HOOK_LOG_PATH}${RESET}`);
    process.exit(0);
  }

  const rawLines = fs.readFileSync(HOOK_LOG_PATH, 'utf8').trim().split('\n').filter(Boolean);
  let entries = rawLines.map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);

  // Apply filters
  if (opts.hook) {
    entries = entries.filter(e => e.hook === opts.hook);
  }

  if (opts.since) {
    const sinceDate = new Date(opts.since);
    if (!isNaN(sinceDate.getTime())) {
      entries = entries.filter(e => e.ts && new Date(e.ts) >= sinceDate);
    }
  }

  if (opts.session) {
    entries = entries.filter(e =>
      e.session_id && String(e.session_id).includes(opts.session)
    );
  }

  // Apply tail
  if (opts.tail > 0 && entries.length > opts.tail) {
    entries = entries.slice(-opts.tail);
  }

  // JSON mode: raw output
  if (opts.json) {
    entries.forEach(e => console.log(JSON.stringify(e)));
    process.exit(0);
  }

  // Human-readable table
  if (entries.length === 0) {
    console.log(`${C.WARN}No matching hook events found.${RESET}`);
    process.exit(0);
  }

  const fileStat = fs.statSync(HOOK_LOG_PATH);
  const width = process.stdout.columns || 100;

  console.log();
  console.log(`${C.HEADER}  Hook Event Log${RESET}`);
  console.log(`${C.DIM}  File: ${HOOK_LOG_PATH}${RESET}`);
  console.log(`${C.DIM}  Size: ${formatBytes(fileStat.size)} | Showing: ${entries.length} events${RESET}`);
  console.log(`${C.DIM}${'─'.repeat(Math.min(width, 110))}${RESET}`);
  console.log(`${C.DIM}  ${padRight('#', 5)} ${padRight('TIME', 10)} ${padRight('HOOK', 18)} ${padRight('EVENT', 24)} SESSION${RESET}`);
  console.log(`${C.DIM}${'─'.repeat(Math.min(width, 110))}${RESET}`);

  entries.forEach((e, i) => {
    const idx = padLeft(String(i + 1), 4);
    const time = e.ts
      ? new Date(e.ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : '??:??:??';
    const hook = padRight(e.hook || '?', 17);
    const event = padRight(e.event || '?', 23);
    const session = (e.session_id || '-').slice(0, 30);

    console.log(`  ${C.INDEX}${idx}${RESET}  ${C.TIME}${time}${RESET}  ${C.HOOK}${hook}${RESET} ${C.EVENT}${event}${RESET} ${C.SESSION}${session}${RESET}`);
  });

  console.log(`${C.DIM}${'─'.repeat(Math.min(width, 110))}${RESET}`);

  // Summary stats
  const hookCounts = {};
  entries.forEach(e => {
    const key = e.hook || 'unknown';
    hookCounts[key] = (hookCounts[key] || 0) + 1;
  });

  console.log();
  console.log(`${C.STAT}  Summary:${RESET}`);
  Object.keys(hookCounts).sort().forEach(hook => {
    console.log(`${C.STAT}    ${padRight(hook, 20)} ${hookCounts[hook]} events${RESET}`);
  });
  console.log(`${C.STAT}    ${'─'.repeat(30)}${RESET}`);
  console.log(`${C.STAT}    ${padRight('Total', 20)} ${entries.length} events${RESET}`);
  console.log();
}

try {
  run();
} catch (error) {
  console.error(`${C.ERR}Hook log viewer error: ${error.message}${RESET}`);
  process.exit(0); // fail-safe
}
