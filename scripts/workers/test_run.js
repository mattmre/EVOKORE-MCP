#!/usr/bin/env node
'use strict';

/**
 * test_run worker -- runs `npx vitest run` (or a user-provided cmd) and
 * captures pass/fail counts and trimmed output.
 */

const { spawnSync } = require('child_process');
const path = require('path');

function send(msg) {
  if (typeof process.send === 'function') {
    try { process.send(msg); } catch { /* ignore IPC errors */ }
  }
}

function parseOptions() {
  try { return JSON.parse(process.env.WORKER_OPTIONS || '{}'); } catch { return {}; }
}

function clip(text, max) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + `\n...[truncated ${text.length - max} chars]` : text;
}

function parseVitestSummary(output) {
  const out = String(output || '');
  // Vitest "Tests" line (varies in newer versions); accept e.g. "Tests  10 passed (10)" or "Test Files  3 passed | 1 failed (4)"
  const passedMatch = out.match(/Tests\s+([\d]+)\s+passed/i);
  const failedMatch = out.match(/([\d]+)\s+failed/i);
  return {
    passed: passedMatch ? parseInt(passedMatch[1], 10) : null,
    failed: failedMatch ? parseInt(failedMatch[1], 10) : 0,
  };
}

(function main() {
  send({ type: 'start', workerId: process.env.WORKER_ID });

  const opts = parseOptions();
  const cwd = opts.cwd || process.cwd();
  const cmd = opts.cmd || 'npx';
  const args = Array.isArray(opts.args) && opts.args.length > 0
    ? opts.args
    : ['vitest', 'run', '--reporter=default'];
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 120_000;

  let result;
  try {
    const isWindows = process.platform === 'win32';
    const realCmd = isWindows && cmd === 'npx' ? 'npx.cmd' : cmd;
    const r = spawnSync(realCmd, args, {
      cwd,
      timeout: timeoutMs,
      encoding: 'utf8',
      shell: false,
    });
    const stdout = clip(r.stdout || '', 8000);
    const stderr = clip(r.stderr || '', 4000);
    const summary = parseVitestSummary((r.stdout || '') + '\n' + (r.stderr || ''));
    result = {
      cwd,
      cmd: `${realCmd} ${args.join(' ')}`,
      exitCode: r.status,
      timedOut: r.error && r.error.code === 'ETIMEDOUT',
      passed: summary.passed,
      failed: summary.failed,
      output: stdout,
      stderr,
    };
  } catch (err) {
    send({ type: 'error', error: err && err.message ? err.message : String(err) });
    process.exit(1);
    return;
  }

  send({ type: 'complete', result });
  process.exit(0);
})();
