---
name: orch-e2e
description: Generate and run end-to-end tests for critical flows
category: Orchestration Framework
metadata:
  version: "1.0"
  source: "Agent33"
  original_command: "/e2e"
  tags: ["orchestration", "command", "e2e", "testing", "integration"]
---

# Orchestration E2E

## Purpose

Generate or run end-to-end tests for critical flows. Identifies key user journeys, creates test scenarios, and captures execution evidence.

## Invocation

```
orch-e2e [action] [flow]
```

Actions: `generate`, `run`, `verify`

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| action | No | generate, run, or verify (default: run) |
| flow | No | Specific flow to test |
| config | No | Test configuration override |

## Workflow

### 1. Identify Critical Flows

- Map user journeys and business flows
- Prioritize by risk and frequency
- Define test boundaries

### 2. Create Test Scenarios

- Write scenario descriptions
- Define preconditions and postconditions
- Specify expected outcomes

### 3. Generate/Run Tests

- Create test files (if generating)
- Execute test suite
- Capture results

### 4. Capture Evidence

- Document test outcomes
- Screenshot/log critical steps (if applicable)
- Update task tracking

## Critical Flow Identification

Prioritize flows by:
1. **Business impact**: Revenue, user retention
2. **Frequency**: Most common user paths
3. **Risk**: Error-prone or recently changed
4. **Compliance**: Regulatory requirements

## Test Scenario Template

```markdown
## Scenario: <name>

### Preconditions
- User state: <logged in/guest/admin>
- Data state: <required fixtures>
- System state: <services running>

### Steps
1. <action>
2. <action>
3. <action>

### Expected Outcome
- <assertion>
- <assertion>

### Postconditions
- <cleanup actions>
```

## Flow Categories

| Category | Examples |
|----------|----------|
| Authentication | Login, logout, password reset |
| Core features | Main user workflows |
| Transactions | Payments, orders, submissions |
| Admin | User management, configuration |
| Integration | Third-party service interactions |

## Outputs

| Output | Description |
|--------|-------------|
| Test files | E2E test scripts (if generating) |
| Results | Test execution summary |
| Evidence | Screenshots, logs, reports |
| Task update | E2E status logged |

## Evidence Capture

```markdown
## E2E Test Evidence

### Test Run
- Command: `<e2e-command>`
- Environment: <test/staging>
- Timestamp: <datetime>

### Results
- Total: X tests
- Passed: Y
- Failed: Z

### Failures (if any)
- Scenario: <name>
- Step: <failed step>
- Error: <message>

### Artifacts
- Report: <path-to-report>
- Logs: <path-to-logs>
```

## Example Usage

```
orch-e2e generate "user registration flow"
```

Flow:
1. Analyze registration feature code
2. Identify steps: form fill, validation, confirmation
3. Generate test file with scenarios
4. Run tests against test environment
5. Capture results and evidence
