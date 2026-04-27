'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Wave 0d-f regression coverage for scripts/derive-skill-composition.js.
// Tests run against a temporary SKILLS/ tree so they are hermetic and
// do not depend on the real corpus.

const derive = require('./scripts/derive-skill-composition');

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-skill-graph-test-'));
}

function writeSkill(root, relDir, body) {
  const full = path.join(root, relDir);
  fs.mkdirSync(full, { recursive: true });
  fs.writeFileSync(path.join(full, 'SKILL.md'), body);
}

function frontmatter(name) {
  return `---\nname: ${name}\ndescription: Test skill ${name}\n---\n`;
}

test('Wave 0d-f: TRANSITIVE_CLOSE_EXPAND has 11 entries including ADAPT chain', () => {
  const allow = derive.TRANSITIVE_CLOSE_EXPAND;
  assert.ok(allow instanceof Set, 'TRANSITIVE_CLOSE_EXPAND should be a Set');
  assert.strictEqual(allow.size, 11, `expected 11 allowlist entries, got ${allow.size}`);
  for (const name of [
    'release-readiness',
    'repo-ingestor',
    'docs-architect',
    'orch-review',
    'orch-plan',
    'tool-governance',
    'orch-refactor',
    'to-issues',
    'tdd',
    'pr-manager',
    'triage-bug'
  ]) {
    assert.ok(allow.has(name), `expected allowlist to include ${name}`);
  }
});

test('Wave 0d-f: scanInvocations matches positive phrasings', () => {
  const phrases = [
    'invoke release-readiness skill',
    'run the docs-architect skill',
    'use `orch-review` skill',
    'call *panel-foo* workflow',
    'run docs_architect skill'
  ];
  for (const phrase of phrases) {
    const hits = derive.scanInvocations(phrase);
    assert.ok(hits.length >= 1, `expected match for: ${phrase}`);
  }
});

test('Wave 0d-f: scanInvocations rejects negative phrasings', () => {
  // No "skill"/"panel"/"workflow" suffix => no match.
  const negatives = [
    'we should think about release-readiness',
    'docs-architect mentions are everywhere',
    'plain prose with no invocation',
    'invoke something' // candidate "something" lacks suffix
  ];
  for (const text of negatives) {
    const hits = derive.scanInvocations(text);
    assert.strictEqual(
      hits.length,
      0,
      `unexpected match in negative phrasing: ${text} => ${JSON.stringify(hits)}`
    );
  }
});

test('Wave 0d-f: invocation regex is not catastrophically backtracking (ReDoS guard)', () => {
  // 200KB pathological-ish payload. The regex must complete fast.
  const haystack = 'invoke '.repeat(20000) + 'no-suffix-here';
  const start = Date.now();
  const hits = derive.scanInvocations(haystack);
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 1000, `scanInvocations took ${elapsed}ms (>1s)`);
  // No skill/panel/workflow suffix => no matches even at 200KB.
  assert.strictEqual(hits.length, 0, 'expected zero matches on ReDoS payload');
});

test('Wave 0d-f: estimateTokenCost uses chars/4 with cap', () => {
  const { estimateTokenCost, TOKEN_COST_MAX } = derive;
  assert.strictEqual(estimateTokenCost(''), 0);
  assert.strictEqual(estimateTokenCost(null), 0);
  assert.strictEqual(estimateTokenCost('abcd'), 1, 'chars/4 of "abcd" should be 1');
  assert.strictEqual(estimateTokenCost('abcde'), 2, 'chars/4 should round up');
  // 1 million chars -> 250000 raw, capped at TOKEN_COST_MAX.
  const giant = 'x'.repeat(1_000_000);
  assert.strictEqual(estimateTokenCost(giant), TOKEN_COST_MAX);
});

test('Wave 0d-f: canReach correctly walks the directed adjacency', () => {
  const adj = new Map();
  adj.set('a', ['b']);
  adj.set('b', ['c']);
  adj.set('c', []);
  assert.strictEqual(derive.canReach('a', 'c', adj), true);
  assert.strictEqual(derive.canReach('a', 'a', adj), true); // self
  assert.strictEqual(derive.canReach('c', 'a', adj), false);
});

