---
name: cross-project-process-miner
description: Aggregates session data from every project slug in ~/.claude/projects/ and surfaces systemic process patterns that appear in 3+ different projects, producing a prioritized finding list with project count, example evidence, and recommended fixes
aliases: [cross-project-miner, process-miner, systemic-pattern-miner, multi-repo-retro]
category: Orchestration Framework
tags: [cross-project, process-analysis, systemic-patterns, session-analysis, continuous-improvement, multi-repo]
version: 1.0.0
requiresTools: [session_analyze_replay, session_work_ratio]
resolutionHints:
  - find process patterns across all my repos
  - which issues are systemic vs project-specific
  - cross-repo session analysis
  - global CLAUDE.md improvement candidates
  - universal process signals from session history
  - patterns that appear in multiple projects
---

# Cross-Project Process Miner

## Purpose

The broadest view in the retrospective system: aggregates session data from every project slug in `~/.claude/projects/` and surfaces findings that appear in **3+ different projects**. These are systemic process issues, not project-specific quirks, and they feed directly into global CLAUDE.md updates rather than per-repo fixes.

Where `session-retrospective-miner` answers "what happened in this project's recent sessions," this skill answers "which process problems show up everywhere, regardless of project type."

```
All Project Slugs ──► Cross-Project Process Miner ──► Systemic Findings
    (~/.claude/                                              │
     projects/)                                              ▼
                                           Patterns appearing in 3+ projects
                                                             │
                                                             ▼
                                          Global CLAUDE.md + skill updates
```

---

## When To Use This Skill

Trigger it when:
- You suspect an efficiency problem is systemic rather than project-specific
- Planning a global CLAUDE.md refresh
- Before authoring a new top-level skill or guardrail
- After multiple per-project retrospectives surface the same kind of finding
- Quarterly process review across your full workspace

---

## Prerequisites

This skill uses two MCP tools from EVOKORE-MCP plus direct JSONL parsing:

- `session_analyze_replay` — tool usage + retry signals across session replay logs
- `session_work_ratio` — per-session work density

Both tools are available in EVOKORE v3.1+. Verify with `discover_tools` before running.

---

## Input Parameters

```yaml
min_projects_for_pattern: 3        # minimum distinct projects a pattern must appear in
time_window: "last-30-days"        # or "last-7-days" | "this-week" | "all-time"
focus: "all"                       # or "tool-efficiency" | "narrative-quality" | "agent-spawns"
output_format: "report"            # or "claude-md-patch"
min_session_turns: 10              # skip trivial/exploratory sessions
project_exclude: []                # optional list of project slugs to exclude
```

---

## Data Sources

| Source | Location | Used For |
|--------|----------|----------|
| Claude session JSONL | `~/.claude/projects/<slug>/*.jsonl` | Per-project tool sequences, turn counts, commits |
| EVOKORE replay logs | `~/.evokore/sessions/*-replay.jsonl` | Tool-call sequences for EVOKORE-tracked sessions |
| EVOKORE evidence logs | `~/.evokore/sessions/*-evidence.jsonl` | Verified outputs and commit presence |
| EVOKORE hook log | `~/.evokore/logs/hooks.jsonl` | Damage-control + purpose-gate fires |

---

## Patterns Detected

### 1. Opening Read Pattern
**Signal:** sessions whose first 3 tool calls are all `Read` (no `Bash`, `Edit`, `Write`, `Grep`, or `Glob`).
**Hypothesis:** context was not established upfront; the session is exploring instead of executing.
**Severity:** HIGH if affected sessions average 2x+ turns vs the project's median.
**Fix template:** "Open sessions with a targeted `grep` or `nav_get_map` call, not a series of exploratory reads."

### 2. Abandoned Session Pattern
**Signal:** sessions ending with 0 git commits and no `@CreateDateColumn` / migration / test output in evidence.
**Hypothesis:** exploration sessions that ran out of context or scope.
**Severity:** MEDIUM; HIGH if >15% of a project's sessions.
**Fix template:** "Set explicit session scope in the opening prompt, or use `/compact` + `/clear` to start a fresh focused session when exploring."

### 3. Agent Spawn Divergence Pattern
**Signal:** `Agent` / `Task` tool calls whose parent session has zero evidence entries attributable to that agent run.
**Hypothesis:** agents ran but produced nothing verifiable.
**Severity:** HIGH (agents are expensive).
**Fix template:** "All Agent spawn prompts should end with `Output your result to [specific file or format]. Done when you have produced that output.`"

