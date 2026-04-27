import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import YAML from 'yaml';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ORCH_TDD_DIR = path.join(
  REPO_ROOT,
  'SKILLS',
  'ORCHESTRATION FRAMEWORK',
  'commands',
  'orch-tdd'
);
const SKILL_PATH = path.join(ORCH_TDD_DIR, 'SKILL.md');
const REFS_DIR = path.join(ORCH_TDD_DIR, 'refs');
const RULES_PATH = path.join(REPO_ROOT, 'damage-control-rules.yaml');
const VALIDATOR = path.join(REPO_ROOT, 'scripts', 'validate-tdd-evidence.js');

describe('Wave 4 orch-tdd uplift', () => {
  describe('SKILL.md', () => {
    let body: string;
    beforeAll(() => {
      body = fs.readFileSync(SKILL_PATH, 'utf8');
    });

    it('exists', () => {
      expect(fs.existsSync(SKILL_PATH)).toBe(true);
    });

    it('description starts with "Use when "', () => {
      const fmMatch = body.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      expect(fmMatch).toBeTruthy();
      const fm = fmMatch![1];
      const descMatch = fm.match(/description:\s*(.+)/);
      expect(descMatch).toBeTruthy();
      expect(descMatch![1].trim()).toMatch(/^Use when /);
    });

    it('has H2 anti-pattern section about horizontal slicing', () => {
      expect(body).toMatch(
        /^##\s+Anti-pattern:\s*horizontal slicing produces crap tests/m
      );
    });

    it('has H2 slice-shape panel gate section', () => {
      expect(body).toMatch(/^##\s+Slice-shape panel gate/m);
    });

    it('has H2 red-commit-hash evidence rule section', () => {
      expect(body).toMatch(/^##\s+Red-commit-hash evidence rule/m);
    });

    it('emits invocation phrasing for slice-shape panel via panel-of-experts skill', () => {
      // Phrasing must be picked up by derive-skill-composition.js
      // INVOCATION_RE which expects "(invoke|run|use|call) <name> (skill|panel|workflow)".
      expect(body).toMatch(
        /Before invoking tdd skill, run slice-shape panel via panel-of-experts skill\./
      );
    });

    it('cross-links the four ref docs', () => {
      expect(body).toMatch(/refs\/deep-modules\.md/);
      expect(body).toMatch(/refs\/interface-design\.md/);
      expect(body).toMatch(/refs\/mocking\.md/);
      expect(body).toMatch(/refs\/tests\.md/);
    });

    it('mentions the Test-Red commit footer convention', () => {
      expect(body).toMatch(/Test-Red:/);
    });

    it('references validate-tdd-evidence.js', () => {
      expect(body).toMatch(/validate-tdd-evidence\.js/);
    });
  });

  describe('refs/ vendored docs', () => {
    const expectedRefs = [
      'deep-modules.md',
      'interface-design.md',
      'mocking.md',
      'tests.md',
    ];

    it('all four ref docs exist', () => {
      for (const r of expectedRefs) {
        expect(fs.existsSync(path.join(REFS_DIR, r))).toBe(true);
      }
    });

    it('every ref doc has a mattpocock attribution header', () => {
      for (const r of expectedRefs) {
        const content = fs.readFileSync(path.join(REFS_DIR, r), 'utf8');
        // Header form: "> Adapted from mattpocock/skills @ 90ea8eec / tdd/<file> (MIT, ...)."
        expect(content).toMatch(
          /^>\s+Adapted from mattpocock\/skills\s+@\s+[0-9a-f]+\s*\/\s*tdd\/[a-z-]+\.md\s*\(MIT/i
        );
      }
    });
  });

  describe('damage-control DC-44 rule', () => {
    let dc44: any;
    beforeAll(() => {
      const raw = fs.readFileSync(RULES_PATH, 'utf8');
      const rules = YAML.parse(raw);
      dc44 = rules.dangerous_commands.find((r: any) => r.id === 'DC-44');
    });

    it('rule DC-44 exists', () => {
      expect(dc44).toBeDefined();
    });

    it('compiles as a valid regex', () => {
      expect(() => new RegExp(dc44.pattern, 'i')).not.toThrow();
    });

    it('does not trivially match empty / colon / single letter', () => {
      const re = new RegExp(dc44.pattern, 'i');
      expect(re.test('')).toBe(false);
      expect(re.test(':')).toBe(false);
      expect(re.test(' ')).toBe(false);
      expect(re.test('a')).toBe(false);
    });

    it('matches a commit message that touches a test file but lacks Test-Red footer', () => {
      const re = new RegExp(dc44.pattern, 'i');
      expect(re.test('git commit -m "add foo.test.ts coverage"')).toBe(true);
      expect(re.test('git commit -m "add bar.spec.tsx new case"')).toBe(true);
    });

    it('does NOT match a commit message that includes a 40-hex Test-Red footer', () => {
      const re = new RegExp(dc44.pattern, 'i');
      const sha = 'a'.repeat(40);
      expect(
        re.test(`git commit -m "add foo.test.ts\\nTest-Red: ${sha}"`)
      ).toBe(false);
    });

    it('does NOT match a non-test commit message', () => {
      const re = new RegExp(dc44.pattern, 'i');
      expect(re.test('git commit -m "refactor PaymentService"')).toBe(false);
      expect(re.test('git commit -m "add feature"')).toBe(false);
    });

    it('uses ask: true (advisory, not block)', () => {
      expect(dc44.ask).toBe(true);
    });
  });

  describe('validate-tdd-evidence.js', () => {
    it('exists and is valid JS (node --check)', () => {
      expect(fs.existsSync(VALIDATOR)).toBe(true);
      // Throws on syntax errors.
      expect(() =>
        execFileSync(process.execPath, ['--check', VALIDATOR], {
          stdio: 'pipe',
        })
      ).not.toThrow();
    });

    it('exits 0 against an empty-evidence fixture', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tdd-evidence-'));
      const fixture = path.join(tmp, 'empty-evidence.jsonl');
      fs.writeFileSync(fixture, '');
      const out = execFileSync(
        process.execPath,
        [VALIDATOR, '--file', fixture, '--json'],
        { encoding: 'utf8' }
      );
      const parsed = JSON.parse(out.trim().split(/\r?\n/).pop()!);
      expect(parsed.ok).toBe(true);
      expect(parsed.tddRows).toBe(0);
      expect(parsed.warnings).toEqual([]);
    });

    it('warns (but exits 0) against a fixture with a green commit lacking a red row', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tdd-evidence-'));
      const fixture = path.join(tmp, 'gap-evidence.jsonl');
      // Two rows: one well-formed, one missing red_sha.
      const goodRow = {
        type: 'tdd-red-green',
        slice_id: 'slice-1',
        red_sha: 'a'.repeat(40),
        green_sha: 'b'.repeat(40),
        test_path: 'tests/foo.test.ts',
        ts: '2026-04-27T00:00:00Z',
      };
      const gappedRow = {
        type: 'tdd-red-green',
        slice_id: 'slice-2',
        red_sha: '',
        green_sha: 'c'.repeat(40),
        test_path: 'tests/bar.test.ts',
        ts: '2026-04-27T00:01:00Z',
      };
      fs.writeFileSync(
        fixture,
        JSON.stringify(goodRow) + '\n' + JSON.stringify(gappedRow) + '\n'
      );

      let exitCode: number | null = 0;
      let stderr = '';
      try {
        execFileSync(process.execPath, [VALIDATOR, '--file', fixture], {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (err: any) {
        exitCode = err.status;
        stderr = String(err.stderr || '');
      }
      // Validator is advisory: exit 0 even on warnings.
      expect(exitCode).toBe(0);

      // Re-run with --json to inspect the structured warning.
      const out = execFileSync(
        process.execPath,
        [VALIDATOR, '--file', fixture, '--json'],
        { encoding: 'utf8' }
      );
      const parsed = JSON.parse(out.trim().split(/\r?\n/).pop()!);
      expect(parsed.ok).toBe(true);
      expect(parsed.tddRows).toBe(2);
      expect(parsed.warnings.length).toBe(1);
      expect(parsed.warnings[0].row.slice_id).toBe('slice-2');
      expect(parsed.warnings[0].reason).toMatch(/red_sha/i);
    });
  });

  describe('skill-graph composition edges', () => {
    // skill-graph.json is a gitignored build artifact (see .gitignore).
    // Generate it on demand so this test runs in fresh checkouts/CI.
    const tmpGraph = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'skill-graph-')),
      'skill-graph.json'
    );

    beforeAll(() => {
      execFileSync(
        process.execPath,
        [
          path.join(REPO_ROOT, 'scripts', 'derive-skill-composition.js'),
          '--quiet',
          '--out',
          tmpGraph,
        ],
        { stdio: 'pipe' }
      );
    });

    it('skill-graph generation succeeds and produces a JSON artifact', () => {
      expect(fs.existsSync(tmpGraph)).toBe(true);
      const graph = JSON.parse(fs.readFileSync(tmpGraph, 'utf8'));
      expect(graph).toBeTruthy();
      expect(Array.isArray(graph.edges)).toBe(true);
    });

    it('contains an edge from orch-tdd to panel-of-experts (slice-shape gate)', () => {
      const graph = JSON.parse(fs.readFileSync(tmpGraph, 'utf8'));
      const edges = (graph.edges || []) as Array<{ from: string; to: string }>;
      const found = edges.some(
        (e) => e.from === 'orch-tdd' && e.to === 'panel-of-experts'
      );
      expect(found).toBe(true);
    });
  });
});
