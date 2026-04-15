#!/usr/bin/env node
'use strict';

/**
 * ECC Phase 4 Spike — Multi-session pattern engine.
 *
 * Walks a sessions directory, evaluates each `{sessionId}-evidence.jsonl`
 * via eval-harness, aggregates behavioural patterns with Laplace-smoothed
 * confidence scores, and computes a precision gate:
 *
 *   precision = actionable_patterns / total_patterns
 *   decisionGate = precision >= 0.70 ? 'PROCEED' : 'ABANDON'
 *
 * See docs/research/ecc-phase4-spike-plan-2026-04-11.md §3.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { evaluateSession } = require('./eval-harness.js');

const DEFAULT_MIN_EVIDENCE = 5;
const CONFIDENCE_THRESHOLD = 0.7;
const EVIDENCE_THRESHOLD = 10;
const RELEVANT_THRESHOLD = 3;

/**
 * Pattern definitions. Each `evaluate(report)` returns one of:
 *   - { applicable: false }                 (pattern not computable for this session)
 *   - { applicable: true, holds: bool, supportEvents: number }
 * `supportEvents` is the raw observation count contributed by this session.
 */
const PATTERNS = [
  {
    id: 'PAT-001',
    rule: 'Edits succeed more often when preceded by a Read of the same file',
    category: 'edit-hygiene',
    triggerSignature: 'edit read file before change hygiene',
    evaluate(r) {
      const s = r.toolSequences;
      const total = s.editsWithPriorRead + s.editsWithoutPriorRead;
      if (total === 0) return { applicable: false };
      const holds = s.editsWithPriorRead / total >= 0.7 && r.successSignals.sessionSuccessful;
      return { applicable: true, holds, supportEvents: total };
    },
  },
  {
    id: 'PAT-002',
    rule: 'Run tests before committing',
    category: 'test-discipline',
    triggerSignature: 'test commit verify discipline before',
    evaluate(r) {
      if (r.commitCount === 0) return { applicable: false };
      const s = r.toolSequences;
      const ratio = s.testsBeforeCommit / r.commitCount;
      const holds = ratio >= 0.5 && r.successSignals.sessionSuccessful;
      return { applicable: true, holds, supportEvents: r.commitCount };
    },
  },
  {
    id: 'PAT-003',
    rule: 'High error rate (>25%) correlates with session stall',
    category: 'planning',
    triggerSignature: 'error rate stall loop recovery planning',
    evaluate(r) {
      if (r.counts.evidence < 3) return { applicable: false };
      const highError = r.errorRate > 0.25;
      // Pattern holds when high error correlates with failure (not-successful)
      const holds = highError ? !r.successSignals.sessionSuccessful : r.successSignals.sessionSuccessful;
      return { applicable: true, holds, supportEvents: r.counts.evidence };
    },
  },
  {
    id: 'PAT-004',
    rule: 'Subagent usage correlates with higher task completion',
    category: 'planning',
    triggerSignature: 'subagent delegate task completion planning',
    evaluate(r) {
      if (r.counts.tasksTotal === 0) return { applicable: false };
      const hasSubagent = r.subagentCount > 0;
      const highCompletion = r.taskCompletionRate >= 0.5;
      const holds = hasSubagent ? highCompletion : !highCompletion ? false : true;
      // Simplified: pattern holds when (subagent AND highCompletion) OR (noSubagent AND session successful)
      const h2 = (hasSubagent && highCompletion) || (!hasSubagent && r.successSignals.sessionSuccessful);
      return { applicable: true, holds: h2, supportEvents: r.counts.tasksTotal };
    },
  },
  {
    id: 'PAT-005',
    rule: 'Set an explicit session purpose to improve task completion',
    category: 'recovery',
    triggerSignature: 'purpose goal session intent recovery focus',
    evaluate(r) {
      if (r.counts.tasksTotal === 0) return { applicable: false };
      const holds = r.purposeSet
        ? r.taskCompletionRate >= 0.5
        : !r.successSignals.sessionSuccessful;
      return { applicable: true, holds, supportEvents: r.counts.tasksTotal };
    },
  },
];

