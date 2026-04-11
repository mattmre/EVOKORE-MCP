---
name: phase-spec-optimizer
description: Analyzes a batch of completed phase specs against their actual session outcomes and produces an updated phase spec template with structural improvements, optionally applying the improved template to remaining unstarted phase specs
aliases: [phase-template-optimizer, spec-optimizer, phase-template-diff]
category: General Coding Workflows
tags: [phase-spec, template-optimization, session-analysis, efficiency, multi-phase, continuous-improvement]
version: 1.0.0
requiresTools: [session_analyze_replay, session_work_ratio]
resolutionHints:
  - improve phase spec template based on session outcomes
  - optimize remaining phase specs before implementation
  - which phase spec elements correlate with session efficiency
  - generate a better phase spec template from past phases
  - apply template improvements to unstarted phases in bulk
  - phase spec template diff from historical data
---

# Phase Spec Optimizer

## Purpose

Analyzes a batch of completed phase specs against their actual session outcomes and produces an updated spec template with structural improvements baked in. Optionally applies the improved template to remaining unstarted phase specs.

This is the **multi-phase product-development companion** to `narrative-quality-scorer`. Where the scorer evaluates a single prompt, this skill compares an entire batch of phase specs against their real session data and produces a template diff you can apply forward.

```
Completed Phase Specs ──► Phase Spec Optimizer ──► Template Diff
    +                                                    │
Session JSONL                                             ▼
    +                                     Improved template + evidence
Retrospective Output                                      │
    +                                                    ▼
Narrative Scores                              (Optional) Bulk-apply to
                                                remaining unstarted specs
```

---

## When To Use This Skill

Trigger it when:
- Starting a new block of phases (e.g., "next 20 phases of Claudius Maximus")
- Session efficiency has been declining across recent phases
- `narrative-quality-scorer` flags the same missing elements repeatedly
- Post-milestone — before planning the next milestone's phase specs
- After running `session-retrospective-miner` and seeing a HIGH action item about phase spec structure

---

## Prerequisites

This skill composes output from the Phase B retrospective skills plus two MCP tools:

- `session_analyze_replay` — tool usage + retry signals per session
- `session_work_ratio` — evidence/replay density per session
- `session-retrospective-miner` skill — aggregate efficiency findings
- `narrative-quality-scorer` skill — per-spec quality scoring

Verify the tools are available with `discover_tools` before running.

---

## Input Parameters

```yaml
phase_range: "300-310"            # completed phases to analyze (inclusive)
remaining_phases: "311-317"       # unstarted phases to optionally update
project_path: "D:/GITHUB/Claudius-Maximus"
session_filter: "Claudius-Maximus"  # project slug used in ~/.claude/projects/
apply_template: false             # if true, apply improved template to remaining phase specs
template_path: "04-planning/phase-spec-template.md"  # optional; auto-detected if omitted
phase_file_glob: "04-planning/phases/phase-*.md"     # where phase spec files live
```

---

## Data Sources

| Source | Location | Used For |
|--------|----------|----------|
| Completed phase specs | `<project_path>/04-planning/phases/phase-NNN-*.md` | Parse structural elements |
| Phase spec template | `<project_path>/04-planning/phase-spec-template.md` | Current template baseline |
| Claude session JSONL | `~/.claude/projects/<session_filter>/*.jsonl` | Per-phase session efficiency |
| EVOKORE replay logs | `~/.evokore/sessions/*-replay.jsonl` | Tool call sequences |
| EVOKORE evidence logs | `~/.evokore/sessions/*-evidence.jsonl` | Verified outputs / commits |
| Retrospective output | from `session-retrospective-miner` | Aggregate findings |
| Narrative scores | from `narrative-quality-scorer` | Per-spec element scores |

---

## Execution Steps

### Step 1: Resolve phase range and locate files

Parse `phase_range` (e.g. `"300-310"`) into an inclusive integer list. For each phase number N:

1. Glob `<project_path>/<phase_file_glob>` for a file matching `phase-NNN-*.md`.
2. Record the spec path and phase title.
3. Locate the session JSONL(s) in `~/.claude/projects/<session_filter>/` whose contents reference the phase number or spec filename (match by branch name, commit message, or text mention in the first user turn).

Skip phases with no matching session — they are not yet implemented or can't be attributed.

### Step 2: Parse each phase spec's structural elements

For each completed phase spec file, detect presence/absence of:

