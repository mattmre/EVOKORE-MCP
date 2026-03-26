#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { writeHookEvent, sanitizeId } = require('./hook-observability');
const { writeSessionState, resolveCanonicalRepoRoot, SESSIONS_DIR } = require('./session-continuity');

const RESET = '\x1b[0m';
const C = {
  EMERALD: '\x1b[38;2;74;222;128m',
  ROSE: '\x1b[38;2;251;113;133m',
  SLATE: '\x1b[38;2;148;163;184m',
  BLUE: '\x1b[38;2;59;130;246m',
  DIM: '\x1b[38;2;71;85;105m',
  ORANGE: '\x1b[38;2;251;146;60m'
};

function resolveAutoSessionId() {
  const candidates = [
    process.env.EVOKORE_SESSION_ID,
    process.env.CLAUDE_SESSION_ID,
    process.env.CLAUDE_CODE_SESSION_ID,
    process.env.SESSION_ID
  ];
  for (const candidate of candidates) {
    if (candidate && String(candidate).trim()) return String(candidate).trim();
  }
  return null;
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
  function emitCli(event, details) {
    writeHookEvent(Object.assign({
      hook: 'tilldone',
      mode: 'cli',
      event
    }, details || {}));
  }

  function getArg(flag) {
    const idx = args.indexOf(flag);
    if (idx === -1 || idx + 1 >= args.length) return null;
    return args[idx + 1];
  }

  function hasFlag(flag) {
    return args.includes(flag);
  }

  let sessionId = getArg('--session');
  if (sessionId === 'auto') {
    sessionId = resolveAutoSessionId();
  }

  if (!sessionId) {
    emitCli('cli_error', { reason: 'missing_session' });
    console.error(`${C.ROSE}Error: --session ID is required (or use --session auto with EVOKORE_SESSION_ID/CLAUDE_SESSION_ID env)${RESET}`);
    process.exit(1);
  }

  if (hasFlag('--add')) {
    const text = getArg('--add');
    if (!text) {
      emitCli('cli_error', { reason: 'missing_add_text', session_id: sessionId });
      console.error(`${C.ROSE}Error: --add requires task text${RESET}`);
      process.exit(1);
    }
    const tasks = loadTasks(sessionId);
    tasks.push({ text, done: false, added: new Date().toISOString() });
    saveTasks(sessionId, tasks);
    writeSessionState(sessionId, {
      workspaceRoot: process.cwd(),
      canonicalRepoRoot: resolveCanonicalRepoRoot(process.cwd()),
      repoName: path.basename(process.cwd()),
      status: 'active',
      lastTaskAction: 'add',
      lastActivityAt: new Date().toISOString()
    });
    emitCli('cli_action', { action: 'add', session_id: sessionId });
    console.log(`${C.EMERALD}Added:${RESET} ${text}`);
    formatTaskList(tasks, false);
  } else if (hasFlag('--toggle')) {
    const num = parseInt(getArg('--toggle'), 10);
    const tasks = loadTasks(sessionId);
    if (isNaN(num) || num < 1 || num > tasks.length) {
      emitCli('cli_error', { reason: 'invalid_toggle_number', session_id: sessionId });
      console.error(`${C.ROSE}Error: Invalid task number ${num}${RESET}`);
      process.exit(1);
    }
    tasks[num - 1].done = !tasks[num - 1].done;
    saveTasks(sessionId, tasks);
    writeSessionState(sessionId, {
      workspaceRoot: process.cwd(),
      canonicalRepoRoot: resolveCanonicalRepoRoot(process.cwd()),
      repoName: path.basename(process.cwd()),
      status: 'active',
      lastTaskAction: 'toggle',
      lastActivityAt: new Date().toISOString()
    });
    emitCli('cli_action', { action: 'toggle', session_id: sessionId });
    formatTaskList(tasks, false);
  } else if (hasFlag('--done')) {
    const num = parseInt(getArg('--done'), 10);
    const tasks = loadTasks(sessionId);
    if (isNaN(num) || num < 1 || num > tasks.length) {
      emitCli('cli_error', { reason: 'invalid_done_number', session_id: sessionId });
      console.error(`${C.ROSE}Error: Invalid task number ${num}${RESET}`);
      process.exit(1);
    }
    tasks[num - 1].done = true;
    saveTasks(sessionId, tasks);
    writeSessionState(sessionId, {
      workspaceRoot: process.cwd(),
      canonicalRepoRoot: resolveCanonicalRepoRoot(process.cwd()),
      repoName: path.basename(process.cwd()),
      status: 'active',
      lastTaskAction: 'done',
      lastActivityAt: new Date().toISOString()
    });
    emitCli('cli_action', { action: 'done', session_id: sessionId });
    formatTaskList(tasks, false);
  } else if (hasFlag('--list')) {
    const tasks = loadTasks(sessionId);
    writeSessionState(sessionId, {
      workspaceRoot: process.cwd(),
      canonicalRepoRoot: resolveCanonicalRepoRoot(process.cwd()),
      repoName: path.basename(process.cwd()),
      status: 'active',
      lastTaskAction: 'list',
      lastActivityAt: new Date().toISOString()
    });
    emitCli('cli_action', { action: 'list', session_id: sessionId });
    formatTaskList(tasks, false);
  } else if (hasFlag('--clear')) {
    saveTasks(sessionId, []);
    writeSessionState(sessionId, {
      workspaceRoot: process.cwd(),
      canonicalRepoRoot: resolveCanonicalRepoRoot(process.cwd()),
      repoName: path.basename(process.cwd()),
      status: 'active',
      lastTaskAction: 'clear',
      lastActivityAt: new Date().toISOString()
    });
    emitCli('cli_action', { action: 'clear', session_id: sessionId });
    console.log(`${C.ORANGE}Tasks cleared for session ${sessionId}${RESET}`);
  } else {
    emitCli('cli_error', { reason: 'invalid_usage', session_id: sessionId });
    console.error(`${C.ROSE}Usage: tilldone.js --add "text" | --toggle N | --done N | --list | --clear  --session ID|auto${RESET}`);
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
      writeSessionState(sessionId, {
        workspaceRoot: process.cwd(),
        canonicalRepoRoot: resolveCanonicalRepoRoot(process.cwd()),
        repoName: path.basename(process.cwd()),
        status: 'active',
        lastStopCheckAt: new Date().toISOString(),
        lastStopCheckResult: 'blocked',
        lastActivityAt: new Date().toISOString()
      });
      writeHookEvent({
        hook: 'tilldone',
        mode: 'hook',
        event: 'hook_mode_block',
        session_id: sessionId,
        incomplete_count: incomplete.length
      });
      process.stderr.write(`\n${C.ROSE}⚠ TillDone: ${incomplete.length} incomplete task(s) remain!${RESET}\n`);
      formatTaskList(tasks, true);
      process.stderr.write(`${C.ORANGE}Complete all tasks before ending the session, or run:${RESET}\n`);
      process.stderr.write(`${C.SLATE}  node scripts/tilldone.js --clear --session ${sessionId}${RESET}\n\n`);
      process.exit(2);
    }

    writeSessionState(sessionId, {
      workspaceRoot: process.cwd(),
      canonicalRepoRoot: resolveCanonicalRepoRoot(process.cwd()),
      repoName: path.basename(process.cwd()),
      status: 'active',
      lastStopCheckAt: new Date().toISOString(),
      lastStopCheckResult: 'clear',
      lastActivityAt: new Date().toISOString()
    });
    writeHookEvent({
      hook: 'tilldone',
      mode: 'hook',
      event: 'hook_mode_allow',
      session_id: sessionId
    });

    // Auto-memory sync on session-wrap boundary (M1.2)
    if (String(process.env.EVOKORE_AUTO_MEMORY_SYNC || '').toLowerCase() !== 'false') {
      try {
        // Only sync if the session had meaningful activity
        const { readSessionState: readState } = require('./session-continuity');
        const sessionState = readState(sessionId);
        const hasActivity = sessionState && (
          (sessionState.metrics && sessionState.metrics.replayEntries > 0) ||
          (sessionState.metrics && sessionState.metrics.evidenceEntries > 0) ||
          sessionState.lastToolName ||
          sessionState.lastActivityAt
        );
        if (hasActivity) {
          const { syncMemory } = require('./claude-memory');
          const memResult = syncMemory({ quiet: true, sessionId });
          writeHookEvent({
            hook: 'tilldone',
            mode: 'hook',
            event: 'auto_memory_sync',
            session_id: sessionId,
            synced: memResult.synced,
            error: memResult.error || null
          });
        } else {
          writeHookEvent({
            hook: 'tilldone',
            mode: 'hook',
            event: 'auto_memory_sync_skipped',
            session_id: sessionId,
            reason: 'no_meaningful_activity'
          });
        }
      } catch (memErr) {
        // Fail-safe: never block session stop due to memory sync failure
        if (process.env.EVOKORE_DEBUG) {
          process.stderr.write(`[auto-memory] sync failed: ${memErr && memErr.message ? memErr.message : memErr}\n`);
        }
        writeHookEvent({
          hook: 'tilldone',
          mode: 'hook',
          event: 'auto_memory_sync_error',
          session_id: sessionId,
          error: String(memErr && memErr.message ? memErr.message : memErr)
        });
      }
    }

    process.exit(0);
  } catch (error) {
    // Fail safe — allow stop
    writeHookEvent({
      hook: 'tilldone',
      mode: 'hook',
      event: 'hook_mode_fail_safe',
      error: String(error && error.message ? error.message : error)
    });
    process.exit(0);
  }
});
