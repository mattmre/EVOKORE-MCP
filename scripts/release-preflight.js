'use strict';

/**
 * Release Preflight — Pre-tag readiness checks for evokore-mcp.
 *
 * Usage:
 *   node scripts/release-preflight.js           # full preflight
 *   node scripts/release-preflight.js --dry-run  # skip git-push-sensitive checks
 *
 * Exit codes:
 *   0 — all blocking checks pass (warnings may be present)
 *   1 — one or more blocking checks failed
 *
 * Env vars:
 *   EVOKORE_RELEASE_PREFLIGHT_SKIP_SECRETS — skip NPM_TOKEN secret check
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '..');
const IS_WINDOWS = process.platform === 'win32';

// On Windows, npm/npx/gh are .cmd batch wrappers. Node.js v24+ rejects
// execFileSync('npm.cmd', args) with EINVAL. The safe workaround is
// shell: true for these commands only (arguments are all hardcoded
// constants, never user input). git is a native .exe and works without
// shell on all platforms.
const NEEDS_SHELL = new Set(['npm', 'npx', 'gh']);

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
}

function run(cmd, args, opts) {
  const useShell = IS_WINDOWS && NEEDS_SHELL.has(cmd);
  return execFileSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...(useShell ? { shell: true } : {}),
    ...opts,
  });
}

function isValidSemver(v) {
  // Simple semver check: MAJOR.MINOR.PATCH with optional pre-release/build
  return /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/.test(v);
}

// ---------------------------------------------------------------------------
// Individual check functions — each returns { pass, message, level }
// ---------------------------------------------------------------------------

/**
 * Check 1: package.json version is valid semver.
 */
function checkVersion() {
  try {
    const pkg = readJson('package.json');
    const version = pkg.version;
    if (!version) {
      return { pass: false, message: 'Version: missing in package.json', level: 'block' };
    }
    if (!isValidSemver(version)) {
      return { pass: false, message: `Version: "${version}" is not valid semver`, level: 'block' };
    }
    return { pass: true, message: `Version: ${version} (valid semver)`, level: 'block' };
  } catch (err) {
    return { pass: false, message: `Version: failed to read package.json — ${err.message}`, level: 'block' };
  }
}

/**
 * Check 2: CHANGELOG.md has an entry matching the current version.
 */
function checkChangelog() {
  try {
    const pkg = readJson('package.json');
    const version = pkg.version;
    const changelogPath = path.join(ROOT, 'CHANGELOG.md');
    if (!fs.existsSync(changelogPath)) {
      return { pass: false, message: 'CHANGELOG: CHANGELOG.md not found', level: 'block' };
    }
    const changelog = fs.readFileSync(changelogPath, 'utf8');
    // Look for a heading that contains the version (e.g., "## v3.1.0" or "## 3.1.0")
    const versionPattern = new RegExp(`^##\\s+v?${version.replace(/\./g, '\\.')}`, 'm');
    if (!versionPattern.test(changelog)) {
      return { pass: false, message: `CHANGELOG: no entry found for v${version}`, level: 'block' };
    }
    return { pass: true, message: `CHANGELOG: entry found for v${version}`, level: 'block' };
  } catch (err) {
    return { pass: false, message: `CHANGELOG: ${err.message}`, level: 'block' };
  }
}

/**
 * Check 3: dist/index.js exists.
 */
function checkBuild() {
  const distPath = path.join(ROOT, 'dist', 'index.js');
  if (fs.existsSync(distPath)) {
    return { pass: true, message: 'Build: dist/index.js exists', level: 'block' };
  }
  // Attempt to build
  try {
    run('npx', ['tsc'], { stdio: 'pipe' });
    if (fs.existsSync(distPath)) {
      return { pass: true, message: 'Build: dist/index.js exists (after build)', level: 'block' };
    }
    return { pass: false, message: 'Build: dist/index.js missing after build', level: 'block' };
  } catch (err) {
    return { pass: false, message: `Build: dist/index.js missing and build failed — ${err.message}`, level: 'block' };
  }
}

/**
 * Check 4: npm pack --dry-run produces expected output and tarball < 5MB.
 */
