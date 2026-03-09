---
name: aep-framework
description: Agile Engineering Process (Align-Execute-Prove) methodology with phase planning, test matrices, and evaluation harnesses
category: Orchestration Framework
metadata:
  version: "1.0"
  source: "Agent33"
  tags: ["methodology", "AEP", "agile", "planning", "verification", "evaluation"]
---

# AEP Framework (Align-Execute-Prove)

The AEP framework is a structured engineering methodology for agentic workflows. It organizes work into three repeating phases:

## The AEP Cycle

### 1. Align (Scope Lock)
Lock the scope before any work begins. Define the PR range, time window, and inputs. Freeze all references so the cycle operates on a stable baseline.

- Define phase goals and constraints
- Freeze inputs (refinement reports, PR lists, backlogs)
- Document dependencies and risks in `phase-planning.md`
- Establish acceptance criteria using `templates.md`

### 2. Execute (Implement)
Carry out remediation in severity-tiered order (Critical > High > Medium > Low). Each tier must be fully verified before advancing to the next.

- Generate small, reviewable PRs (one theme per PR)
- Follow branch naming and commit conventions from `templates.md`
- Select tests per change type using `test-matrix.md`
- Track progress in the backlog and tracker tables

### 3. Prove (Verify with Evidence)
Every merged fix requires auditable verification evidence. No tier closes without proof.

- Capture build/test commands and results in `verification-log.md`
- Evaluate orchestration quality using `evaluation-harness.md`
- Record pass/fail against golden tasks and metrics
- Archive evidence in session logs

## Documents in This Skill

| File | Purpose | AEP Phase |
|------|---------|-----------|
| `workflow.md` | Full AEP process definition with roles, triggers, and guardrails | All |
| `templates.md` | Conventions for finding IDs, branches, trackers, and rubrics | Align |
| `phase-planning.md` | Long-running planning record template for a cycle | Align |
| `test-matrix.md` | Test selection strategy with agent-specific guidance | Execute / Prove |
| `verification-log.md` | Evidence tracking for build/test results per PR | Prove |
| `evaluation-harness.md` | Golden tasks, golden cases, metrics, and evaluation playbook | Prove |

## Integration with Other Skills

### Handoff Protocol
The AEP workflow's ownership handoff rules (reassign after 2 inactive sessions, short note with status/next-action/last-verification) align with the handoff protocol skill. When using AEP with multi-agent orchestration, use the handoff protocol for agent-to-agent transitions and AEP's tracker for finding-level ownership.

See: `SKILLS/ORCHESTRATION FRAMEWORK/handoff-protocol/` (if available)

### Policy Pack
The AEP acceptance checks, scope lock enforcement, and tier-close checklists complement the policy pack's governance rules. The evaluation harness references acceptance check patterns that can be sourced from the policy pack.

See: `SKILLS/ORCHESTRATION FRAMEWORK/policy-pack/` (if available)

## Quick Start

1. **Starting a cycle**: Copy `phase-planning.md` and fill in cycle metadata and phase goals.
2. **Tracking findings**: Use the finding ID format from `templates.md` (`AEP-YYYYMMDD-PRNNN-SEQ`).
3. **Selecting tests**: Consult `test-matrix.md` for which tests to run based on change type.
4. **Recording evidence**: Log every verification in `verification-log.md` with command, result, and rationale.
5. **Evaluating quality**: Run golden tasks from `evaluation-harness.md` to measure orchestration effectiveness.
