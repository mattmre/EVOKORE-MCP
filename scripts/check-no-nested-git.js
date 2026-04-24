#!/usr/bin/env node
'use strict';

/*
 * Fails if any file tracked by git looks like a nested-repo artifact.
 *
 * Why: audit-2026-04-24 issue #282 item #4. A stray `.git` file (the
 * plain-text kind that a worktree checkout drops inside a subdirectory)
 * slipped into a commit once. That shows up in `git ls-files` as a
 * path whose basename is literally `.git`, because git does not
 * auto-ignore sub-`.git` entries — only the repo-root one. A sub-.git
 * directory's contents can likewise be staged if someone bypasses the
 * worktree tooling.
 *
 * Run in CI (and locally from a pre-commit hook if installed). This
 * script is additive to validate-submodule-cleanliness.js, which only
 * catches _registered_ submodule drift, not stray nested-repo files.
 */

const { execSync } = require('child_process');

function runGit(command) {
  return execSync(command, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trimEnd();
}

function getTrackedFiles() {
  const output = runGit('git ls-files -z');
  if (!output) return [];
  return output.split('\0').filter(Boolean);
}

function isNestedGitArtifact(relativePath) {
  const parts = relativePath.split(/[\/\\]/);
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] !== '.git') continue;
    if (i === 0) continue;
    return true;
  }
  return false;
}

function main() {
  const offenders = [];
  for (const path of getTrackedFiles()) {
    if (isNestedGitArtifact(path)) {
      offenders.push(path);
    }
  }

  if (offenders.length > 0) {
    console.error('Nested .git artifacts were found in tracked files:');
    for (const p of offenders) console.error('  ' + p);
    console.error('');
    console.error('These are almost always leaked git-worktree internals. Remove them with:');
    console.error('  git rm --cached <path>');
    console.error('and commit the removal before retrying.');
    process.exit(1);
  }

  console.log('No nested .git artifacts found in ' + getTrackedFiles().length + ' tracked files.');
}

if (require.main === module) {
  main();
}

module.exports = { isNestedGitArtifact };
