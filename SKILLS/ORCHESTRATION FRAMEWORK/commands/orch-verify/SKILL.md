---
name: orch-verify
description: Capture verification evidence for the current task by running tests and logging results
category: Orchestration Framework
metadata:
  version: "1.0"
  source: "Agent33"
  original_command: "/verify"
  tags: ["orchestration", "command", "verification", "testing", "evidence"]
---

# Orchestration Verify

## Purpose

Capture verification evidence for the current task by running tests, capturing output, and updating the verification log.

## Invocation

```
orch-verify [command]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| command | No | Specific test command to run |

If no command is provided, uses the default test command from task context or project configuration.

## Workflow

### 1. Context Load

Read the following:
- Current task from task queue (status: `in_progress`)
- Test commands from project configuration or status tracking
- Evidence capture protocol (if defined)

### 2. Test Execution

Execute verification command(s):
- Run specified command or default test suite
- Capture stdout, stderr, and exit code
- Record execution timestamp

### 3. Evidence Capture

Collect verification artifacts:
- **Command**: Exact command executed
- **Exit Code**: Process return code
- **Output**: Relevant output (truncated if excessive)
- **Timestamp**: ISO 8601 execution time
- **Task Reference**: Associated task ID

### 4. Log Update

Append entry to `verification-log.md`:

```markdown
## [YYYY-MM-DD HH:MM] Task: [task-id]

**Command**:
```
[executed command]
```

**Result**: [PASS | FAIL]
**Exit Code**: [code]

**Output**:
```
[captured output, truncated to 50 lines]
```

**Evidence Hash**: [sha256 of output, optional]

---
```

### 5. Status Update

If verification passes:
- Update task status per workflow (may advance to `done` or `review`)
- Report success summary

If verification fails:
- Keep task status unchanged
- Report failure with relevant output excerpt

## Outputs

| Output | Destination | Action |
|--------|-------------|--------|
| Verification result | stdout | display |
| Evidence entry | `verification-log.md` | append |

## Evidence Standards

- All verification must be captured with reproducible commands
- Output should be sufficient to demonstrate pass/fail
- Sensitive data must be redacted before logging

## Error Handling

- If no active task exists, report "No active task to verify"
- If command fails to execute, report execution error
- If verification-log.md doesn't exist, create it with header
