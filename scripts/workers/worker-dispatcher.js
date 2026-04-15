'use strict';

/**
 * Async worker dispatcher (Wave 2 Phase 2.5-B).
 *
 * Forks `scripts/workers/{type}.js` as a detached child, writes an initial
 * `pending`/`running` state file, and returns immediately with the workerId.
 *
 * Worker scripts communicate over IPC:
 *   process.send({ type: 'start',    workerId })
 *   process.send({ type: 'complete', result })
 *   process.send({ type: 'error',    error })
 *
 * The dispatcher mirrors those messages into the shared JSON state file so
 * that `worker_context` (and other consumers) can poll without IPC.
 */

const path = require('path');
const { fork } = require('child_process');
const {
  newWorkerId,
  writeWorkerState,
  readWorkerState,
  listWorkerStates,
  workerPathFor,
  workersDirFor,
} = require('./worker-store');

const ALLOWED_WORKERS = new Set(['test_run', 'repo_analysis', 'security_scan', 'benchmark']);

function isAllowedWorkerType(workerType) {
  return ALLOWED_WORKERS.has(String(workerType));
}

function workerScriptPath(workerType) {
  return path.join(__dirname, `${workerType}.js`);
}

/**
 * Dispatch a worker. Synchronous from the caller's POV — returns
 * `{ workerId }` after the initial `pending` state file is written.
 *
 * Options:
 *   detached      (default true)  — outlive the dispatching process
 *   silent        (default true)  — don't pipe stdio to parent
 *   options       (passed via WORKER_OPTIONS env to the child)
 */
function dispatchWorker(sessionId, workerType, options = {}) {
  if (!isAllowedWorkerType(workerType)) {
    throw new Error(`Unknown worker type: ${workerType}`);
  }

  const workerId = newWorkerId(workerType);
  const startedAt = new Date().toISOString();

  const initialState = {
    workerId,
    workerScript: workerType,
    status: 'pending',
    startedAt,
    options: options || {},
  };
  writeWorkerState(sessionId, workerId, initialState);

  const env = Object.assign({}, process.env, {
    WORKER_ID: workerId,
    WORKER_SESSION_ID: String(sessionId || ''),
    WORKER_TYPE: workerType,
    WORKER_OPTIONS: JSON.stringify(options || {}),
  });

  let child;
  try {
    child = fork(workerScriptPath(workerType), [], {
      env,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      detached: false,
    });
  } catch (err) {
    writeWorkerState(sessionId, workerId, Object.assign({}, initialState, {
      status: 'error',
      completedAt: new Date().toISOString(),
      error: `fork_failed: ${err && err.message ? err.message : String(err)}`,
    }));
    return { workerId };
  }

  child.on('message', (msg) => {
    if (!msg || typeof msg !== 'object') return;
    const current = readWorkerState(sessionId, workerId) || initialState;
    if (msg.type === 'start') {
      writeWorkerState(sessionId, workerId, Object.assign({}, current, {
        status: 'running',
      }));
    } else if (msg.type === 'complete') {
      writeWorkerState(sessionId, workerId, Object.assign({}, current, {
        status: 'complete',
        completedAt: new Date().toISOString(),
        result: msg.result == null ? null : msg.result,
      }));
    } else if (msg.type === 'error') {
      writeWorkerState(sessionId, workerId, Object.assign({}, current, {
        status: 'error',
        completedAt: new Date().toISOString(),
        error: typeof msg.error === 'string' ? msg.error : JSON.stringify(msg.error),
      }));
    }
  });

  child.on('error', (err) => {
    const current = readWorkerState(sessionId, workerId) || initialState;
    if (current.status === 'complete' || current.status === 'error') return;
    writeWorkerState(sessionId, workerId, Object.assign({}, current, {
      status: 'error',
      completedAt: new Date().toISOString(),
      error: `child_error: ${err && err.message ? err.message : String(err)}`,
    }));
  });

  child.on('exit', (code) => {
    const current = readWorkerState(sessionId, workerId) || initialState;
    if (current.status === 'complete' || current.status === 'error') return;
    if (code === 0) {
      // Worker exited cleanly without sending 'complete' — record as complete with empty result.
      writeWorkerState(sessionId, workerId, Object.assign({}, current, {
        status: 'complete',
        completedAt: new Date().toISOString(),
        result: current.result == null ? null : current.result,
      }));
    } else {
      writeWorkerState(sessionId, workerId, Object.assign({}, current, {
        status: 'error',
        completedAt: new Date().toISOString(),
        error: `exit_code_${code}`,
      }));
    }
  });

  // Avoid keeping the parent alive for IPC if it's an MCP server.
  try { child.unref(); } catch { /* ignore */ }

  return { workerId };
}

/**
 * Get the most recent worker of a given type for a session, or null.
 */
function getMostRecentWorker(sessionId, workerType) {
  const all = listWorkerStates(sessionId).filter((w) => w.workerScript === workerType);
  if (all.length === 0) return null;
  all.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  return all[0];
}

/**
 * Get all completed (or error) workers for a session, newest first.
 */
function getCompletedWorkerResults(sessionId) {
  const all = listWorkerStates(sessionId).filter(
    (w) => w.status === 'complete' || w.status === 'error'
  );
  all.sort((a, b) => String(b.completedAt || b.startedAt).localeCompare(String(a.completedAt || a.startedAt)));
  return all;
}

module.exports = {
  ALLOWED_WORKERS,
  isAllowedWorkerType,
  workerScriptPath,
  dispatchWorker,
  getMostRecentWorker,
  getCompletedWorkerResults,
  workerPathFor,
  workersDirFor,
};