function checkPack() {
  try {
    let packOutput;
    try {
      // npm pack --dry-run --json returns a JSON array with pack details
      packOutput = run('npm', ['pack', '--dry-run', '--json'], { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      // npm pack --json sometimes writes to stderr for warnings; capture stdout from the error
      if (err.stdout) {
        packOutput = err.stdout;
      } else {
        return { pass: false, message: `Pack: npm pack failed — ${err.message}`, level: 'block' };
      }
    }

    let parsed;
    try {
      parsed = JSON.parse(packOutput);
    } catch {
      // Fallback: try to parse line-based output
      return { pass: false, message: 'Pack: could not parse npm pack --json output', level: 'block' };
    }

    // npm pack --json returns an array
    const entry = Array.isArray(parsed) ? parsed[0] : parsed;
    const fileCount = entry.files ? entry.files.length : 0;
    const sizeBytes = entry.size || entry.unpackedSize || 0;
    const sizeKB = (sizeBytes / 1024).toFixed(1);
    const sizeMB = sizeBytes / (1024 * 1024);

    if (sizeMB > 5) {
      return { pass: false, message: `Pack: ${fileCount} files, ${sizeKB} kB (exceeds 5 MB limit)`, level: 'block' };
    }
    return { pass: true, message: `Pack: ${fileCount} files, ${sizeKB} kB`, level: 'block' };
  } catch (err) {
    return { pass: false, message: `Pack: ${err.message}`, level: 'block' };
  }
}

/**
 * Check 5: No uncommitted changes (clean working tree).
 */
function checkCleanTree() {
  try {
    const status = run('git', ['status', '--porcelain']);
    const lines = status.replace(/\n$/, '');
    if (lines.length === 0) {
      return { pass: true, message: 'Git: working tree clean', level: 'block' };
    }
    const count = lines.split('\n').length;
    return { pass: false, message: `Git: ${count} uncommitted change(s)`, level: 'block' };
  } catch (err) {
    return { pass: false, message: `Git: failed to check working tree — ${err.message}`, level: 'block' };
  }
}

/**
 * Check 6: Current HEAD is reachable from origin/main.
 */
function checkAncestor() {
  try {
    // Fetch first to ensure origin/main is up to date
    try {
      run('git', ['fetch', '--no-tags', 'origin', 'main']);
    } catch {
      // Fetch may fail in CI or restricted environments; continue with existing ref
    }
    run('git', ['merge-base', '--is-ancestor', 'HEAD', 'origin/main']);
    return { pass: true, message: 'Git: HEAD is ancestor of origin/main', level: 'block' };
  } catch {
    return { pass: false, message: 'Git: HEAD is NOT an ancestor of origin/main', level: 'block' };
  }
}

/**
 * Check 7: Git tag v{version} does NOT already exist.
 */
function checkTagNotExists() {
  try {
    const pkg = readJson('package.json');
    const tag = `v${pkg.version}`;
    try {
      run('git', ['rev-parse', '--verify', `refs/tags/${tag}`]);
      // If the above succeeds, the tag exists
      return { pass: false, message: `Git: tag ${tag} already exists`, level: 'block' };
    } catch {
      // Tag doesn't exist — good
      return { pass: true, message: `Git: tag ${tag} does not exist yet`, level: 'block' };
    }
  } catch (err) {
    return { pass: false, message: `Git: tag check failed — ${err.message}`, level: 'block' };
  }
}

/**
 * Check 8 (warning): NPM_TOKEN availability.
 */
function checkNpmToken() {
  if (process.env.EVOKORE_RELEASE_PREFLIGHT_SKIP_SECRETS) {
    return { pass: true, message: 'NPM_TOKEN: check skipped (EVOKORE_RELEASE_PREFLIGHT_SKIP_SECRETS)', level: 'warn' };
  }

  // Try gh secret list to see if NPM_TOKEN is configured
  try {
    const output = run('gh', ['secret', 'list']);
    if (output.includes('NPM_TOKEN')) {
      return { pass: true, message: 'NPM_TOKEN: found in GitHub secrets', level: 'warn' };
    }
    return { pass: false, message: 'NPM_TOKEN: not found in GitHub secrets (npm publish will be skipped)', level: 'warn' };
  } catch {
    return { pass: false, message: 'NPM_TOKEN: could not check GitHub secrets (gh CLI unavailable or not authenticated)', level: 'warn' };
  }
}

/**
 * Check 9 (warning): Tarball size reasonableness (> 2MB triggers warning).
 */
function checkTarballSize() {
  try {
    let packOutput;
    try {
      packOutput = run('npm', ['pack', '--dry-run', '--json']);
    } catch (err) {
      if (err.stdout) {
        packOutput = err.stdout;
      } else {
        return { pass: true, message: 'Tarball size: could not determine (pack failed)', level: 'warn' };
      }
    }

    let parsed;
    try {
      parsed = JSON.parse(packOutput);
    } catch {
      return { pass: true, message: 'Tarball size: could not determine (parse failed)', level: 'warn' };
    }

    const entry = Array.isArray(parsed) ? parsed[0] : parsed;
    const sizeBytes = entry.size || entry.unpackedSize || 0;
    const sizeMB = sizeBytes / (1024 * 1024);

    if (sizeMB > 2) {
      return { pass: false, message: `Tarball size: ${sizeMB.toFixed(1)} MB (consider reducing)`, level: 'warn' };
    }
    return { pass: true, message: `Tarball size: ${sizeMB.toFixed(1)} MB (within expectations)`, level: 'warn' };
  } catch {
    return { pass: true, message: 'Tarball size: could not determine', level: 'warn' };
  }
}

// ---------------------------------------------------------------------------
// Exported check registry
// ---------------------------------------------------------------------------

const allChecks = {
  checkVersion,
  checkChangelog,
  checkBuild,
  checkPack,
  checkCleanTree,
  checkAncestor,
  checkTagNotExists,
  checkNpmToken,
  checkTarballSize,
};

// Checks that touch remote git state or push-sensitive operations
const GIT_SENSITIVE_CHECKS = new Set(['checkAncestor']);

// ---------------------------------------------------------------------------
// CLI runner
// ---------------------------------------------------------------------------

function formatResult(result) {
  const icon = result.pass ? '\u2713' : (result.level === 'warn' ? '\u26A0' : '\u2717');
  return `${icon} ${result.message}`;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const jsonOutput = args.includes('--json');

  const pkg = readJson('package.json');
  const version = pkg.version;

  if (!jsonOutput) {
    console.log(`\nRelease Preflight \u2014 ${pkg.name} v${version}`);
    console.log('\u2500'.repeat(45));
    if (dryRun) {
      console.log('(dry-run mode: skipping git-push-sensitive checks)\n');
    } else {
      console.log('');
    }
  }

  const results = [];
  const checkNames = Object.keys(allChecks);

  for (const name of checkNames) {
    if (dryRun && GIT_SENSITIVE_CHECKS.has(name)) {
      results.push({ name, pass: true, message: `${name}: skipped (dry-run)`, level: 'block', skipped: true });
      continue;
    }
    const result = allChecks[name]();
    results.push({ name, ...result });
  }

  if (jsonOutput) {
    console.log(JSON.stringify({ version, dryRun, results }, null, 2));
  } else {
    for (const r of results) {
      console.log(formatResult(r));
    }

    const blockers = results.filter(r => r.level === 'block' && !r.pass);
    const warnings = results.filter(r => r.level === 'warn' && !r.pass);

    console.log('');
    if (blockers.length === 0 && warnings.length === 0) {
      console.log('Result: all checks passed');
    } else {
      const parts = [];
      if (blockers.length > 0) parts.push(`${blockers.length} blocking issue(s)`);
      if (warnings.length > 0) parts.push(`${warnings.length} warning(s)`);
      console.log(`Result: ${parts.join(', ')}`);
    }
  }

  const hasBlockers = results.some(r => r.level === 'block' && !r.pass);
  process.exitCode = hasBlockers ? 1 : 0;
}

// Run CLI if invoked directly
if (require.main === module) {
  main();
}

// Export for test consumption
module.exports = {
  ...allChecks,
  allChecks,
  GIT_SENSITIVE_CHECKS,
  isValidSemver,
};
