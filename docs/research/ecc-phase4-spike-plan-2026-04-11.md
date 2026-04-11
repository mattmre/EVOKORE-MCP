# ECC Phase 4 Spike — Research & Implementation Plan

**Date:** 2026-04-11
**Author:** Researcher agent
**Scope:** Read-only research for ECC Phase 4 (Automated Learning) spike
**Status:** Pre-implementation plan — no code written

---

## 0. Context Recap

ECC-INTEGRATION-PLAN.md §Phase 4 mandates a **spike** before investing in the full learning loop:

- Deliverables: `scripts/eval-harness.js` and `scripts/pattern-extractor.js`
- Run against **10 existing session evidence logs**
- Measure **precision** of extracted patterns (actionable vs. noise)
- **Decision gate:** proceed only if precision ≥ 70%
- **Kill criteria:** < 70% precision → abandon Phase 4, keep session replay as passive diagnostic
- If passes: `~/.evokore/instincts.yaml` + `scripts/instinct-evolver.js`, plus `homunculus.json` in a later step

The spike MUST NOT touch the existing hook pipeline. It should be a pure, read-only analysis over existing JSONL artifacts.

---

## Section 1: Evidence Data Quality Assessment

### 1.1 Evidence types that actually exist in the runtime

From reading `scripts/evidence-capture.js` and `scripts/after-edit.js`, the evidence schema in `{sessionId}-evidence.jsonl` is as follows:

| type | Written by | Trigger | Key fields |
|---|---|---|---|
| `test-result` | evidence-capture.js | Bash command matching TEST_PATTERNS (npm test, vitest, jest, pytest, mocha, cargo test, go test, npx vitest/jest) | `evidence_id`, `ts`, `tool='Bash'`, `summary` (sliced command), `exit_code`, `passed` (= `!is_error`), `invocation_ts` |
| `git-operation` | evidence-capture.js | Bash command matching GIT_PATTERNS (commit/push/merge/tag) | same shape as above, `summary` prefixed with `git <op>:` |
| `file-change` | evidence-capture.js | Write or Edit tool call | `summary` = `<toolName>: <file_path>`, `passed`, `exit_code=null`, **no structured `file` field** |
| `edit-trace` | after-edit.js | Edit / Write / MultiEdit | `evidence_id`, `type='edit-trace'`, `ts`, `tool`, `file` (structured), `is_error` |

Important deltas from the ECC plan's strawman schema:
- The ECC plan text calls the git type `git-op`, but the hook writes `git-operation`. **The extractor must match the actual runtime string.**
- `file-change` does **not** have a structured `file` field — only the concatenated `summary`. Only `edit-trace` gives structured `file`.
- The prompt's example `{"type":"test-result","tool":"Bash","exitCode":0,...}` uses `exitCode`; the hook writes `exit_code` (snake_case). The extractor MUST use `exit_code` and `passed`.

### 1.2 Useful vs. noisy types for pattern extraction

| Rank | Type | Why | Caveats |
|---|---|---|---|
| 1 | `test-result` | Has `passed` boolean + `exit_code` — ground truth for "did CI pass locally" | Only captured on Bash test invocations. Doesn't capture vitest run via Task subagent. |
| 2 | `edit-trace` | Structured `file` field + `is_error`; enables per-file Read-before-Edit correlation | Fires on Edit/Write/MultiEdit; not on Bash file writes |
| 3 | `git-operation` | Success of commit/push is a strong session-success signal | `passed` reflects shell exit, not whether a pre-commit hook blocked |
| 4 | `file-change` | Redundant with `edit-trace` for Edit/Write; adds little because `file` is embedded in `summary` | The extractor can ignore this type to avoid double-counting |

**Recommendation:** extractor should treat `edit-trace` + `test-result` + `git-operation` as the primary signal surface, and cross-reference the replay log for `Read` events (which are NOT in evidence) via the session ID.

### 1.3 Field reliability matrix

