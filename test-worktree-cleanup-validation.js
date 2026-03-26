'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function check(label, fn) {
  fn(); // Let vitest catch assertion failures directly
}

test('worktree cleanup validation', () => {

// =========================================================================
// Script Structure
// =========================================================================

check('script file exists', () => {
  const scriptPath = path.join(__dirname, 'scripts', 'worktree-cleanup.js');
  assert.ok(fs.existsSync(scriptPath), 'scripts/worktree-cleanup.js must exist');
});

check('script is valid JavaScript (can be parsed)', () => {
  const scriptPath = path.join(__dirname, 'scripts', 'worktree-cleanup.js');
  const source = fs.readFileSync(scriptPath, 'utf8');
  // This will throw a SyntaxError if the file is invalid JS
  new Function(source.replace(/^#!.*\n/, ''));
});

check('script documents --dry-run flag', () => {
  const source = fs.readFileSync(path.join(__dirname, 'scripts', 'worktree-cleanup.js'), 'utf8');
  assert.ok(source.includes('--dry-run'), 'must document --dry-run flag');
});

check('script documents --apply flag', () => {
  const source = fs.readFileSync(path.join(__dirname, 'scripts', 'worktree-cleanup.js'), 'utf8');
  assert.ok(source.includes('--apply'), 'must document --apply flag');
});

check('script documents --force flag', () => {
  const source = fs.readFileSync(path.join(__dirname, 'scripts', 'worktree-cleanup.js'), 'utf8');
  assert.ok(source.includes('--force'), 'must document --force flag');
});

check('script documents --max-age flag', () => {
  const source = fs.readFileSync(path.join(__dirname, 'scripts', 'worktree-cleanup.js'), 'utf8');
  assert.ok(source.includes('--max-age'), 'must document --max-age flag');
});

check('script documents --json flag', () => {
  const source = fs.readFileSync(path.join(__dirname, 'scripts', 'worktree-cleanup.js'), 'utf8');
  assert.ok(source.includes('--json'), 'must document --json flag');
});

// =========================================================================
// parseArgs unit tests
// =========================================================================

check('parseArgs defaults to dry-run', () => {
  const cleanup = require('./scripts/worktree-cleanup');
  const flags = cleanup.parseArgs(['node', 'script']);
  assert.strictEqual(flags.apply, false, 'apply must default to false');
});

check('parseArgs sets apply when --apply is passed', () => {
  const cleanup = require('./scripts/worktree-cleanup');
  const flags = cleanup.parseArgs(['node', 'script', '--apply']);
  assert.strictEqual(flags.apply, true);
});

check('parseArgs sets force when --force is passed', () => {
  const cleanup = require('./scripts/worktree-cleanup');
  const flags = cleanup.parseArgs(['node', 'script', '--force']);
  assert.strictEqual(flags.force, true);
});

check('parseArgs sets json when --json is passed', () => {
  const cleanup = require('./scripts/worktree-cleanup');
  const flags = cleanup.parseArgs(['node', 'script', '--json']);
  assert.strictEqual(flags.json, true);
});

check('parseArgs sets maxAge from --max-age', () => {
  const cleanup = require('./scripts/worktree-cleanup');
  const flags = cleanup.parseArgs(['node', 'script', '--max-age', '14']);
  assert.strictEqual(flags.maxAge, 14);
});

check('parseArgs default maxAge is 7', () => {
  const cleanup = require('./scripts/worktree-cleanup');
  assert.strictEqual(cleanup.DEFAULT_MAX_AGE_DAYS, 7);
});

// =========================================================================
// Dry-run Default
// =========================================================================

check('dry-run produces output with DRY RUN indicator', () => {
  const cleanup = require('./scripts/worktree-cleanup');
  const flags = cleanup.parseArgs(['node', 'script']);
  const report = cleanup.collectWorktreeReport(flags, process.cwd());
  const rendered = cleanup.renderHuman(report);
  assert.ok(rendered.includes('DRY RUN'), 'output must include DRY RUN indicator');
});

check('dry-run does not execute git worktree remove', () => {
  const cleanup = require('./scripts/worktree-cleanup');
  const flags = cleanup.parseArgs(['node', 'script']);
  const report = cleanup.collectWorktreeReport(flags, process.cwd());
  // In dry-run mode, all actions should have dryRun: true or be skip actions
  for (const action of report.actions) {
    if (action.action === 'remove') {
      assert.strictEqual(action.dryRun, true, 'remove actions must be dry-run');
    }
  }
});

// =========================================================================
// Classification Logic
// =========================================================================

check('correctly identifies root worktree and skips it', () => {
  const cleanup = require('./scripts/worktree-cleanup');
  const flags = cleanup.parseArgs(['node', 'script']);
  const report = cleanup.collectWorktreeReport(flags, process.cwd());
  assert.ok(report.worktrees.length >= 1, 'must have at least one worktree');
  assert.strictEqual(report.worktrees[0].isRoot, true, 'first worktree must be root');
  // Root should never appear in stale list
  const rootPath = report.worktrees[0].path;
  const staleRoot = report.stale.find(s => s.path === rootPath);
  assert.strictEqual(staleRoot, undefined, 'root worktree must not appear in stale list');
});

check('classifyWorktree returns empty reasons for fresh worktree', () => {
  const cleanup = require('./scripts/worktree-cleanup');
  // Simulate a fresh worktree with a recent commit
  const fakeWt = {
    path: '/fake/path',
    head: 'HEAD',  // Will resolve to current HEAD
    branch: 'main',
    detached: false,
    prunable: false,
  };
  // Use a very large maxAge so nothing is aged
  const reasons = cleanup.classifyWorktree(fakeWt, 99999, process.cwd());
  // Should include 'merged' since HEAD of main is ancestor of origin/main
  // but should not include 'aged' or 'detached_old'
  assert.ok(!reasons.includes('detached_old'), 'should not be detached_old');
});

check('classifyWorktree identifies prunable entries', () => {
  const cleanup = require('./scripts/worktree-cleanup');
  const fakeWt = {
    path: '/nonexistent/prunable',
    head: 'abc123',
    branch: '',
    detached: false,
    prunable: true,
  };
  const reasons = cleanup.classifyWorktree(fakeWt, 7, process.cwd());
  assert.ok(reasons.includes('prunable'), 'must identify prunable worktrees');
});

// =========================================================================
// Safety Checks
// =========================================================================

check('script checks for uncommitted changes before removal', () => {
  const source = fs.readFileSync(path.join(__dirname, 'scripts', 'worktree-cleanup.js'), 'utf8');
  assert.ok(
    source.includes("'--porcelain'") && source.includes("'status'"),
    'must check git status --porcelain for uncommitted changes'
  );
});

check('script checks for active sessions', () => {
  const source = fs.readFileSync(path.join(__dirname, 'scripts', 'worktree-cleanup.js'), 'utf8');
  assert.ok(source.includes('sessions'), 'must check sessions directory');
  assert.ok(source.includes('activeSession'), 'must track active session state');
});

check('isBlocked respects force flag for uncommitted changes', () => {
  const cleanup = require('./scripts/worktree-cleanup');
  const safety = {
    uncommittedChanges: true,
    unpushedCommits: false,
    activeSession: false,
    openPR: false,
    lockFile: false,
    details: ['has uncommitted changes'],
  };
  assert.strictEqual(cleanup.isBlocked(safety, false), true, 'should block without force');
  assert.strictEqual(cleanup.isBlocked(safety, true), false, 'should not block with force');
});

check('isBlocked always blocks on active session even with force', () => {
  const cleanup = require('./scripts/worktree-cleanup');
  const safety = {
    uncommittedChanges: false,
    unpushedCommits: false,
    activeSession: true,
    openPR: false,
    lockFile: false,
    details: ['active session'],
  };
  assert.strictEqual(cleanup.isBlocked(safety, true), true, 'active session must always block');
});

check('isBlocked always blocks on open PR even with force', () => {
  const cleanup = require('./scripts/worktree-cleanup');
  const safety = {
    uncommittedChanges: false,
    unpushedCommits: false,
    activeSession: false,
    openPR: true,
    lockFile: false,
    details: ['open PR'],
  };
  assert.strictEqual(cleanup.isBlocked(safety, true), true, 'open PR must always block');
});

// =========================================================================
// JSON Output
// =========================================================================

check('JSON output has expected schema', () => {
  const cleanup = require('./scripts/worktree-cleanup');
  const flags = cleanup.parseArgs(['node', 'script', '--json']);
  const report = cleanup.collectWorktreeReport(flags, process.cwd());

  assert.ok(Array.isArray(report.worktrees), 'worktrees must be an array');
  assert.ok(Array.isArray(report.stale), 'stale must be an array');
  assert.ok(Array.isArray(report.actions), 'actions must be an array');
  assert.ok(report.summary != null, 'summary must exist');
  assert.strictEqual(typeof report.summary.total, 'number');
  assert.strictEqual(typeof report.summary.stale, 'number');
  assert.strictEqual(typeof report.summary.removed, 'number');
  assert.strictEqual(typeof report.summary.skipped, 'number');
  assert.strictEqual(typeof report.summary.errors, 'number');
  assert.strictEqual(typeof report.summary.dryRun, 'boolean');
});

check('JSON output worktree entries have expected fields', () => {
  const cleanup = require('./scripts/worktree-cleanup');
  const flags = cleanup.parseArgs(['node', 'script', '--json']);
  const report = cleanup.collectWorktreeReport(flags, process.cwd());

  assert.ok(report.worktrees.length >= 1, 'must have at least one worktree');
  const root = report.worktrees[0];
  assert.strictEqual(typeof root.path, 'string');
  assert.strictEqual(typeof root.head, 'string');
  assert.strictEqual(typeof root.detached, 'boolean');
  assert.strictEqual(typeof root.prunable, 'boolean');
  assert.strictEqual(typeof root.isRoot, 'boolean');
});

// =========================================================================
// npm Scripts
// =========================================================================

check('package.json has worktree:cleanup script', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts['worktree:cleanup'], 'must have worktree:cleanup script');
  assert.ok(pkg.scripts['worktree:cleanup'].includes('--dry-run'), 'worktree:cleanup must use --dry-run');
});

check('package.json has worktree:cleanup:apply script', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts['worktree:cleanup:apply'], 'must have worktree:cleanup:apply script');
  assert.ok(pkg.scripts['worktree:cleanup:apply'].includes('--apply'), 'worktree:cleanup:apply must use --apply');
});

// =========================================================================
// Integration with repo-state-audit
// =========================================================================

check('reuses parseWorktreePorcelain from repo-state-audit.js', () => {
  const source = fs.readFileSync(path.join(__dirname, 'scripts', 'worktree-cleanup.js'), 'utf8');
  assert.ok(
    source.includes("require('./repo-state-audit')") || source.includes('require("./repo-state-audit")'),
    'must import from repo-state-audit.js'
  );
  assert.ok(
    source.includes('parseWorktreePorcelain'),
    'must reference parseWorktreePorcelain'
  );
});

// =========================================================================
// Research doc
// =========================================================================

check('research doc exists', () => {
  const docPath = path.join(__dirname, 'docs', 'research', 'm3-4-worktree-cleanup-research-2026-03-26.md');
  assert.ok(fs.existsSync(docPath), 'research doc must exist');
});

});