test('Wave 0d-f: cycle-rejection-on-insert drops back-edges and emits _rejected_cycles', () => {
  const root = mkTmpDir();
  try {
    // alpha invokes bravo. bravo invokes charlie. charlie invokes alpha
    // (would close a cycle, depending on processing order).
    // Note: invocation regex requires capture-group >= 3 chars, so we
    // use multi-char names instead of single letters.
    writeSkill(
      root,
      'alpha',
      `${frontmatter('alpha')}\n# alpha\nThis skill needs to invoke bravo skill.\n`
    );
    writeSkill(
      root,
      'bravo',
      `${frontmatter('bravo')}\n# bravo\nNext, run charlie skill for verification.\n`
    );
    writeSkill(
      root,
      'charlie',
      `${frontmatter('charlie')}\n# charlie\nFinally, call alpha skill to close the loop.\n`
    );

    const graph = derive.buildGraph(root, { quiet: true });
    assert.ok(Array.isArray(graph._rejected_cycles), 'expected _rejected_cycles array');
    // Exactly one of the three edges in {alpha->bravo, bravo->charlie,
    // charlie->alpha} closes a cycle relative to whatever scan order
    // the build chose. Exactly one edge must be rejected.
    assert.strictEqual(
      graph._rejected_cycles.length,
      1,
      `expected exactly one rejected cycle, got ${JSON.stringify(graph._rejected_cycles)}`
    );
    const dropped = graph._rejected_cycles[0];
    assert.strictEqual(dropped.reason, 'would_close_cycle');
    assert.match(dropped.file, /SKILL\.md$/);

    // The dropped edge must NOT appear in the emitted edges list.
    const leaked = graph.edges.find(
      (e) => e.from === dropped.from && e.to === dropped.to && e.kind === 'direct'
    );
    assert.strictEqual(leaked, undefined, 'cycle-closing edge leaked into graph');

    // Direct cycles must be empty (back-edge was rejected pre-detection).
    assert.strictEqual(graph.cycles.length, 0);

    // Exactly two direct edges should remain (the third is the rejected
    // cycle-closer).
    const directs = graph.edges.filter((e) => e.kind === 'direct');
    assert.strictEqual(directs.length, 2, `expected 2 direct edges, got ${directs.length}`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Wave 0d-f: every emitted edge carries tokenCostEstimate', () => {
  const root = mkTmpDir();
  try {
    writeSkill(
      root,
      'tdd',
      `${frontmatter('tdd')}\n# tdd\nNow invoke pr-manager skill to ship.\n`
    );
    writeSkill(
      root,
      'pr-manager',
      `${frontmatter('pr-manager')}\n# pr-manager\nNothing else.\n`
    );

    const graph = derive.buildGraph(root, { quiet: true });
    assert.ok(graph.edges.length >= 1);
    for (const edge of graph.edges) {
      assert.ok(
        typeof edge.tokenCostEstimate === 'number',
        `edge ${edge.from}->${edge.to} missing tokenCostEstimate`
      );
      assert.ok(edge.tokenCostEstimate >= 0, 'tokenCostEstimate must be non-negative');
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Wave 0d-f: transitive edges from allowlisted source carry tokenCostEstimate', () => {
  const root = mkTmpDir();
  try {
    writeSkill(
      root,
      'tdd',
      `${frontmatter('tdd')}\n# tdd\nFirst invoke pr-manager skill.\n`
    );
    writeSkill(
      root,
      'pr-manager',
      `${frontmatter('pr-manager')}\n# pr-manager\nNext run release-readiness skill.\n`
    );
    writeSkill(
      root,
      'release-readiness',
      `${frontmatter('release-readiness')}\n# release-readiness\nfin.\n`
    );

    const graph = derive.buildGraph(root, { quiet: true });
    // tdd is allowlisted, so we expect a transitive tdd -> release-readiness edge.
    const transitive = graph.edges.find(
      (e) => e.from === 'tdd' && e.to === 'release-readiness' && e.kind === 'transitive'
    );
    assert.ok(transitive, 'expected transitive edge tdd -> release-readiness');
    assert.ok(typeof transitive.tokenCostEstimate === 'number');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Wave 0d-f: empty SKILLS/ tree yields _rejected_cycles []', () => {
  const root = mkTmpDir();
  try {
    const graph = derive.buildGraph(root, { quiet: true });
    assert.ok(Array.isArray(graph._rejected_cycles));
    assert.strictEqual(graph._rejected_cycles.length, 0);
    assert.strictEqual(graph.edges.length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
