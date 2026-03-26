# Revised Roadmap — Post-Validation Execution Plan (2026-03-26)

## Purpose

This roadmap replaces the flat post-Phase-5 backlog with a milestone-based execution plan that:

- keeps runtime continuity as the architectural spine
- minimizes scope drift between phases and PRs
- inserts explicit review loops for architecture and code quality
- keeps context small by making each phase independently reviewable
- preserves a standard engineering flow: Align → Design → Implement → Prove → Review → Merge

This document is the durable planning artifact. `next-session.md` should remain the short operational summary.

## Current Baseline

- `main` is at `3fae08a`
- `v3.1.0` was released on GitHub
- `npm publish` is still blocked by missing `NPM_TOKEN`
- Validation coverage for the latest sprint landed on `main`
- Runtime continuity is only partially complete:
  - `FileSessionStore` persistence is validated
  - HTTP session reattachment is still not wired
- The canonical continuity anchor already exists:
  - `~/.evokore/sessions/{sessionId}.json`

## Core Architectural Position

The remaining roadmap should not be executed as independent features.

The correct dependency spine is:

1. **Operational closure**
2. **Runtime continuity**
3. **Security and operator controls**
4. **Scale / UX expansion**

The central architectural rule is:

> Every continuity-facing subsystem must build on the same session contract before expansion work begins.

That means:

- `HttpServer`
- `SessionIsolation`
- `FileSessionStore`
- Auto-memory
- Dashboard session filtering
- Redis session storage
- Telemetry
- HITL approval transport

must all align on one canonical session model rather than evolving in parallel.

## Execution Principles

### 1. Single-source-of-truth first

Do not add more session-adjacent features until the runtime session contract is explicit and wired.

### 2. One milestone, one primary architectural question

Each milestone should answer one dominant question:

- Can the system release cleanly?
- Can a session survive and be resumed correctly?
- Can the operator trust and govern the system?
- Can the system scale or stream safely?

### 3. Small PRs, milestone-level closure

Within a milestone, use multiple PRs only when the write surfaces are naturally separable.
Do not spread one architectural decision across many mixed PRs.

### 4. Review loops are part of the roadmap

ARCH-AEP and post-implementation review are not optional cleanup. They are phase gates.

### 5. Observability before distribution

Before Redis, WebSocket HITL, or container isolation expansion, ship the minimal telemetry and diagnostics needed to debug them.

## Milestone Overview

| Milestone | Name | Goal | Status |
|---|---|---|---|
| M0 | Release Closure | Complete release readiness and operator preflight | pending |
| M1 | Runtime Continuity Platform | Make session continuity real end-to-end | pending |
| M2 | Secure Operator Platform | Add trust boundaries, operator controls, and reviewable governance | pending |
| M3 | Scale and Real-Time Runtime | Add distributed/session scale features and live approval transport | pending |
| M4 | Continuous Improvement Loop | Formalize ARCH-AEP and code-review follow-through after each milestone | pending |

## Milestone M0 — Release Closure

### Objective

Close the release gap so GitHub release and npm publication are both controlled, testable, and repeatable.

### Scope

- Verify `NPM_TOKEN`
- Add a release readiness/preflight path
- Confirm version/tag/package alignment
- Make release failure states obvious to the operator

### Dependencies

- None

### Out of Scope

- Session architecture changes
- Dashboard auth
- Redis

### Recommended PR Slices

1. Release preflight / readiness command
2. NPM publish path verification and docs

### Exit Criteria

- Release path has explicit preflight checks
- `package.json`, git tag, and release workflow expectations are documented and validated
- Future sessions cannot mistake “GitHub release succeeded” for “full release succeeded”

## Milestone M1 — Runtime Continuity Platform

### Objective

Turn session continuity from evidence-backed components into real runtime behavior.

### Scope

- HTTP session reattachment
- Explicit session contract/schema
- Manifest/versioning rules
- Auto-memory integration on top of the session manifest
- Dashboard session filtering alignment with that same contract

### Dependencies

- M0 complete or at least stable enough not to distract the operator path

