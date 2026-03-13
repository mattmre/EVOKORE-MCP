'use strict';


const assert = require('assert');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname);
const syncScriptPath = path.join(projectRoot, 'scripts', 'sync-configs.js');

function resolveCanonicalProjectRoot() {
  const commonDirRaw = execSync('git rev-parse --git-common-dir', {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'ignore'],
  }).toString().trim();
  const resolvedCommonDir = path.resolve(projectRoot, commonDirRaw);
  return path.basename(resolvedCommonDir).toLowerCase() === '.git'
    ? path.dirname(resolvedCommonDir)
    : projectRoot;
}

test('sync configs canonical root validation', () => {
  console.log('Running sync configs canonical root validation...');

  const canonicalRoot = resolveCanonicalProjectRoot();
  const canonicalEntry = path.join(canonicalRoot, 'dist', 'index.js').replace(/\\/g, '/');
  const worktreeEntry = path.join(projectRoot, 'dist', 'index.js').replace(/\\/g, '/');

  const result = spawnSync(process.execPath, [syncScriptPath, '--dry-run', 'gemini'], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: process.env,
  });

  assert.strictEqual(result.status, 0, `sync-configs dry run failed: ${result.stderr}`);

  const normalizedOutput = result.stdout.replace(/\\/g, '/');
  assert(
    normalizedOutput.includes(canonicalEntry),
    `Expected sync output to use canonical root entry path.\nExpected: ${canonicalEntry}\nOutput: ${normalizedOutput}`
  );

  if (canonicalEntry !== worktreeEntry) {
    assert(
      !normalizedOutput.includes(worktreeEntry),
      `Expected sync output to avoid disposable worktree entry path.\nUnexpected: ${worktreeEntry}\nOutput: ${normalizedOutput}`
    );
  }
});