| Field | Always present | Usually present | Sometimes missing | Notes |
|---|---|---|---|---|
| `evidence_id` | ✓ | | | Sequential `E-NNN` — can be used as stable ordinal but NOT monotonic timestamp |
| `ts` | ✓ | | | ISO 8601 |
| `type` | ✓ | | | Use exact runtime strings, not plan strings |
| `tool` | ✓ | | | |
| `summary` | ✓ | | | Free text, max 200 chars |
| `exit_code` | | ✓ for Bash | null on Edit/Write | `payload.tool_response?.metadata?.exit_code ?? null` — frequently null on child processes that don't surface exit_code |
| `passed` | | ✓ | | Derived from `!is_error`; proxies exit success |
| `invocation_ts` | ✓ on new entries | | Older logs may lack it | Added in recent ECC phases |
| `file` | | ✓ on edit-trace | missing on file-change | `file-change` only has summary |
| `is_error` | | ✓ on edit-trace | | |

### 1.4 Failure modes that could push precision below 70%

1. **Sparse ground truth.** `passed` is a weak signal. A test command can exit 0 while still having failing assertions hidden behind `|| true`. Patterns anchored on exit code alone will over-credit bad sessions.
2. **Edit-trace vs. file-change double counting.** If the extractor counts both, per-file edit density will double-count any Edit tool call and inflate pattern support.
3. **No Read in evidence.** The "Read before Edit" pattern requires cross-referencing `{sessionId}-replay.jsonl` because Read is captured there, not in evidence. If the extractor only looks at evidence JSONL, that high-confidence instinct cannot be computed.
4. **Session length skew.** 10 sessions of vastly unequal length (one 500-entry session + nine 5-entry sessions) will let one session dominate every pattern. Need per-session normalization.
5. **Evidence ID discontinuities.** If multiple hooks write concurrently, `evidence_id` can race (each hook counts lines independently). Don't treat `E-NNN` as globally ordered — sort by `ts`.
6. **Purpose drift within a session.** A single session may span three distinct intents; patterns are most meaningful scoped to a purpose. The manifest's `purpose` field is only the last value. Spike-scale mitigation: accept the noise and document it as a Phase 4.2 follow-up.
7. **Selection bias.** The 10 sessions chosen for the spike will likely come from the operator's own recent work — precision on this slice may not generalize. Document as a limitation.
8. **YAML vs. JSON friction.** If instincts.yaml parsing fails and defaults to an empty set, precision computed on an empty instinct set is nominally 100% but meaningless. Ensure minimum evidence count before computing precision.

---

## Section 2: `eval-harness.js` Design

### 2.1 Purpose

A single-session evaluator. Read one `{sessionId}-evidence.jsonl` (and optionally its sibling replay/tasks/manifest files under `~/.evokore/sessions/`) and produce a structured per-session report. This is the atomic unit the pattern extractor consumes.

### 2.2 Contract

**Input:**
- `--evidence <path>` — absolute path to a `{sessionId}-evidence.jsonl` file
- `--session-dir <path>` (optional) — overrides default `~/.evokore/sessions/` for locating the replay/tasks/manifest siblings. Defaults to `path.dirname(evidencePath)`.
- `--out <path>` (optional) — write JSON report to file. Defaults to stdout.
- `--quiet` — suppress summary print

**Output:** JSON report object (also returned when required as a module):

```json
{
  "sessionId": "sess-abc123",
  "evidencePath": "/home/.evokore/sessions/sess-abc123-evidence.jsonl",
  "counts": {
    "evidence": 42,
    "testResult": 6,
    "gitOperation": 2,
    "editTrace": 28,
    "fileChange": 6,
    "replay": 137,
    "tasksTotal": 4,
    "tasksDone": 3
  },
  "toolDistribution": { "Bash": 18, "Edit": 22, "Read": 41, "Write": 6, "Grep": 12 },
  "errorRate": 0.071,
  "testPassRate": 0.833,
  "workRatio": 0.205,
  "taskCompletionRate": 0.75,
  "commitCount": 2,
  "purposeSet": true,
  "subagentCount": 0,
  "timeline": {
    "firstTs": "2026-04-10T14:01:22.003Z",
    "lastTs": "2026-04-10T17:48:12.771Z",
    "durationMinutes": 227
  },
  "successSignals": {
    "sessionSuccessful": true,
    "reasons": ["taskCompletionRate>=0.5", "testPassRate>=0.8", "commitCount>0"]
  },
  "toolSequences": {
    "editsWithPriorRead": 19,
    "editsWithoutPriorRead": 3,
    "testsBeforeCommit": 2,
    "commitsWithoutPriorTest": 0
  },
  "warnings": ["replay log not found"]
}
```

