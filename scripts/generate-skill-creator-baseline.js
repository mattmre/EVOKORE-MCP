#!/usr/bin/env node
/**
 * Generate baseline-allowlist.txt for the skill-creator quick_validate.py lint.
 *
 * Walks SKILLS/** for every directory containing a SKILL.md, runs
 * quick_validate.py against each one, and emits the failing relative paths
 * (one per line, POSIX-style) to:
 *   SKILLS/DEVELOPER TOOLS/skill-creator/baseline-allowlist.txt
 *
 * This is a deletion-only ratchet: regenerate on demand, but the size of
 * the allowlist is monotonically non-increasing. The vitest suite enforces
 * that the allowlist line count never grows.
 *
 * Usage:
 *   node scripts/generate-skill-creator-baseline.js [--out <path>] [--quiet]
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const SKILLS_ROOT = path.join(REPO_ROOT, 'SKILLS');
const VALIDATOR = path.join(
  REPO_ROOT,
  'SKILLS',
  'DEVELOPER TOOLS',
  'skill-creator',
  'scripts',
  'quick_validate.py'
);
const DEFAULT_OUT = path.join(
  REPO_ROOT,
  'SKILLS',
  'DEVELOPER TOOLS',
  'skill-creator',
  'baseline-allowlist.txt'
);

function findSkillDirs(root) {
  const results = [];
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    let hasSkillMd = false;
    for (const ent of entries) {
      if (ent.name === 'SKILL.md' && ent.isFile()) {
        hasSkillMd = true;
      }
    }
    if (hasSkillMd) {
      results.push(dir);
    }
    for (const ent of entries) {
      if (ent.isDirectory()) {
        walk(path.join(dir, ent.name));
      }
    }
  }
  walk(root);
  return results;
}

function pythonExecutable() {
  // Prefer python3, fall back to python.
  const candidates = ['python3', 'python'];
  for (const c of candidates) {
    const r = spawnSync(c, ['--version'], { encoding: 'utf-8' });
    if (r.status === 0) return c;
  }
  return null;
}

function main() {
  const args = process.argv.slice(2);
  let outPath = DEFAULT_OUT;
  let quiet = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out' && i + 1 < args.length) {
      outPath = args[++i];
    } else if (args[i] === '--quiet') {
      quiet = true;
    }
  }

  const py = pythonExecutable();
  if (!py) {
    console.error('Python interpreter not found; cannot generate baseline.');
    process.exit(2);
  }

  const skillDirs = findSkillDirs(SKILLS_ROOT);
  if (!quiet) {
    console.error(`Scanning ${skillDirs.length} SKILL.md directories...`);
  }

  const failing = [];
  const env = { ...process.env, PYTHONIOENCODING: 'utf-8' };
  for (const dir of skillDirs) {
    const r = spawnSync(py, [VALIDATOR, dir], { encoding: 'utf-8', env });
    if (r.status !== 0) {
      const rel = path.relative(REPO_ROOT, dir).split(path.sep).join('/');
      failing.push(rel);
    }
  }

  failing.sort();

  const header = [
    '# baseline-allowlist.txt',
    '#',
    '# These skills were grandfathered in when the trigger-explicit lint',
    '# (Wave 0b) shipped. New skills are NOT allowed to fail.',
    '#',
    '# Deletion-only ratchet: paths can be REMOVED when fixed but not ADDED.',
    '# The vitest suite enforces that the line count never grows.',
    '#',
    '# Regenerate via: node scripts/generate-skill-creator-baseline.js',
    '',
  ].join('\n');
  const body = failing.join('\n') + (failing.length ? '\n' : '');
  fs.writeFileSync(outPath, header + body, 'utf-8');

  if (!quiet) {
    console.error(`Wrote ${failing.length} failing path(s) to ${outPath}`);
  }
}

if (require.main === module) {
  main();
}
