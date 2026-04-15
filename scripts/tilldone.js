#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { writeHookEvent, sanitizeId } = require('./hook-observability');
const { SESSIONS_DIR } = require('./session-continuity');

// Phase 0-D: appendEvent is the canonical write path. compactIfNeeded rolls
// the JSONL manifest into a `__snapshot__` line when it exceeds the threshold.
// Require is wrapped so a missing dist build fails open without crashing.
let appendEvent = () => {};
let compactIfNeeded = async () => false;
try {
  // eslint-disable-next-line global-require
  const manifest = require('../dist/SessionManifest.js');
  if (manifest && typeof manifest.appendEvent === 'function') {
    appendEvent = manifest.appendEvent;
  }
  if (manifest && typeof manifest.compactIfNeeded === 'function') {
    compactIfNeeded = manifest.compactIfNeeded;
  }
} catch {
  // Fail open — CLI and hook still work, just without manifest events.
}

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

// --- Wave 2 Phase 2.5-C: dependency graph ---
//
// Task schema (additive, all new fields optional):
//   { text, done, added,
//     depends_on?: string[],   // task texts (substring) OR task indices ("1","2")
//     blocked_by?: string[],   // derived: subset of depends_on still incomplete
//     domain?: string }        // optional grouping tag
//
// Old tasks without these fields are returned untouched by recomputeBlocked()
// and treated as unblocked.
function findTaskByRef(tasks, ref) {
  if (ref == null) return -1;
  const refStr = String(ref).trim();
  if (refStr.length === 0) return -1;
  // Numeric reference => 1-based index
  if (/^\d+$/.test(refStr)) {
    const idx = parseInt(refStr, 10) - 1;
    if (idx >= 0 && idx < tasks.length) return idx;
    return -1;
  }
  // Otherwise: case-insensitive substring match against task text
  const lower = refStr.toLowerCase();
  for (let i = 0; i < tasks.length; i++) {
    if (String(tasks[i].text || '').toLowerCase().includes(lower)) return i;
  }
  return -1;
}

function recomputeBlocked(tasks) {
  const newlyUnblocked = [];
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    if (!Array.isArray(t.depends_on) || t.depends_on.length === 0) {
      // No deps -- ensure blocked_by stays empty for consistency.
      if (Array.isArray(t.blocked_by) && t.blocked_by.length > 0) {
        const prev = t.blocked_by.slice();
        t.blocked_by = [];
        if (!t.done) newlyUnblocked.push({ index: i, text: t.text, previouslyBlockedBy: prev });
      }
      continue;
    }
    const stillBlocked = [];
    for (const ref of t.depends_on) {
      const depIdx = findTaskByRef(tasks, ref);
      if (depIdx === -1) {
        // Unknown ref -- treat as still blocking so we surface the issue.
        stillBlocked.push(ref);
      } else if (!tasks[depIdx].done) {
        stillBlocked.push(ref);
      }
    }
    const wasBlocked = Array.isArray(t.blocked_by) && t.blocked_by.length > 0;
    t.blocked_by = stillBlocked;
    const isNowUnblocked = stillBlocked.length === 0;
    if (wasBlocked && isNowUnblocked && !t.done) {
      newlyUnblocked.push({ index: i, text: t.text, domain: t.domain || null });
    }
  }
  return newlyUnblocked;
}

function groupByDomain(tasks) {
  const groups = new Map();
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const key = t.domain || '__none__';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ index: i, task: t });
  }
  return groups;
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
    const blocked = !t.done && Array.isArray(t.blocked_by) && t.blocked_by.length > 0;
    const icon = t.done
      ? `${C.EMERALD}✓${RESET}`
      : blocked ? `${C.ORANGE}⊘${RESET}` : `${C.ROSE}○${RESET}`;
    const text = t.done ? `${C.DIM}${t.text}${RESET}` : `${C.SLATE}${t.text}${RESET}`;
    const domainTag = t.domain ? ` ${C.DIM}[${t.domain}]${RESET}` : '';
    const blockedTag = blocked ? ` ${C.ORANGE}(blocked by: ${t.blocked_by.join(', ')})${RESET}` : '';
    write(`  ${icon} ${C.DIM}${String(i + 1).padStart(2)}.${RESET} ${text}${domainTag}${blockedTag}\n`);
  });
  write(`${C.DIM}${'─'.repeat(50)}${RESET}\n\n`);
}

// Expose helpers for tests and for purpose-gate's auto-inject path. The
// CLI/hook entrypoints below only run on direct invocation (so test files
// that `require('./tilldone.js')` get the helpers without consuming stdin
// or triggering the CLI flag parser).
module.exports = {
  loadTasks,
  saveTasks,
  recomputeBlocked,
  groupByDomain,
  findTaskByRef,
  tasksPath,
};

const tilldoneMainFilename = (require.main && require.main.filename) ? require.main.filename : '';
const tilldoneMainBase = path.basename(tilldoneMainFilename);
const isTilldoneDirectInvocation =
  require.main === module ||
  (tilldoneMainBase === 'tilldone.js' && path.basename(path.dirname(tilldoneMainFilename)) === 'hooks');

