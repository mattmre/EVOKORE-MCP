#!/usr/bin/env node
// session-checkpoint.js — Create a timestamped session checkpoint
// Usage: node scripts/session-checkpoint.js [--session <id>] [--out <dir>]

'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const SESSIONS_DIR = path.join(os.homedir(), '.evokore', 'sessions');

async function readJsonlLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = [];
  const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try { lines.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  return lines;
}

async function createCheckpoint(opts = {}) {
  const sessionId = opts.sessionId || process.env.EVOKORE_SESSION_ID || 'default';
  const outDir = opts.outDir || 'docs/session-logs';
  const sessionsDir = opts.sessionsDir || SESSIONS_DIR;

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const checkpointPath = path.join(outDir, `session-checkpoint-${ts}.md`);

  // Read evidence log
  const evidencePath = path.join(sessionsDir, `${sessionId}-evidence.jsonl`);
  const evidence = await readJsonlLines(evidencePath);

  // Read tasks
  const tasksPath = path.join(sessionsDir, `${sessionId}-tasks.json`);
  let tasks = [];
  try {
    const raw = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
    tasks = Array.isArray(raw) ? raw : (raw.tasks || []);
  } catch { /* no tasks */ }

  // Read session state / manifest
  let purpose = '';
  const manifestPath = path.join(sessionsDir, `${sessionId}.json`);
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    purpose = manifest.purpose || '';
  } catch { /* no manifest */ }

  // Compute metrics
  const testResults = evidence.filter(e => e.type === 'test-result');
  const gitOps = evidence.filter(e => e.type === 'git-operation');
  const editTraces = evidence.filter(e => e.type === 'edit-trace');
  const passedTests = testResults.filter(e => e.passed);
  const completedTasks = tasks.filter(t => t.status === 'completed' || t.done === true);

  // Build markdown
  const lines = [
    `# Session Checkpoint — ${ts}`,
    '',
    `**Session ID:** ${sessionId}`,
    `**Purpose:** ${purpose || '(not set)'}`,
    `**Generated:** ${new Date().toISOString()}`,
    '',
    '## Task Status',
    '',
    `**Progress:** ${completedTasks.length}/${tasks.length} tasks completed`,
    '',
  ];

  if (tasks.length > 0) {
    lines.push('| Status | Task |');
    lines.push('|--------|------|');
    for (const t of tasks) {
      const done = t.status === 'completed' || t.done === true;
      lines.push(`| ${done ? 'done' : 'pending'} | ${t.content || t.text || t.id} |`);
    }
    lines.push('');
  }

  lines.push('## Evidence Summary', '');
  lines.push(`- **Total evidence entries:** ${evidence.length}`);
  lines.push(`- **Test results:** ${testResults.length} (${passedTests.length} passed)`);
  lines.push(`- **Git operations:** ${gitOps.length}`);
  lines.push(`- **Edit traces:** ${editTraces.length}`);
  lines.push('');

  if (gitOps.length > 0) {
    lines.push('## Recent Git Operations', '');
    for (const op of gitOps.slice(-5)) {
      lines.push(`- ${op.summary || op.tool} (${op.passed ? 'success' : 'failed'})`);
    }
    lines.push('');
  }

  lines.push('## Resume Instructions', '');
  lines.push(`To resume from this checkpoint:`);
  lines.push(`1. Load session: \`EVOKORE_SESSION_ID=${sessionId}\``);
  lines.push(`2. Session purpose: ${purpose || '(check manifest)'}`);
  lines.push(`3. Incomplete tasks: ${tasks.length - completedTasks.length} remaining`);
  lines.push('');

  // Write checkpoint
  try {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(checkpointPath, lines.join('\n'), 'utf8');
    console.log(`Checkpoint written: ${checkpointPath}`);
  } catch (err) {
    console.error('Failed to write checkpoint:', err.message);
    process.exit(1);
  }

  return checkpointPath;
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const sessionIdx = args.indexOf('--session');
  const outIdx = args.indexOf('--out');
  const sessionId = sessionIdx >= 0 ? args[sessionIdx + 1] : undefined;
  const outDir = outIdx >= 0 ? args[outIdx + 1] : undefined;
  await createCheckpoint({ sessionId, outDir });
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { createCheckpoint };