### Internal Dependency Order

1. Define the canonical session contract and lifecycle states
2. Wire `SessionIsolation.loadSession()` into `HttpServer`
3. Add end-to-end runtime reattachment tests
4. Align dashboard filtering to the same session identifiers/state
5. Make auto-memory event-driven from the same manifest/session-wrap boundary

### Out of Scope

- Redis distribution
- External telemetry shipping
- WebSocket HITL transport

### Recommended PR Slices

1. Session contract + runtime reattachment
2. Continuity validation and acceptance tests
3. Auto-memory trigger wiring
4. Dashboard session-filter alignment and validation hardening

### Exit Criteria

- Existing `mcp-session-id` values survive restart when persisted session state exists
- Session contract is documented and versioned
- Auto-memory consumes the canonical session manifest instead of separate state inference
- Dashboard session filtering uses the same session identity/lifecycle model

## Milestone M2 — Secure Operator Platform

### Objective

Add the trust and governance layer needed before broader scale/runtime expansion.

### Scope

- Dashboard auth and authorization
- Auditability for approvals and session operations
- Minimal internal telemetry for session and operator flows
- Container-based skill sandbox isolation design and initial implementation
- Supabase live validation as an operator-trust slice
- Dashboard validation/hardening against the already-landed auth/filtering surface

### Dependencies

- M1 complete

### Internal Dependency Order

1. Dashboard auth/authz contract and validation boundary normalization
2. Internal telemetry for session/auth/approval events
3. Supabase live validation under explicit credential-gated path
4. Sandbox isolation implementation against clarified trust boundaries

### Out of Scope

- Redis HA rollout
- Full external telemetry export
- Real-time approval transport

### Recommended PR Slices

1. Dashboard auth/authz validation and hardening
2. Internal telemetry and audit trail improvements
3. Supabase live validation
4. Container sandbox isolation

### Exit Criteria

- Dashboard access is authenticated and scoped
- Operator-relevant session/auth/approval events are observable
- Sandbox execution has a materially stronger isolation boundary than temp-dir subprocess execution
- External integrations are validated under opt-in credential flow

## Milestone M3 — Scale and Real-Time Runtime

### Objective

Expand the platform for multi-node/session scale and lower-latency human-in-the-loop workflows.

### Scope

- Redis `SessionStore` adapter
- Real-time WebSocket HITL approvals
- External telemetry reporting
- Stale worktree cleanup automation

### Dependencies

- M1 complete
- M2 substantially complete

### Internal Dependency Order

1. Redis session-store contract compatibility with the canonical session model
2. External telemetry schema based on already-shipped internal telemetry
3. WebSocket HITL approval transport built on the existing approval model and dashboard auth
4. Worktree cleanup automation as operational follow-through

### Out of Scope

- Reworking core session identity again
- Replacing the approval model entirely

### Recommended PR Slices

1. Redis `SessionStore`
2. Telemetry export / hardening
3. WebSocket HITL transport
4. Worktree automation

### Exit Criteria

- Session persistence can move beyond local file-backed storage
- Approval flows can operate in near real time without breaking governance
- Telemetry can be exported safely and intentionally
- Repo hygiene automation reduces operator cleanup overhead

## Milestone M4 — Continuous Improvement Loop

This milestone runs after every implementation milestone, not after the entire roadmap.

### Required Loops

#### Loop A — ARCH-AEP Align/Architecture Review

Run before implementation begins for each milestone or major phase.

Required outputs:

- architectural question being answered
- dependency map
- scope boundary
- acceptance criteria
- explicit non-goals
- PR slicing plan

#### Loop B — Implementation Phase

Implement only the approved slice.

Rules:

- one primary behavior change per PR
- avoid mixing docs/control-plane drift with runtime changes
- use fresh agents/worktrees when parallelism is needed
- keep write surfaces disjoint

#### Loop C — Prove / Validation Phase

Before PR publication or merge:

- targeted tests for the changed slice
- full relevant build/test pass for the milestone boundary
- operator evidence recorded in docs/session log or research artifact

