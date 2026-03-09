---
name: orch-status
description: Review current operational state and surface blockers, constraints, or pending actions
category: Orchestration Framework
metadata:
  version: "1.0"
  source: "Agent33"
  original_command: "/status"
  tags: ["orchestration", "command", "status", "monitoring", "blockers"]
---

# Orchestration Status

## Purpose

Review current operational state and surface blockers, constraints, or pending actions that require attention.

## Invocation

```
orch-status
```

No arguments required.

## Workflow

### 1. Context Load

Read the following project state documents:
- Status/state tracking document (e.g., `STATUS.md`)
- Task queue (e.g., `TASKS.md`)
- Current plan (e.g., `PLAN.md`)
- Priorities list (e.g., `PRIORITIES.md`)

### 2. State Analysis

Extract and synthesize:
- **Current Task**: Active task (status: `in_progress`)
- **Blockers**: Any tasks with status `blocked` and their dependencies
- **Runtime State**: Constraints and assumptions from status tracking
- **Priorities**: Current rolling horizon from priorities list

### 3. Blocker Detection

Flag items requiring attention:
- Tasks blocked > 24 hours
- Missing dependencies or undefined owners
- Escalation triggers
- Resource constraints documented in status tracking

### 4. Output Generation

Produce a structured summary:

```markdown
## Current State

**Active Task**: [task-id] - [description]
**Owner**: [assigned owner]
**Status**: [in_progress | blocked | review]

## Blockers

| Task | Blocker | Duration | Escalation |
|------|---------|----------|------------|
| ... | ... | ... | ... |

## Next Actions

1. [Recommended action]
2. [Recommended action]

## Runtime Notes

- [Any relevant constraints or warnings]
```

## Outputs

| Output | Destination | Action |
|--------|-------------|--------|
| Status summary | stdout | display |

This command does not modify project documents; it is read-only.

## Error Handling

- If state documents are missing, report which files are absent
- If no active task exists, report "No active tasks in queue"
- If status tracking is stale (>24h), flag for refresh