### 4. Bash Retry Spike Pattern
**Signal:** 3+ consecutive `Bash` tool calls with the same command shape, or `Bash` calls immediately followed by another `Bash` touching the same path/env.
**Hypothesis:** path/env fragility, usually Windows `D:/` vs `/d/` or `.cmd` suffix issues.
**Severity:** MEDIUM; HIGH if concentrated in Windows projects.
**Fix template:** "Add path handling to the relevant guardrail skill or CLAUDE.md, e.g. `use forward slashes in Bash`, `.cmd on Windows for npx`."

### 5. Cross-Project Convention Violation Pattern
**Signal:** clarification turns asking the same kind of convention question across multiple projects (e.g. "should the PK be UUID or BIGSERIAL?", "should I commit the build output?", "which branch base do I use?").
**Hypothesis:** missing global conventions.
**Severity:** LOW per occurrence, but compounds over time.
**Fix template:** "Add a `Global Conventions` block to the top-level CLAUDE.md (or an AGENTS.md) covering the repeated question."

---

## Execution Steps

### Step 1: Enumerate project slugs

List every subdirectory of `~/.claude/projects/`. Each directory name is a project slug (often a path-encoded repo path, e.g. `D--GITHUB-EVOKORE-MCP`). Filter out any slug in `project_exclude`.

### Step 2: Sample sessions per project

For each slug:

1. List all `*.jsonl` files whose mtime falls inside `time_window`.
2. Count lines and skip files with fewer than `min_session_turns * 4` lines (each turn emits ~4 JSONL entries on average).
3. Record the project slug and the session file paths.

### Step 3: Aggregate tool-call and efficiency metrics

For each sampled session, parse the JSONL and extract:

```javascript
const entries = jsonl.lines.map(JSON.parse);

// Ordered tool-use sequence across all turns
const toolSeq = entries.flatMap(e =>
  (e.message?.content || [])
    .filter(c => c.type === 'tool_use')
    .map(c => c.name)
);

// First-productive-turn: first Edit/Write/Bash tool use
const firstProductiveTurn = entries.findIndex(e =>
  e.message?.content?.some(c =>
    c.type === 'tool_use' && ['Edit', 'Write', 'Bash'].includes(c.name)
  )
);

// Has any git commit?
const hasCommit = entries.some(e =>
  e.message?.content?.some(c =>
    (c.type === 'tool_use' && c.name === 'Bash' &&
      /git\s+commit\b/.test(c.input?.command || '')) ||
    (c.type === 'tool_result' && typeof c.content === 'string' &&
      /\[[\w\-/]+\s+[0-9a-f]{7,}\]/.test(c.content))
  )
);

// Agent spawns in this session
const agentSpawns = entries.flatMap(e =>
  (e.message?.content || [])
    .filter(c => c.type === 'tool_use' && (c.name === 'Agent' || c.name === 'Task'))
);

const totalTurns = entries.filter(e => e.type === 'assistant').length;
```

Also call the MCP tools once per project with an appropriate project filter:

```
session_analyze_replay({ time_window, project_filter: <slug> })
session_work_ratio({ time_window, project_filter: <slug> })
```

### Step 4: Apply pattern detectors

For each pattern listed above, classify every sampled session as **match** or **no match**. Bucket matches by project slug.

A pattern "appears in" a project if at least one session in that project matches it. A pattern is **systemic** when it appears in at least `min_projects_for_pattern` distinct projects.

### Step 5: Compute impact per pattern

For each systemic pattern:

- `projects_affected` = list of slugs where it matched
- `total_sessions_affected` = count of matching sessions across all projects
- `avg_turn_penalty` = mean `totalTurns` of matching sessions minus mean `totalTurns` of non-matching sessions in the same projects
- `severity` = HIGH | MED | LOW using the pattern's defined thresholds plus the measured turn penalty
- `impact_score` = `total_sessions_affected * severity_weight` where HIGH=3, MED=2, LOW=1

Sort findings by `impact_score` descending.

### Step 6: Produce report

Render the output template. If `focus` is narrower than `all`, filter the report to the relevant pattern families (e.g. `agent-spawns` → patterns 3 only).

### Step 7 (optional): Emit CLAUDE.md patch

If `output_format: "claude-md-patch"`, emit a fenced-diff block for each finding's `Fix template`, formatted for direct paste into the top-level CLAUDE.md:

```diff
+ ## Global Process Conventions
+
+ - Open sessions with a targeted grep or nav_get_map, not a series of exploratory reads.
+ - All Agent spawn prompts must end with "Output your result to [specific file or format]."
+ - (etc.)
```

The patch is advisory — the operator must review and apply it manually.

---

## Output Template