### 2.3 Metrics to compute

| Metric | Source | Formula |
|---|---|---|
| `errorRate` | evidence | `count(is_error===true OR passed===false) / count(evidence)` |
| `testPassRate` | evidence type=test-result | `count(passed) / count(test-result)` (NaN → null) |
| `workRatio` | evidence vs replay | `count(evidence) / count(replay)` |
| `toolDistribution` | replay log | `Map<tool, count>` |
| `taskCompletionRate` | tasks JSON | `done / total` (0 if no tasks) |
| `commitCount` | evidence type=git-operation summary includes `commit` | integer |
| `editsWithPriorRead` | replay timeline | for every Edit/Write, look back N=20 replay entries for same `file_path`; if a Read is found, count as pre-read |
| `testsBeforeCommit` | evidence timeline | for every git-operation commit, was there a test-result in the previous 15 minutes? |
| `durationMinutes` | first/last evidence ts | ms diff / 60000 |
| `purposeSet` | manifest | `manifest.purpose != null && manifest.purpose != ''` |
| `subagentCount` | manifest.subagents.length | integer |

### 2.4 Session success definition

A session is `sessionSuccessful === true` if **at least 2 of 3** hold:

1. `taskCompletionRate >= 0.5` (if `tasksTotal === 0`, this clause contributes null, not false)
2. `testPassRate >= 0.8` or `testResult count === 0` AND `errorRate <= 0.15`
3. `commitCount >= 1` AND no `git-operation` with `passed === false`

`reasons` array records which clauses fired. This 2-of-3 vote is deliberately lenient during the spike.

### 2.5 I/O and implementation constraints

- Standard library only: `fs`, `path`, `os`, `readline`
- Use `readline` + `fs.createReadStream` to iterate JSONL (matches existing EVOKORE pattern)
- All JSON.parse calls wrapped in try/catch — malformed lines become `warnings`, not crashes
- Sibling file resolution: given `sess-abc-evidence.jsonl`, derive `sess-abc.json`, `sess-abc-replay.jsonl`, `sess-abc-tasks.json` in the same directory
- Target **< 150 lines**
- Exportable shape: `module.exports = { evaluateSession, main }` so `pattern-extractor.js` and tests can call `evaluateSession(evidencePath, opts)` directly

---

## Section 3: `pattern-extractor.js` Design

### 3.1 Contract

**Input:**
- `--sessions <dir>` — `~/.evokore/sessions/` directory; enumerates `*-evidence.jsonl` and calls `evaluateSession` internally
- `--min-evidence <n>` — default 5; reports with fewer than `n` evidence entries are skipped
- `--out <path>` — JSON file, default stdout

**Output:**

```json
{
  "generatedAt": "2026-04-11T15:30:00Z",
  "sessionsAnalyzed": 10,
  "sessionsSkipped": 2,
  "patterns": [
    {
      "id": "PAT-001",
      "rule": "Edits succeed more often when preceded by a Read of the same file",
      "confidence": 0.93,
      "evidence_count": 187,
      "support_sessions": 9,
      "relevant_sessions": 10,
      "source": "pattern-extractor",
      "category": "edit-hygiene",
      "actionable": true
    }
  ],
  "precision": 0.8,
  "precisionPassed": true,
  "decisionGate": "PROCEED"
}
```

### 3.2 Pattern taxonomy (5 concrete types)

| ID | Pattern | Signal | Category |
|---|---|---|---|
| **PAT-001** | **Read before Edit** | `editsWithPriorRead / (editsWithPriorRead + editsWithoutPriorRead)` | edit-hygiene |
| **PAT-002** | **Test before Commit** | `testsBeforeCommit / commitCount >= 0.5` | test-discipline |
| **PAT-003** | **High error rate correlates with stall** | P(failed session \| errorRate > 0.25) | planning |
| **PAT-004** | **Subagent usage correlates with task completion** | mean taskCompletion(hasSubagent) vs mean taskCompletion(noSubagent) | planning |
| **PAT-005** | **Pre-compact snapshot correlates with recovery** | P(post-compact activity \| snapshot present) | recovery |
| **PAT-006** | **Purpose set improves task completion** (stretch) | delta taskCompletionRate(purposeSet vs not) >= 0.2 | planning |

