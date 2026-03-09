# Modular Rules Index

Purpose: Provide a modular, customizable rule set for agent behavior governance.

## Overview

Rules in this directory define specific behavioral constraints and requirements for agents operating under Policy Pack v1. Each rule file focuses on a single domain, enabling:

- **Selective adoption**: Projects can adopt rules incrementally
- **Easy customization**: Override or extend rules per project needs
- **Clear ownership**: Each domain has defined scope and maintainer
- **Audit trail**: Changes to rules are tracked and versioned

## Rule Files

| File | Domain | Description |
|------|--------|-------------|
| `security.md` | Security | Secrets handling, input validation, injection prevention |
| `testing.md` | Testing | TDD workflow, coverage requirements, verification evidence |
| `git-workflow.md` | Git | Commits, branches, PRs, reviews |
| `coding-style.md` | Code Style | File organization, immutability, documentation |
| `agents.md` | Agent Ops | Agent delegation and coordination |
| `patterns.md` | Patterns | Common code and API patterns |
| `performance.md` | Efficiency | Context management, scope creep prevention |

---

## Rule Index

### Core Rules

- **[security](./security.md)** - Security rules
  - Secrets handling, input validation, injection prevention

- **[testing](./testing.md)** - Testing rules
  - TDD workflow, coverage requirements, verification evidence

- **[git-workflow](./git-workflow.md)** - Git workflow rules
  - Commits, branches, PRs, reviews

- **[coding-style](./coding-style.md)** - Coding style rules
  - File organization, immutability, documentation

### Agent Operations

- **[agents](./agents.md)** - Agent delegation rules
  - When to delegate to subagents
  - Agent selection criteria
  - Parallel execution guidelines
  - Escalation patterns

### Code Standards

- **[patterns](./patterns.md)** - Common patterns rules
  - API response format standards
  - Error handling conventions
  - Logging patterns
  - Configuration management

### Efficiency

- **[performance](./performance.md)** - Performance rules
  - Context management (keep focused)
  - Efficient tool usage
  - Avoid redundant operations
  - Scope creep prevention

---

## How Rules Apply

### Default Behavior

All rules in this directory apply by default when Policy Pack v1 is active. Agents should:

1. Load all rule files at session start
2. Apply rules throughout task execution
3. Document any rule deviations with rationale

### Per-Project Customization

Projects can customize rules by:

1. **Override file**: Create a rules override file in project root
2. **Selective disable**: List rules to skip with justification
3. **Extensions**: Add project-specific rules that augment defaults

### Rule Precedence

1. Project-specific overrides (highest)
2. Policy Pack rules (this directory)
3. Task-specific constraints (in TASKS.md)
4. Core principles (lowest, always apply)

### Enforcement
- Rules are guidance, not hard blocks
- Document deviations with rationale
- Escalate if rule conflicts with task

## Rule Structure

Each rule file follows this structure:

```markdown
# [Domain] Rules

Purpose: <one-line description>

Related docs:
- <related-file-1>
- <related-file-2>

---

## Rules
Numbered list of specific rules.

## Enforcement
How agents should enforce these rules.

## Exceptions
Valid reasons to deviate (with documentation requirements).

## Evidence Capture
What to log when applying these rules.

## Cross-References
Links to related documents.
```

## Adding New Rules

1. Create new `.md` file in this directory
2. Follow the rule structure template above
3. Update this index with the new rule file
4. Document in `AGENTS.md` reference section

## Cross-References

- Parent policy: `../AGENTS.md`
- Evidence requirements: `../EVIDENCE.md`
- Risk triggers: `../RISK_TRIGGERS.md`
- Acceptance checks: `../ACCEPTANCE_CHECKS.md`