if (!isTilldoneDirectInvocation) {
  return;
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
    const newTask = { text, done: false, added: new Date().toISOString() };
    const dependsOnRaw = getArg('--depends-on');
    if (dependsOnRaw) {
      newTask.depends_on = String(dependsOnRaw).split(',').map(s => s.trim()).filter(s => s.length > 0);
    }
    const domain = getArg('--domain');
    if (domain) newTask.domain = String(domain).trim();
    tasks.push(newTask);
    recomputeBlocked(tasks);
    saveTasks(sessionId, tasks);
    appendEvent(sessionId, {
      type: 'task_action',
      payload: { action: 'add', taskIndex: tasks.length - 1, taskText: text }
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
    const unblocked = recomputeBlocked(tasks);
    saveTasks(sessionId, tasks);
    appendEvent(sessionId, {
      type: 'task_action',
      payload: {
        action: 'toggle',
        taskIndex: num - 1,
        taskText: tasks[num - 1].text,
        newlyUnblocked: unblocked
      }
    });
    emitCli('cli_action', { action: 'toggle', session_id: sessionId });
    formatTaskList(tasks, false);
    if (unblocked.length > 0) {
      console.log(`${C.EMERALD}Unblocked ${unblocked.length} task(s):${RESET} ${unblocked.map(u => u.text).join(', ')}`);
    }
  } else if (hasFlag('--done')) {
    const num = parseInt(getArg('--done'), 10);
    const tasks = loadTasks(sessionId);
    if (isNaN(num) || num < 1 || num > tasks.length) {
      emitCli('cli_error', { reason: 'invalid_done_number', session_id: sessionId });
      console.error(`${C.ROSE}Error: Invalid task number ${num}${RESET}`);
      process.exit(1);
    }
    tasks[num - 1].done = true;
    const unblocked = recomputeBlocked(tasks);
    saveTasks(sessionId, tasks);
    appendEvent(sessionId, {
      type: 'task_action',
      payload: {
        action: 'done',
        taskIndex: num - 1,
        taskText: tasks[num - 1].text,
        newlyUnblocked: unblocked
      }
    });
    emitCli('cli_action', { action: 'done', session_id: sessionId });
    formatTaskList(tasks, false);
    if (unblocked.length > 0) {
      console.log(`${C.EMERALD}Unblocked ${unblocked.length} task(s):${RESET} ${unblocked.map(u => u.text).join(', ')}`);
    }
  } else if (hasFlag('--list')) {
    const tasks = loadTasks(sessionId);
    recomputeBlocked(tasks);
    appendEvent(sessionId, {
      type: 'task_action',
      payload: { action: 'list' }
    });
    emitCli('cli_action', { action: 'list', session_id: sessionId });
    formatTaskList(tasks, false);
  } else if (hasFlag('--clear')) {
    saveTasks(sessionId, []);
    appendEvent(sessionId, {
      type: 'task_action',
      payload: { action: 'clear' }
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
process.stdin.on('end', async () => {
  try {
    const payload = JSON.parse(input);
    const sessionId = sanitizeId(payload.session_id);
    const tasks = loadTasks(sessionId);
    // Recompute blocked_by so Stop hook surfaces fresh dependency status.
    recomputeBlocked(tasks);

    const incomplete = tasks.filter(t => !t.done);

    if (incomplete.length > 0) {
      const hasDomains = incomplete.some(t => !!t.domain);
      const blocked = incomplete.filter(t => Array.isArray(t.blocked_by) && t.blocked_by.length > 0);
      const ready = incomplete.filter(t => !Array.isArray(t.blocked_by) || t.blocked_by.length === 0);

      appendEvent(sessionId, {
        type: 'stop_check',
        payload: {
          result: 'blocked',
          incompleteCount: incomplete.length,
          blockedCount: blocked.length,
          readyCount: ready.length,
          hasDomains
        }
      });
      writeHookEvent({
        hook: 'tilldone',
        mode: 'hook',
        event: 'hook_mode_block',
        session_id: sessionId,
        incomplete_count: incomplete.length,
        blocked_count: blocked.length,
        ready_count: ready.length
      });
      // Compaction opportunity on every Stop boundary (Phase 0-D).
      try { await compactIfNeeded(sessionId); } catch { /* best effort */ }
      process.stderr.write(`\n${C.ROSE}⚠ TillDone: ${incomplete.length} incomplete task(s) remain!${RESET}\n`);
      if (blocked.length > 0) {
        process.stderr.write(`${C.SLATE}  ${ready.length} ready, ${blocked.length} blocked by deps${RESET}\n`);
      }
      formatTaskList(tasks, true);
      if (hasDomains) {
        const groups = groupByDomain(incomplete);
        process.stderr.write(`${C.BLUE}  Grouped by domain:${RESET}\n`);
        for (const [domain, items] of groups.entries()) {
          const label = domain === '__none__' ? '(no domain)' : domain;
          process.stderr.write(`${C.SLATE}  ${label}:${RESET} ${items.length} task(s)\n`);
        }
      }
      process.stderr.write(`${C.ORANGE}Complete all tasks before ending the session, or run:${RESET}\n`);
      process.stderr.write(`${C.SLATE}  node scripts/tilldone.js --clear --session ${sessionId}${RESET}\n\n`);
      process.exit(2);
    }

    appendEvent(sessionId, {
      type: 'stop_check',
      payload: { result: 'clear', incompleteCount: 0 }
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

    // Phase 0-D: compact the JSONL manifest on Stop boundary.
    try { await compactIfNeeded(sessionId); } catch { /* best effort */ }

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
