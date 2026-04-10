---
name: session-retrospective-miner
description: Automatically mines Claude session JSONL and EVOKORE session data to compute efficiency metrics and produce a structured retrospective report with specific narrative improvement recommendations
aliases: [retrospective-miner, session-miner, retro-miner, session-retrospective]
category: Orchestration Framework
tags: [retrospective, session-analysis, metrics, narrative-quality, efficiency, continuous-improvement]
version: 1.0.0
requires: [session_analyze_replay, session_work_ratio]
resolutionHints:
  - analyze session data or efficiency metrics
  - run a retrospective on recent sessions
  - find patterns in session tool usage
  - improve narrative quality based on session data
  - why are sessions taking so many turns
  - identify clarification loops in session history
---

# Session Retrospective Miner

## Purpose

A data-driven retrospective skill that automatically mines session data across all repos and produces actionable narrative improvement recommendations. The backward-looking complement to ARCH-AEP: AEP plans and executes forward; this skill looks back and improves the inputs for the next cycle.

This skill automates **Phase 1 (Metrics Collection)** of the `improvement-cycles` skill — no manual data gathering required.

```
Session Data ──► Retrospective Miner ──► Narrative Quality Score
                                               │
                                               ▼
                               Specific improvement recommendations
                                               │
                                               ▼
                       Updated phase specs, CLAUDE.md, prompt templates
                                               │
                                               ▼
                               Next cycle's AEP Align phase (better inputs)
```

---

## Prerequisites

This skill uses two MCP tools from EVOKORE-MCP that must be available:
- `session_analyze_replay` — aggregates tool frequency, retry rates, and hook events across session replay logs
- `session_work_ratio` — computes useful-work density (evidence entries / replay entries) per session

Both tools were added in EVOKORE-MCP v3.1 (`feat/token-efficiency-tools`). Verify with `discover_tools` before running.

---

## Input Parameters

```yaml
time_window: "last-7-days" | "last-30-days" | "this-week" | "all-time"
project_filter: "all" | "Claudius-Maximus" | "OCR_LOCAL" | "EDCTool" | "<any slug>"
focus: "narrative-quality" | "tool-efficiency" | "phase-implementation" | "all"
min_session_turns: 10   # exclude trivial/exploratory sessions (default: 10)
```

---

## Execution Steps

### Step 1: Locate session files

Scan `~/.claude/projects/` for project slugs matching `project_filter`. For each matching slug:
- List all `.jsonl` files in `~/.claude/projects/<slug>/`
- Filter by modification time to match `time_window`
- Skip files with fewer than `min_session_turns` entries (count lines / ~4 entries per turn)

For EVOKORE-tracked sessions, also locate:
- `~/.evokore/sessions/*-replay.jsonl` — tool call sequence
- `~/.evokore/sessions/*-evidence.jsonl` — verified outputs

### Step 2: Call MCP tools for aggregate metrics

```
session_analyze_replay({
  time_window: <time_window>,
  project_filter: <project_filter>
})
```

This returns: tool frequency table, retry rate per tool, damage-control trigger counts, hook event distribution.

```
session_work_ratio({
  time_window: <time_window>,
  project_filter: <project_filter>
})
```

This returns: per-session work density (evidence / replay ratio), sessions above/below thresholds.

### Step 3: Parse JSONL for per-session metrics

For each session JSONL file, extract:

**First-productive-turn:**
```javascript
const entries = jsonl.lines.map(JSON.parse);
const firstProductiveTurn = entries.findIndex(e =>
  e.message?.content?.some(c =>
    c.type === 'tool_use' && ['Edit', 'Write', 'Bash'].includes(c.name)
  )
);
```

**Clarification loop score (assistant ? turns before first Edit/Write):**
```javascript
const clarificationTurns = entries
  .slice(0, firstProductiveTurn)
  .filter(e =>
    e.type === 'assistant' &&
    e.message?.content?.some(c => c.type === 'text' && c.text?.includes('?'))
  ).length;
```

**Context growth rate (token trajectory):**
```javascript
const usageByTurn = entries
  .filter(e => e.message?.usage)
  .map(e => (e.message.usage.cache_read_input_tokens || 0) +
             (e.message.usage.input_tokens || 0));
const growthRate = usageByTurn.length > 1
  ? usageByTurn[usageByTurn.length - 1] / usageByTurn[0]
  : 1;
```

**Phase completion signal:**
```javascript
const hasCommit = entries.some(e =>
  e.message?.content?.some(c =>
    c.type === 'tool_result' &&
    typeof c.content === 'string' &&
    c.content.includes('main')
  )
);
```

