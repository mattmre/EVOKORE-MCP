/**
 * ECC Phase 1 — purpose-gate + damage-control hook enrichment
 *
 * These tests exercise the helper exports added to `scripts/purpose-gate.js`
 * and `scripts/damage-control.js` by the ECC Phase 1 integration. The
 * helpers are CommonJS exports; we `require()` them through a dynamic
 * import path to keep the TypeScript test file honest.
 *
 * Coverage:
 *  - `loadSoulValues()` parses SOUL.md Section 2 with "Correctness > Speed"
 *  - `loadSoulValues()` fails open when SOUL.md cannot be loaded
 *  - `selectMode()` respects security-audit > debug > review > research > dev precedence
 *  - `selectMode()` returns 'dev' safely when modes map is empty
 *  - `enrichReasonWithRules()` appends RULES.md citation for known rule types
 *  - `enrichReasonWithRules()` returns the original reason when rulesIntent is null
 *  - Source files still declare the expected helpers (structural guard)
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PURPOSE_GATE_PATH = path.join(REPO_ROOT, 'scripts', 'purpose-gate.js');
const DAMAGE_CONTROL_PATH = path.join(REPO_ROOT, 'scripts', 'damage-control.js');
const SOUL_PATH = path.join(REPO_ROOT, 'SOUL.md');

interface PurposeGateExports {
  loadSoulValues: () => string;
  loadSteeringModes: () => Record<string, { focus?: string }>;
  selectMode: (purpose: string, modes: Record<string, unknown>) => string;
}

interface DamageControlExports {
  loadRulesIntent: () => Record<string, string>;
  enrichReasonWithRules: (
    reason: string,
    ruleType: string,
    rulesIntent: Record<string, string> | null
  ) => string;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const purposeGate = require(PURPOSE_GATE_PATH) as PurposeGateExports;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const damageControl = require(DAMAGE_CONTROL_PATH) as DamageControlExports;

describe('ECC Phase 1 — purpose-gate helpers', () => {
  it('loadSoulValues() returns Section 2 including "Correctness > Speed" when SOUL.md is present', () => {
    const values = purposeGate.loadSoulValues();
    expect(typeof values).toBe('string');
    expect(values.length).toBeGreaterThan(0);
    expect(values).toContain('Correctness > Speed');
  });

  it('loadSoulValues() returns empty string when SOUL.md cannot be read (fail open)', () => {
    // Temporarily rename SOUL.md so the helper's readFileSync throws.
    const backup = SOUL_PATH + '.ecc-test-backup';
    fs.renameSync(SOUL_PATH, backup);
    try {
      const values = purposeGate.loadSoulValues();
      expect(values).toBe('');
    } finally {
      fs.renameSync(backup, SOUL_PATH);
    }
  });

  it('selectMode() resolves "review this PR changes" to review', () => {
    const modes = purposeGate.loadSteeringModes();
    expect(purposeGate.selectMode('review this PR changes', modes)).toBe('review');
  });

  it('selectMode() resolves "implement new feature" to dev', () => {
    const modes = purposeGate.loadSteeringModes();
    expect(purposeGate.selectMode('implement new feature', modes)).toBe('dev');
  });

  it('selectMode() resolves "security audit the RBAC system" to security-audit', () => {
    const modes = purposeGate.loadSteeringModes();
    expect(purposeGate.selectMode('security audit the RBAC system', modes)).toBe('security-audit');
  });

  it('selectMode() returns "dev" safely when modes map is empty', () => {
    expect(purposeGate.selectMode('anything at all', {})).toBe('dev');
  });
});

describe('ECC Phase 1 — damage-control helpers', () => {
  it('loadRulesIntent() returns an object keyed by the five RULES.md sections', () => {
    const intent = damageControl.loadRulesIntent();
    expect(typeof intent).toBe('object');
    // RULES.md is present in this repo so every section should be populated.
    expect(Object.keys(intent)).toEqual(
      expect.arrayContaining([
        'file_access',
        'tool_restrictions',
        'commit_policies',
        'session_policies',
        'escalation_policies',
      ])
    );
  });

  it('enrichReasonWithRules() appends §1 File Access Policies for zero_access_paths', () => {
    const intent = damageControl.loadRulesIntent();
    const reason = damageControl.enrichReasonWithRules(
      'Access to sensitive path denied: secret-path',
      'zero_access_paths',
      intent
    );
    expect(reason).toContain('§1 File Access Policies');
    expect(reason).toContain('RULES.md');
  });

  it('enrichReasonWithRules() returns the original reason unchanged when rulesIntent is null', () => {
    const original = 'Access to sensitive path denied: some-path';
    const result = damageControl.enrichReasonWithRules(original, 'zero_access_paths', null);
    expect(result).toBe(original);
  });

  it('enrichReasonWithRules() returns the original reason for unknown rule types', () => {
    const intent = damageControl.loadRulesIntent();
    const original = 'Something else blocked';
    const result = damageControl.enrichReasonWithRules(original, 'not_a_real_rule_type', intent);
    expect(result).toBe(original);
  });
});

describe('ECC Phase 1 — structural guards', () => {
  it('scripts/purpose-gate.js declares loadSoulValues, loadSteeringModes, selectMode', () => {
    const source = fs.readFileSync(PURPOSE_GATE_PATH, 'utf8');
    expect(source).toContain('function loadSoulValues');
    expect(source).toContain('function loadSteeringModes');
    expect(source).toContain('function selectMode');
    // Ensure the helpers are actually exported for test consumption.
    expect(source).toMatch(/module\.exports\s*=\s*\{[^}]*loadSoulValues/);
  });

  it('scripts/damage-control.js declares loadRulesIntent and enrichReasonWithRules', () => {
    const source = fs.readFileSync(DAMAGE_CONTROL_PATH, 'utf8');
    expect(source).toContain('function loadRulesIntent');
    expect(source).toContain('function enrichReasonWithRules');
    expect(source).toMatch(/module\.exports\s*=\s*\{[^}]*loadRulesIntent/);
  });

  it('scripts/damage-control.js preserves block/ask exit codes (enrichment does not change decisions)', () => {
    const source = fs.readFileSync(DAMAGE_CONTROL_PATH, 'utf8');
    // Guard against accidental regressions: the original decision paths
    // must still call process.exit(2) for blocks and process.exit(0) for
    // asks/fail-open. Enrichment only touches the reason string.
    expect(source).toContain('process.exit(2)');
    expect(source).toContain("decision: 'ask'");
  });
});
