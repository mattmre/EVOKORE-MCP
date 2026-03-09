---
name: orch-tasks
description: List open tasks with priorities, status, and acceptance criteria
category: Orchestration Framework
metadata:
  version: "1.0"
  source: "Agent33"
  original_command: "/tasks"
  tags: ["orchestration", "command", "tasks", "priorities", "tracking"]
---

# Orchestration Tasks

## Purpose

List open tasks with their priorities, status, and acceptance criteria.

## Invocation

```
orch-tasks [filter]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| filter | No | Status filter: `all`, `queued`, `in_progress`, `blocked`, `review` |

Default: Shows `queued` and `in_progress` tasks.

## Workflow

### 1. Context Load

Read the following project documents:
- Task queue (e.g., `TASKS.md`)
- Priorities list (e.g., `PRIORITIES.md`)
- Definition of done / acceptance standards

### 2. Task Parsing

Extract task entries with fields:
- **ID**: Task identifier
- **Description**: Task summary
- **Status**: Current state (queued, in_progress, blocked, review, done)
- **Priority**: Priority level or inline priority marker
- **Owner**: Assigned agent or operator
- **Acceptance Criteria**: Success conditions

### 3. Priority Ordering

Order tasks by:
1. Priority level (P0 > P1 > P2 > P3)
2. Status (in_progress > blocked > queued)
3. Creation date (oldest first within same priority)

### 4. Output Generation

Produce a structured task list:

```markdown
## Open Tasks

### In Progress

| ID | Description | Owner | Priority | Blockers |
|----|-------------|-------|----------|----------|
| T-001 | [description] | [owner] | P1 | None |

### Queued

| ID | Description | Priority | Est. Effort |
|----|-------------|----------|-------------|
| T-002 | [description] | P2 | 2h |

### Blocked

| ID | Description | Blocked By | Duration |
|----|-------------|------------|----------|
| T-003 | [description] | T-001 | 4h |

---

## Acceptance Criteria (Next Task)

**T-002**: [task description]

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3
```

## Outputs

| Output | Destination | Action |
|--------|-------------|--------|
| Task list | stdout | display |

This command does not modify project documents; it is read-only.

## Status Definitions

| Status | Description |
|--------|-------------|
| `queued` | In queue, not started |
| `in_progress` | Active work underway |
| `blocked` | Waiting on dependency or decision |
| `review` | Awaiting reviewer input |
| `done` | Verified and documented |

## Error Handling

- If task queue is missing, report file not found
- If task queue is empty, report "No tasks in queue"
- If filter matches no tasks, report "No tasks match filter: [filter]"
