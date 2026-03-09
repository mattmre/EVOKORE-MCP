---
name: orch-tdd
description: Test-Driven Development workflow with RED/GREEN/REFACTOR stage tracking
category: Orchestration Framework
metadata:
  version: "1.0"
  source: "Agent33"
  original_command: "/tdd"
  tags: ["orchestration", "command", "tdd", "testing", "red-green-refactor"]
---

# Orchestration TDD

## Purpose

Direct entry point for Test-Driven Development workflow. Guides implementation through the RED/GREEN/REFACTOR cycle with evidence capture at each stage.

## Invocation

```
orch-tdd <feature-description>
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| feature-description | Yes | Clear description of feature to implement |
| target-path | No | Directory or file to target |
| test-framework | No | Override default test framework |

## Workflow

### 1. Parse Requirements

- Parse feature description into testable requirements
- Identify target files and test framework

### 2. RED Phase

- Write failing test(s) for the feature
- Verify test fails for the right reason
- Capture: test file path, failure output

### 3. GREEN Phase

- Write minimal implementation to pass test
- Run test suite to verify pass
- Capture: implementation file path, pass output

### 4. REFACTOR Phase

- Identify code smells or duplication
- Refactor while keeping tests green
- Capture: refactored files, final test output

## Stage Tracking

Track current stage in project status:

```markdown
## TDD Progress
- [x] RED: test written, fails correctly
- [x] GREEN: implementation passes
- [ ] REFACTOR: cleanup complete
```

## Outputs

| Output | Description |
|--------|-------------|
| Test files | New or updated test file(s) |
| Implementation | Minimal code to pass tests |
| Evidence | RED/GREEN/REFACTOR stage captures |
| Task update | Progress logged in task tracking |

## Evidence Capture

Minimum evidence per stage:
- **RED**: Test code + failure message
- **GREEN**: Implementation code + pass confirmation
- **REFACTOR**: Diff summary + all tests still pass

## Example Usage

```
orch-tdd "Add user authentication with JWT tokens"
```

Expected flow:
1. Write test for authentication endpoint
2. Verify test fails (no auth implemented)
3. Implement minimal JWT auth
4. Verify test passes
5. Refactor for clarity and security
6. Capture evidence at each stage
