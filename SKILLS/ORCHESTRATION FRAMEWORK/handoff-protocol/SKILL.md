---
name: handoff-protocol
description: Structured handoff protocol for multi-session agent orchestration with evidence capture
category: Orchestration Framework
metadata:
  version: "1.0"
  source: "Agent33"
  tags: ["orchestration", "handoff", "evidence", "session-management"]
---

# Handoff Protocol

A structured protocol for managing multi-session agent orchestration. This protocol ensures continuity between sessions, captures evidence of work performed, and provides templates for common orchestration activities.

## Overview

The handoff protocol defines how agents pass context between sessions. It covers:

- **Session state**: What was done, what is in progress, what is next
- **Evidence capture**: Commands run, outputs observed, artifacts created
- **Review workflows**: When and how to request reviews
- **Escalation paths**: When to escalate issues to higher authority

## Documents

### Core State Files

| Document | Purpose |
|----------|---------|
| [STATUS.md](./STATUS.md) | Runtime assumptions, constraints, and current context |
| [PLAN.md](./PLAN.md) | Objectives, success criteria, and project-level constraints |
| [TASKS.md](./TASKS.md) | Task queue, status tracking, and task template |
| [DECISIONS.md](./DECISIONS.md) | Architecture decision log with rationale |
| [PRIORITIES.md](./PRIORITIES.md) | Rolling horizon priorities (2-4 week window) |

### Workflow Guides

| Document | Purpose |
|----------|---------|
| [SPEC_FIRST_CHECKLIST.md](./SPEC_FIRST_CHECKLIST.md) | Pre-implementation checklist to lock scope and acceptance criteria |
| [AUTONOMY_BUDGET.md](./AUTONOMY_BUDGET.md) | Per-task scope, allowed actions, and escalation triggers |
| [HARNESS_INITIALIZER.md](./HARNESS_INITIALIZER.md) | Session initialization steps and clean-state protocol |
| [PROGRESS_LOG_FORMAT.md](./PROGRESS_LOG_FORMAT.md) | Progress log fields and rotation guidance |

### Evidence and Review

| Document | Purpose |
|----------|---------|
| [EVIDENCE_CAPTURE.md](./EVIDENCE_CAPTURE.md) | Template for recording commands and verification outcomes |
| [REVIEW_CAPTURE.md](./REVIEW_CAPTURE.md) | Template for capturing review inputs and resolutions |
| [REVIEW_CHECKLIST.md](./REVIEW_CHECKLIST.md) | Quick-reference review checklist with risk triggers |
| [SESSION_WRAP.md](./SESSION_WRAP.md) | End-of-session wrap-up template |

### Governance

| Document | Purpose |
|----------|---------|
| [DEFINITION_OF_DONE.md](./DEFINITION_OF_DONE.md) | Checklist for task completion |
| [ESCALATION_PATHS.md](./ESCALATION_PATHS.md) | When and how to escalate issues |

## Quick Start

1. **Start a session**: Read `STATUS.md`, `PLAN.md`, `TASKS.md` to load context
2. **Pick a task**: Follow the task template in `TASKS.md`
3. **Use spec-first**: Complete `SPEC_FIRST_CHECKLIST.md` before implementation
4. **Capture evidence**: Use `EVIDENCE_CAPTURE.md` for verification
5. **Wrap up**: Complete `SESSION_WRAP.md` at end of session

## Workflow (AEP)

1. **Align**: Define scope and acceptance checks
2. **Execute**: Implement minimal changes and log progress
3. **Prove**: Run verification and capture evidence
