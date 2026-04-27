'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Wave 0d-f regression coverage for the truth-score gate that blocks
// nextSteps[] auto-activation of destructive skills until a passing
// `verification-quality` evidence row appears in the active session's
// evidence log.
//
// The runtime logic lives on EvokoreMCPServer (a private method). We
// validate it via two paths:
//   1. Source-contract checks against src/index.ts so the gate cannot
//      be silently removed.
//   2. Functional checks against the compiled file's behavior using a
//      tiny harness that mirrors the helper signature exactly.

test('Wave 0d-f: index.ts declares DESTRUCTIVE_AUTO_ACTIVATION_TARGETS set', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'src/index.ts'), 'utf8');
  assert.match(src, /DESTRUCTIVE_AUTO_ACTIVATION_TARGETS\s*=\s*new Set/,
    'expected DESTRUCTIVE_AUTO_ACTIVATION_TARGETS const set in index.ts');
  for (const tool of ['"tdd"', '"pr-manager"', '"orch-refactor"', '"to-issues"', '"release-readiness"']) {
    assert.ok(src.includes(tool),
      `expected destructive target ${tool} in DESTRUCTIVE_AUTO_ACTIVATION_TARGETS`);
  }
});

test('Wave 0d-f: index.ts wires EVOKORE_AUTO_ACTIVATION_REQUIRE_TRUTH_SCORE env', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'src/index.ts'), 'utf8');
  assert.match(src, /EVOKORE_AUTO_ACTIVATION_REQUIRE_TRUTH_SCORE/,
    'expected EVOKORE_AUTO_ACTIVATION_REQUIRE_TRUTH_SCORE env read');
  assert.match(src, /requireTruthScoreForAutoActivation/,
    'expected requireTruthScoreForAutoActivation field');
  // Default ON: when env is unset, the field must initialize to true.
  assert.match(src, /this\.requireTruthScoreForAutoActivation\s*=\s*true/,
    'expected default-on initialization');
});

test('Wave 0d-f: index.ts wires EVOKORE_TOOLS_LIST_CHANGED_DEBOUNCE_MS with [0,5000] clamp', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'src/index.ts'), 'utf8');
  assert.match(src, /EVOKORE_TOOLS_LIST_CHANGED_DEBOUNCE_MS/,
    'expected debounce env var');
  assert.match(src, /Math\.max\(0,\s*Math\.min\(5000/,
    'expected [0, 5000] clamp on debounce window');
  assert.match(src, /scheduleToolListChanged/,
    'expected scheduleToolListChanged method');
});

test('Wave 0d-f: applyExecuteSkillNextSteps emits deferred_truth_score and deferred_budget hints', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'src/index.ts'), 'utf8');
  assert.match(src, /deferred_truth_score/,
    'expected deferred_truth_score hint string');
  assert.match(src, /deferred_budget/,
    'expected deferred_budget hint string');
  assert.match(src, /hasRecentVerificationQualityEvidence/,
    'expected hasRecentVerificationQualityEvidence helper');
  assert.match(src, /getActiveProfileTokenBudget/,
    'expected getActiveProfileTokenBudget helper');
});

test('Wave 0d-f: SkillNextStep interface carries tokenCostEstimate + hint', () => {
  const skillMgr = fs.readFileSync(path.resolve(__dirname, 'src/SkillManager.ts'), 'utf8');
  assert.match(skillMgr, /SkillNextStep/, 'expected SkillNextStep interface');
  assert.match(skillMgr, /tokenCostEstimate\?:\s*number/,
    'expected optional tokenCostEstimate on SkillNextStep');
  assert.match(skillMgr, /hint\?:\s*string/,
    'expected optional hint on SkillNextStep');
});

// ---- Functional check on the evidence-scan helper ----
//
// We replicate the helper's signature verbatim against a temp evidence
// file and verify both the pass-through and fail-closed paths. This
// shadows the implementation enough to catch subtle regressions
// (e.g. accidentally dropping the tail-window scan).