| Element | Detection Heuristic |
|---------|--------------------|
| Explicit insertion points | mentions of `app.module.ts`, `@AI:NAV[INS:`, or `nav_read_anchor` |
| Acceptance criteria | `Done when`, `Acceptance:`, or `Definition of done` section |
| DB/convention reminders | `BIGSERIAL`, `VARCHAR(45)`, `@CreateDateColumn`, or a `Conventions:` block |
| Explicit file paths to create | fenced path list or `Create:` section with full paths |
| Shared type references | `shared/src/index.ts`, `shared types`, or `export interface` hints |
| Test commands | `npm run build`, `npm run test`, or `typecheck` mentioned |
| Branch naming | `Branch:` directive or branch convention line |
| Stop conditions for Agent spawns | `stop after`, `do not`, or `scope:` blocks |

Record a per-phase element presence vector.

### Step 3: Compute efficiency metrics per phase session

Reuse the extraction approach from `session-retrospective-miner`:

```javascript
const entries = jsonl.lines.map(JSON.parse);

const firstProductiveTurn = entries.findIndex(e =>
  e.message?.content?.some(c =>
    c.type === 'tool_use' && ['Edit', 'Write', 'Bash'].includes(c.name)
  )
);

const clarificationTurns = entries
  .slice(0, firstProductiveTurn)
  .filter(e =>
    e.type === 'assistant' &&
    e.message?.content?.some(c => c.type === 'text' && c.text?.includes('?'))
  ).length;

const totalTurns = entries.filter(e => e.type === 'assistant').length;

const hasCommit = entries.some(e =>
  e.message?.content?.some(c =>
    (c.type === 'tool_use' && c.name === 'Bash' &&
      /git\s+commit\b/.test(c.input?.command || '')) ||
    (c.type === 'tool_result' && typeof c.content === 'string' &&
      /\[[\w\-/]+\s+[0-9a-f]{7,}\]/.test(c.content))
  )
);
```

Also call `session_work_ratio` with the matching project filter to pull per-session work density, and `session_analyze_replay` for retry signals.

### Step 4: Correlate elements with efficiency

For each structural element, compute:

- `presentAvgTurns` = mean `totalTurns` across phases whose spec contains the element
- `absentAvgTurns` = mean `totalTurns` across phases whose spec lacks the element
- `delta` = `absentAvgTurns - presentAvgTurns`
- `affectedPhases` = list of phase numbers where the element was missing and the session ran hot (above median `totalTurns`)

Rank elements by `delta` descending. Any element with `delta >= 4` turns and at least 3 absent samples becomes a **candidate template improvement**.

### Step 5: Score current and projected templates

Use `narrative-quality-scorer` on the current template file (if it exists) and on a synthesized "improved" version that adds every candidate element. Record:

- `current_template_score`
- `projected_template_score`

If the current template file can't be located, derive a baseline score from the mean element-presence rate across completed phase specs.

### Step 6: Produce template diff

Format the output using the template below. Each proposed change must cite the phase numbers that triggered it and the measured turn delta.

### Step 7 (optional): Apply to remaining phase specs

If `apply_template: true`:

1. Parse `remaining_phases` (e.g. `"311-317"`) into an integer list.
2. For each phase N in that list, locate `phase-NNN-*.md`.
3. If the file exists and does not already contain the candidate element, append the improvement block (or insert at the conventional position) with a clearly-marked origin comment, for example:

    ```markdown
    <!-- phase-spec-optimizer: added Register-in-app.module.ts block (from phases 302, 305, 308) -->
    ```

4. Write a summary of modified files to the output report.
5. Do **not** modify the template file itself automatically — the operator must confirm the diff before committing. Only the unstarted phase specs are touched.

---

## Output Template