```markdown
## Cross-Project Process Analysis: [time_window]

Generated: [ISO timestamp]
Tool: cross-project-process-miner v1.0
Projects scanned: N (after exclusions)
Sessions analyzed: M (after min_session_turns filter)
min_projects_for_pattern: 3

---

### Systemic Findings (sorted by impact score)

**Finding 1: [Pattern name] — HIGH**
Appears in: [projectA, projectB, projectC, projectD] (4 projects, 27 sessions)
Avg turn penalty: +14 turns vs non-matching sessions
Impact score: 81

Example evidence:
- `projectA/session-2026-04-03.jsonl` — first 3 calls: Read, Read, Read (first Edit at turn 9)
- `projectB/session-2026-04-05.jsonl` — first 4 calls: Read, Read, Read, Read (first Edit at turn 12)
- `projectC/session-2026-03-29.jsonl` — first 3 calls: Read, Read, Read (first Edit at turn 7)

→ Recommended fix:
Add to top-level CLAUDE.md:
"Open sessions with a targeted `grep` or `nav_get_map` call, not a series of exploratory Reads.
If you need orientation, use `nav_get_map` on the entrypoint file first."

---

**Finding 2: [Pattern name] — MED**
...

---

### Per-Project Pattern Matrix

| Project           | Opening Read | Abandoned | Agent Divergence | Bash Retry | Conventions |
|-------------------|--------------|-----------|-------------------|------------|-------------|
| EVOKORE-MCP       |     yes      |    no     |        no         |    yes     |     no      |
| Claudius-Maximus  |     yes      |    yes    |        yes        |    yes     |     yes     |
| OCR_LOCAL         |     yes      |    yes    |        no         |    no      |     no      |
| EDCTool           |     no       |    no     |        no         |    yes     |     no      |
| ...               |     ...      |    ...    |        ...        |    ...     |     ...     |

---

### Summary

- Total systemic findings: N
- HIGH severity: N
- MED severity: N
- LOW severity: N
- Estimated global turn savings if all HIGH fixes applied: ~X turns/session across matching projects

---

### Recommended CLAUDE.md Patch
(only populated when output_format: "claude-md-patch")

```diff
+ ## Global Process Conventions
+
+ - [fix template for finding 1]
+ - [fix template for finding 2]
+ - ...
```
```

---

## Integration With Other Skills

### session-retrospective-miner
The retrospective miner is single-project; this skill is cross-project. Run the retrospective miner first per project, then run this skill to check whether per-project findings actually reflect a systemic issue before patching a per-project CLAUDE.md.

### improvement-cycles
Cross-project findings belong to improvement-cycles Phase 1 at the **global** scope. Per-project findings should be triaged via `session-retrospective-miner` before escalating to this skill.

### AEP Align phase
Systemic findings feed into the Align phase when the scope is "global process" rather than a single milestone. The `output_format: claude-md-patch` option is designed to hand directly to Align.

### meta-improvement panel
Cross-project findings can be presented to the meta-improvement panel as "global narrative quality" evidence, complementing the panel's existing persona-quality review.

---

## Example Invocation

```
Run cross-project-process-miner for the last 30 days across all projects.
min_projects_for_pattern: 3
focus: all
output_format: report

Save the output to docs/session-logs/cross-project-retro-2026-04-10.md.
If any HIGH findings appear, rerun with output_format: claude-md-patch so I can paste
the diff into the top-level CLAUDE.md.
```

---

## Interpretation Guide

| Signal | Meaning | Action |
|--------|---------|--------|
| HIGH finding in 5+ projects | True systemic issue | Update global CLAUDE.md and audit top-level skills |
| HIGH finding in exactly 3 projects | Likely systemic | Update global CLAUDE.md, monitor for additional projects |
| MED finding in many projects | Process friction, not blocker | Add a note to global CLAUDE.md; defer guardrail work |
| No findings surface | Per-project retrospectives are the right tool | Stop here and use `session-retrospective-miner` |
| One project dominates a "systemic" finding | It's actually project-specific | Demote to per-project fix via `session-retrospective-miner` |

---

## Safety Rules

1. **Never auto-apply** the `claude-md-patch` output. The operator must review and paste it manually.
2. **Never modify** per-project CLAUDE.md files from this skill — that is the job of `session-retrospective-miner` and `narrative-quality-scorer`.
3. **Respect `project_exclude`** — some project slugs may contain sensitive session data the operator does not want mined.
4. **Minimum session filter is load-bearing.** Without `min_session_turns`, trivial sessions dominate the "opening Read" pattern and produce false positives.
5. **Cross-project findings require evidence from at least `min_projects_for_pattern` distinct slugs.** Do not emit a finding that only appears in one or two projects — surface those through `session-retrospective-miner` instead.
