'use strict';

const assert = require('assert');
const audit = require('./scripts/repo-state-audit');

function check(label, fn) {
  try {
    fn();
    console.log(`[PASS] ${label}`);
  } catch (error) {
    console.error(`[FAIL] ${label}: ${error.message}`);
    process.exitCode = 1;
  }
}

console.log('Running repo state audit validation...');

check('parseTrack handles gone upstream', () => {
  const parsed = audit.parseTrack('[gone]');
  assert.strictEqual(parsed.gone, true);
  assert.strictEqual(parsed.ahead, 0);
  assert.strictEqual(parsed.behind, 0);
});

check('parseTrack handles ahead/behind counts', () => {
  const parsed = audit.parseTrack('[ahead 2, behind 5]');
  assert.strictEqual(parsed.gone, false);
  assert.strictEqual(parsed.ahead, 2);
  assert.strictEqual(parsed.behind, 5);
});

check('parseWorktreePorcelain parses multiple worktrees', () => {
  const parsed = audit.parseWorktreePorcelain([
    'worktree /repo',
    'HEAD abc123',
    'branch refs/heads/main',
    '',
    'worktree /repo/.orchestrator/worktrees/t1',
    'HEAD def456',
    'branch refs/heads/feat/t1',
    '',
  ].join('\n'));

  assert.strictEqual(parsed.length, 2);
  assert.strictEqual(parsed[0].branch, 'main');
  assert.strictEqual(parsed[1].path, '/repo/.orchestrator/worktrees/t1');
});

check('classifyControlPlane detects tracked and untracked handoff files', () => {
  const classified = audit.classifyControlPlane([
    { xy: ' M', path: 'CLAUDE.md' },
    { xy: '??', path: 'task_plan.md' },
    { xy: ' M', path: 'src/index.ts' },
    { xy: '??', path: 'docs/session-logs/session-2026-03-11.md' },
  ]);

  assert.deepStrictEqual(classified.modified, ['CLAUDE.md']);
  assert.deepStrictEqual(classified.untracked, ['task_plan.md', 'docs/session-logs/session-2026-03-11.md']);
});

check('parseStatus preserves both staged and unstaged file paths', () => {
  const parsed = audit.parseStatus([
    'M  docs/RESEARCH_AND_HANDOFFS.md',
    ' M docs/TESTING_AND_VALIDATION.md',
    '?? scripts/repo-state-audit.js',
  ].join('\n'));

  assert.deepStrictEqual(parsed, [
    { xy: 'M ', path: 'docs/RESEARCH_AND_HANDOFFS.md' },
    { xy: ' M', path: 'docs/TESTING_AND_VALIDATION.md' },
    { xy: '??', path: 'scripts/repo-state-audit.js' },
  ]);
});

check('collectAudit returns current repo report shape', () => {
  const report = audit.collectAudit({ cwd: process.cwd() });
  assert.ok(report.repoRoot);
  assert.ok(report.currentBranch);
  assert.ok(Array.isArray(report.worktrees));
  assert.ok(report.worktrees.length >= 1);
  assert.ok(Array.isArray(report.localBranches));
  assert.ok(Array.isArray(report.warnings));
  assert.ok(report.divergenceFromMain);
  assert.strictEqual(typeof report.divergenceFromMain.behind, 'number');
  assert.strictEqual(typeof report.divergenceFromMain.ahead, 'number');
});

if (process.exitCode) {
  throw new Error('Repo state audit validation failed');
}

console.log('Repo state audit validation passed.');
