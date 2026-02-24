'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function run() {
  const trackerPath = path.resolve(__dirname, 'docs', 'ORCHESTRATION_TRACKER.md');
  const decisionsPath = path.resolve(__dirname, 'docs', 'RESEARCH_DECISIONS_LOG.md');
  const matrixPath = path.resolve(__dirname, 'docs', 'PRIORITY_STATUS_MATRIX.md');
  const runbookPath = path.resolve(__dirname, 'docs', 'PR_MERGE_RUNBOOK.md');
  const docsReadmePath = path.resolve(__dirname, 'docs', 'README.md');
  const contributingPath = path.resolve(__dirname, 'CONTRIBUTING.md');

  assert.ok(fs.existsSync(trackerPath), 'ORCHESTRATION_TRACKER.md should exist');
  assert.ok(fs.existsSync(decisionsPath), 'RESEARCH_DECISIONS_LOG.md should exist');
  assert.ok(fs.existsSync(matrixPath), 'PRIORITY_STATUS_MATRIX.md should exist');
  assert.ok(fs.existsSync(runbookPath), 'PR_MERGE_RUNBOOK.md should exist');

  const tracker = fs.readFileSync(trackerPath, 'utf8');
  const decisions = fs.readFileSync(decisionsPath, 'utf8');
  const matrix = fs.readFileSync(matrixPath, 'utf8');
  const runbook = fs.readFileSync(runbookPath, 'utf8');
  const docsReadme = fs.readFileSync(docsReadmePath, 'utf8');
  const contributing = fs.readFileSync(contributingPath, 'utf8');

  assert.match(tracker, /context-rot prevention/i);
  assert.match(tracker, /Session Snapshot Template/);
  assert.match(tracker, /File Ownership Checklist/);
  assert.match(tracker, /Initial Entry \(This Execution\)/);

  assert.match(decisions, /context-rot prevention/i);
  assert.match(decisions, /Decision Entry Template/);
  assert.match(decisions, /Decision Review Checklist/);
  assert.match(decisions, /Initial Entries \(This Execution\)/);

  assert.match(matrix, /Priority Status Matrix/);
  assert.match(matrix, /Priority item\/phase/);

  assert.match(runbook, /Pre-merge Checklist/);
  assert.match(runbook, /Required Checks by Change Type/);
  assert.match(runbook, /Reviewer Responsibilities/);
  assert.match(runbook, /Merge-order Controls \(Dependency Chain\)/);
  assert.match(runbook, /Post-merge Verification/);
  assert.match(runbook, /Rollback Plan/);
  assert.match(runbook, /Initial Entry \(This Execution\)/);

  assert.match(docsReadme, /ORCHESTRATION_TRACKER\.md/);
  assert.match(docsReadme, /RESEARCH_DECISIONS_LOG\.md/);
  assert.match(docsReadme, /PRIORITY_STATUS_MATRIX\.md/);
  assert.match(docsReadme, /PR_MERGE_RUNBOOK\.md/);
  assert.match(contributing, /docs\/PR_MERGE_RUNBOOK\.md/);

  console.log('Ops docs validation passed.');
}

try {
  run();
} catch (error) {
  console.error('Ops docs validation failed:', error);
  process.exit(1);
}
