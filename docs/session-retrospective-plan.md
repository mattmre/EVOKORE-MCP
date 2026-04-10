# Session Retrospective & Narrative Improvement System

**Created:** 2026-04-06  
**Relates to:** `docs/ai-nav-anchors-plan.md` (session analytics tools)

---

## Problem Statement

The existing improvement infrastructure (AEP framework, improvement-cycles skill, meta-improvement panel) is:
1. **Manual** — requires the operator to gather data, notice patterns, write retrospectives
2. **Forward-looking** — plans what to do next, but doesn't mine what actually happened
3. **Single-repo scoped** — each retrospective is scoped to one project/milestone
4. **Not connected to session data** — EVOKORE captures rich data (`~/.evokore/`, `~/.claude/`) that is never fed back into process improvement

The result: the prompts and phase narratives used to drive development are **static**. They are written once and rarely revised based on what the session data reveals about their quality.

**Key observation from 2026-04-06 audit:**
> The user is in a multi-phase product lifecycle (Claudius Maximus: 384 phases, OCR_LOCAL, EDCTool, RSMFConverter, etc.) using a fairly static prompt structure for each phase. Session data across those phases is a goldmine of signals about what makes a phase session efficient vs. expensive — but no tool extracts those signals.

---

## What This System Is

A **data-driven retrospective loop** that:
1. Mines session data across all repos (not just one)
2. Scores session quality against measurable efficiency metrics
3. Identifies specific structural weaknesses in the prompts/narratives driving the work
4. Produces concrete narrative improvement recommendations
5. Feeds findings back into the AEP framework and CLAUDE.md files

This is the **backward-looking complement to ARCH-AEP**. AEP plans and executes forward. This system looks back and improves the inputs for the next cycle.

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

## Data Sources

| Source | Location | What It Contains |
|--------|----------|-----------------|
| Claude session JSONL | `~/.claude/projects/<slug>/*.jsonl` | Full conversation, tool inputs/outputs, token usage, timestamps |
| EVOKORE replay logs | `~/.evokore/sessions/*-replay.jsonl` | Tool call sequence with summaries (EVOKORE projects only) |
| EVOKORE evidence logs | `~/.evokore/sessions/*-evidence.jsonl` | Verified outputs: test results, git ops, file changes |
| EVOKORE hook log | `~/.evokore/logs/hooks.jsonl` | Damage-control triggers, purpose-gate fires |
| EVOKORE manifests | `~/.evokore/sessions/*.json` | Session metadata: purpose, duration, metrics |
| Project CLAUDE.md files | `D:/GITHUB/<project>/CLAUDE.md` | Current narrative instructions |
| Phase spec files | `D:/GITHUB/<project>/04-planning/phases/` | Phase implementation specs (Claudius Maximus) |

---

## Component 1: `session-retrospective-miner` Skill

**Type:** EVOKORE skill (not an MCP tool — this requires agent reasoning, not just data access)  
**Location:** `SKILLS/ORCHESTRATION FRAMEWORK/session-retrospective-miner/SKILL.md`  
**Cross-repo:** Yes — operates on `~/.claude/projects/` across all slugs

### What It Does

Queries session data for a configurable time window and/or project filter, computes efficiency metrics, and produces a structured retrospective report with **specific, actionable narrative improvement recommendations** — not just observations.

### Input Parameters

```yaml
time_window: "last-30-days" | "last-7-days" | "this-week" | "all-time"
project_filter: "all" | "Claudius-Maximus" | "OCR_LOCAL" | "EDCTool" | ...
focus: "narrative-quality" | "tool-efficiency" | "phase-implementation" | "all"
min_session_turns: 10   # exclude trivial sessions
```

### Efficiency Metrics Computed Per Session

| Metric | Computation | Signal |
|--------|-------------|--------|
| **Turn-to-output ratio** | total turns / evidence entries | Low = efficient; High = overhead-heavy |
| **First-productive-turn** | index of first Edit/Write/Bash output turn | Low = clear instructions; High = clarification loops |
| **Clarification loop score** | count of assistant turns containing "?" before first file change | 0 = clear prompt; 3+ = unclear prompt |
| **Retry rate** | consecutive same-tool pairs / total tool calls | Low = clean execution; High = brittle commands |
| **Context growth rate** | tokens at turn N / tokens at turn 1 | Steep = large file reads early; Flat = good scoping |
| **Work density** | evidence entries / replay entries (EVOKORE sessions) | >20% = high value; <10% = overhead-heavy |
| **Phase completion signal** | did session produce a git commit? | Boolean — sessions without commits may be abandoned |

