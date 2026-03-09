---
name: improvement-cycles
description: Structured improvement cycles with metrics review and retrospective templates
category: Orchestration Framework
metadata:
  version: "1.0"
  source: "Agent33"
  tags: ["improvement", "retrospective", "metrics", "continuous-improvement"]
---

# Improvement Cycles

Structured templates for running continuous improvement cycles on AI-assisted coding sessions. Adapted from Agent33's improvement-cycle workflows.

## Purpose

Improvement cycles provide a repeatable process for:
- Reviewing session metrics and outcomes
- Identifying patterns (successes and failures)
- Generating actionable improvements
- Tracking improvement adoption over time

## Cycle Structure

Each improvement cycle follows four phases:

### Phase 1: Metrics Collection

Gather quantitative data from recent sessions.

**Sources:**
- Session replay logs (`~/.evokore/sessions/{id}-replay.jsonl`)
- Evidence capture logs (`~/.evokore/sessions/{id}-evidence.jsonl`)
- Hook observability logs (`~/.evokore/logs/hooks.jsonl`)
- Git history (commits, PRs, branches)

**Key Metrics:**
| Metric | Source | Description |
|--------|--------|-------------|
| Tool call count | session-replay | Total tool invocations per session |
| Evidence entries | evidence-capture | Significant operations captured |
| Damage control triggers | damage-control log | Blocked or warned operations |
| Session duration | session timestamps | Time from first to last tool call |
| Files modified | git diff | Scope of changes per session |
| Test pass rate | evidence (test-result) | Ratio of passing test runs |

### Phase 2: Retrospective Review

Analyze the metrics and session logs qualitatively.

**Template:**

```markdown
## Retrospective: [Date Range]

### What went well
- [List successes, efficient patterns, smooth workflows]

### What could improve
- [List friction points, repeated errors, wasted effort]

### Patterns observed
- [Recurring themes across multiple sessions]

### Root causes
- [Underlying reasons for issues, not just symptoms]
```

**Guiding Questions:**
1. Which sessions had the most damage-control triggers? Why?
2. Were there sessions with unusually high tool call counts? What caused it?
3. Did evidence capture reveal patterns in test failures?
4. Were scope boundary warnings accurate or too noisy?
5. What CLAUDE.md learnings were added? Are they being followed?

### Phase 3: Action Items

Convert retrospective findings into concrete improvements.

**Action Item Template:**

```markdown
### Action: [Short title]
- **Priority:** High | Medium | Low
- **Category:** Hook config | Workflow | Documentation | Tooling
- **Description:** [What to change and why]
- **Success criteria:** [How to verify the improvement worked]
- **Target:** [Which file, script, or process to modify]
```

**Categories of Improvements:**
- **Hook tuning** -- Adjust damage-control rules, evidence capture patterns, or scope validation thresholds
- **Workflow optimization** -- Streamline repeated multi-step processes into skills or scripts
- **Documentation updates** -- Add learnings to CLAUDE.md, update operator guides
- **Tooling additions** -- New scripts, hooks, or integrations to address gaps

### Phase 4: Adoption Tracking

Track whether action items are implemented and effective.

**Tracking Table:**

```markdown
| Action | Status | Implemented | Verified | Notes |
|--------|--------|-------------|----------|-------|
| [title] | pending/done/dropped | [date] | [date] | [outcome] |
```

## Running a Cycle

### Quick Cycle (15 minutes)

Use after every 3-5 sessions or weekly, whichever comes first.

1. Review the last 3-5 evidence logs for patterns
2. Check damage-control log for recurring triggers
3. Write 2-3 bullet retrospective notes
4. Create 1-2 action items
5. Update CLAUDE.md if learnings emerged

### Full Cycle (30-60 minutes)

Use monthly or after major milestones.

1. Aggregate metrics across all sessions in the period
2. Complete the full retrospective template
3. Prioritize and assign all action items
4. Review previous cycle's adoption tracking
5. Update documentation and hook configurations
6. Archive the cycle report in `docs/session-logs/`

## Integration with EVOKORE Hooks

The improvement cycle leverages data from the hook system:

```
purpose-gate --> sets session intent
    |
session-replay --> logs all tool calls
    |
evidence-capture --> flags significant operations
    |
damage-control --> logs security/scope events
    |
tilldone --> tracks task completion
    |
    v
IMPROVEMENT CYCLE
    |
    v
CLAUDE.md updates, hook config changes, workflow improvements
```

## Example Cycle Output

```markdown
## Retrospective: 2026-03-01 to 2026-03-08

### What went well
- Evidence capture caught 3 test failures early in feature branches
- Session purpose tracking kept agents focused on declared goals
- Damage-control blocked 2 accidental force-push attempts

### What could improve
- Scope boundary warnings fired on legitimate cross-project references (too sensitive)
- Session replay logs growing large; need rotation policy
- No automated way to diff metrics between cycles

### Action Items
1. [High] Relax scope boundary heuristic to allow known sibling projects
2. [Medium] Add rotation to evidence-capture JSONL files (match hook-observability pattern)
3. [Low] Create a metrics-diff script for cycle-over-cycle comparison
```
