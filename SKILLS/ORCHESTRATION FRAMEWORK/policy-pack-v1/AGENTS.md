# AGENTS.md (Policy Pack v1)

Purpose: Provide a model-agnostic baseline for how agents should operate in any repo.

## Core Principles
- Evidence-first: capture commands, outputs, artifacts, and review outcomes.
- Minimal diffs: keep changes scoped to the task acceptance criteria.
- Spec-first: require goals, non-goals, assumptions, and acceptance checks.
- Safe-by-default: no network or destructive actions without approval.

## Required Artifacts
- PLAN, TASKS, STATUS, DECISIONS, PRIORITIES
- Evidence capture (commands + outcomes)
- Review capture when risk triggers apply

## Autonomy Budget
- Scope: allowed files/paths and max diff size.
- Commands: explicit allowlist.
- Network: off by default; allowlist if approved.
- Stop conditions: ambiguity, failing tests, scope expansion.

## Modular Rules

Detailed rules are organized in the `rules/` subdirectory for easier customization:

| Rule File | Domain |
|-----------|--------|
| `rules/security.md` | Secrets, input validation, injection prevention |
| `rules/testing.md` | TDD workflow, coverage, verification evidence |
| `rules/git-workflow.md` | Commits, branches, PRs, reviews |
| `rules/coding-style.md` | File organization, immutability, documentation |
| `rules/agents.md` | Agent delegation and coordination |
| `rules/patterns.md` | Common code and API patterns |
| `rules/performance.md` | Context management, scope creep prevention |

See `rules/README.md` for customization guidance and per-project overrides.