### Output: Retrospective Report

```markdown
## Session Retrospective: [date range] — [project filter]

### Summary
- Sessions analyzed: 47
- Median turns to first output: 4.2
- Median clarification loops: 1.1
- Sessions with 0 commits: 8 (17%)
- High-efficiency sessions (work ratio >20%): 12 (26%)
- Overhead-heavy sessions (work ratio <10%): 9 (19%)

### Pattern Findings

**Finding 1: Phase specs without explicit insertion points add 8+ turns**
Sessions where the initial prompt did not mention app.module.ts insertion averaged
31 turns. Sessions with explicit insertion points averaged 14 turns. Affects 62% of
Claudius Maximus phase sessions.
→ Recommendation: Add "@AI:NAV insert point" reference to every phase spec.

**Finding 2: Sessions starting with >3 Read calls have 2.4x higher turn counts**
When the first 3 tool calls are all Reads, the session averages 41 turns vs 17 turns
when the first call is Bash or Edit. Indicates context was not established upfront.
→ Recommendation: Phase specs should include file paths to the specific entities
to create, not just the module name.

**Finding 3: Clarification loops cluster around schema decisions**
23% of all clarification turns involve Claude asking "should the primary key be
UUID or BIGSERIAL?" or "should I add an index on X?" — decisions already resolved
by project convention.
→ Recommendation: Add "DB conventions" section to phase spec template:
  - PKs: BIGSERIAL
  - Timestamps: created_at/updated_at with @CreateDateColumn/@UpdateDateColumn
  - No UUID PKs, no INET columns (use VARCHAR(45))

**Finding 4: Agent spawns without explicit scope produce 47% more sub-turns**
Agent tool calls where the prompt didn't include "stop after X, do not Y" averaged
89 sub-turns. Those with explicit scope boundaries averaged 48 sub-turns.
→ Recommendation: All Agent spawn prompts should include explicit stop conditions.

### Narrative Quality Scores by Project

| Project | Avg Turns/Session | First-Output Turn | Clarity Score | Trend |
|---------|------------------|-------------------|---------------|-------|
| Claudius Maximus | 28.4 | 6.1 | 62/100 | Improving |
| OCR_LOCAL | 41.2 | 11.3 | 44/100 | Flat |
| EDCTool | 19.1 | 3.8 | 78/100 | Improving |
| RSMFConverter | 22.6 | 4.9 | 71/100 | Improving |

### Action Items

| Priority | Action | Target | Success Criterion |
|----------|--------|--------|------------------|
| HIGH | Add insertion point references to phase spec template | Claudius Maximus/04-planning/ | Avg turns drops below 20 |
| HIGH | Add DB conventions block to phase spec template | Claudius Maximus/CLAUDE.md | Clarification loops on schema drop by 50% |
| MED | Add explicit stop conditions to all Agent spawn prompts | Global CLAUDE.md | Sub-agent turn count drops 30% |
| MED | OCR_LOCAL CLAUDE.md lacks function line map | OCR_LOCAL/CLAUDE.md | First-output turn drops from 11 to <5 |
| LOW | 8 sessions with no commits — investigate abandoned sessions | All projects | Understand if these are exploratory or failed |
```

### How Metrics Are Extracted From Session JSONL

```javascript
// First-productive-turn: index of first message with Edit/Write tool use
const firstProductiveTurn = entries.findIndex(e =>
  e.message?.content?.some(c => ['Edit', 'Write'].includes(c.type === 'tool_use' && c.name))
);

// Clarification loop score: assistant ? turns before first Edit/Write
const clarificationTurns = entries
  .slice(0, firstProductiveTurn)
  .filter(e => e.type === 'assistant' && 
    e.message?.content?.some(c => c.type === 'text' && c.text?.includes('?')))
  .length;

// Retry rate: consecutive same-tool pairs
let retries = 0;
for (let i = 1; i < toolSeq.length; i++) {
  if (toolSeq[i] === toolSeq[i-1]) retries++;
}
const retryRate = retries / toolSeq.length;
```

---

