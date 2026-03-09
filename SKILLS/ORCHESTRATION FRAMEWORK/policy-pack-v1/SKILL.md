---
name: policy-pack-v1
description: Model-agnostic policy pack defining agent behavior, evidence requirements, and modular rules
category: Orchestration Framework
metadata:
  version: "1.0"
  source: "Agent33"
  tags: ["orchestration", "policy", "rules", "governance", "evidence"]
---

# Policy Pack v1

A comprehensive, model-agnostic policy pack that defines how agents should operate in any repository. It provides governance for agent behavior, evidence capture requirements, risk assessment, and modular rules that can be selectively adopted per project.

## Overview

Policy Pack v1 establishes baseline standards for:

- **Agent behavior**: Core principles and autonomy boundaries
- **Evidence capture**: Minimum evidence requirements for changes
- **Risk assessment**: Triggers that require review before completion
- **Acceptance checks**: Default checks per change type
- **Promotion criteria**: Rules for promoting assets to shared libraries

## Documents

### Core Policies

| Document | Purpose |
|----------|---------|
| [AGENTS.md](./AGENTS.md) | Core principles and autonomy baseline for agents |
| [ORCHESTRATION.md](./ORCHESTRATION.md) | Standard handoff protocol and AEP workflow |
| [EVIDENCE.md](./EVIDENCE.md) | Minimum evidence requirements for changes |
| [ACCEPTANCE_CHECKS.md](./ACCEPTANCE_CHECKS.md) | Default acceptance checks per change type |
| [RISK_TRIGGERS.md](./RISK_TRIGGERS.md) | Changes that require review before completion |
| [PROMOTION_GUIDE.md](./PROMOTION_GUIDE.md) | Rules for promoting reusable assets |

### Modular Rules

Rules are organized in the `rules/` subdirectory for selective adoption:

| Rule | Domain |
|------|--------|
| [rules/security.md](./rules/security.md) | Secrets, input validation, injection prevention |
| [rules/testing.md](./rules/testing.md) | TDD workflow, coverage, verification evidence |
| [rules/git-workflow.md](./rules/git-workflow.md) | Commits, branches, PRs, reviews |
| [rules/coding-style.md](./rules/coding-style.md) | File organization, immutability, documentation |
| [rules/agents.md](./rules/agents.md) | Agent delegation and coordination |
| [rules/patterns.md](./rules/patterns.md) | API response formats, error handling, logging |
| [rules/performance.md](./rules/performance.md) | Context management, scope creep prevention |

See [rules/README.md](./rules/README.md) for the full index and customization guidance.

## Quick Start

1. Read `AGENTS.md` for core principles
2. Review `RISK_TRIGGERS.md` to understand when reviews are needed
3. Use `EVIDENCE.md` to understand minimum evidence requirements
4. Adopt rules from `rules/` incrementally as needed
