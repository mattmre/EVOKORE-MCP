/**
 * Wave 2 Phase 3.5-B — Governance Gate (AGT-018)
 *
 * Validates the PolicyBundle compilation, ContinueGate alignment check,
 * and the AGT-018 archetype JSON structure. Tests exercise the exported
 * helpers from scripts/purpose-gate.js without touching the stdin loop.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const purposeGate = require('../../scripts/purpose-gate.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ARCHETYPE_PATH = path.join(
  REPO_ROOT,
  'SKILLS',
  'ORCHESTRATION FRAMEWORK',
  'agent-archetypes',
  'AGT-018-governance-gate.json'
);

describe('Governance Gate — exported helpers', () => {
  it('exports loadPolicyBundle as a function', () => {
    expect(typeof purposeGate.loadPolicyBundle).toBe('function');
  });

  it('exports checkContinueGate as a function', () => {
    expect(typeof purposeGate.checkContinueGate).toBe('function');
  });

  it('exports findRepoRoot as a function', () => {
    expect(typeof purposeGate.findRepoRoot).toBe('function');
  });
});

describe('PolicyBundle — loadPolicyBundle()', () => {
  it('returns an object with fingerprint, rulesSections, claudeSections, loadedAt', () => {
    const bundle = purposeGate.loadPolicyBundle();
    expect(bundle).toBeTypeOf('object');
    expect(bundle).toHaveProperty('fingerprint');
    expect(bundle).toHaveProperty('rulesSections');
    expect(bundle).toHaveProperty('claudeSections');
    expect(bundle).toHaveProperty('loadedAt');
  });

  it('fingerprint is a 16-char hex string (or "unknown" on read failure)', () => {
    const bundle = purposeGate.loadPolicyBundle();
    expect(typeof bundle.fingerprint).toBe('string');
    expect(bundle.fingerprint === 'unknown' || /^[a-f0-9]{16}$/.test(bundle.fingerprint)).toBe(true);
  });

  it('rulesSections and claudeSections are arrays', () => {
    const bundle = purposeGate.loadPolicyBundle();
    expect(Array.isArray(bundle.rulesSections)).toBe(true);
    expect(Array.isArray(bundle.claudeSections)).toBe(true);
  });

  it('extracts at least one CLAUDE.md section heading from the live repo', () => {
    const bundle = purposeGate.loadPolicyBundle();
    // CLAUDE.md is checked into the repo at root and has many ## headings.
    expect(bundle.claudeSections.length).toBeGreaterThan(0);
  });

  it('returns identical fingerprints across consecutive calls (deterministic)', () => {
    const a = purposeGate.loadPolicyBundle();
    const b = purposeGate.loadPolicyBundle();
    expect(a.fingerprint).toBe(b.fingerprint);
  });
});

describe('ContinueGate — checkContinueGate()', () => {
  const originalEnv = process.env.EVOKORE_CONTINUE_GATE;

  beforeEach(() => {
    delete process.env.EVOKORE_CONTINUE_GATE;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.EVOKORE_CONTINUE_GATE;
    } else {
      process.env.EVOKORE_CONTINUE_GATE = originalEnv;
    }
  });

  it('returns null when EVOKORE_CONTINUE_GATE is not set', () => {
    const result = purposeGate.checkContinueGate(
      { purpose: 'fix authentication bug in login flow' },
      'completely unrelated message about weather forecasts and rainbows everywhere',
      'dev'
    );
    expect(result).toBeNull();
  });

  it('returns null when state is missing', () => {
    process.env.EVOKORE_CONTINUE_GATE = 'true';
    const result = purposeGate.checkContinueGate(null, 'some long message here', 'dev');
    expect(result).toBeNull();
  });

  it('returns null when state.purpose is missing', () => {
    process.env.EVOKORE_CONTINUE_GATE = 'true';
    const result = purposeGate.checkContinueGate({}, 'some long message here', 'dev');
    expect(result).toBeNull();
  });

  it('returns null for short messages (< 10 words)', () => {
    process.env.EVOKORE_CONTINUE_GATE = 'true';
    const result = purposeGate.checkContinueGate(
      { purpose: 'fix authentication bug in login flow' },
      'short message',
      'dev'
    );
    expect(result).toBeNull();
  });

  it('returns null when alignment is high (purpose words overlap message)', () => {
    process.env.EVOKORE_CONTINUE_GATE = 'true';
    const result = purposeGate.checkContinueGate(
      { purpose: 'implement governance gate policy bundle compilation system' },
      'lets implement the governance gate policy bundle now and verify compilation works correctly today',
      'dev'
    );
    expect(result).toBeNull();
  });

  it('returns warning string for low-alignment substantial messages', () => {
    process.env.EVOKORE_CONTINUE_GATE = 'true';
    const result = purposeGate.checkContinueGate(
      { purpose: 'implement governance gate policy bundle compilation' },
      'completely unrelated discussion about pineapple smoothies marathon training schedules weekend pottery weather forecasts',
      'dev'
    );
    expect(typeof result).toBe('string');
    expect(result).toContain('Governance Gate');
    expect(result).toContain('Purpose Alignment Check');
    expect(result).toContain('alignment:');
  });
});

describe('AGT-018 archetype JSON', () => {
  it('archetype JSON file exists at AGT-018-governance-gate.json', () => {
    expect(fs.existsSync(ARCHETYPE_PATH)).toBe(true);
  });

  it('archetype JSON parses without error', () => {
    const raw = fs.readFileSync(ARCHETYPE_PATH, 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('archetype has required top-level fields', () => {
    const spec = JSON.parse(fs.readFileSync(ARCHETYPE_PATH, 'utf8'));
    expect(spec.agent_id).toBe('AGT-018');
    expect(spec.name).toBe('governance-gate');
    expect(spec.role).toBe('enforcer');
    expect(spec.status).toBe('active');
    expect(spec.version).toBeTypeOf('string');
    expect(spec.description).toBeTypeOf('string');
  });

  it('archetype declares policy_bundle and continue_gate config blocks', () => {
    const spec = JSON.parse(fs.readFileSync(ARCHETYPE_PATH, 'utf8'));
    expect(spec.policy_bundle).toBeTypeOf('object');
    expect(spec.policy_bundle.sources).toContain('RULES.md');
    expect(spec.policy_bundle.sources).toContain('CLAUDE.md');
    expect(spec.policy_bundle.fingerprint_algorithm).toBe('sha256');
    expect(spec.continue_gate).toBeTypeOf('object');
    expect(spec.continue_gate.enabled_via).toBe('EVOKORE_CONTINUE_GATE=true');
    expect(spec.continue_gate.alignment_threshold).toBe(0.10);
    expect(spec.continue_gate.min_message_words).toBe(10);
    expect(spec.continue_gate.hard_block).toBe(false);
  });
});
