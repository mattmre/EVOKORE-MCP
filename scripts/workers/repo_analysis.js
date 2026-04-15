#!/usr/bin/env node
'use strict';

/**
 * repo_analysis worker -- runs `git status`, `git log --oneline -5`, counts
 * uncommitted files. PR count is best-effort via `gh pr list` (skipped on
 * failure to keep the worker network-independent).
 */

const { spawnSync } = require('child_process');

function send(msg) {
  if (typeof process.send === 'function') {
    try { process.send(msg); } catch { /* ignore */ }
  }
}

function parseOptions() {
  try { return JSON.parse(process.env.WORKER_OPTIONS || '{}'); } catch { return {}; }
}

function runCmd(cmd, args, cwd) {
  try {
    const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: false, timeout: 15_000 });
    return { stdout: r.stdout || '', stderr: r.stderr || '', code: r.status };
  } catch (err) {
    return { stdout: '', stderr: err && err.message ? err.message : String(err), code: -1 };
  }
}

(function main() {
  send({ type: 'start', workerId: process.env.WORKER_ID });

  const opts = parseOptions();
  const cwd = opts.cwd || process.cwd();

  try {
    const branchRes = runCmd('git', ['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
    const branch = String(branchRes.stdout || '').trim();

    const statusRes = runCmd('git', ['status', '--porcelain=v1'], cwd);
    const uncommittedFiles = String(statusRes.stdout || '')
      .split(/\r?\n/)
      .filter((l) => l.length > 0).length;

    const logRes = runCmd('git', ['log', '--oneline', '-5'], cwd);
    const recentCommits = String(logRes.stdout || '')
      .split(/\r?\n/)
      .filter((l) => l.length > 0);

    let openPRs = null;
    if (opts.includePRs === true) {
      const prRes = runCmd('gh', ['pr', 'list', '--state', 'open', '--json', 'number'], cwd);
      if (prRes.code === 0) {
        try { openPRs = JSON.parse(prRes.stdout || '[]').length; } catch { openPRs = null; }
      }
    }

    send({
      type: 'complete',
      result: {
        cwd,
        branch,
        uncommittedFiles,
        recentCommits,
        openPRs,
      },
    });
    process.exit(0);
  } catch (err) {
    send({ type: 'error', error: err && err.message ? err.message : String(err) });
    process.exit(1);
  }
})();
