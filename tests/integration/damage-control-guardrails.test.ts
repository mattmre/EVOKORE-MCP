/**
 * Wave 0g argv-aware guardrail fixture coverage.
 *
 * Loads two fixture files and asserts each row's `expect:` outcome by
 * invoking the matcher's exported helpers directly:
 *   - tests/fixtures/damage-control/git-guardrails.yaml  (DC-33..DC-39 + DC-03 tightened)
 *   - tests/fixtures/damage-control/auto-mutation.yaml   (DC-41 / DC-42 / DC-43)
 *
 * For each row:
 *   1. Look up the rule by `rule_id` (or, when `rule_id: null`, sweep ALL
 *      argv-aware rules and assert none fire).
 *   2. For argv-aware rules: tokenize the command, call `evaluateArgvRule`
 *      with the row's optional `env` and `cwd` overrides, and assert the
 *      returned severity matches `expect`.
 *   3. For DC-03 (legacy regex), test the regex against the joined command
 *      and verify match/non-match against `expect`.
 *
 * Triviality safety floor (DC-03 colon-bug regression guard):
 *   - empty string, lone colon, single space, single letter must NEVER match
 *     ANY rule.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const damageControl = require('../../scripts/damage-control.js');
const { tokenizeCommand, evaluateArgvRule } = damageControl;

const RULES_PATH = path.resolve(__dirname, '..', '..', 'damage-control-rules.yaml');
const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures', 'damage-control');
const GIT_FIXTURE = path.join(FIXTURES_DIR, 'git-guardrails.yaml');
const AUTO_MUT_FIXTURE = path.join(FIXTURES_DIR, 'auto-mutation.yaml');

interface DcRule {
  id: string;
  pattern?: string;
  argv_match?: unknown;
  inert?: boolean;
  pattern_alias_of?: string;
  reason: string;
  ask?: boolean;
  severity?: string;
  warn_severity?: string;
  env_override?: string;
}

interface DcRules {
  dangerous_commands: DcRule[];
}

interface FixtureCase {
  rule_id: string | null;
  command: string;
  expect: 'block' | 'warn' | 'allow';
  env?: Record<string, string>;
  cwd?: string;
  note?: string;
}

interface Fixture {
  cases: FixtureCase[];
}

const rawYaml = fs.readFileSync(RULES_PATH, 'utf8');
const rules: DcRules = YAML.parse(rawYaml) as DcRules;

function loadFixture(p: string): Fixture {
  const raw = fs.readFileSync(p, 'utf8');
  return YAML.parse(raw) as Fixture;
}

function ruleById(id: string): DcRule | undefined {
  return rules.dangerous_commands.find((r) => r.id === id);
}

function argvAwareRules(): DcRule[] {
  return rules.dangerous_commands.filter((r) => r.argv_match && !r.inert && !r.pattern_alias_of);
}

/**
 * Evaluate a row through the matcher and return the resulting outcome:
 * 'block' | 'warn' | 'allow'. Reproduces the dispatch logic in
 * scripts/damage-control.js (Bash branch) without spawning a child process.
 */
function evaluateRow(row: FixtureCase): 'block' | 'warn' | 'allow' {
  const env = Object.assign({}, process.env, row.env || {});
  const cwd = row.cwd || process.cwd();
  const argv = tokenizeCommand(row.command);

  // Specific-rule mode: only consult the named rule.
  if (row.rule_id) {
    const rule = ruleById(row.rule_id);
    if (!rule) {
      throw new Error(`Fixture references unknown rule id: ${row.rule_id}`);
    }
    if (rule.argv_match) {
      const result = evaluateArgvRule(rule, argv, env, cwd);
      if (!result) return 'allow';
      return result.severity === 'warn' ? 'warn' : 'block';
    }
    // Legacy regex path (DC-03 short-flag tightening).
    if (typeof rule.pattern === 'string') {
      const re = new RegExp(rule.pattern, 'i');
      if (re.test(row.command)) {
        return rule.ask ? 'warn' : 'block';
      }
      return 'allow';
    }
    return 'allow';
  }

  // Sweep mode: assert NO argv-aware rule fires for trivial inputs.
  for (const rule of argvAwareRules()) {
    const result = evaluateArgvRule(rule, argv, env, cwd);
    if (result) {
      return result.severity === 'warn' ? 'warn' : 'block';
    }
  }
  return 'allow';
}

function describeRow(row: FixtureCase): string {
  const ruleTag = row.rule_id ?? 'no-rule';
  const envTag = row.env ? ` env=${JSON.stringify(row.env)}` : '';
  const cwdTag = row.cwd ? ` cwd=${row.cwd}` : '';
  const noteTag = row.note ? ` — ${row.note}` : '';
  return `[${ruleTag}] ${row.command || '(empty)'}${envTag}${cwdTag}${noteTag}`;
}

// ---------------------------------------------------------------------------
// Per-rule colon-bug + empty-string guards (regex sanity floor).
// ---------------------------------------------------------------------------
describe('Damage Control argv guardrails — safety floor', () => {
  it('every legacy regex rule rejects "" and ":"', () => {
    for (const rule of rules.dangerous_commands) {
      if (typeof rule.pattern !== 'string') continue;
      if (rule.inert || rule.pattern_alias_of) continue;
      const re = new RegExp(rule.pattern, 'i');
      expect(re.test(''), `rule ${rule.id} regex must not match empty string`).toBe(false);
      expect(re.test(':'), `rule ${rule.id} regex must not match lone colon`).toBe(false);
    }
  });

  it('every argv-aware rule rejects "", ":", " ", and "a"', () => {
    for (const rule of argvAwareRules()) {
      for (const trivial of ['', ':', ' ', 'a']) {
        const argv = tokenizeCommand(trivial);
        const result = evaluateArgvRule(rule, argv, process.env, process.cwd());
        expect(
          result,
          `rule ${rule.id} must not fire on trivial input ${JSON.stringify(trivial)}`
        ).toBeNull();
      }
    }
  });

  it('argv-aware rules carry expected schema fields', () => {
    for (const rule of argvAwareRules()) {
      expect(rule.id, 'rule has an id').toMatch(/^DC-\d+$/);
      expect(rule.reason, `rule ${rule.id} has a reason`).toBeTruthy();
      // Severity defaults to 'block' when unset; tests are lenient there.
      if (rule.severity) {
        expect(['block', 'warn']).toContain(rule.severity);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Fixture-driven coverage.
// ---------------------------------------------------------------------------
describe('Damage Control argv guardrails — git-guardrails.yaml', () => {
  const fixture = loadFixture(GIT_FIXTURE);

  it('fixture parses and has cases', () => {
    expect(fixture).toBeDefined();
    expect(fixture.cases).toBeInstanceOf(Array);
    expect(fixture.cases.length).toBeGreaterThan(0);
  });

  for (const row of fixture.cases) {
    it(describeRow(row), () => {
      const got = evaluateRow(row);
      expect(got).toBe(row.expect);
    });
  }
});

describe('Damage Control argv guardrails — auto-mutation.yaml', () => {
  const fixture = loadFixture(AUTO_MUT_FIXTURE);

  it('fixture parses and has cases', () => {
    expect(fixture).toBeDefined();
    expect(fixture.cases).toBeInstanceOf(Array);
    expect(fixture.cases.length).toBeGreaterThan(0);
  });

  for (const row of fixture.cases) {
    it(describeRow(row), () => {
      const got = evaluateRow(row);
      expect(got).toBe(row.expect);
    });
  }
});
