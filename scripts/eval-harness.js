#!/usr/bin/env node
'use strict';

/**
 * ECC Phase 4 Spike — Single-session evaluator.
 *
 * Reads a `{sessionId}-evidence.jsonl` file and its sibling replay/tasks/
 * manifest artifacts, then emits a structured per-session report. Pure
 * read-only analysis over existing JSONL. Fails soft: missing siblings
 * produce warnings, not exceptions.
 *
 * Contract: see docs/research/ecc-phase4-spike-plan-2026-04-11.md §2.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const LOOKBACK = 20; // replay entries to scan for Read-before-Edit
const COMMIT_WINDOW_MS = 15 * 60 * 1000; // test-before-commit window

async function readJsonl(filePath, onEntry, warnings) {
  if (!fs.existsSync(filePath)) {
    warnings.push(`file not found: ${path.basename(filePath)}`);
    return 0;
  }
  let count = 0;
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const raw of rl) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const obj = JSON.parse(line);
      onEntry(obj);
      count++;
    } catch (_e) {
      warnings.push(`malformed JSONL in ${path.basename(filePath)}`);
    }
  }
  return count;
}

function readJsonSafe(filePath, warnings) {
  if (!fs.existsSync(filePath)) {
    warnings.push(`file not found: ${path.basename(filePath)}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    warnings.push(`malformed JSON in ${path.basename(filePath)}: ${e.message}`);
    return null;
  }
}

function extractSessionId(evidencePath) {
  const base = path.basename(evidencePath);
  const m = base.match(/^(.+)-evidence\.jsonl$/);
  return m ? m[1] : base.replace(/\.jsonl$/, '');
}

function deriveSiblingPaths(evidencePath, sessionDir) {
  const dir = sessionDir || path.dirname(evidencePath);
  const sessionId = extractSessionId(evidencePath);
  return {
    sessionId,
    replayPath: path.join(dir, `${sessionId}-replay.jsonl`),
    tasksPath: path.join(dir, `${sessionId}-tasks.json`),
    manifestPath: path.join(dir, `${sessionId}.json`),
  };
}

function replayFilePath(entry) {
  // Runtime session-replay.js emits summary = file_path for Read/Edit/Write.
  // Synthetic fixtures may use "Read: path" — handle both.
  const s = entry && entry.summary ? String(entry.summary) : '';
  const colon = s.match(/^[A-Za-z]+:\s+(.+)$/);
  return colon ? colon[1].trim() : s.trim();
}

function computeToolSequences(replay) {
  let editsWithPriorRead = 0;
  let editsWithoutPriorRead = 0;
  for (let i = 0; i < replay.length; i++) {
    const e = replay[i];
    if (e.tool !== 'Edit' && e.tool !== 'Write') continue;
    const target = replayFilePath(e);
    if (!target) continue;
    let found = false;
    const start = Math.max(0, i - LOOKBACK);
    for (let j = i - 1; j >= start; j--) {
      const prev = replay[j];
      if (prev.tool === 'Read' && replayFilePath(prev) === target) {
        found = true;
        break;
      }
    }
    if (found) editsWithPriorRead++;
    else editsWithoutPriorRead++;
  }
  return { editsWithPriorRead, editsWithoutPriorRead };
}

function countTasks(tasksData) {
  if (!tasksData) return { total: 0, done: 0 };
  const arr = Array.isArray(tasksData)
    ? tasksData
    : Array.isArray(tasksData.tasks)
      ? tasksData.tasks
      : [];
  let done = 0;
  for (const t of arr) {
    if (!t) continue;
    if (t.status === 'completed' || t.done === true) done++;
  }
  return { total: arr.length, done };
}

async function evaluateSession(evidencePath, opts = {}) {
  const warnings = [];
  const sib = deriveSiblingPaths(evidencePath, opts.sessionDir);

  // 1. Evidence JSONL
  const evidence = [];
  const counts = { evidence: 0, testResult: 0, gitOperation: 0, editTrace: 0, fileChange: 0 };
  let errorCount = 0;
  let testPass = 0;
  let testTotal = 0;
  let commitCount = 0;
  let failedGitOp = false;

  await readJsonl(evidencePath, (e) => {
    evidence.push(e);
    counts.evidence++;
    if (e.type === 'test-result') {
      counts.testResult++;
      testTotal++;
      if (e.passed === true) testPass++;
    } else if (e.type === 'git-operation') {
      counts.gitOperation++;
      if (typeof e.summary === 'string' && /commit/i.test(e.summary)) commitCount++;
      if (e.passed === false) failedGitOp = true;
    } else if (e.type === 'edit-trace') {
      counts.editTrace++;
    } else if (e.type === 'file-change') {
      counts.fileChange++;
    }
    if (e.is_error === true || e.passed === false) errorCount++;
  }, warnings);

  // Sort by ts for downstream timing checks
  evidence.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));

  // 2. Replay JSONL
  const replay = [];
  const toolDistribution = {};
  await readJsonl(sib.replayPath, (e) => {
    replay.push(e);
    const t = e.tool || 'unknown';
    toolDistribution[t] = (toolDistribution[t] || 0) + 1;
  }, warnings);
  counts.replay = replay.length;

  // 3. Tasks JSON
  const tasksData = readJsonSafe(sib.tasksPath, warnings);
  const { total: tasksTotal, done: tasksDone } = countTasks(tasksData);
  counts.tasksTotal = tasksTotal;
  counts.tasksDone = tasksDone;

  // 4. Manifest JSON
  const manifest = readJsonSafe(sib.manifestPath, warnings) || {};
  const purposeSet = typeof manifest.purpose === 'string' && manifest.purpose.trim().length > 0;
  const subagentCount = Array.isArray(manifest.subagents) ? manifest.subagents.length : 0;

  // 5. Metrics
  const errorRate = counts.evidence > 0 ? errorCount / counts.evidence : 0;
  const testPassRate = testTotal > 0 ? testPass / testTotal : null;
  const workRatio = counts.replay > 0 ? counts.evidence / counts.replay : null;
  const taskCompletionRate = tasksTotal > 0 ? tasksDone / tasksTotal : 0;

  // 6. Timeline
  let firstTs = null;
  let lastTs = null;
  let durationMinutes = 0;
  if (evidence.length > 0) {
    firstTs = evidence[0].ts;
    lastTs = evidence[evidence.length - 1].ts;
    const diff = new Date(lastTs).getTime() - new Date(firstTs).getTime();
    if (Number.isFinite(diff)) durationMinutes = Math.max(0, Math.round(diff / 60000));
  }

  // 7. Tool sequences (requires replay)
  const { editsWithPriorRead, editsWithoutPriorRead } = computeToolSequences(replay);

  // testsBeforeCommit / commitsWithoutPriorTest
  let testsBeforeCommit = 0;
  let commitsWithoutPriorTest = 0;
  const commits = evidence.filter((e) => e.type === 'git-operation' && /commit/i.test(String(e.summary || '')));
  const tests = evidence.filter((e) => e.type === 'test-result');
  for (const c of commits) {
    const cTs = new Date(c.ts).getTime();
    const hit = tests.some((t) => {
      const tTs = new Date(t.ts).getTime();
      return tTs <= cTs && cTs - tTs <= COMMIT_WINDOW_MS && t.passed === true;
    });
    if (hit) testsBeforeCommit++;
    else commitsWithoutPriorTest++;
  }

  // 8. Session success: 2-of-3 vote
  const reasons = [];
  let trueClauses = 0;
  if (tasksTotal > 0 && taskCompletionRate >= 0.5) {
    reasons.push('taskCompletionRate>=0.5');
    trueClauses++;
  }
  const testClause =
    (testPassRate !== null && testPassRate >= 0.8) ||
    (testTotal === 0 && errorRate <= 0.15);
  if (testClause) {
    reasons.push('testPassRate>=0.8');
    trueClauses++;
  }
  if (commitCount >= 1 && !failedGitOp) {
    reasons.push('commitCount>0');
    trueClauses++;
  }
  const sessionSuccessful = trueClauses >= 2;

  const report = {
    sessionId: sib.sessionId,
    evidencePath: path.resolve(evidencePath),
    counts,
    toolDistribution,
    errorRate: round3(errorRate),
    testPassRate: testPassRate === null ? null : round3(testPassRate),
    workRatio: workRatio === null ? null : round3(workRatio),
    taskCompletionRate: round3(taskCompletionRate),
    commitCount,
    purposeSet,
    subagentCount,
    timeline: { firstTs, lastTs, durationMinutes },
    successSignals: { sessionSuccessful, reasons },
    toolSequences: {
      editsWithPriorRead,
      editsWithoutPriorRead,
      testsBeforeCommit,
      commitsWithoutPriorTest,
    },
    warnings,
  };

  report.judgeResult = judgeSession(report);
  return report;
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

/**
 * JUDGE: lightweight success classifier based on a weighted composite.
 */
