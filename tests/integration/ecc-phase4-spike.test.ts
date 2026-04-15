/**
 * ECC Phase 4 — Learning-Loop Spike
 *
 * Validates `scripts/eval-harness.js` (single-session evaluator) and
 * `scripts/pattern-extractor.js` (multi-session pattern engine +
 * precision gate). Tests write synthetic evidence/replay/tasks/manifest
 * artifacts to a temp dir; no real `~/.evokore` state is touched.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import {
  buildEvidenceJsonl,
  buildReplayJsonl,
  buildTasksJson,
  buildManifest,
  buildSuccessfulSession,
  buildNoisySession,
} from '../helpers/synth-evidence.js';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { evaluateSession } = require('../../scripts/eval-harness.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { extractPatterns } = require('../../scripts/pattern-extractor.js');

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-phase4-'));
});

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

describe('eval-harness.evaluateSession', () => {
  it('returns zero counts for an empty evidence file', async () => {
    const p = buildEvidenceJsonl(tmpDir, 'sess-empty', []);
    const report = await evaluateSession(p);
    expect(report.counts.evidence).toBe(0);
    expect(report.counts.testResult).toBe(0);
    expect(report.counts.gitOperation).toBe(0);
    expect(report.errorRate).toBe(0);
    expect(report.testPassRate).toBeNull();
  });

  it('counts each evidence type correctly for a seeded 10-entry file', async () => {
    const entries = [
      { type: 'test-result', passed: true, exit_code: 0 },
      { type: 'test-result', passed: true, exit_code: 0 },
      { type: 'test-result', passed: false, exit_code: 1, is_error: true },
      { type: 'edit-trace', tool: 'Edit', passed: true, file: 'a.ts' },
      { type: 'edit-trace', tool: 'Edit', passed: true, file: 'b.ts' },
      { type: 'edit-trace', tool: 'Write', passed: true, file: 'c.ts' },
      { type: 'file-change', tool: 'Edit', passed: true },
      { type: 'file-change', tool: 'Edit', passed: true },
      { type: 'git-operation', tool: 'Bash', summary: 'git commit: x', passed: true, exit_code: 0 },
      { type: 'git-operation', tool: 'Bash', summary: 'git push', passed: true, exit_code: 0 },
    ];
    const p = buildEvidenceJsonl(tmpDir, 'sess-10', entries);
    const report = await evaluateSession(p);
    expect(report.counts.evidence).toBe(10);
    expect(report.counts.testResult).toBe(3);
    expect(report.counts.editTrace).toBe(3);
    expect(report.counts.fileChange).toBe(2);
    expect(report.counts.gitOperation).toBe(2);
    expect(report.commitCount).toBe(1);
  });

  it('computes errorRate from is_error and passed===false mixed', async () => {
    const entries = [
      { type: 'test-result', passed: true, exit_code: 0 },
      { type: 'test-result', passed: false, exit_code: 1, is_error: true },
      { type: 'edit-trace', tool: 'Edit', passed: false, is_error: true, file: 'a.ts' },
      { type: 'edit-trace', tool: 'Edit', passed: true, file: 'b.ts' },
    ];
    const p = buildEvidenceJsonl(tmpDir, 'sess-err', entries);
    const report = await evaluateSession(p);
    // 2 error entries / 4 total = 0.5
    expect(report.errorRate).toBe(0.5);
  });

  it('computes testPassRate only across test-result entries', async () => {
    const entries = [
      { type: 'test-result', passed: true, exit_code: 0 },
      { type: 'test-result', passed: true, exit_code: 0 },
      { type: 'test-result', passed: false, exit_code: 1, is_error: true },
      { type: 'test-result', passed: true, exit_code: 0 },
      { type: 'edit-trace', tool: 'Edit', passed: false, is_error: true, file: 'x.ts' },
    ];
    const p = buildEvidenceJsonl(tmpDir, 'sess-tpr', entries);
    const report = await evaluateSession(p);
    expect(report.testPassRate).toBe(0.75);
  });

  it('reads sibling replay log and produces toolDistribution', async () => {
    buildReplayJsonl(tmpDir, 'sess-repl', [
      { tool: 'Read', summary: 'a.ts' },
      { tool: 'Read', summary: 'b.ts' },
      { tool: 'Edit', summary: 'a.ts' },
      { tool: 'Bash', summary: 'npx vitest run' },
    ]);
    const p = buildEvidenceJsonl(tmpDir, 'sess-repl', [
      { type: 'test-result', passed: true, exit_code: 0 },
    ]);
    const report = await evaluateSession(p);
    expect(report.toolDistribution.Read).toBe(2);
    expect(report.toolDistribution.Edit).toBe(1);
    expect(report.toolDistribution.Bash).toBe(1);
    expect(report.counts.replay).toBe(4);
  });

  it('reads sibling tasks file and computes taskCompletionRate', async () => {
    buildTasksJson(tmpDir, 'sess-tasks', [
      { content: 't1', status: 'completed' },
      { content: 't2', status: 'completed' },
      { content: 't3', status: 'pending' },
      { content: 't4', status: 'pending' },
    ]);
    const p = buildEvidenceJsonl(tmpDir, 'sess-tasks', [
      { type: 'test-result', passed: true, exit_code: 0 },
    ]);
    const report = await evaluateSession(p);
    expect(report.counts.tasksTotal).toBe(4);
    expect(report.counts.tasksDone).toBe(2);
    expect(report.taskCompletionRate).toBe(0.5);
  });

  it('marks sessionSuccessful=true when 2 of 3 clauses fire', async () => {
    const { evidencePath } = buildSuccessfulSession(tmpDir, 'sess-ok');
    const report = await evaluateSession(evidencePath);
    expect(report.successSignals.sessionSuccessful).toBe(true);
    expect(report.successSignals.reasons.length).toBeGreaterThanOrEqual(2);
  });

  it('emits warnings (not throws) when replay log is missing', async () => {
    const p = buildEvidenceJsonl(tmpDir, 'sess-no-replay', [
      { type: 'test-result', passed: true, exit_code: 0 },
    ]);
    const report = await evaluateSession(p);
    expect(report.warnings.some((w: string) => w.includes('replay'))).toBe(true);
    expect(report.counts.replay).toBe(0);
  });

  it('handles a malformed JSONL line gracefully (warning + continue)', async () => {
    const filePath = path.join(tmpDir, 'sess-bad-evidence.jsonl');
    const good = JSON.stringify({
      evidence_id: 'E-001',
      ts: new Date().toISOString(),
      type: 'test-result',
      tool: 'Bash',
      summary: 'npx vitest',
      exit_code: 0,
      passed: true,
    });
    fs.writeFileSync(filePath, good + '\n' + '{not json\n' + good + '\n', 'utf8');
    const report = await evaluateSession(filePath);
    expect(report.counts.evidence).toBe(2);
    expect(report.warnings.some((w: string) => w.includes('malformed'))).toBe(true);
  });
});

describe('pattern-extractor.extractPatterns', () => {
  function seedSuccessfulCorpus(dir: string, n: number): void {
    for (let i = 0; i < n; i++) {
      buildSuccessfulSession(dir, `sess-ok-${String(i).padStart(2, '0')}`);
    }
  }

  function seedNoisyCorpus(dir: string, n: number): void {
    for (let i = 0; i < n; i++) {
      buildNoisySession(dir, `sess-noisy-${String(i).padStart(2, '0')}`);
    }
  }

  it('returns decisionGate=PROCEED when the corpus is overwhelmingly successful', async () => {
    seedSuccessfulCorpus(tmpDir, 8);
    const result = await extractPatterns(tmpDir);
    expect(result.decisionGate).toBe('PROCEED');
    expect(result.precision).toBeGreaterThanOrEqual(0.7);
    expect(result.sessionsAnalyzed).toBe(8);
  });

  it('returns decisionGate=ABANDON when the corpus is noisy', async () => {
    seedNoisyCorpus(tmpDir, 8);
    const result = await extractPatterns(tmpDir);
    expect(result.decisionGate).toBe('ABANDON');
    expect(result.precision).toBeLessThan(0.7);
  });

  it('PAT-001 (Read before Edit) fires support+1 for a session with reads preceding edits', async () => {
    // 5 successful sessions so PAT-001 is relevant and supporting
    seedSuccessfulCorpus(tmpDir, 5);
    const result = await extractPatterns(tmpDir);
    const pat = result.patterns.find((p: any) => p.id === 'PAT-001');
    expect(pat).toBeDefined();
    expect(pat.supporting_sessions).toBe(5);
    expect(pat.evidence_count).toBeGreaterThan(0);
  });

  it('PAT-002 (Test before Commit) fires support+1 when test appears before commit', async () => {
    seedSuccessfulCorpus(tmpDir, 4);
    const result = await extractPatterns(tmpDir);
    const pat = result.patterns.find((p: any) => p.id === 'PAT-002');
    expect(pat).toBeDefined();
    expect(pat.supporting_sessions).toBe(4);
  });

  it('PAT-003 (High error rate) fires contradicting+1 when errorRate>0.25 AND tasks completed', async () => {
    // Need a session that is successful (tasks+commit) but has a high errorRate.
    // That contradicts PAT-003.
    const baseTs = Date.now();
    const entries = [
      { type: 'test-result', passed: false, exit_code: 1, is_error: true },
      { type: 'test-result', passed: true, exit_code: 0 },
      { type: 'edit-trace', tool: 'Edit', passed: true, file: 'a.ts' },
      { type: 'edit-trace', tool: 'Edit', passed: false, is_error: true, file: 'a.ts' },
      { type: 'git-operation', tool: 'Bash', summary: 'git commit: x', passed: true, exit_code: 0 },
    ];
    buildEvidenceJsonl(tmpDir, 'sess-contra-1', entries);
    buildReplayJsonl(tmpDir, 'sess-contra-1', [
      { tool: 'Read', summary: 'a.ts' },
      { tool: 'Edit', summary: 'a.ts' },
      { tool: 'Bash', summary: 'npx vitest run' },
      { tool: 'Bash', summary: 'git commit -m x' },
    ]);
    buildTasksJson(tmpDir, 'sess-contra-1', [
      { content: 't1', status: 'completed' },
      { content: 't2', status: 'completed' },
    ]);
    buildManifest(tmpDir, 'sess-contra-1', { purpose: 'contradicting case' });

    // Pair it with two successful sessions to get relevant_sessions >= 3.
    buildSuccessfulSession(tmpDir, 'sess-ok-a');
    buildSuccessfulSession(tmpDir, 'sess-ok-b');

    const result = await extractPatterns(tmpDir);
    const pat = result.patterns.find((p: any) => p.id === 'PAT-003');
    expect(pat).toBeDefined();
    expect(pat.contradicting_sessions).toBeGreaterThanOrEqual(1);
  });

  it('Laplace smoothing: pattern with 1 relevant session never reports confidence > 0.75', async () => {
    // Single successful session — any pattern that is applicable sees
    // relevant=1, supporting<=1, contradicting<=0.  Max confidence = 2/3.
    buildSuccessfulSession(tmpDir, 'sess-solo');
    const result = await extractPatterns(tmpDir);
    for (const p of result.patterns) {
      if (p.relevant_sessions === 1) {
        expect(p.confidence).toBeLessThanOrEqual(0.75);
      }
    }
  });

  it('Extractor skips sessions with evidence count < min-evidence', async () => {
    // Seed a session with only 2 evidence entries.
    buildEvidenceJsonl(tmpDir, 'sess-thin', [
      { type: 'test-result', passed: true, exit_code: 0 },
      { type: 'edit-trace', tool: 'Edit', passed: true, file: 'a.ts' },
    ]);
    const result = await extractPatterns(tmpDir, { minEvidence: 5 });
    expect(result.sessionsAnalyzed).toBe(0);
    expect(result.sessionsSkipped).toBe(1);
  });

  it('Extractor is deterministic: same inputs produce identical pattern ordering', async () => {
    seedSuccessfulCorpus(tmpDir, 3);
    const r1 = await extractPatterns(tmpDir);
    const r2 = await extractPatterns(tmpDir);
    expect(r1.patterns.map((p: any) => p.id)).toEqual(r2.patterns.map((p: any) => p.id));
    // Same metric values too
    for (let i = 0; i < r1.patterns.length; i++) {
      expect(r1.patterns[i].confidence).toBe(r2.patterns[i].confidence);
      expect(r1.patterns[i].evidence_count).toBe(r2.patterns[i].evidence_count);
    }
  });
});

describe('ecc-phase4 end-to-end', () => {
  it('3-session pipeline yields a numeric precision in [0,1]', async () => {
    buildSuccessfulSession(tmpDir, 'sess-p1');
    buildSuccessfulSession(tmpDir, 'sess-p2');
    buildSuccessfulSession(tmpDir, 'sess-p3');
    const result = await extractPatterns(tmpDir);
    expect(typeof result.precision).toBe('number');
    expect(result.precision).toBeGreaterThanOrEqual(0);
    expect(result.precision).toBeLessThanOrEqual(1);
  });

  it('10 successful sessions meet precision >= 0.7 (decisionGate=PROCEED)', async () => {
    for (let i = 0; i < 10; i++) {
      buildSuccessfulSession(tmpDir, `sess-good-${String(i).padStart(2, '0')}`);
    }
    const result = await extractPatterns(tmpDir);
    expect(result.precision).toBeGreaterThanOrEqual(0.7);
    expect(result.decisionGate).toBe('PROCEED');
  });

  it('10 noisy sessions fail precision < 0.7 (decisionGate=ABANDON)', async () => {
    for (let i = 0; i < 10; i++) {
      buildNoisySession(tmpDir, `sess-bad-${String(i).padStart(2, '0')}`);
    }
    const result = await extractPatterns(tmpDir);
    expect(result.precision).toBeLessThan(0.7);
    expect(result.decisionGate).toBe('ABANDON');
  });
});