## Component 2: `narrative-quality-scorer` Skill

**Type:** EVOKORE skill  
**Location:** `SKILLS/ORCHESTRATION FRAMEWORK/narrative-quality-scorer/SKILL.md`  
**Purpose:** Score a specific prompt or phase spec document against the efficiency patterns found by `session-retrospective-miner`. Returns a quality score and diff-style improvement suggestions.

### What It Does

Given a prompt text or file path, the skill:
1. Parses the narrative for structural elements (file paths mentioned, insertion points, acceptance criteria, explicit stop conditions)
2. Scores it against the efficiency patterns learned from session data
3. Returns specific suggested additions/changes — like a code reviewer for prompts

### Input

```yaml
narrative: |
  "Implement Phase 312: Analytics Export Module.
   Read phase spec from 04-planning/phases/phase-312-analytics-export.md.
   Create branch phase-312-analytics-export from main.
   Implement: migration, entities, DTOs, service, controller, module."
session_context: "claudius-maximus-phase-implementation"
```

### Output: Scored Narrative

```markdown
## Narrative Quality Score: 41/100

### Missing elements (each reduces average session efficiency):

❌ No insertion point specified (-15 pts)
   Sessions without app.module.ts insertion point average 17 more turns.
   Add: "Register in app.module.ts: add AnalyticsExportEntity to entities array
   at @AI:NAV[INS:new-typeorm-entity], add AnalyticsExportModule to imports
   array at @AI:NAV[INS:new-module]."

❌ No acceptance criteria (-12 pts)
   Sessions with explicit "done when X" average 8 fewer turns.
   Add: "Done when: build passes, migration runs clean, all endpoints return 200."

❌ No DB conventions reminder (-8 pts)
   23% of Claudius Maximus sessions include a clarification turn about PK type.
   Add: "Use BIGSERIAL PKs, VARCHAR(45) for IPs, no INET columns."

⚠️ Phase spec file not read-before-implement (-6 pts)
   The instruction says "read phase spec" but doesn't specify what to extract.
   Add: "Extract: SQL migration, entity names, API endpoint paths, shared type names."

✅ Branch naming convention specified (+4 pts)
✅ Module type specified (+3 pts)

### Improved Narrative

"Implement Phase 312: Analytics Export Module.

1. Read 04-planning/phases/phase-312-analytics-export.md. Extract:
   - SQL migration (full CREATE TABLE statement)
   - Entity names, API endpoint paths, shared type names

2. Implement: migration, entities (BIGSERIAL PKs, no INET columns),
   DTOs (class-validator), service (@InjectRepository pattern),
   controller (versioned, @Controller({ version: '1' })), module, shared types.

3. Register in app.module.ts:
   - Add entity imports at @AI:NAV[INS:new-entity-import]
   - Add entity to TypeORM array at @AI:NAV[INS:new-typeorm-entity]
   - Add module to @Module imports at @AI:NAV[INS:new-module]

4. Done when: npm run build, typecheck, test all pass with no new failures.

Branch: phase-312-analytics-export"

Estimated session efficiency improvement: +40% (28 turns → ~17 turns)
```

### Scoring Rubric (configurable per project context)

Each element worth points because it correlates with session efficiency data:

| Element | Points | Basis |
|---------|--------|-------|
| Explicit insertion points | +15 | -8 turns avg when present |
| Acceptance criteria ("done when") | +12 | -8 turns avg when present |
| DB/convention reminders | +8 | Eliminates schema clarification loops |
| Explicit file paths to create | +10 | -5 turns first-output time |
| Stop conditions for Agent spawns | +10 | -40% sub-agent turns |
| Branch naming | +5 | Baseline clarity |
| Module/feature type | +5 | Baseline clarity |
| Test commands specified | +8 | Reduces test clarification turns |
| Anti-patterns explicitly excluded | +7 | Prevents known wrong paths |

---

## Component 3: `phase-spec-optimizer` Skill

**Type:** EVOKORE skill  
**Location:** `SKILLS/GENERAL CODING WORKFLOWS/phase-spec-optimizer/SKILL.md`  
**Purpose:** Specifically for multi-phase product development. Analyzes a batch of phase specs against their actual session outcomes and produces an updated spec template with structural improvements baked in.

### Trigger