### Step 4: Aggregate and pattern-detect

Compute per-project aggregates:
- Median `firstProductiveTurn` across sessions
- Mean `clarificationTurns` per session
- Fraction of sessions with 0 git commits
- Sessions with work ratio > 20% (high efficiency)
- Sessions with work ratio < 10% (overhead-heavy)
- Most retried tools (from `session_analyze_replay` output)

Pattern thresholds (findings trigger when exceeded):
| Threshold | Finding |
|-----------|---------|
| Median first-productive-turn > 6 | Context not established upfront |
| Mean clarification loops > 1.5 | Unclear narrative — missing decisions |
| Sessions without commits > 15% | Possible scope/context abandonment |
| Top-retried tool appears 3+ consecutive times | Command fragility |
| Context growth rate > 5x | Large file reads early in session |
| Work ratio < 10% in > 30% of sessions | Overhead-heavy workflow |

### Step 5: Produce retrospective report

Format the output using the template below. Every finding must:
1. State the quantitative basis (not just "sessions were slow")
2. Identify which sessions/projects are affected
3. Provide a specific, copy-pasteable recommendation

---

## Output Template

```markdown
## Session Retrospective: [date range] — [project filter]

Generated: [ISO timestamp]
Tool: session-retrospective-miner v1.0
Data: session_analyze_replay + session_work_ratio + direct JSONL parsing

### Summary

- Sessions analyzed: N (after min_session_turns filter)
- Median turns to first output: X.X
- Mean clarification loops per session: X.X
- Sessions with 0 commits: N (X%)
- High-efficiency sessions (work ratio >20%): N (X%)
- Overhead-heavy sessions (work ratio <10%): N (X%)
- Most retried tools: [tool_A (N retries), tool_B (N retries)]

---

### Pattern Findings

**Finding 1: [Title]**
[Quantitative basis: which sessions, what metric, what value vs baseline]
Affects: [X% of sessions] / [N sessions] in [project(s)]
→ Recommendation: [Specific, copy-pasteable text to add to CLAUDE.md or phase spec]

[... additional findings ...]

---

### Narrative Quality Scores by Project

| Project | Avg Turns/Session | First-Output Turn | Clarity Score | Trend |
|---------|------------------|-------------------|---------------|-------|
| [name]  | X.X              | X.X               | XX/100        | [↑↓→] |

Clarity score = 100 - (clarificationLoops * 12) - (firstProductiveTurn > 6 ? 15 : 0) - (commitsZero% * 0.5)

---

### Action Items

| Priority | Action | Target | Success Criterion |
|----------|--------|--------|------------------|
| HIGH     | [action] | [file or workflow] | [measurable outcome] |
| MED      | [action] | [file or workflow] | [measurable outcome] |
| LOW      | [action] | [file or workflow] | [measurable outcome] |
```

---

## Integration with Other Skills

### improvement-cycles (Phase 1 replacement)

This skill replaces manual Phase 1 data gathering in `improvement-cycles`:

```
OLD Phase 1: "Gather quantitative data from recent sessions" (manual)
NEW Phase 1: Run session-retrospective-miner → structured metrics report → proceed to Phase 2
```

To invoke as Phase 1 of an improvement cycle:
1. Run this skill with desired `time_window` and `project_filter`
2. Save the output report to `docs/session-logs/retro-[date].md`
3. Proceed to improvement-cycles Phase 2 (Retrospective Review) using the report as input

### narrative-quality-scorer

Feed specific phase specs or prompt narratives into `narrative-quality-scorer` to get per-prompt scores. The retrospective report's **Action Items** section identifies which files to score first.

### AEP Align phase

The retrospective report's findings feed directly into step 2 (Discovery + normalization) of the AEP Align workflow. Efficiency trend data informs effort estimates in `phase-planning.md`. Cross-project findings drive global CLAUDE.md updates.

---

## Example Invocation

```
Run a session retrospective for the last 30 days on Claudius Maximus sessions.
Focus on narrative quality.
Use the session-retrospective-miner skill.
Save the output to docs/session-logs/retro-2026-04-10.md.
```

---

## Interpretation Guide

| Metric | Green | Yellow | Red |
|--------|-------|--------|-----|
| First-productive-turn | ≤ 4 | 5–8 | > 8 |
| Clarification loops | 0–1 | 1–2 | > 2 |
| Sessions without commits | < 10% | 10–20% | > 20% |
| Work ratio (median) | > 20% | 10–20% | < 10% |
| Context growth rate | < 3x | 3–6x | > 6x |

Sessions in the Red zone on 2+ metrics are candidates for narrative quality scoring via `narrative-quality-scorer`.
