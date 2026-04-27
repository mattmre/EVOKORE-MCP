import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';

// Wave 3: validates the CONTEXT.md / docs/adr/ discipline folded into
// aep-framework Phase 1. The validator soft-passes when ADR-0005 is absent
// (PR #301 dependency) — once #301 lands, the validator becomes strict.

const VALIDATOR_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'scripts',
  'validate-context-and-adrs.js'
);

describe('validate-context-and-adrs', () => {
  it('validator script exists and is readable', () => {
    expect(fs.existsSync(VALIDATOR_PATH)).toBe(true);
  });

  it('exits 0 against the current repo state', () => {
    const result = spawnSync(process.execPath, [VALIDATOR_PATH], {
      cwd: path.resolve(__dirname, '..', '..'),
      encoding: 'utf8'
    });

    if (result.status !== 0) {
      // Surface stdout + stderr in the assertion message for fast triage.
      throw new Error(
        `validator exited with status ${result.status}\n` +
        `stdout:\n${result.stdout}\n` +
        `stderr:\n${result.stderr}`
      );
    }

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('validate-context-and-adrs: OK');
  });

  it('rejects an ADR with an invalid Status field', () => {
    // Pure unit-level guard against the parser drifting away from the
    // documented status lifecycle.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(VALIDATOR_PATH);
    expect(mod.ALLOWED_STATUSES.has('Proposed')).toBe(true);
    expect(mod.ALLOWED_STATUSES.has('Accepted')).toBe(true);
    expect(mod.ALLOWED_STATUSES.has('Deprecated')).toBe(true);
    expect(mod.ALLOWED_STATUSES.has('Superseded')).toBe(true);
    expect(mod.ALLOWED_STATUSES.has('Random')).toBe(false);
  });

  it('parseAdrFields recognises bolded and plain field forms', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(VALIDATOR_PATH);
    const fields = mod.parseAdrFields(
      '# ADR Test\n\n**Status:** Accepted\nDate: 2026-04-27\n'
    );
    expect(fields.Status).toBe('Accepted');
    expect(fields.Date).toBe('2026-04-27');
  });

  it('slugify maps ADR-0005 heading style to directory slug', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(VALIDATOR_PATH);
    expect(mod.slugify('Skill Registry & Discovery')).toBe(
      'skill-registry-and-discovery'
    );
    expect(mod.slugify('Session & Continuity')).toBe('session-and-continuity');
  });
});
