---
name: orch-review
description: Trigger code review workflow with risk detection and reviewer routing
category: Orchestration Framework
metadata:
  version: "1.0"
  source: "Agent33"
  original_command: "/review"
  tags: ["orchestration", "command", "review", "risk-triggers", "code-quality"]
---

# Orchestration Review

## Purpose

Trigger the code review workflow, checking for risk triggers and routing to the appropriate reviewer based on change type.

## Invocation

```
orch-review [target]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| target | No | Branch, PR number, or commit SHA to review |

Default: Reviews current branch against main.

## Workflow

### 1. Context Load

Read the following (if available):
- Risk trigger definitions
- Reviewer routing map
- Review protocol / checklist

### 2. Change Analysis

Analyze the diff to identify:
- **Files Changed**: List of modified files
- **Change Type**: Feature, bugfix, refactor, config, docs
- **Lines Changed**: Addition/deletion counts
- **Risk Triggers**: Match against known risk patterns

### 3. Risk Trigger Detection

Check for triggers requiring elevated review:

| Trigger | Pattern | Review Level |
|---------|---------|--------------|
| Security | auth, crypto, secrets, permissions | Senior + Security |
| Schema | migrations, models, database | Senior + DBA |
| API | endpoints, contracts, breaking changes | Senior + API Owner |
| CI/CD | workflows, deployment, infrastructure | Senior + DevOps |
| Large Refactor | >500 lines or >10 files | Senior |

### 4. Reviewer Routing

Route to appropriate reviewer:
- **Standard changes**: Route to available reviewer
- **Risk-triggered changes**: Route to specialized reviewer + senior
- **Two-layer review**: Apply if change matches elevated criteria

### 5. Review Execution

Apply review checklist:
- [ ] Code quality and style
- [ ] Test coverage
- [ ] Security considerations
- [ ] Performance implications
- [ ] Documentation updates
- [ ] Breaking change assessment

### 6. Capture Review Outcome

Produce a structured review record:

```markdown
## Review: [target] - [YYYY-MM-DD HH:MM]

**Reviewer**: [reviewer role/id]
**Review Type**: [standard | risk-triggered]
**Risk Triggers**: [none | list]

### Summary

[Brief summary of changes reviewed]

### Files Reviewed

| File | Status | Notes |
|------|--------|-------|
| [path] | [approved|needs-work|blocked] | [note] |

### Findings

#### Issues (Must Fix)

- [ ] [issue description and location]

#### Suggestions (Consider)

- [ ] [suggestion description]

#### Observations

- [observation]

### Verdict

**Status**: [APPROVED | NEEDS_WORK | BLOCKED]
**Conditions**: [any conditions for approval]

### Follow-up Actions

- [ ] [action required before merge]

---
```

## Outputs

| Output | Destination | Action |
|--------|-------------|--------|
| Review summary | stdout | display |
| Review record | Review capture log | append |

## Review Levels

| Level | When Applied | Requirements |
|-------|--------------|--------------|
| Standard | No risk triggers | Single reviewer |
| Elevated | Risk trigger matched | Senior + specialist |
| Two-Layer | Per elevated review criteria | Sequential review |

## Error Handling

- If target doesn't exist, report "Target not found: [target]"
- If no diff available, report "No changes to review"
- If reviewer unavailable, flag for manual routing