### 3.3 Confidence formula

```
relevant_sessions   = count(sessions where P is computable)
supporting_sessions = count(relevant sessions where P holds AND session is successful)
contradicting_sessions = count(relevant sessions where P does NOT hold AND session is successful)

# Laplace smoothing:
confidence = (supporting + 1) / (supporting + contradicting + 2)
evidence_count = sum of raw event count across relevant sessions
```

### 3.4 "Actionable" vs. "noise" definition

A pattern is **actionable** when ALL of:

1. `relevant_sessions >= 3` (not a fluke of one session)
2. `confidence >= 0.7` (Laplace-smoothed)
3. `evidence_count >= 10` (enough raw observations)
4. The rule can be mechanically injected into a future session context (declarative imperative, not descriptive correlation)
5. Has at least some `contradicting_sessions` (not trivially true due to survivorship bias)

### 3.5 Precision definition

```
precision = count(actionable patterns) / count(all emitted patterns)
```

Decision gate: `precision >= 0.70` → PROCEED. Else → ABANDON Phase 4.

With 5 implemented patterns, precision takes values in `{0.0, 0.2, 0.4, 0.6, 0.8, 1.0}`. Document this coarse granularity in the spike verdict.

---

## Section 4: `instincts.yaml` Format

### 4.1 Location

Path: `~/.evokore/instincts.yaml` — user-global, not per-project.

### 4.2 Schema

```yaml
version: 1
generatedAt: 2026-04-11T15:30:00Z
precisionAtLastEval: 0.8
instincts:
  - id: INS-001
    rule: "Read a file before editing it"
    confidence: 0.93
    evidence_count: 187
    support_sessions: 9
    relevant_sessions: 10
    contradicting_sessions: 1
    category: edit-hygiene
    source: pattern-extractor
    source_pattern_id: PAT-001
    first_observed: 2026-04-03T00:00:00Z
    last_updated: 2026-04-11T15:30:00Z
    version: 3
    active: true
```

### 4.3 `instinct-evolver.js` incremental update algorithm

```
loadInstinctsYaml() -> { version, instincts[] } (empty if missing)
runPatternExtractor() -> { patterns[], precision }

for each pattern in extractor output:
  match = instincts.find(i => i.source_pattern_id === pattern.id)
  if match:
    match.confidence = ewma(match.confidence, pattern.confidence, alpha=0.3)
    match.evidence_count += pattern.evidence_count
    match.last_updated = now
    match.version += 1
  else:
    assign new INS-NNN, append with pattern data

for each instinct without a corresponding pattern this run:
  confidence *= 0.95 (decay)
  if confidence < 0.4 for 3 consecutive runs -> active = false

write atomically (temp + rename)
```

### 4.4 purpose-gate integration (post-spike only)

On session start, `purpose-gate.js` reads `instincts.yaml`, filters `active === true && confidence >= 0.7`, sorts by confidence desc, takes top 5, injects as `additionalContext`. This integration is OUT OF SCOPE for the spike.

---

## Section 5: Test Plan

### 5.1 File location

`tests/integration/ecc-phase4-spike.test.ts`

### 5.2 Test cases (target 20)

**`eval-harness` tests (9):**

1. `evaluateSession()` returns zero counts for an empty evidence file
2. `evaluateSession()` counts each evidence type correctly for a seeded 10-entry file
3. `evaluateSession()` computes `errorRate` from `is_error` and `passed===false` mixed
4. `evaluateSession()` computes `testPassRate` only across `test-result` entries
5. `evaluateSession()` reads sibling replay log and produces `toolDistribution`
6. `evaluateSession()` reads sibling tasks file and computes `taskCompletionRate`
7. `evaluateSession()` marks `sessionSuccessful=true` when 2 of 3 clauses fire
8. `evaluateSession()` emits `warnings` (not throws) when replay log is missing
9. `evaluateSession()` handles a malformed JSONL line gracefully (warning + continue)

**`pattern-extractor` tests (8):**

