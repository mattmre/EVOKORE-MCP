#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const ALLOWED_STATUSES = new Set(['done', 'partial', 'missing', 'ops', 'manual']);
const REQUIRED_TRACKER_SECTIONS = [
  'Session Snapshot Template',
  'File Ownership Checklist',
  'Handoff Checklist',
  'Agent Execution Log'
];

function expectedPriorityIds() {
  return Array.from({ length: 15 }, (_, index) => `p${String(index + 1).padStart(2, '0')}`);
}

function resolveHomeDirectory() {
  return process.env.HOME || process.env.USERPROFILE || os.homedir();
}

function appendEvent(result, details) {
  const homeDir = resolveHomeDirectory();
  const logsDir = path.join(homeDir, '.evokore', 'logs');
  const logPath = path.join(logsDir, 'orchestration-tracker.jsonl');

  fs.mkdirSync(logsDir, { recursive: true });
  const event = {
    ts: new Date().toISOString(),
    check: 'tracker-consistency',
    result,
    details
  };
  fs.appendFileSync(logPath, `${JSON.stringify(event)}\n`, 'utf8');
}

function validatePriorityMatrix(matrixContents) {
  const issues = [];
  const expectedIds = expectedPriorityIds();
  const expectedIdSet = new Set(expectedIds);
  const matrixRows = matrixContents
    .split(/\r?\n/)
    .filter((line) => /^\|\s*p\d{2}\s*\|/.test(line));

  const idCounts = new Map();
  for (const row of matrixRows) {
    const columns = row.split('|');
    const id = (columns[1] || '').trim();
    if (!id) {
      continue;
    }
    idCounts.set(id, (idCounts.get(id) || 0) + 1);
  }

  for (const id of expectedIds) {
    const count = idCounts.get(id) || 0;
    if (count !== 1) {
      issues.push(`Expected "${id}" exactly once, found ${count}.`);
    }
  }

  for (const id of idCounts.keys()) {
    if (!expectedIdSet.has(id)) {
      issues.push(`Unexpected priority ID found: "${id}".`);
    }
  }

  for (const row of matrixRows) {
    const columns = row.split('|');
    const id = (columns[1] || '').trim();
    const status = (columns[3] || '').trim().toLowerCase();

    if (!ALLOWED_STATUSES.has(status)) {
      issues.push(`Priority "${id}" has invalid status "${status}".`);
    }
  }

  return issues;
}

function validateOrchestrationTracker(trackerContents) {
  const issues = [];

  for (const section of REQUIRED_TRACKER_SECTIONS) {
    if (!trackerContents.includes(section)) {
      issues.push(`Missing required section: "${section}".`);
    }
  }

  return issues;
}

function run() {
  const repoRoot = path.resolve(__dirname, '..');
  const matrixPath = path.join(repoRoot, 'docs', 'PRIORITY_STATUS_MATRIX.md');
  const trackerPath = path.join(repoRoot, 'docs', 'ORCHESTRATION_TRACKER.md');

  const matrixContents = fs.readFileSync(matrixPath, 'utf8');
  const trackerContents = fs.readFileSync(trackerPath, 'utf8');

  const issues = [
    ...validatePriorityMatrix(matrixContents),
    ...validateOrchestrationTracker(trackerContents)
  ];

  if (issues.length > 0) {
    appendEvent('fail', { issues });
    console.error('Tracker consistency validation failed:');
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  appendEvent('pass', { ids: 'p01..p15', statuses: Array.from(ALLOWED_STATUSES) });
  console.log('Tracker consistency validation passed.');
}

try {
  run();
} catch (error) {
  console.error('Tracker consistency validation failed:', error);
  process.exit(1);
}
