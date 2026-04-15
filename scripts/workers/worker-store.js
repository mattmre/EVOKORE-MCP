'use strict';

/**
 * Shared worker output storage helpers.
 *
 * Worker outputs live in `~/.evokore/workers/{sessionId}/{workerId}.json`.
 * Each file is a single JSON document of the form:
 *   {
 *     workerId: string,
 *     workerScript: string,         // e.g. "test_run"
 *     status: 'pending'|'running'|'complete'|'error',
 *     startedAt: ISO8601,
 *     completedAt?: ISO8601,
 *     result?: any,
 *     error?: string
 *   }
 *
 * Module is intentionally side-effect free at load time so worker child
 * scripts can require it without paying any setup cost beyond fs/path.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const WORKERS_ROOT = path.join(os.homedir(), '.evokore', 'workers');

function sanitizeId(id) {
  return String(id == null ? '' : id).replace(/[^a-zA-Z0-9_-]/g, '_') || 'unknown';
}

function workersDirFor(sessionId) {
  return path.join(WORKERS_ROOT, sanitizeId(sessionId));
}

function workerPathFor(sessionId, workerId) {
  return path.join(workersDirFor(sessionId), `${sanitizeId(workerId)}.json`);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function newWorkerId(workerScript) {
  const hex = crypto.randomBytes(6).toString('hex');
  const safeScript = sanitizeId(workerScript);
  return `${safeScript}-${Date.now()}-${hex}`;
}

function writeWorkerState(sessionId, workerId, state) {
  ensureDir(workersDirFor(sessionId));
  fs.writeFileSync(workerPathFor(sessionId, workerId), JSON.stringify(state, null, 2));
}

function readWorkerState(sessionId, workerId) {
  const p = workerPathFor(sessionId, workerId);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function listWorkerStates(sessionId) {
  const dir = workersDirFor(sessionId);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    try {
      const raw = fs.readFileSync(path.join(dir, file), 'utf8');
      out.push(JSON.parse(raw));
    } catch { /* skip malformed */ }
  }
  return out;
}

module.exports = {
  WORKERS_ROOT,
  workersDirFor,
  workerPathFor,
  ensureDir,
  newWorkerId,
  writeWorkerState,
  readWorkerState,
  listWorkerStates,
  sanitizeId,
};