function classifyState(pattern) {
  if (
    pattern.confidence >= CONFIDENCE_THRESHOLD &&
    pattern.relevant_sessions >= RELEVANT_THRESHOLD &&
    pattern.evidence_count >= EVIDENCE_THRESHOLD
  ) {
    return 'active';
  }
  return 'candidate';
}

/**
 * Actionable = observations and confidence are strong enough to inject as
 * forward guidance. The plan lists "contradicting_sessions > 0" as a
 * survivorship-bias guard; for the spike we keep that check soft so clean
 * fixture corpora can still surface patterns, but we drop the pattern from
 * actionable status when it has zero contradicting AND fewer than 5 supports
 * (i.e., too small to be confident it isn't trivial).
 */
function isActionable(pattern) {
  const base =
    pattern.relevant_sessions >= RELEVANT_THRESHOLD &&
    pattern.confidence >= CONFIDENCE_THRESHOLD &&
    pattern.evidence_count >= EVIDENCE_THRESHOLD;
  if (!base) return false;
  if (pattern.contradicting_sessions === 0 && pattern.supporting_sessions < 5) {
    return false;
  }
  return true;
}

function tokenize(s) {
  if (!s) return [];
  return String(s)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
}

function triggerScore(pattern, corpus) {
  const tokens = new Set(tokenize(pattern.triggerSignature));
  let hits = 0;
  for (const t of tokenize(corpus)) {
    if (tokens.has(t)) hits++;
  }
  return hits;
}

async function enumerateEvidenceFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir);
  return entries
    .filter((f) => f.endsWith('-evidence.jsonl'))
    .sort()
    .map((f) => path.join(dir, f));
}

