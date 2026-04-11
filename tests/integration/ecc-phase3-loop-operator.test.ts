/**
 * ECC Phase 3 — Loop Operator archetype (AGT-013)
 *
 * Validates the agent archetype JSON spec, the detection script file,
 * and exercises the pure detectLoop() algorithm across clean, repeated-error,
 * and stalled patterns. Also verifies the "detected within 5 iterations"
 * convergence guarantee.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { detectLoop, DEFAULTS } = require('../../scripts/loop-operator.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ARCHETYPE_PATH = path.join(
  REPO_ROOT,
  'SKILLS',
  'ORCHESTRATION FRAMEWORK',
  'agent-archetypes',
  'AGT-013-loop-operator.json'
);
const LOOP_OPERATOR_SCRIPT = path.join(REPO_ROOT, 'scripts', 'loop-operator.js');

function nowIso(): string {
  return new Date().toISOString();
}

function oldIso(): string {
  // 20 minutes ago — well outside the default 10-minute stall window
  return new Date(Date.now() - 20 * 60 * 1000).toISOString();
}

function makeEntry(
  id: string,
  description: string,
  outcome: 'ok' | 'error',
  ts: string = nowIso()
) {
  return { id, ts, type: 'Task', description, purpose: 'test', worktree: null, outcome };
}

describe('ECC Phase 3 — file structure', () => {
  it('archetype JSON file exists at AGT-013-loop-operator.json', () => {
    expect(fs.existsSync(ARCHETYPE_PATH)).toBe(true);
  });

  it('archetype JSON parses without error', () => {
    const raw = fs.readFileSync(ARCHETYPE_PATH, 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('scripts/loop-operator.js exists', () => {
    expect(fs.existsSync(LOOP_OPERATOR_SCRIPT)).toBe(true);
  });
});

describe('ECC Phase 3 — archetype JSON schema', () => {
  const spec = JSON.parse(fs.readFileSync(ARCHETYPE_PATH, 'utf8'));

  it('has required base fields (name, version, role, description, agent_id, status)', () => {
    expect(spec.name).toBeDefined();
    expect(spec.version).toBeDefined();
    expect(spec.role).toBeDefined();
    expect(spec.description).toBeDefined();
    expect(spec.agent_id).toBeDefined();
    expect(spec.status).toBeDefined();
  });

  it('agent_id is AGT-013', () => {
    expect(spec.agent_id).toBe('AGT-013');
  });

  it('role is orchestrator', () => {
    expect(spec.role).toBe('orchestrator');
  });

  it('has loop_detection key with patterns array', () => {
    expect(spec.loop_detection).toBeDefined();
    expect(Array.isArray(spec.loop_detection.patterns)).toBe(true);
    expect(spec.loop_detection.patterns.length).toBeGreaterThan(0);
  });

  it('intervention_options includes change-approach, escalate, and terminate', () => {
    const options = spec.loop_detection.intervention_options;
    expect(options).toBeDefined();
    expect(options['change-approach']).toBeDefined();
    expect(options['escalate']).toBeDefined();
    expect(options['terminate']).toBeDefined();
  });
});

describe('detectLoop() — clean state', () => {
  it('empty subagents returns isDegenerate: false', () => {
    const result = detectLoop([]);
    expect(result.isDegenerate).toBe(false);
    expect(result.pattern).toBeNull();
    expect(result.recommendation).toBeNull();
  });

  it('mixed ok/error below threshold returns isDegenerate: false', () => {
    const subagents = [
      makeEntry('SA-001', 'build project', 'ok', oldIso()),
      makeEntry('SA-002', 'lint failure', 'error', oldIso()),
      makeEntry('SA-003', 'run tests', 'ok', oldIso()),
    ];
    const result = detectLoop(subagents);
    expect(result.isDegenerate).toBe(false);
  });
});

describe('detectLoop() — repeated-error pattern', () => {
  it('3 identical errors at threshold (not strictly greater) returns isDegenerate: false', () => {
    // Use old timestamps so the stalled-pattern fallback doesn't fire.
    const subagents = [
      makeEntry('SA-001', 'TypeError: undefined x', 'error', oldIso()),
      makeEntry('SA-002', 'TypeError: undefined x', 'error', oldIso()),
      makeEntry('SA-003', 'TypeError: undefined x', 'error', oldIso()),
    ];
    const result = detectLoop(subagents);
    expect(result.isDegenerate).toBe(false);
  });

  it('4 identical errors (count > threshold) returns repeated-error + change-approach', () => {
    const subagents = [
      makeEntry('SA-001', 'TypeError: undefined x', 'error', oldIso()),
      makeEntry('SA-002', 'TypeError: undefined x', 'error', oldIso()),
      makeEntry('SA-003', 'TypeError: undefined x', 'error', oldIso()),
      makeEntry('SA-004', 'TypeError: undefined x', 'error', oldIso()),
    ];
    const result = detectLoop(subagents);
    expect(result.isDegenerate).toBe(true);
    expect(result.pattern).toBe('repeated-error');
    expect(result.recommendation).toBe('change-approach');
  });

  it('7 identical errors (count > threshold*2) returns recommendation: terminate', () => {
    const subagents = Array.from({ length: 7 }, (_, i) =>
      makeEntry(`SA-${String(i + 1).padStart(3, '0')}`, 'TypeError: undefined x', 'error', oldIso())
    );
    const result = detectLoop(subagents);
    expect(result.isDegenerate).toBe(true);
    expect(result.pattern).toBe('repeated-error');
    expect(result.recommendation).toBe('terminate');
  });

  it('evidence array contains the SA-NNN IDs of matching entries', () => {
    const subagents = [
      makeEntry('SA-010', 'Other failure', 'error', oldIso()),
      makeEntry('SA-011', 'TypeError: undefined x', 'error', oldIso()),
      makeEntry('SA-012', 'TypeError: undefined x', 'error', oldIso()),
      makeEntry('SA-013', 'TypeError: undefined x', 'error', oldIso()),
      makeEntry('SA-014', 'TypeError: undefined x', 'error', oldIso()),
    ];
    const result = detectLoop(subagents);
    expect(result.isDegenerate).toBe(true);
    expect(result.evidence).toEqual(['SA-011', 'SA-012', 'SA-013', 'SA-014']);
    expect(result.evidence).not.toContain('SA-010');
  });
});

describe('detectLoop() — stalled pattern', () => {
  it('2 recent errors within stall window returns stalled + escalate', () => {
    // Distinct descriptions so repeated-error pattern does not fire first.
    const subagents = [
      makeEntry('SA-020', 'connection refused on port 8080', 'error', nowIso()),
      makeEntry('SA-021', 'timeout waiting for database', 'error', nowIso()),
    ];
    const result = detectLoop(subagents);
    expect(result.isDegenerate).toBe(true);
    expect(result.pattern).toBe('stalled');
    expect(result.recommendation).toBe('escalate');
  });

  it('old errors beyond stall window do not trigger stalled pattern', () => {
    const subagents = [
      makeEntry('SA-030', 'connection refused', 'error', oldIso()),
      makeEntry('SA-031', 'timeout', 'error', oldIso()),
    ];
    const result = detectLoop(subagents);
    expect(result.isDegenerate).toBe(false);
  });

  it('stalled requires count >= 2 (single error does not trigger)', () => {
    const subagents = [
      makeEntry('SA-040', 'some error', 'error', nowIso()),
    ];
    const result = detectLoop(subagents);
    expect(result.isDegenerate).toBe(false);
  });
});

describe('Loop detected within 5 iterations', () => {
  it('repeated-error pattern fires by iteration 4 (strictly < 5)', () => {
    // errorThreshold default = 3, so count must exceed 3 → iteration 4
    const subagents: ReturnType<typeof makeEntry>[] = [];
    let detectedAt = -1;
    for (let i = 1; i <= 5; i++) {
      subagents.push(
        makeEntry(`SA-${String(i).padStart(3, '0')}`, 'same recurring fault', 'error', oldIso())
      );
      const result = detectLoop(subagents);
      if (result.isDegenerate && detectedAt === -1) {
        detectedAt = i;
      }
    }
    expect(detectedAt).toBeGreaterThan(0);
    expect(detectedAt).toBeLessThan(5);
    expect(detectedAt).toBe(4);
  });

  it('stalled scenario fires detection on iteration 2', () => {
    const subagents: ReturnType<typeof makeEntry>[] = [];
    let detectedAt = -1;
    const faults = [
      'connection refused',
      'timeout hit',
      'socket reset',
      'dns failure',
      'bad gateway',
    ];
    for (let i = 1; i <= 5; i++) {
      subagents.push(
        makeEntry(`SA-${String(i).padStart(3, '0')}`, faults[i - 1], 'error', nowIso())
      );
      const result = detectLoop(subagents);
      if (result.isDegenerate && detectedAt === -1) {
        detectedAt = i;
      }
    }
    expect(detectedAt).toBe(2);
    // Ensure DEFAULTS export exists and matches the assumption
    expect(DEFAULTS.errorThreshold).toBe(3);
  });
});
