---
name: orchestration-framework
description: Core orchestration framework for model-agnostic multi-agent workflows with handoff protocol, policy governance, and configuration schemas
category: Orchestration Framework
metadata:
  version: "1.0"
  source: "Agent33"
  tags: ["orchestration", "multi-agent", "handoff", "policy", "governance"]
---

# Orchestration Framework

This index connects the core orchestration system, AEP workflow, and reusable governance assets. Migrated from the Agent33 orchestration protocol and adapted for EVOKORE-MCP.

## Model-Agnostic Principle

All guidance is written to be model-neutral. If a task requires a specific tool or model, document it in TASKS.

## Sub-Skills

| Skill | Description |
|-------|-------------|
| [handoff-protocol/](./handoff-protocol/SKILL.md) | Structured handoff protocol for multi-session orchestration |
| [policy-pack-v1/](./policy-pack-v1/SKILL.md) | Agent behavior policies, evidence requirements, and modular rules |
| [schemas/](./schemas/SKILL.md) | JSON schemas for agents, workflows, and orchestrator configuration |

## Orchestration (Handoff Protocol)

- `handoff-protocol/STATUS.md` - Runtime assumptions and constraints
- `handoff-protocol/PLAN.md` - Objectives and success criteria
- `handoff-protocol/TASKS.md` - Task queue and status
- `handoff-protocol/DEFINITION_OF_DONE.md` - Task completion checklist
- `handoff-protocol/REVIEW_CAPTURE.md` - Review capture template
- `handoff-protocol/REVIEW_CHECKLIST.md` - Review checklist with risk triggers
- `handoff-protocol/SESSION_WRAP.md` - End-of-session wrap template
- `handoff-protocol/PRIORITIES.md` - Rolling horizon priorities
- `handoff-protocol/SPEC_FIRST_CHECKLIST.md` - Pre-implementation scope checklist
- `handoff-protocol/AUTONOMY_BUDGET.md` - Per-task autonomy boundaries
- `handoff-protocol/HARNESS_INITIALIZER.md` - Session initialization protocol
- `handoff-protocol/PROGRESS_LOG_FORMAT.md` - Progress log format and rotation
- `handoff-protocol/EVIDENCE_CAPTURE.md` - Evidence capture template
- `handoff-protocol/DECISIONS.md` - Architecture decision log
- `handoff-protocol/ESCALATION_PATHS.md` - Escalation decision guide

## Policy Pack

- `policy-pack-v1/AGENTS.md` - Agent behavior principles
- `policy-pack-v1/ORCHESTRATION.md` - Handoff protocol standard
- `policy-pack-v1/EVIDENCE.md` - Evidence requirements
- `policy-pack-v1/RISK_TRIGGERS.md` - Review trigger conditions
- `policy-pack-v1/ACCEPTANCE_CHECKS.md` - Acceptance checks per change type
- `policy-pack-v1/PROMOTION_GUIDE.md` - Asset promotion rules

## Modular Rules

- `policy-pack-v1/rules/README.md` - Rules index and customization guide
- `policy-pack-v1/rules/security.md` - Security rules
- `policy-pack-v1/rules/testing.md` - Testing rules
- `policy-pack-v1/rules/git-workflow.md` - Git workflow rules
- `policy-pack-v1/rules/coding-style.md` - Coding style rules
- `policy-pack-v1/rules/agents.md` - Agent delegation rules
- `policy-pack-v1/rules/patterns.md` - Common patterns rules
- `policy-pack-v1/rules/performance.md` - Performance and efficiency rules

## Configuration Schemas

- `schemas/agent.schema.json` - Agent definition schema
- `schemas/workflow.schema.json` - Workflow definition schema
- `schemas/orchestrator.schema.json` - Orchestrator configuration schema

## AEP Workflow

The Align-Execute-Prove (AEP) workflow is the core operating model:

1. **Align**: Define scope and acceptance checks using `SPEC_FIRST_CHECKLIST.md`
2. **Execute**: Implement minimal changes, log progress using `PROGRESS_LOG_FORMAT.md`
3. **Prove**: Run verification, capture evidence using `EVIDENCE_CAPTURE.md`

## Quick Start

1. Read `handoff-protocol/STATUS.md` + `handoff-protocol/PLAN.md` + `handoff-protocol/TASKS.md` to load context
2. Review `policy-pack-v1/RISK_TRIGGERS.md` to understand review requirements
3. Pick a task from `handoff-protocol/TASKS.md` and follow the task template
4. Use spec-first workflow: complete `handoff-protocol/SPEC_FIRST_CHECKLIST.md`
5. Capture evidence: use `handoff-protocol/EVIDENCE_CAPTURE.md`
6. Wrap session: complete `handoff-protocol/SESSION_WRAP.md`
