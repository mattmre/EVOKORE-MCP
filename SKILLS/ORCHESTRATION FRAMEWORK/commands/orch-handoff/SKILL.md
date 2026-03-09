---
name: orch-handoff
description: Generate a session wrap summary documenting state, decisions, and recommended next steps
category: Orchestration Framework
metadata:
  version: "1.0"
  source: "Agent33"
  original_command: "/handoff"
  tags: ["orchestration", "command", "handoff", "session-wrap", "continuity"]
---

# Orchestration Handoff

## Purpose

Generate a session wrap summary for the next session, documenting current state, decisions made, and recommended next steps.

> **Note**: This skill complements the existing `session-wrap` skill in `SKILLS/GENERAL CODING WORKFLOWS/session-wrap/`. While `session-wrap` focuses on the git commit, PR, and session log workflow, `orch-handoff` focuses on synthesizing orchestration state (tasks, decisions, blockers, plans) into a structured handoff document for session continuity.

## Invocation

```
orch-handoff [notes]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| notes | No | Additional context or notes to include |

## Workflow

### 1. Context Load

Read the following project state documents:
- Status/state tracking document (e.g., `STATUS.md`)
- Task queue (e.g., `TASKS.md`)
- Decision log (e.g., `DECISIONS.md`)
- Current plan (e.g., `PLAN.md`)
- Priorities list (e.g., `PRIORITIES.md`)

### 2. Session Analysis

Synthesize session activity:
- **Completed Tasks**: Tasks moved to `done` this session
- **Active Work**: Tasks still `in_progress`
- **Decisions Made**: Entries added to decision log
- **Blockers Encountered**: Issues that slowed progress
- **Plan Changes**: Modifications to the plan

### 3. Next Actions Derivation

Determine recommended next steps:
- Priority tasks from priorities list
- Unblocked tasks ready for work
- Review items awaiting input
- Follow-up actions from decisions

### 4. Handoff Generation

Produce a structured session wrap:

```markdown
## Session Wrap: [YYYY-MM-DD HH:MM]

### Status Summary

**Session Duration**: [start] - [end]
**Tasks Completed**: [count]
**Tasks In Progress**: [count]
**Blockers**: [count]

### Completed This Session

- [x] [task-id]: [description]
- [x] [task-id]: [description]

### Still In Progress

- [ ] [task-id]: [description] - [status note]

### Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| [decision] | [why] | [what changes] |

### Blockers & Issues

- [blocker description and mitigation]

### Recommended Next Steps

1. **[Priority]**: [action description]
2. **[Priority]**: [action description]
3. **[Priority]**: [action description]

### Notes

[Additional context or operator notes]

---
```

## Outputs

| Output | Destination | Action |
|--------|-------------|--------|
| Handoff summary | stdout | display |
| Session wrap entry | Session wrap log | append |

## Handoff Quality Checklist

Before generating handoff:
- [ ] All task statuses are current
- [ ] Decisions are documented with rationale
- [ ] Blockers have clear descriptions
- [ ] Next steps are actionable

## Error Handling

- If state documents are missing, report which files are absent
- If no session activity detected, generate minimal handoff noting "No activity this session"
- If session wrap log doesn't exist, create it with header