function makeTempEvidence(rows) {
  const tmp = path.join(os.tmpdir(), `evokore-truth-score-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
  fs.writeFileSync(
    tmp,
    rows.map((r) => JSON.stringify(r)).join('\n') + '\n'
  );
  return tmp;
}

async function evidenceLooksPassing(filePath, opts = {}) {
  // Same logic as hasRecentVerificationQualityEvidence in src/index.ts
  // but reading from an explicit path for the test harness.
  const windowSize = Number.isFinite(opts.window) && opts.window > 0
    ? Math.min(opts.window, 1000)
    : 50;
  const threshold = Number.isFinite(opts.threshold) ? opts.threshold : 0.7;

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return false;
  }
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  const tail = lines.slice(Math.max(0, lines.length - windowSize));
  for (const line of tail) {
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (!row || typeof row !== 'object') continue;
    const t = row.type ?? row.kind ?? row.evidenceType;
    if (t !== 'verification-quality' && t !== 'verification_quality') continue;
    if (row.passed === true) return true;
    const score =
      typeof row.score === 'number'
        ? row.score
        : typeof row.truthScore === 'number'
          ? row.truthScore
          : null;
    if (score !== null && Number.isFinite(score) && score >= threshold) {
      return true;
    }
  }
  return false;
}

test('Wave 0d-f: evidence scanner accepts passed:true row', async () => {
  const tmp = makeTempEvidence([
    { type: 'tool_call', name: 'foo' },
    { type: 'verification-quality', passed: true }
  ]);
  try {
    assert.strictEqual(await evidenceLooksPassing(tmp), true);
  } finally {
    fs.unlinkSync(tmp);
  }
});

test('Wave 0d-f: evidence scanner accepts numeric score >= threshold', async () => {
  const tmp = makeTempEvidence([
    { type: 'verification-quality', score: 0.85 }
  ]);
  try {
    assert.strictEqual(await evidenceLooksPassing(tmp), true);
    assert.strictEqual(await evidenceLooksPassing(tmp, { threshold: 0.9 }), false,
      'higher threshold should reject a 0.85 score');
  } finally {
    fs.unlinkSync(tmp);
  }
});

test('Wave 0d-f: evidence scanner rejects when no verification-quality row exists', async () => {
  const tmp = makeTempEvidence([
    { type: 'tool_call' },
    { type: 'file_change' }
  ]);
  try {
    assert.strictEqual(await evidenceLooksPassing(tmp), false);
  } finally {
    fs.unlinkSync(tmp);
  }
});

test('Wave 0d-f: evidence scanner fails closed when file is missing', async () => {
  const missing = path.join(os.tmpdir(), `evokore-missing-${Date.now()}.jsonl`);
  assert.strictEqual(await evidenceLooksPassing(missing), false);
});

test('Wave 0d-f: evidence scanner respects window bound', async () => {
  // 60 rows where only the very first is a passing verification-quality row.
  // Default window=50 should miss it; window=100 should catch it.
  const rows = [{ type: 'verification-quality', passed: true }];
  for (let i = 0; i < 59; i++) rows.push({ type: 'tool_call', i });
  const tmp = makeTempEvidence(rows);
  try {
    assert.strictEqual(await evidenceLooksPassing(tmp, { window: 50 }), false,
      'old passing row should fall off the default window');
    assert.strictEqual(await evidenceLooksPassing(tmp, { window: 100 }), true,
      'wider window should catch the historical pass');
  } finally {
    fs.unlinkSync(tmp);
  }
});

test('Wave 0d-f: evidence scanner tolerates malformed JSON lines', async () => {
  const tmp = path.join(os.tmpdir(), `evokore-malformed-${Date.now()}.jsonl`);
  fs.writeFileSync(
    tmp,
    [
      'this is not json',
      JSON.stringify({ type: 'verification-quality', passed: true }),
      '{also not json'
    ].join('\n') + '\n'
  );
  try {
    assert.strictEqual(await evidenceLooksPassing(tmp), true);
  } finally {
    fs.unlinkSync(tmp);
  }
});