Use this skill when:
- Starting a new block of phases (e.g., "next 20 phases of Claudius Maximus")
- Session efficiency has been declining over recent phases
- The narrative-quality-scorer flags the same missing elements repeatedly
- Post-milestone — before planning the next milestone's phase specs

### What It Does

1. Reads a sample of completed phase specs (e.g., phases 300–310) alongside their session JSONL files
2. Computes efficiency metrics for each completed phase session
3. Correlates spec structure elements with session efficiency
4. Produces a diff: "your current template → improved template"
5. Optionally applies the improved template to the remaining unstarted phase specs in bulk

### Output: Template Diff

```markdown
## Phase Spec Template Improvements

Based on 10 completed phases (300–310), 7 remaining phases (311–317):

### Current template score: 48/100
### Projected improved template score: 81/100

### Changes to make to phase-spec template:

1. ADD after "Implement:" block:
   ```
   Register in app.module.ts:
   - Entity imports: nav_read_anchor(app.module.ts, new-entity-import)
   - TypeORM entities: nav_read_anchor(app.module.ts, new-typeorm-entity)  
   - Module imports: nav_read_anchor(app.module.ts, new-module)
   ```
   Basis: phases 302, 305, 308 each spent 8+ turns finding insertion points.

2. ADD "Shared types:" section with explicit type names to create
   Basis: phases 303, 307 had 3+ clarification turns about which interfaces to add.

3. ADD "Done when:" block:
   ```
   Done when: npm run build && npm run typecheck && npm run test pass with no regressions.
   ```
   Basis: 6/10 phases had a "should I run tests?" clarification turn.

4. REMOVE boilerplate "Read phase spec from..." — replace with explicit extraction prompt:
   ```
   From 04-planning/phases/phase-NNN-*.md, extract and confirm before implementing:
   - [ ] SQL migration (full CREATE TABLE)
   - [ ] Entity names and fields
   - [ ] API routes (method + path)
   - [ ] Shared type names to add to shared/src/index.ts
   ```

### Apply to remaining phases? (phases 311–317)
Confirm to apply template changes to unstarted phase specs.
```

---

## Component 4: `cross-project-process-miner` Skill

**Type:** EVOKORE skill  
**Location:** `SKILLS/ORCHESTRATION FRAMEWORK/cross-project-process-miner/SKILL.md`  
**Purpose:** The broadest view — finds process patterns that recur across ALL repos, regardless of project type. Not product-specific, not repo-specific. Pure process signal.

### What It Does

Aggregates session data from every project slug in `~/.claude/projects/` and surfaces findings that appear in 3+ different projects — meaning they're systemic process issues, not project-specific quirks.

### Example Cross-Project Findings

The kinds of patterns this skill would surface (based on data already in your sessions):

**"The opening Read pattern"**
> In 8/10 projects, sessions that start with 3+ Read calls before any Bash/Edit average 2.4x more turns. This is not project-specific — it's a universal signal that context wasn't established upfront. Fix: open sessions with a targeted grep or nav_get_map, not a series of exploratory reads.

**"The abandoned session pattern"**
> 17% of sessions across all projects end with 0 git commits. Clustering: most occur after long Read chains with no Edit output. These are likely "exploration sessions that ran out of context." Fix: set explicit session scope in CLAUDE.md header or use /compact+clear to start a fresh focused session.

**"The agent spawn divergence pattern"**
> 47 consecutive Agent spawns found in sample. In sessions using the Agent tool, 34% have zero evidence entries — agents ran but produced nothing verifiable. Universal fix: all Agent spawn prompts should end with "Output your result to [specific file or format]. Done when you have produced that output."

**"The Bash retry spike"**
> 549 consecutive Bash pairs in sample. Concentrated in projects using Windows paths + bash. Fix: add Windows path handling to a global skill or guardrail — `D:/` vs `/d/` ambiguity accounts for the majority of these.

### Output Structure

```markdown
## Cross-Project Process Analysis

### Sessions analyzed: 333 across 30 projects
### Patterns appearing in 3+ projects:

[Finding] [Frequency] [Projects affected] [Recommended fix]
```

---

## Integration with Existing Skills

### Feeds into AEP Framework

The retrospective miner's findings are direct inputs to the **AEP Align phase**:
- Narrative quality scores → phase spec improvements before planning next milestone
- Efficiency trend data → informs effort estimates in phase-planning.md
- Cross-project findings → global CLAUDE.md updates (not project-specific)

