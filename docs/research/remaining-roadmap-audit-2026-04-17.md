# Remaining Roadmap Audit — 2026-04-17

## Purpose

Reconcile the live repository state with the control-plane docs before starting
another implementation wave.

## Evidence

### Open PR audit

Command:

```powershell
gh pr list --repo mattmre/EVOKORE-MCP --state open --json number,title,headRefName
```

Result:

- `[]`

Interpretation:

- There are no open PRs to review, comment on, fix, or merge at the moment.

### Local repo state

Commands:

```powershell
git status --short --branch
git rev-parse --short HEAD
git worktree list
```

Results:

- branch clean on `main`
- `HEAD`: `7ba93ef`
- only the root worktree is present

### Recent merged work beyond stale handoff

Recent history:

- `50f15af` — PR `#270` Wave 4 skills import wave 2
- `a059df2` — PR `#272` browser skill + authoring guidance
- `db9b7fa` — PR `#273` ComplianceChecker / codemods / ADR 0004
- `d76c415` — PR `#274` plugin manifest support
- `fc98795` — PR `#275` reusable CI/CD workflows
- `111194b` — PR `#276` OrchestrationRuntime
- `7ba93ef` — PR `#277` expand CLI sync to Copilot and Codex

Interpretation:

- The queue in `next-session.md` is materially stale because multiple items it
  still labels pending are already merged on `main`.

## Drift Identified

### Control-plane drift

- `next-session.md` still lists Wave 4 SKILLS-PR-2/3, Wave 7, Wave 8, and Wave
  9 as pending
- `task_plan.md` is still anchored to the old Phase 4C starting point
- `progress.md` and `docs/session-logs/` have not been refreshed for the post-
  `#270` through `#277` work

### Technical backlog drift

- `scripts/check-vector-trigger.js` is referenced by:
  - `next-session.md`
  - `docs/adr/0004-vector-memory-trigger.md`
- but the script does not exist yet

- Multiple tests still carry `TODO(BUG-28)` markers and source-structure
  assertions, for example:
  - `tests/integration/file-session-store-validation.test.ts`
  - `tests/integration/skill-fetch.test.ts`
  - `tests/integration/skill-registry.test.ts`
  - `tests/integration/stt-whisper-validation.test.ts`

- `docs/research/repo-review-2026-04-04.md` claims `BUG-28 fully resolved`,
  which conflicts with the live test files above. That review note should not be
  treated as the sole source of truth for BUG-28 closure.

## Actual Remaining Work

### 1. Control-plane sync

Refresh the durable handoff artifacts so the repo reflects reality after PRs
`#270`-`#277`.

### 2. Security slice A

Primary source: `docs/research/repo-review-2026-04-04.md`

- `SEC-01` approval token exposure
- `DX-05` pending-approval documentation mismatch
- optionally `SEC-02` if it stays tightly scoped

### 3. Security slice B

Primary source: `docs/research/repo-review-2026-04-04.md`

- `SEC-03` shared `httpUtils.ts` SSRF hardening
- `SEC-04` telemetry export URL hardening

### 4. Reliability slice

Primary source: `docs/research/repo-review-2026-04-04.md`

- `REL-01`, `REL-02`, `REL-03`
- `OPS-01`, `OPS-05`

### 5. BUG-28 remainder

Convert remaining source-scraping tests to behavioral coverage in small,
sequential PRs if needed.

### 6. Vector gate instrumentation

Implement the measurement script and gate reporting only. Do not start vector
memory implementation unless the gate conditions actually trip.

### 7. npm publication follow-up

Still operator-gated on `NPM_TOKEN`. This remains a release-state action, not an
application-code-first task.

## Recommended Execution Order

1. Docs/control-plane sync
2. `SEC-01` approval-token exposure
3. shared SSRF hardening
4. `HttpServer` / reconnect lifecycle fixes
5. BUG-28 conversion wave(s)
6. vector-trigger instrumentation
7. npm publish closure after operator action

## What Not To Do

- Do not pretend there are open PRs to review when GitHub says there are none
- Do not start vector memory implementation ahead of the gate
- Do not mix the control-plane refresh with security/runtime code fixes
- Do not close BUG-28 based on one research note while TODO-marked tests remain
