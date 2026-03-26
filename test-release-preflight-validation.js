'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SCRIPT_PATH = path.resolve(__dirname, 'scripts', 'release-preflight.js');

// ---------------------------------------------------------------------------
// 1. Script exists and is importable
// ---------------------------------------------------------------------------

test('release-preflight script exists', () => {
  assert.ok(fs.existsSync(SCRIPT_PATH), 'scripts/release-preflight.js must exist');
});

test('release-preflight script is importable', () => {
  const mod = require(SCRIPT_PATH);
  assert.ok(mod, 'module should export a truthy value');
  assert.ok(typeof mod.allChecks === 'object', 'module must export allChecks object');
});

// ---------------------------------------------------------------------------
// 2. Each exported check function returns the expected shape
// ---------------------------------------------------------------------------

test('each check function returns { pass: boolean, message: string, level }', () => {
  const mod = require(SCRIPT_PATH);
  const checkNames = Object.keys(mod.allChecks);

  assert.ok(checkNames.length >= 9, `expected at least 9 checks, got ${checkNames.length}`);

  for (const name of checkNames) {
    const fn = mod.allChecks[name];
    assert.strictEqual(typeof fn, 'function', `${name} must be a function`);

    const result = fn();
    assert.strictEqual(typeof result.pass, 'boolean', `${name}.pass must be boolean`);
    assert.strictEqual(typeof result.message, 'string', `${name}.message must be a string`);
    assert.ok(
      result.level === 'block' || result.level === 'warn',
      `${name}.level must be 'block' or 'warn', got '${result.level}'`
    );
  }
});

// ---------------------------------------------------------------------------
// 3. Specific check behaviors
// ---------------------------------------------------------------------------

test('checkVersion passes for current package.json', () => {
  const { checkVersion } = require(SCRIPT_PATH);
  const result = checkVersion();
  assert.strictEqual(result.pass, true, 'checkVersion should pass for a valid semver version');
  assert.strictEqual(result.level, 'block');
  assert.match(result.message, /valid semver/);
});

test('isValidSemver works correctly', () => {
  const { isValidSemver } = require(SCRIPT_PATH);
  assert.strictEqual(isValidSemver('3.1.0'), true);
  assert.strictEqual(isValidSemver('0.0.1'), true);
  assert.strictEqual(isValidSemver('1.2.3-beta.1'), true);
  assert.strictEqual(isValidSemver('1.2.3+build.42'), true);
  assert.strictEqual(isValidSemver('not-a-version'), false);
  assert.strictEqual(isValidSemver(''), false);
  assert.strictEqual(isValidSemver('1.2'), false);
});

test('checkChangelog passes for current version', () => {
  const { checkChangelog } = require(SCRIPT_PATH);
  const result = checkChangelog();
  assert.strictEqual(result.pass, true, 'checkChangelog should pass if CHANGELOG.md has current version');
  assert.strictEqual(result.level, 'block');
});

test('checkBuild detects dist/index.js', () => {
  const { checkBuild } = require(SCRIPT_PATH);
  const result = checkBuild();
  // Build may or may not exist in test env; just validate shape
  assert.strictEqual(typeof result.pass, 'boolean');
  assert.strictEqual(result.level, 'block');
  assert.match(result.message, /Build:/);
});

test('checkPack returns file count and size', () => {
  const { checkPack } = require(SCRIPT_PATH);
  const result = checkPack();
  assert.strictEqual(typeof result.pass, 'boolean');
  assert.strictEqual(result.level, 'block');
  assert.match(result.message, /Pack:/);
});

test('checkNpmToken returns warn level', () => {
  const { checkNpmToken } = require(SCRIPT_PATH);
  const result = checkNpmToken();
  assert.strictEqual(result.level, 'warn');
  assert.strictEqual(typeof result.pass, 'boolean');
});

test('checkTarballSize returns warn level', () => {
  const { checkTarballSize } = require(SCRIPT_PATH);
  const result = checkTarballSize();
  assert.strictEqual(result.level, 'warn');
  assert.strictEqual(typeof result.pass, 'boolean');
});

// ---------------------------------------------------------------------------
// 4. package.json has the release:preflight script entry
// ---------------------------------------------------------------------------

test('package.json has release:preflight script', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')
  );
  assert.strictEqual(
    pkg.scripts['release:preflight'],
    'node scripts/release-preflight.js',
    'release:preflight must point to the preflight script'
  );
});

// ---------------------------------------------------------------------------
// 5. CLI --dry-run exits cleanly
// ---------------------------------------------------------------------------

test('release-preflight --dry-run exits cleanly', () => {
  // Run the script with --dry-run and capture output
  let output;
  try {
    output = execFileSync('node', [SCRIPT_PATH, '--dry-run'], {
      cwd: path.resolve(__dirname),
      encoding: 'utf8',
      timeout: 60000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    // Even if exit code is non-zero (blockers), it should not crash
    output = err.stdout || '';
    // A crash would have no structured output at all
    assert.ok(output.length > 0, `--dry-run should produce output, got error: ${err.message}`);
  }
  assert.match(output, /Release Preflight/, 'output should contain Release Preflight header');
  assert.match(output, /dry-run/, 'output should mention dry-run');
  assert.match(output, /Result:/, 'output should contain a Result summary');
});

test('release-preflight --dry-run --json returns valid JSON', () => {
  let output;
  try {
    output = execFileSync('node', [SCRIPT_PATH, '--dry-run', '--json'], {
      cwd: path.resolve(__dirname),
      encoding: 'utf8',
      timeout: 60000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    output = err.stdout || '';
  }
  const parsed = JSON.parse(output);
  assert.strictEqual(parsed.dryRun, true);
  assert.ok(Array.isArray(parsed.results));
  assert.ok(parsed.results.length >= 9);
  for (const r of parsed.results) {
    assert.strictEqual(typeof r.pass, 'boolean');
    assert.strictEqual(typeof r.message, 'string');
    assert.ok(r.level === 'block' || r.level === 'warn');
  }
});

// ---------------------------------------------------------------------------
// 6. GIT_SENSITIVE_CHECKS are properly defined
// ---------------------------------------------------------------------------

test('GIT_SENSITIVE_CHECKS contains the expected entries', () => {
  const { GIT_SENSITIVE_CHECKS } = require(SCRIPT_PATH);
  assert.ok(GIT_SENSITIVE_CHECKS instanceof Set, 'GIT_SENSITIVE_CHECKS must be a Set');
  assert.ok(GIT_SENSITIVE_CHECKS.has('checkAncestor'), 'checkAncestor must be git-sensitive');
});
