---
name: orchestration-commands
description: Registry and index of all orchestration command skills
category: Orchestration Framework
metadata:
  version: "1.0"
  source: "Agent33"
  original_command: "COMMAND_REGISTRY"
  tags: ["orchestration", "commands", "registry", "index"]
---

# Orchestration Command Registry

This registry defines all available orchestration command skills. Each command is a standalone skill that can be invoked independently.

## Available Commands

| Command | Purpose | Skill Path |
|---------|---------|------------|
| `orch-status` | Review runtime state and surface blockers | [orch-status/SKILL.md](orch-status/SKILL.md) |
| `orch-tasks` | List and manage open tasks with priorities | [orch-tasks/SKILL.md](orch-tasks/SKILL.md) |
| `orch-verify` | Capture verification evidence for current task | [orch-verify/SKILL.md](orch-verify/SKILL.md) |
| `orch-handoff` | Generate session wrap summaries | [orch-handoff/SKILL.md](orch-handoff/SKILL.md) |
| `orch-plan` | Create approval-gated implementation plans | [orch-plan/SKILL.md](orch-plan/SKILL.md) |
| `orch-review` | Trigger code review with risk routing | [orch-review/SKILL.md](orch-review/SKILL.md) |
| `orch-tdd` | RED/GREEN/REFACTOR workflow entry point | [orch-tdd/SKILL.md](orch-tdd/SKILL.md) |
| `orch-build-fix` | Diagnose and fix build/test failures | [orch-build-fix/SKILL.md](orch-build-fix/SKILL.md) |
| `orch-refactor` | Dead code cleanup and refactoring | [orch-refactor/SKILL.md](orch-refactor/SKILL.md) |
| `orch-docs` | Documentation synchronization | [orch-docs/SKILL.md](orch-docs/SKILL.md) |
| `orch-e2e` | Generate and run E2E test suites | [orch-e2e/SKILL.md](orch-e2e/SKILL.md) |

## Schema

Each command skill follows this schema:

```yaml
id: string           # Unique identifier (orch-prefixed)
name: string         # Display name
description: string  # Brief purpose statement
triggers:            # What invokes this command
  - manual           # Operator-initiated
  - scheduled        # Time-based
  - event            # Triggered by system event
inputs:              # Required context
  - document: string # Input path or description
    required: bool   # Whether mandatory
outputs:             # Produced artifacts
  - document: string # Output path or pattern
    action: string   # create | update | append
```

## Command Conventions

### Invocation

Commands are invoked by referencing the skill name:

```
orch-{command} [required-args] [optional-args]
```

### Standard Outputs

All commands should produce:
1. Primary artifacts (code, docs, tests)
2. Evidence of execution
3. Task tracking update (if applicable)

### Error Handling

- Commands should fail gracefully with clear messages
- Partial progress should be captured
- Escalation path should be clear

## Adding New Commands

1. Create a new subdirectory under `commands/` named `orch-<id>/`
2. Add a `SKILL.md` following the frontmatter schema
3. Add an entry to this registry table
4. Document any new artifacts or dependencies

## Related Skills

- `../handoff-protocol/` - Handoff protocol definitions (when available)
- `../../GENERAL CODING WORKFLOWS/session-wrap/` - Session wrap workflow