```markdown
## Phase Spec Template Improvements

Project: [project_path]
Generated: [ISO timestamp]
Tool: phase-spec-optimizer v1.0
Phase range analyzed: [phase_range] ([N] phases)
Remaining phases: [remaining_phases] ([M] phases)
apply_template: [true|false]

### Current template score: XX/100
### Projected improved template score: XX/100

---

### Phase Efficiency Baseline

| Phase | Turns | First Output | Clarifications | Work Ratio | Commit? |
|-------|-------|--------------|----------------|------------|---------|
| 300   | 28    | 6            | 1              | 18%        | yes     |
| 301   | 41    | 11           | 3              | 9%         | yes     |
| ...   | ...   | ...          | ...            | ...        | ...     |

Median turns: X.X    Median first-output: X.X    Median work ratio: XX%

---

### Proposed Template Changes

1. **ADD after "Implement:" block:**
   ```
   Register in app.module.ts:
   - Entity imports: nav_read_anchor(app.module.ts, new-entity-import)
   - TypeORM entities: nav_read_anchor(app.module.ts, new-typeorm-entity)
   - Module imports: nav_read_anchor(app.module.ts, new-module)
   ```
   **Basis:** phases 302, 305, 308 averaged +9 turns vs phases with insertion points specified.

2. **ADD "Shared types:" section with explicit type names to create**
   **Basis:** phases 303, 307 had 3+ clarification turns about which interfaces to add.

3. **ADD "Done when:" block:**
   ```
   Done when: npm run build && npm run typecheck && npm run test pass with no regressions.
   ```
   **Basis:** 6/10 phases had a "should I run tests?" clarification turn.

4. **REPLACE boilerplate "Read phase spec from..." with explicit extraction prompt:**
   ```
   From 04-planning/phases/phase-NNN-*.md, extract and confirm before implementing:
   - [ ] SQL migration (full CREATE TABLE)
   - [ ] Entity names and fields
   - [ ] API routes (method + path)
   - [ ] Shared type names to add to shared/src/index.ts
   ```
   **Basis:** phases without explicit extraction averaged +5 first-output turn.

---

### Structural Element Correlation

| Element                      | Present Avg Turns | Absent Avg Turns | Delta | Adopt? |
|------------------------------|-------------------|------------------|-------|--------|
| Explicit insertion points    | 17                | 26               | +9    | YES    |
| Acceptance criteria          | 18                | 24               | +6    | YES    |
| DB conventions reminder      | 19                | 23               | +4    | YES    |
| Explicit file paths          | 18                | 22               | +4    | YES    |
| Test commands specified      | 19                | 22               | +3    | no     |

(Adopt threshold: delta >= 4 turns with at least 3 absent samples.)

---

### Bulk Apply Report
(only populated when apply_template: true)

Remaining phases updated: [M]
Files modified:
- 04-planning/phases/phase-311-xxx.md (added: insertion block, done-when block)
- 04-planning/phases/phase-312-xxx.md (added: insertion block)
- ...

No changes made to the template file itself — confirm the diff above and update the template manually.
```

---

## Integration With Other Skills

### session-retrospective-miner
Use the retrospective miner first to confirm there is a phase-spec-related finding. The miner output's Action Items section should contain a HIGH-priority entry pointing at the phase spec template before you invoke this optimizer.

### narrative-quality-scorer
The optimizer calls the scorer twice: once on the current template, once on the projected improved template. The scorer's rubric is the source of truth for element point values.

### AEP Align phase
Template improvements surfaced here feed into the AEP Align phase of the next milestone — specifically the step where phase specs are authored from the milestone plan.

### improvement-cycles
A successful optimizer run fulfills Phase 3 (Intervention Design) of the `improvement-cycles` skill when the intervention target is "phase spec template."

---

## Example Invocation

```
Run phase-spec-optimizer on Claudius Maximus phases 300–310.
Remaining phases: 311–317.
project_path: D:/GITHUB/Claudius-Maximus
session_filter: Claudius-Maximus
apply_template: false

Save the output to docs/session-logs/phase-spec-optimizer-2026-04-10.md.
After I review the diff, rerun with apply_template: true to update the unstarted specs.
```

---

## Interpretation Guide

| Signal | Meaning | Action |
|--------|---------|--------|
| projected_score - current_score >= 20 | Template is clearly under-specified | Adopt most candidates and rerun with apply_template: true |
| projected_score - current_score 10-20 | Template has targeted gaps | Adopt only candidates with delta >= 6 turns |
| projected_score - current_score < 10 | Template is roughly healthy | Do not bulk-apply; consider narrative-quality-scorer per spec instead |
| All phases have same missing element | Systemic template gap | High-confidence template change |
| One phase is an outlier | Session-specific issue | Investigate that session with `session_analyze_replay` before changing template |

---

## Safety Rules

1. **Never modify the template file automatically.** The operator must confirm the diff before updating the template itself.
2. **Only modify unstarted phase specs** (those in `remaining_phases`). Never touch a phase spec whose session is already complete.
3. **Always annotate automated edits** with an HTML comment naming the skill and the phases that motivated the change, so future operators can trace provenance.
4. **Require `apply_template: true`** to be explicitly set — the default is a dry-run diff only.