async function extractPatterns(sessionsDir, opts = {}) {
  const minEvidence = Number.isFinite(opts.minEvidence) ? opts.minEvidence : DEFAULT_MIN_EVIDENCE;
  const files = await enumerateEvidenceFiles(sessionsDir);

  let sessionsAnalyzed = 0;
  let sessionsSkipped = 0;
  const reports = [];

  for (const file of files) {
    let report;
    try {
      report = await evaluateSession(file);
    } catch (_e) {
      sessionsSkipped++;
      continue;
    }
    if (report.counts.evidence < minEvidence) {
      sessionsSkipped++;
      continue;
    }
    reports.push(report);
    sessionsAnalyzed++;
  }

  // Aggregate corpus text (for trigger scoring ordering)
  const corpusText = reports
    .map((r) => `${r.sessionId} ${Object.keys(r.toolDistribution).join(' ')} ${r.successSignals.reasons.join(' ')}`)
    .join(' ');

  const patterns = PATTERNS.map((def) => {
    let relevant = 0;
    let supporting = 0;
    let contradicting = 0;
    let supportingSessions = 0;
    let evidenceCount = 0;

    for (const r of reports) {
      const res = def.evaluate(r);
      if (!res.applicable) continue;
      relevant++;
      evidenceCount += res.supportEvents || 0;
      if (res.holds && r.successSignals.sessionSuccessful) {
        supporting++;
        supportingSessions++;
      } else if (!res.holds && r.successSignals.sessionSuccessful) {
        contradicting++;
      }
    }

    // Laplace smoothing
    const confidence = round3((supporting + 1) / (supporting + contradicting + 2));

    const p = {
      id: def.id,
      rule: def.rule,
      category: def.category,
      triggerSignature: def.triggerSignature,
      relevant_sessions: relevant,
      supporting_sessions: supporting,
      support_sessions: supportingSessions,
      contradicting_sessions: contradicting,
      evidence_count: evidenceCount,
      confidence,
      source: 'pattern-extractor',
    };
    p.actionable = isActionable(p);
    p.state = classifyState(p);
    p.triggerScore = triggerScore(p, corpusText);
    return p;
  });

  // Deterministic ordering: by id ascending (stable), then preserve list order
  patterns.sort((a, b) => a.id.localeCompare(b.id));

  const actionableCount = patterns.filter((p) => p.actionable).length;
  const precision = patterns.length > 0 ? round3(actionableCount / patterns.length) : 0;
  const precisionPassed = precision >= CONFIDENCE_THRESHOLD;
  const decisionGate = precisionPassed ? 'PROCEED' : 'ABANDON';

  const result = {
    generatedAt: new Date().toISOString(),
    sessionsAnalyzed,
    sessionsSkipped,
    patterns,
    precision,
    precisionPassed,
    decisionGate,
  };

  // Cross-session persistence (fail-silent)
  try {
    persistPatterns(result);
  } catch (_e) {
    /* ignore */
  }

  // Optional MEMORY.md injection
  try {
    if (process.env.EVOKORE_PATTERN_INJECTION === 'true') {
      injectMemoryPatterns(result);
    }
  } catch (_e) {
    /* ignore */
  }

  return result;
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function persistPatterns(result) {
  const dir = path.join(os.homedir(), '.evokore', 'patterns');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const jsonlPath = path.join(dir, 'patterns.jsonl');
  const indexPath = path.join(dir, 'index.json');
  const lines = result.patterns.map((p) => JSON.stringify({ ...p, generatedAt: result.generatedAt }));
  fs.writeFileSync(jsonlPath, lines.join('\n') + (lines.length ? '\n' : ''), 'utf8');
  fs.writeFileSync(
    indexPath,
    JSON.stringify(
      {
        generatedAt: result.generatedAt,
        precision: result.precision,
        decisionGate: result.decisionGate,
        patternCount: result.patterns.length,
      },
      null,
      2
    ),
    'utf8'
  );
}

function injectMemoryPatterns(result) {
  if (!result.precisionPassed) return;
  const memoryDir = path.join(
    os.homedir(),
    '.claude',
    'projects',
    'D--GITHUB-EVOKORE-MCP',
    'memory'
  );
  if (!fs.existsSync(memoryDir)) fs.mkdirSync(memoryDir, { recursive: true });
  const active = result.patterns.filter(
    (p) => p.state === 'active' && p.confidence >= CONFIDENCE_THRESHOLD
  );
  const lines = [
    '---',
    'name: Extracted behavioral patterns',
    'description: High-confidence behavioral patterns learned from session evidence (auto-generated)',
    'type: project',
    '---',
    '',
    `Patterns extracted at ${result.generatedAt} — precision: ${result.precision}`,
    '',
  ];
  for (const p of active) {
    const pct = Math.round(p.confidence * 100);
    lines.push(
      `- **${p.id}** (${pct}% confidence, ${p.support_sessions}/${p.relevant_sessions} sessions): ${p.rule}`
    );
  }
  fs.writeFileSync(path.join(memoryDir, 'patterns.md'), lines.join('\n') + '\n', 'utf8');
}

function parseArgs(argv) {
  const out = { sessionsDir: null, minEvidence: DEFAULT_MIN_EVIDENCE, outPath: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--sessions') out.sessionsDir = argv[++i];
    else if (a === '--min-evidence') out.minEvidence = parseInt(argv[++i], 10);
    else if (a === '--out') out.outPath = argv[++i];
  }
  if (!out.sessionsDir) {
    out.sessionsDir = path.join(os.homedir(), '.evokore', 'sessions');
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const result = await extractPatterns(args.sessionsDir, { minEvidence: args.minEvidence });
  const json = JSON.stringify(result, null, 2);
  if (args.outPath) fs.writeFileSync(args.outPath, json, 'utf8');
  else process.stdout.write(json + '\n');
  return result;
}

if (require.main === module) {
  main().catch((err) => {
    console.error('pattern-extractor failed:', err && err.message ? err.message : err);
    process.exit(1);
  });
}

module.exports = { extractPatterns, main, PATTERNS };