#### Loop D — ARCH-AEP Review and Analysis

After implementation but before merge:

- architecture conformance check
- contract drift check
- dependency check against the roadmap
- “did we accidentally expand scope?” check

#### Loop E — Code Review / Hardening Loop

After ARCH-AEP review:

- full code review pass
- risk-focused review for security, resilience, and operational regressions
- tighten tests/docs/contracts before merge

#### Loop F — Post-Merge Stabilization

After each phase lands:

- rerun relevant validation on updated `main`
- refresh handoff docs
- record any new operator learnings in `CLAUDE.md`
- confirm next phase still has the same boundary

## Standard Phase Template

Every future phase should follow this template:

1. **Align**
   - restate objective
   - restate non-goals
   - define acceptance criteria
2. **Research**
   - inspect current implementation and prior research
   - record dependencies and risks
3. **Architecture**
   - decide contract changes and boundaries
   - define PR slicing
4. **Implement**
   - build only the approved slice
5. **Prove**
   - run targeted validation
   - collect evidence
6. **ARCH-AEP Review**
   - architecture review against scope and contracts
7. **Code Review / Analysis**
   - bug/risk/regression review
8. **Merge + Stabilize**
   - merge sequentially
   - revalidate on `main`
   - refresh handoff docs

## Scope-Drift Controls

### Phase-Level Drift Controls

- Every phase must have a single owner question and explicit non-goals
- If a task requires changing more than one architectural contract, it is too large for one phase
- If the PR body needs “also” more than twice, the phase is too broad

### PR-Level Drift Controls

- One runtime concern per PR
- One docs/control-plane PR after a multi-PR milestone, not mixed into each feature PR
- Do not mix validation-only additions with unrelated runtime implementation unless the test is inseparable from the change

### Context Controls

- Use fresh agents per phase or per narrowly scoped subtask
- Maintain a single short milestone summary in `next-session.md`
- Put full rationale in a dedicated roadmap/research artifact, not in the handoff file

## Dependency Map Summary

### Hard Dependencies

- Auto-memory depends on the canonical session manifest and should follow HTTP session reattachment
- Dashboard session filtering depends on stable session identity/lifecycle definitions
- Redis session storage depends on the same canonical session contract
- WebSocket HITL depends on dashboard auth and approval governance
- External telemetry should follow internal event/metric clarity, not precede it
- Container sandbox isolation should land before broader plugin/skill trust expansion

### Soft Dependencies

- Supabase validation can run during M2 once operator auth/credential discipline is in place
- Worktree cleanup automation can be deferred, but should not precede the bigger runtime/governance gaps

## Recommended Immediate Execution Order

1. M0: Release Closure
2. ARCH-AEP checkpoint: normalize phase names, non-goals, and exit criteria before Phase 6 starts
3. M1.1: Canonical session contract + HTTP reattachment
4. M1.2: Auto-memory event trigger on session-wrap boundary
5. M1.3: Dashboard session-filter alignment and validation hardening
6. ARCH-AEP review after the full M1 wave
7. M2.1: Dashboard auth/authz validation and hardening
8. M2.2: Internal telemetry and auditability
9. M2.3: Supabase live validation
10. M2.4: Container sandbox isolation
11. ARCH-AEP review after the full M2 wave
12. M3.1: Redis `SessionStore`
13. M3.2: Telemetry export / hardening
14. M3.3: WebSocket HITL approvals
15. M3.4: Worktree cleanup automation

## What Not To Do

- Do not start Redis before the canonical session contract is finalized
- Do not start WebSocket HITL before dashboard auth and approval governance are stable
- Do not treat external telemetry as the first observability slice
- Do not mix milestone-planning docs with implementation PRs unless the roadmap itself changed
- Do not relabel existing partial implementations as brand-new greenfield work; use validation/hardening language where the base feature already exists

## Deliverables To Maintain

- `next-session.md`: short restart summary
- `docs/research/revised-roadmap-2026-03-26.md`: full roadmap truth source
- session log per milestone/phase
- `CLAUDE.md`: operational learnings only, not milestone planning