function judgeSession(report) {
  const testPassed = report.testPassRate !== null && report.testPassRate >= 0.8;
  const noErrorLoop = report.errorRate <= 0.15;
  const editVerified = report.toolSequences.editsWithPriorRead > 0;
  const quality =
    (testPassed ? 0.4 : 0) + (noErrorLoop ? 0.3 : 0) + (editVerified ? 0.3 : 0);
  return { success: quality >= 0.6, qualityScore: round3(quality) };
}

function parseArgs(argv) {
  const out = { evidence: null, sessionDir: null, outPath: null, quiet: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--evidence') out.evidence = argv[++i];
    else if (a === '--session-dir') out.sessionDir = argv[++i];
    else if (a === '--out') out.outPath = argv[++i];
    else if (a === '--quiet') out.quiet = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.evidence) {
    console.error('Usage: eval-harness.js --evidence <path> [--session-dir <dir>] [--out <path>] [--quiet]');
    process.exit(2);
  }
  const report = await evaluateSession(args.evidence, { sessionDir: args.sessionDir });
  const json = JSON.stringify(report, null, 2);
  if (args.outPath) {
    fs.writeFileSync(args.outPath, json, 'utf8');
  } else if (!args.quiet) {
    process.stdout.write(json + '\n');
  }
  return report;
}

if (require.main === module) {
  main().catch((err) => {
    console.error('eval-harness failed:', err && err.message ? err.message : err);
    process.exit(1);
  });
}

module.exports = { evaluateSession, judgeSession, main };
