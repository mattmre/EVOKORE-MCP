---
name: orch-plan
description: Create an approval-gated implementation plan with phased tasks and acceptance criteria
category: Orchestration Framework
metadata:
  version: "1.0"
  source: "Agent33"
  original_command: "/plan"
  tags: ["orchestration", "command", "planning", "approval-gate", "phases"]
---

# Orchestration Plan

## Purpose

Create an implementation plan for a request, breaking it into phases and tasks with acceptance criteria, then wait for operator approval before execution.

## Invocation

```
orch-plan <request>
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| request | Yes | Description of what needs to be implemented |

## Workflow

### 1. Context Load

Read the following:
- Existing task queue (e.g., `TASKS.md`)
- Current plan state (e.g., `PLAN.md`)
- Priority context (e.g., `PRIORITIES.md`)
- Acceptance standards (if defined)

### 2. Request Analysis

Analyze the request to determine:
- **Scope**: What is being requested
- **Dependencies**: What must exist or complete first
- **Risk Triggers**: Security, API, schema, or other review triggers
- **Effort Estimate**: Approximate complexity

### 3. Plan Generation

Create structured implementation plan:

```markdown
## Plan: [Request Title]

**Created**: [YYYY-MM-DD HH:MM]
**Status**: PENDING_APPROVAL

### Objective

[Clear statement of what this plan achieves]

### Scope

**In Scope**:
- [item]
- [item]

**Out of Scope**:
- [item]

### Phases

#### Phase 1: [Phase Name]

**Objective**: [phase goal]
**Estimated Effort**: [time estimate]

**Tasks**:
- [ ] [task description]
- [ ] [task description]

**Acceptance Criteria**:
- [ ] [criterion]
- [ ] [criterion]

**Risk Triggers**: [none | list triggers]

#### Phase 2: [Phase Name]

[...]

### Dependencies

- [dependency and resolution approach]

### Review Requirements

| Phase | Review Type | Reviewer |
|-------|-------------|----------|
| 1 | [type] | [role] |

### Rollback Strategy

[How to revert if issues arise]

---

**AWAITING APPROVAL**

Reply with:
- `approve` - Proceed with implementation
- `modify` - Request changes to plan
- `reject` - Cancel this plan
```

### 4. Confirmation Wait

**Critical**: Do not proceed with implementation until operator provides explicit approval.

Wait states:
- `approve` / `yes` / `proceed`: Begin execution, update plan status to `APPROVED`
- `modify` / `change`: Request clarification, regenerate plan
- `reject` / `cancel` / `no`: Abort, discard plan

### 5. Plan Commit (on approval)

On approval:
- Set plan status to `APPROVED`
- Record approval timestamp
- Add tasks to task queue with status `queued`

## Outputs

| Output | Destination | Action |
|--------|-------------|--------|
| Plan proposal | stdout | display |
| Approved plan | Plan document | update |
| New tasks | Task queue | append |

## Plan Quality Standards

- Each phase must have clear acceptance criteria
- Risk triggers must be identified upfront
- Effort estimates use relative sizing (S/M/L or hours)
- Dependencies must be resolvable or flagged as blockers

## Error Handling

- If request is ambiguous, ask clarifying questions before generating plan
- If dependencies cannot be resolved, flag as blockers in plan
- If an active plan already exists, warn before overwriting
