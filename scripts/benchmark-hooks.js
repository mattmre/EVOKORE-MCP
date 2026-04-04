#!/usr/bin/env node
'use strict';

/**
 * Hook Load-Time Benchmark
 *
 * Measures the cold-start overhead of each of the 7 active Claude Code hook
 * scripts by spawning them as subprocesses with minimal stdin payloads,
 * matching how Claude Code actually invokes hooks.
 *
 * This establishes a baseline before any ECC behavioral injection is added.
 *
 * Usage:
 *   node scripts/benchmark-hooks.js
 *   node scripts/benchmark-hooks.js --iterations 5
 *   node scripts/benchmark-hooks.js --json
 */

const path = require('path');
const { performance } = require('perf_hooks');
const { spawnSync } = require('child_process');

const HOOKS_DIR = path.resolve(__dirname, 'hooks');

const HOOKS = [
  {
    name: 'damage-control',
    file: 'damage-control.js',
    type: 'PreToolUse',
    // Minimal valid payload for damage-control (PreToolUse hook)
    payload: JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'echo hello' },
      session_id: 'benchmark-test'
    })
  },
  {
    name: 'purpose-gate',
    file: 'purpose-gate.js',
    type: 'UserPromptSubmit',
    payload: JSON.stringify({
      user_prompt: 'benchmark test',
      session_id: 'benchmark-test'
    })
  },
  {
    name: 'session-replay',
    file: 'session-replay.js',
    type: 'PostToolUse',
    payload: JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'echo hello' },
      tool_result: 'hello',
      session_id: 'benchmark-test'
    })
  },
  {
    name: 'tilldone',
    file: 'tilldone.js',
    type: 'Stop',
    payload: JSON.stringify({
      session_id: 'benchmark-test',
      stop_reason: 'user'
    })
  },
  {
    name: 'evidence-capture',
    file: 'evidence-capture.js',
    type: 'PostToolUse',
    payload: JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'echo hello' },
      tool_result: 'hello',
      session_id: 'benchmark-test'
    })
  },
  {
    name: 'repo-audit-hook',
    file: 'repo-audit-hook.js',
    type: 'UserPromptSubmit',
    payload: JSON.stringify({
      user_prompt: 'benchmark test',
      session_id: 'benchmark-test'
    })
  },
  {
    name: 'voice-stop',
    file: 'voice-stop.js',
    type: 'Stop',
    payload: JSON.stringify({
      session_id: 'benchmark-test',
      stop_reason: 'user'
    })
  }
];

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { iterations: 5, json: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--iterations' && args[i + 1]) {
      opts.iterations = Math.max(1, parseInt(args[i + 1], 10) || 5);
      i++;
    }
    if (args[i] === '--json') {
      opts.json = true;
    }
  }
  return opts;
}

/**
 * Measure a single hook invocation by spawning it as a subprocess.
 * This matches how Claude Code invokes hooks: spawn node, pipe JSON on stdin.
 * We measure wall-clock time from spawn to exit.
 */
function measureSingleRun(hookFile, payload) {
  const scriptPath = path.join(HOOKS_DIR, hookFile);
  const start = performance.now();
  spawnSync(process.execPath, [scriptPath], {
    input: payload,
    timeout: 10000,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, {
      // Prevent repo-audit-hook from doing expensive git operations
      EVOKORE_REPO_AUDIT_HOOK: 'false'
    })
  });
  const end = performance.now();
  return end - start;
}

function runBenchmark(opts) {
  const results = [];

  for (const hook of HOOKS) {
    const times = [];
    for (let i = 0; i < opts.iterations; i++) {
      times.push(measureSingleRun(hook.file, hook.payload));
    }

    times.sort((a, b) => a - b);
    const min = times[0];
    const max = times[times.length - 1];
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    // Median
    const mid = Math.floor(times.length / 2);
    const median = times.length % 2 === 0
      ? (times[mid - 1] + times[mid]) / 2
      : times[mid];

    results.push({
      name: hook.name,
      type: hook.type,
      file: hook.file,
      iterations: opts.iterations,
      minMs: parseFloat(min.toFixed(3)),
      maxMs: parseFloat(max.toFixed(3)),
      meanMs: parseFloat(mean.toFixed(3)),
      medianMs: parseFloat(median.toFixed(3))
    });
  }

  return results;
}

function printTable(results) {
  const nameWidth = 20;
  const typeWidth = 20;
  const numWidth = 10;

  const header = [
    'Hook'.padEnd(nameWidth),
    'Type'.padEnd(typeWidth),
    'Min(ms)'.padStart(numWidth),
    'Max(ms)'.padStart(numWidth),
    'Mean(ms)'.padStart(numWidth),
    'Median(ms)'.padStart(numWidth)
  ].join(' | ');

  const separator = [
    '-'.repeat(nameWidth),
    '-'.repeat(typeWidth),
    '-'.repeat(numWidth),
    '-'.repeat(numWidth),
    '-'.repeat(numWidth),
    '-'.repeat(numWidth)
  ].join('-+-');

  console.log('');
  console.log('Hook Load-Time Benchmark (subprocess spawn)');
  console.log(`Iterations per hook: ${results[0]?.iterations || 0}`);
  console.log('');
  console.log(header);
  console.log(separator);

  for (const r of results) {
    const row = [
      r.name.padEnd(nameWidth),
      r.type.padEnd(typeWidth),
      r.minMs.toFixed(3).padStart(numWidth),
      r.maxMs.toFixed(3).padStart(numWidth),
      r.meanMs.toFixed(3).padStart(numWidth),
      r.medianMs.toFixed(3).padStart(numWidth)
    ].join(' | ');
    console.log(row);
  }

  const totalMean = results.reduce((s, r) => s + r.meanMs, 0);
  console.log(separator);
  console.log(`${'TOTAL (mean sum)'.padEnd(nameWidth)} | ${''.padEnd(typeWidth)} | ${''.padStart(numWidth)} | ${''.padStart(numWidth)} | ${totalMean.toFixed(3).padStart(numWidth)} |`);
  console.log('');
  console.log('NOTE: Times include Node.js cold start + module loading + stdin');
  console.log('parsing + rule evaluation + I/O. This matches the actual overhead');
  console.log('Claude Code incurs per hook invocation (each hook is a spawned');
  console.log('subprocess). repo-audit-hook git operations are disabled for');
  console.log('consistent measurement (EVOKORE_REPO_AUDIT_HOOK=false).');
  console.log('');
}

// Main
const opts = parseArgs();
const results = runBenchmark(opts);

if (opts.json) {
  console.log(JSON.stringify({ benchmark: 'hook-subprocess-spawn', results }, null, 2));
} else {
  printTable(results);
}