### Extends improvement-cycles

The `improvement-cycles` skill has a "Phase 1: Metrics Collection" step that currently requires manual data gathering. `session-retrospective-miner` automates that step entirely. The improvement-cycles skill should be updated to call the retrospective miner as its Phase 1:

```
OLD: "Gather quantitative data from recent sessions" (manual)
NEW: Run session-retrospective-miner → get structured metrics report → proceed to Phase 2
```

### Extends meta-improvement panel

The meta-improvement panel currently evaluates expert persona quality. It can be extended to also evaluate **narrative quality** — using the narrative-quality-scorer to score the prompts used in the reviewed sessions, and including narrative improvement recommendations alongside persona improvement recommendations.

---

## Implementation Plan

### Phase A — Infrastructure (same session as nav-anchor-tools)
These build on `session_analyze_replay` and `session_work_ratio` from `ai-nav-anchors-plan.md`:
- [ ] `session_analyze_replay` MCP tool (prerequisite for skill data extraction)
- [ ] `session_work_ratio` MCP tool (prerequisite for work density scoring)

### Phase B — Retrospective Skills (next dedicated session)
- [ ] Create `SKILLS/ORCHESTRATION FRAMEWORK/session-retrospective-miner/SKILL.md`
  - Skill definition, metric computation instructions, report template
  - References `session_analyze_replay` and `session_work_ratio` MCP tools
  - References `~/.claude/projects/` JSONL for clarification loop detection
- [ ] Create `SKILLS/ORCHESTRATION FRAMEWORK/narrative-quality-scorer/SKILL.md`
  - Scoring rubric (configurable per project context key)
  - Improvement suggestion templates
  - "Improved narrative" output format
- [ ] Update `SKILLS/ORCHESTRATION FRAMEWORK/improvement-cycles/SKILL.md`
  - Phase 1 now calls `session-retrospective-miner` instead of manual data gathering
- [ ] Update `SKILLS/ORCHESTRATION FRAMEWORK/aep-framework/workflow.md`
  - Add "Retrospective input" step to Align phase

### Phase C — Phase-Specific Skills (after B is validated)
- [ ] Create `SKILLS/GENERAL CODING WORKFLOWS/phase-spec-optimizer/SKILL.md`
  - Phase spec template diff generator
  - Bulk apply to unstarted phase files
- [ ] Create `SKILLS/ORCHESTRATION FRAMEWORK/cross-project-process-miner/SKILL.md`
  - Cross-repo aggregation, 3+ project pattern detection
  - Feeds into global CLAUDE.md improvement recommendations

### Phase D — Claudius Maximus Application
Once skills exist, apply them to the remaining phase work:
- [ ] Run `session-retrospective-miner` on all completed Claudius Maximus phase sessions
- [ ] Run `phase-spec-optimizer` on the remaining unstarted phase specs
- [ ] Update `Claudius Maximus/CLAUDE.md` with narrative improvement findings
- [ ] Update `Claudius Maximus/04-planning/` phase spec template

---

## Start Prompt for Implementation Session

> "Load docs/session-retrospective-plan.md. Implement Phase B: create the session-retrospective-miner skill and narrative-quality-scorer skill. Both are in SKILLS/ORCHESTRATION FRAMEWORK/. The retrospective miner should use session_analyze_replay and session_work_ratio tools (built in the prior session) plus direct JSONL parsing of ~/.claude/projects/ for clarification loop detection. The narrative-quality-scorer takes a prompt text, scores it against a configurable rubric, and returns specific additions with token-efficiency justification. After creating the skills, update improvement-cycles/SKILL.md Phase 1 to reference session-retrospective-miner."

---

## Key Difference From Existing Tooling

| | improvement-cycles | meta-improvement panel | **This system** |
|---|---|---|---|
| Data source | Manual gathering | Panel review artifacts | Automated session JSONL mining |
| Scope | Single repo | Single review cycle | Cross-repo, all time |
| Output | Retrospective template | Persona improvements | Narrative quality scores + diffs |
| Automation | None | None | Full — runs as a skill invocation |
| Feeds back into | CLAUDE.md manually | Expert roster | Phase specs + AEP Align + CLAUDE.md |
| Trigger | Operator runs it | After each panel | On demand or scheduled |