10. `extractPatterns()` returns `decisionGate=PROCEED` when 4 of 5 patterns are actionable (precision 0.8)
11. `extractPatterns()` returns `decisionGate=ABANDON` when only 2 of 5 patterns are actionable (precision 0.4)
12. PAT-001 (Read before Edit) fires support+1 for a session with 10 reads preceding 10 edits
13. PAT-002 (Test before Commit) fires support+1 when commit ts > test-result ts by < 15 min
14. PAT-003 (High error rate → stall) fires contradicting+1 when errorRate > 0.25 AND task completion > 0.5
15. Laplace smoothing: pattern with 1 relevant session never reports confidence > 0.75
16. Extractor skips sessions with `evidence count < min-evidence`
17. Extractor is deterministic: same inputs → identical `patterns` array ordering

**Integration tests (3):**

18. Full pipeline: seed 3 fixture sessions → run `extractPatterns` over `evaluateSession` outputs → assert precision value
19. Fixture corpus mimicking 10 "successful" sessions meets precision ≥ 0.7 (`decisionGate=PROCEED`)
20. Fixture corpus mimicking 10 "noisy" sessions fails precision < 0.7 (`decisionGate=ABANDON`)

### 5.3 Test helpers

`tests/helpers/synth-evidence.ts`:
- `buildEvidenceJsonl(dir, sessionId, entries[])` — writes evidence JSONL
- `buildReplayJsonl(dir, sessionId, entries[])` — writes replay JSONL
- `buildTasksJson(dir, sessionId, tasks[])` — writes tasks JSON
- `buildManifest(dir, sessionId, patch)` — writes session manifest
- `buildSuccessfulSession(dir, sessionId, opts)` — convenience builder
- `buildNoisySession(dir, sessionId, opts)` — convenience builder

---

## Section 6: Implementation Order

### 6.1 File dependency graph

```
scripts/eval-harness.js          (no external deps)
    └── exports evaluateSession(evidencePath, opts)

scripts/pattern-extractor.js
    └── depends on: scripts/eval-harness.js

tests/helpers/synth-evidence.ts  (no external deps)

tests/integration/ecc-phase4-spike.test.ts
    ├── scripts/eval-harness.js
    ├── scripts/pattern-extractor.js
    └── tests/helpers/synth-evidence.ts

scripts/instinct-evolver.js      (POST-SPIKE only)
```

### 6.2 Build order

1. `tests/helpers/synth-evidence.ts` — fixture builders
2. `scripts/eval-harness.js` — single-session evaluator
3. Tests 1–9 green
4. `scripts/pattern-extractor.js` — multi-session pattern engine
5. Tests 10–17 green
6. Integration tests 18–20 green
7. **Operator runs spike against real sessions** — writes verdict document
8. ONLY IF spike passes: `scripts/instinct-evolver.js`, purpose-gate integration

---

## Appendix A: Key runtime facts (non-negotiable)

1. Actual evidence types: `test-result`, `git-operation` (NOT `git-op`), `file-change`, `edit-trace`
2. Evidence uses snake_case `exit_code`, not `exitCode`
3. `file-change` has no structured `file` field — only `summary`; use `edit-trace` for file-accurate analysis
4. Read events live in `*-replay.jsonl`, not `*-evidence.jsonl`
5. `SESSIONS_DIR = path.join(os.homedir(), '.evokore', 'sessions')` — import from `scripts/session-continuity.js`
6. The manifest `preCompactSnapshot` shape: `{ ts, purpose, trigger, incompleteTasks, recentFiles, recentEvidenceIds, lastToolName, subagentCount, lastActivityAt }`
7. `subagents` in the manifest: `{ id, ts, type, description, prompt, outcome, worktree }`
8. Evidence IDs (`E-NNN`) are per-session sequential but NOT globally ordered — sort by `ts`

## Appendix B: Relevant file paths

- `scripts/evidence-capture.js` — how `test-result`, `git-operation`, `file-change` evidence is shaped
- `scripts/after-edit.js` — how `edit-trace` evidence is shaped (structured `file` field)
- `scripts/session-replay.js` — replay JSONL shape: `{ ts, tool, summary, outcome, output, invocation_ts }`
- `scripts/session-continuity.js` — `getSessionPaths()`, `readSessionState()`, `SESSIONS_DIR`, `sanitizeId`
- `scripts/pre-compact.js` — `preCompactSnapshot` shape and `tailLines` streaming idiom
- `scripts/subagent-tracker.js` — subagents array shape
- `tests/integration/ecc-phase2-hooks.test.ts` — template for tests using isolated HOME dir
