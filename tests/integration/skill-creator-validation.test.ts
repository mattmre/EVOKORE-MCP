import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

/**
 * Wave 0b: skill-creator trigger-explicit lint validation.
 *
 * - Verifies quick_validate.py emits the new failure-class checks for
 *   noun-phrase descriptions, missing "## When to use this skill" sections,
 *   and short descriptions.
 * - Verifies the freshly-generated init_skill template passes the lint.
 * - Verifies baseline-allowlist.txt size only decreases (deletion-only ratchet).
 *
 * If Python is not available in CI, fixture-driven tests skip gracefully.
 * The allowlist size check is pure JS and always runs.
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const VALIDATOR = path.join(
  REPO_ROOT,
  'SKILLS',
  'DEVELOPER TOOLS',
  'skill-creator',
  'scripts',
  'quick_validate.py'
);
const INIT_SCRIPT = path.join(
  REPO_ROOT,
  'SKILLS',
  'DEVELOPER TOOLS',
  'skill-creator',
  'scripts',
  'init_skill.py'
);
const ALLOWLIST = path.join(
  REPO_ROOT,
  'SKILLS',
  'DEVELOPER TOOLS',
  'skill-creator',
  'baseline-allowlist.txt'
);
const FIXTURES = path.join(REPO_ROOT, 'tests', 'fixtures', 'skill-creator');

// Recorded baseline of the allowlist size (path-line count, not header lines).
// This is the post-Wave-0b ratchet seal: future PRs MAY decrease this number
// (by fixing skills and removing them from the allowlist) but MUST NOT grow it.
const ALLOWLIST_BASELINE_PATH_COUNT = 256;

function detectPython(): string | null {
  for (const candidate of ['python3', 'python']) {
    try {
      const r = spawnSync(candidate, ['--version'], { encoding: 'utf-8' });
      if (r.status === 0) return candidate;
    } catch {
      // try next candidate
    }
  }
  return null;
}

function runValidator(skillDir: string, extraArgs: string[] = []) {
  const py = detectPython();
  if (!py) return null;
  return spawnSync(py, [VALIDATOR, skillDir, ...extraArgs], {
    encoding: 'utf-8',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    cwd: REPO_ROOT,
  });
}

function countPathLines(filePath: string): number {
  if (!fs.existsSync(filePath)) return 0;
  const raw = fs.readFileSync(filePath, 'utf-8');
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'))
    .length;
}

describe('Wave 0b: skill-creator trigger-explicit lint', () => {
  const py = detectPython();

  describe('quick_validate.py against fixtures', () => {
    if (!py) {
      it.skip('skipped: Python interpreter not available', () => {});
      // Emit a stderr line so CI surfaces why this block was skipped.
      // eslint-disable-next-line no-console
      console.error(
        '[skill-creator-validation] Python not found; skipping fixture-driven checks.'
      );
      return;
    }

    it('good fixture passes all checks (exit 0)', () => {
      const r = runValidator(path.join(FIXTURES, 'good'));
      expect(r).not.toBeNull();
      expect(r!.status, `stdout: ${r!.stdout}\nstderr: ${r!.stderr}`).toBe(0);
      expect(r!.stdout).toMatch(/Skill is valid/);
    });

    it('bad-noun-phrase fixture rejects on trigger phrasing AND verb checks', () => {
      const r = runValidator(path.join(FIXTURES, 'bad-noun-phrase'));
      expect(r).not.toBeNull();
      expect(r!.status).toBe(1);
      expect(r!.stdout).toMatch(/must start with "Use when/);
      expect(r!.stdout).toMatch(/must contain at least one verb/);
    });

    it('bad-no-when-section fixture rejects on missing H2 section', () => {
      const r = runValidator(path.join(FIXTURES, 'bad-no-when-section'));
      expect(r).not.toBeNull();
      expect(r!.status).toBe(1);
      expect(r!.stdout).toMatch(
        /When to use this skill.*within the first 30 lines/s
      );
    });

    it('bad-short-description fixture rejects on length check', () => {
      const r = runValidator(path.join(FIXTURES, 'bad-short-description'));
      expect(r).not.toBeNull();
      expect(r!.status).toBe(1);
      expect(r!.stdout).toMatch(/must be >= 60 characters/);
    });

    it('init_skill.py template produces a SKILL.md that passes the lint', () => {
      const tmpRoot = fs.mkdtempSync(
        path.join(REPO_ROOT, '.tmp-skill-init-test-')
      );
      try {
        const r = spawnSync(
          py!,
          [INIT_SCRIPT, 'fresh-fixture-skill', '--path', tmpRoot],
          {
            encoding: 'utf-8',
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
            cwd: REPO_ROOT,
          }
        );
        expect(r.status, `init_skill.py failed: ${r.stderr}`).toBe(0);
        const newSkillDir = path.join(tmpRoot, 'fresh-fixture-skill');
        const validation = runValidator(newSkillDir);
        expect(validation).not.toBeNull();
        expect(
          validation!.status,
          `Freshly scaffolded skill failed lint:\n${validation!.stdout}\n${validation!.stderr}`
        ).toBe(0);
      } finally {
        // Best-effort cleanup; do not throw on rm failures.
        try {
          fs.rmSync(tmpRoot, { recursive: true, force: true });
        } catch {
          // swallow
        }
      }
    });
  });

  describe('baseline-allowlist deletion-only ratchet', () => {
    it('baseline-allowlist.txt exists', () => {
      expect(fs.existsSync(ALLOWLIST)).toBe(true);
    });

    it('allowlist line count never grows beyond the recorded baseline', () => {
      const current = countPathLines(ALLOWLIST);
      // Fail-loud guidance: this assertion intentionally pins the size.
      // If you ADDED a path, fix the underlying skill instead.
      // If you REMOVED a path (great!), bump ALLOWLIST_BASELINE_PATH_COUNT
      // down to match the new size.
      expect(
        current,
        `baseline-allowlist.txt has ${current} entries; baseline is ${ALLOWLIST_BASELINE_PATH_COUNT}. ` +
          'The allowlist is a deletion-only ratchet: it can shrink, never grow.'
      ).toBeLessThanOrEqual(ALLOWLIST_BASELINE_PATH_COUNT);
    });
  });
});
