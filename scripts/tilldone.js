#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const SESSIONS_DIR = path.join(os.homedir(), '.evokore', 'sessions');

const RESET = '\x1b[0m';
const C = {
  EMERALD: '\x1b[38;2;74;222;128m',
  ROSE: '\x1b[38;2;251;113;133m',
  SLATE: '\x1b[38;2;148;163;184m',
  BLUE: '\x1b[38;2;59;130;246m',
  DIM: '\x1b[38;2;71;85;105m',
  ORANGE: '\x1b[38;2;251;146;60m'
};

function sanitizeId(id) {
  return String(id || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function ensureDir() {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

function tasksPath(sessionId) {
  return path.join(SESSIONS_DIR, `${sanitizeId(sessionId)}-tasks.json`);
}

function loadTasks(sessionId) {
  const p = tasksPath(sessionId);
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return []; }
}

function saveTasks(sessionId, tasks) {
  ensureDir();
  fs.writeFileSync(tasksPath(sessionId), JSON.stringify(tasks, null, 2));
}

function formatTaskList(tasks, useStderr) {
  const write = useStderr ? process.stderr.write.bind(process.stderr) : process.stdout.write.bind(process.stdout);
  if (tasks.length === 0) {
    write(`${C.DIM}No tasks.${RESET}\n`);
    return;
  }

  const done = tasks.filter(t => t.done).length;
  const total = tasks.length;
  write(`\n${C.BLUE}  TillDone Tasks${RESET} ${C.SLATE}(${done}/${total} complete)${RESET}\n`);
  write(`${C.DIM}${'─'.repeat(50)}${RESET}\n`);

  tasks.forEach((t, i) => {
    const icon = t.done ? `${C.EMERALD}✓${RESET}` : `${C.ROSE}○${RESET}`;
    const text = t.done ? `${C.DIM}${t.text}${RESET}` : `${C.SLATE}${t.text}${RESET}`;
    write(`  ${icon} ${C.DIM}${String(i + 1).padStart(2)}.${RESET} ${text}\n`);
  });
  write(`${C.DIM}${'─'.repeat(50)}${RESET}\n\n`);
}

// --- CLI mode ---
if (process.argv.length > 2) {
  const args = process.argv.slice(2);

  function getArg(flag) {
    const idx = args.indexOf(flag);
    if (idx === -1 || idx + 1 >= args.length) return null;
    return args[idx + 1];
  }

  function hasFlag(flag) {
    return args.includes(flag);
  }

  const sessionId = getArg('--session');
  if (!sessionId) {
    console.error(`${C.ROSE}Error: --session ID is required${RESET}`);
    process.exit(1);
  }

  if (hasFlag('--add')) {
    const text = getArg('--add');
    if (!text) {
      console.error(`${C.ROSE}Error: --add requires task text${RESET}`);
      process.exit(1);
    }
    const tasks = loadTasks(sessionId);
    tasks.push({ text, done: false, added: new Date().toISOString() });
    saveTasks(sessionId, tasks);
    console.log(`${C.EMERALD}Added:${RESET} ${text}`);
    formatTaskList(tasks, false);
  } else if (hasFlag('--toggle')) {
    const num = parseInt(getArg('--toggle'), 10);
    const tasks = loadTasks(sessionId);
    if (isNaN(num) || num < 1 || num > tasks.length) {
      console.error(`${C.ROSE}Error: Invalid task number ${num}${RESET}`);
      process.exit(1);
    }
    tasks[num - 1].done = !tasks[num - 1].done;
    saveTasks(sessionId, tasks);
    formatTaskList(tasks, false);
  } else if (hasFlag('--done')) {
    const num = parseInt(getArg('--done'), 10);
    const tasks = loadTasks(sessionId);
    if (isNaN(num) || num < 1 || num > tasks.length) {
      console.error(`${C.ROSE}Error: Invalid task number ${num}${RESET}`);
      process.exit(1);
    }
    tasks[num - 1].done = true;
    saveTasks(sessionId, tasks);
    formatTaskList(tasks, false);
  } else if (hasFlag('--list')) {
    const tasks = loadTasks(sessionId);
    formatTaskList(tasks, false);
  } else if (hasFlag('--clear')) {
    saveTasks(sessionId, []);
    console.log(`${C.ORANGE}Tasks cleared for session ${sessionId}${RESET}`);
  } else {
    console.error(`${C.ROSE}Usage: tilldone.js --add "text" | --toggle N | --done N | --list | --clear  --session ID${RESET}`);
    process.exit(1);
  }

  process.exit(0);
}

// --- Hook mode (stdin) ---
let input = '';
process.stdin.on('data', (chunk) => input += chunk);
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(input);
    const sessionId = sanitizeId(payload.session_id);
    const tasks = loadTasks(sessionId);

    const incomplete = tasks.filter(t => !t.done);

    if (incomplete.length > 0) {
      process.stderr.write(`\n${C.ROSE}⚠ TillDone: ${incomplete.length} incomplete task(s) remain!${RESET}\n`);
      formatTaskList(tasks, true);
      process.stderr.write(`${C.ORANGE}Complete all tasks before ending the session, or run:${RESET}\n`);
      process.stderr.write(`${C.SLATE}  node scripts/tilldone.js --clear --session ${sessionId}${RESET}\n\n`);
      process.exit(2);
    }

    process.exit(0);
  } catch {
    // Fail safe — allow stop
    process.exit(0);
  }
});
