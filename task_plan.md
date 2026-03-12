---
name: sequential-orchestration-checklist
description: Strict execution order for stabilization, roadmap implementation, PR slicing, and handoff persistence.
---

# Task Plan: Sequential Orchestration Checklist

## Goal
Create a durable, crash-safe execution plan for the remaining EVOKORE-MCP and Agent33 work, then execute the work in strict sequence with documented research, implementation, verification, PR slicing, and session continuity updates.

## Current Phase
Complete

## Phases

### Phase 1: Persisted Planning and Current-State Validation
- [x] Create `task_plan.md`, `findings.md`, and `progress.md`
- [x] Save the strict ordered checklist to disk
- [x] Validate current git/PR/worktree state before execution
- [x] Document findings in `findings.md`
- **Status:** complete

### Phase 2: Live Queue Reconciliation
- [x] Verify archived stabilization PR state for `#81-#85`
- [x] Review PR `#86`
- [x] Fix repo-wide security scan workflow blocker
- [x] Review PR `#88`
- [x] Review PR `#89`
- [x] Review PR `#90`
- [x] Review PR `#87`
- [x] Define merge/reconcile order and post-merge verification gates
- [x] Land or reconcile each active item on `main`
- **Status:** complete

### Phase 3: Skill Indexing Architecture Decision
- [x] Research current `SkillManager.loadSkills()` behavior and tests
- [x] Decide recursive indexing vs intentional 2-level boundary
- [x] Document rationale in `docs/research/`
- [x] Implement the chosen architecture if code changes are needed
- [x] Validate startup/search performance and regression coverage
- **Status:** complete

### Phase 4: Agent33 Roadmap Execution
- [x] Convert Agent33 improvement doc into executable dependency order
- [x] Process each roadmap item in strict sequence with full cycles
- [x] Create one PR-ready slice per roadmap item/phase
- [x] Capture research and implementation notes in `docs/research/`
- [x] Update progress after each slice
- **Status:** complete

### Phase 5: Session Continuity and Handoff
- [x] Update session log in `docs/session-logs/`
- [x] Update `next-session.md`
- [x] Update `CLAUDE.md`
- [x] Ensure persistent artifacts reflect final status
- [x] Deliver concise status and remaining blockers to user
- **Status:** complete

### Phase 6: Post-Roadmap Repo Hygiene
- [x] Remove stale auxiliary worktrees after roadmap completion
- [x] Realign local `main` to `origin/main`
- [x] Prune merged local roadmap and agent branches
- [x] Persist cleanup results to the root control plane
- **Status:** complete

### Phase 7: Post-Roadmap Branch Reconciliation and Repo-Control Follow-Through
- [x] Audit stale local and remote branches against `main` and GitHub PR state
- [x] Reconcile unmerged `feature/damage-control-expansion` work onto current `main`
- [x] Implement repo-state/startup audit automation for branch, worktree, and handoff drift
- [x] Prepare one PR per executable slice and run `pr-manager` review preparation
- [x] Update session log and handoff artifacts after PR publication
- **Status:** complete

### Phase 8: Post-PR Merge Verification and Cleanup Closeout
- [x] Review, merge, and verify PR `#104` on merged `main`
- [x] Refresh PR `#105` onto merged `main`, rerun validation, and merge it
- [x] Run `npm run repo:audit` from merged `main` before and after cleanup
- [x] Prune explicitly-accounted local branches, remote branches, and disposable worktrees
- [x] Move the dirty root handoff worktree off stale `feature/damage-control-expansion`
- **Status:** complete

## Strict Execution Order

### 0. Control Plane
- [ ] T00: Validate repo state (`git status`, branch, worktrees, open PR context)
  - Blockers: unknown local drift, stale locks, abandoned worktrees
  - Dependencies: none
  - Deliverables: current-state snapshot in `findings.md` and `progress.md`

### 1. Queue Reconciliation
- [x] T00: Validate repo state (`git status`, branch, worktrees, open PR context)
  - Blockers: unknown local drift, stale locks, abandoned worktrees
  - Dependencies: none
  - Deliverables: current-state snapshot in `findings.md` and `progress.md`
- [x] T01: Verify archived stabilization queue `#81-#85`
  - Blockers: stale docs could disagree with GitHub
  - Dependencies: T00
  - Deliverables: merged-state confirmation and checklist correction
- [x] T02: Review PR `#86` documentation sync and orphaned references
  - Blockers: rerun CI after remediation, confirm helper-file deletion is the only required fix
  - Dependencies: T01
  - Full cycle: review -> validate -> merge/reconcile -> verify `main`
- [x] T02A: Fix repo-wide security scan workflow blocker
  - Blockers: root cause not yet isolated in workflow/tooling, may require a dedicated CI-fix PR before queue can land cleanly
  - Dependencies: T02
  - Full cycle: reproduce -> isolate workflow failure -> implement fix -> rerun -> document
- [x] T03: Review PR `#88` Agent33 reverse improvements
  - Blockers: failing CI, scope creep across hooks/status/docs
  - Dependencies: T02A
  - Full cycle: review -> validate -> merge/reconcile -> verify `main`
- [x] T04: Review PR `#89` voice sidecar hardening
  - Blockers: failing CI, security/regression risk, platform behavior
  - Dependencies: T03
  - Full cycle: review -> validate -> merge/reconcile -> verify `main`
- [x] T05: Review PR `#90` recursive skill indexing with weighted search
  - Blockers: failing CI, search-performance risk, architecture fit
  - Dependencies: T04
  - Full cycle: review -> validate -> merge/reconcile -> verify `main`
- [x] T06: Review PR `#87` skill-index performance monitoring
  - Blockers: failing CI, metric-design drift, overlap with recursive indexing work
  - Dependencies: T05
  - Full cycle: review -> validate -> merge/reconcile -> verify `main`
- [x] T07: Post-queue `main` verification run
  - Blockers: any failed merge or unresolved regression
  - Dependencies: T02, T02A, T03, T04, T05, T06
  - Full cycle: aggregate verification -> document final queue state

### 2. EVOKORE Decision/Hardening Follow-Through
- [x] T08: Skill indexing architecture decision
  - Blockers: insufficient performance evidence, ambiguity in desired UX
  - Dependencies: T05, T06, T07
  - Full cycle: research -> decision memo -> implementation/no-op ratification -> tests
- [x] T09: Skill indexing performance validation
  - Blockers: startup count/search telemetry unavailable
  - Dependencies: T08
  - Full cycle: benchmark -> analyze -> document -> tune if required

### 3. Agent33 Roadmap, Strict Dependency Chain
- [x] T10: Hooks system port
  - Blockers: cleared and merged in PR `#92`
  - Dependencies: T07
  - Full cycle: research -> implement -> test -> docs -> PR
- [x] T11: Fail-safe design principles adoption
  - Blockers: cleared and merged in PR `#93`
  - Dependencies: T10
  - Full cycle: research -> implement -> test -> docs -> PR
- [x] T12: HITL approval token flow
  - Blockers: cleared and merged in PR `#94`
  - Dependencies: T11
  - Full cycle: research -> implement -> test -> docs -> PR
- [x] T13: Dynamic tool discovery
  - Blockers: cleared and merged in PR `#95`
  - Dependencies: T12
  - Full cycle: research -> implement -> test -> docs -> PR
- [x] T14: Skills library architecture/import
  - Blockers: cleared and merged in PR `#96`
  - Dependencies: T13
  - Full cycle: research -> scope import -> implement -> test -> docs -> PR
- [x] T15: Multi-server MCP aggregation
  - Blockers: cleared and merged in PR `#97`
  - Dependencies: T12, T13, T14
  - Full cycle: research -> implement -> test -> docs -> PR
- [x] T16: Semantic skill resolution
  - Blockers: cleared and merged in PR `#98`
  - Dependencies: T14, T15
  - Full cycle: research -> implement -> test -> docs -> PR
- [x] T17: Cross-CLI configuration sync
  - Blockers: cleared and merged in PR `#99`
  - Dependencies: T15
  - Full cycle: research -> implement -> test -> docs -> PR
- [x] T18: Session continuity architecture
  - Blockers: cleared and merged in PR `#100`
  - Dependencies: T10, T11
  - Full cycle: research -> implement -> test -> docs -> PR
- [x] T19: Auto-memory system
  - Blockers: cleared and merged in PR `#101`
  - Dependencies: T18
  - Full cycle: research -> implement -> docs -> PR
- [x] T20: Voice sidecar
  - Blockers: cleared and merged in PR `#103`
  - Dependencies: T15
  - Full cycle: research -> implement -> test -> docs -> PR
- [x] T21: Live status line display
  - Blockers: cleared and merged in PR `#102`
  - Dependencies: T10, T18
  - Full cycle: research -> implement -> test -> docs -> PR

## Critical Path

## Execution Sequence

1. [x] `T10` Hooks system port
   Blockers cleared by this slice: canonical lifecycle layout, hook wiring parity, runtime entrypoint drift
2. [x] `T11` Fail-safe design principles adoption
   Depends on: `T10`
3. [x] `T12` HITL approval token flow
   Depends on: `T11`
4. [x] `T13` Dynamic tool discovery
   Depends on: `T12`
5. [x] `T14` Skills library architecture/import
   Depends on: `T13`
6. [x] `T15` Multi-server MCP aggregation
   Depends on: `T12`, `T13`, `T14`
7. [x] `T16` Semantic skill resolution
   Depends on: `T14`, `T15`
8. [x] `T17` Cross-CLI configuration sync
   Depends on: `T15`
9. [x] `T18` Session continuity architecture
   Depends on: `T10`, `T11`
10. [x] `T19` Auto-memory system
    Depends on: `T18`
11. [x] `T20` Voice sidecar follow-through
    Depends on: `T15`
12. [x] `T21` Live status line display
    Depends on: `T10`, `T18`
13. [x] `T22` Session-wrap updates
    Depends on: all completed slices in the current execution window

## Immediate Blocker Map

- No active blockers remain in the roadmap chain.
- No active repo-hygiene blockers remain. Final `repo:audit` reports zero stale local branches, zero stale remote branches, zero open PRs, and only expected local control-plane drift on `handoff/post-pr105-session`.

### Core Chain
- [x] C1: T10 Hooks system port
- [x] C2: T11 Fail-safe design principles adoption
- [x] C3: T12 HITL approval token flow
- [x] C4: T13 Dynamic tool discovery
- [x] C5: T14 Skills library architecture/import

### Branch A: Aggregation and Retrieval
- [x] C6A: T15 Multi-server MCP aggregation
- [x] C7A: T16 Semantic skill resolution
- [x] C8A: T17 Cross-CLI configuration sync

### Branch B: Continuity and Operator UX
- [x] C6B: T18 Session continuity architecture
- [x] C7B: T19 Auto-memory system
- [x] C8B: T21 Live status line display

### Branch C: Voice Follow-Through
- [x] C6C: T20 Voice sidecar follow-through

### Finalization
- [x] C9: T22 Session-wrap updates

## Current Execution Slice

- [x] Slice 1: T10 Hooks system port
  - Objective: align EVOKORE with the canonical Agent33 hook layout and lifecycle contract without regressing current behavior
  - Deliverable: dedicated PR for canonical `scripts/hooks/` runtime plus compatibility coverage, tests, docs, and updated hook wiring
  - Result: merged in PR `#92` as commit `f259b5b`
- [x] Slice 2: T11 Fail-safe design principles adoption
  - Objective: formalize fail-safe guarantees consistently across all canonical hook entrypoints after `T10` lands
  - Result: merged in PR `#93` as commit `129d153`
- [x] Slice 3: T12 HITL approval token flow
  - Objective: harden the existing HITL contract so approval-token schema injection is universal across proxied tools
  - Result: merged in PR `#94` as commit `a3b279b`
- [x] Gate 3: review and merge PR `#94`
  - Why: kept the critical path linear before starting `T13`
- [x] Slice 4: T13 Dynamic tool discovery
  - Objective: formalize tool activation and registry discovery behavior after `T12` lands
  - Result: merged in PR `#95` as commit `7c9412c`
- [x] Gate 4: refresh from merged `main` and start `T14`
  - Why: kept the critical path linear before skills-library follow-through
- [x] Slice 5: T14 Skills library architecture/import
  - Objective: treat the imported skills corpus as a metadata-aware indexed library instead of a flat markdown corpus
  - Result: merged in PR `#96` as commit `522043d`
- [x] Gate 5: refresh from merged `main` and start `T15`
  - Why: kept the critical path linear before aggregation follow-through
- [x] Slice 6: T15 Multi-server MCP aggregation
  - Objective: expose the existing proxy aggregation runtime as an operator-facing native capability and prove mixed child-server states end-to-end
  - Result: merged in PR `#97` as commit `e2f8be8`
- [x] Gate 6: refresh from merged `main` and start `T16`
  - Why: keeps the aggregation/retrieval branch linear before semantic resolution
- [x] Slice 7: T16 Semantic skill resolution
  - Objective: improve natural-language workflow resolution quality without replacing the existing Fuse.js index
  - Result: merged in PR `#98` as commit `7b7e9cc`
- [x] Gate 7: refresh from merged `main` and start `T17`
  - Why: keeps the aggregation/retrieval branch linear before cross-CLI config follow-through
- [x] Slice 8: T17 Cross-CLI configuration sync
  - Objective: make sync-config output stable across disposable worktrees by resolving the canonical runtime root
  - Result: merged in PR `#99` as commit `5e45dce`
- [x] Gate 8: refresh from merged `main` and start `T18`
  - Why: aggregation/retrieval branch is complete; continuity/operator UX is the next critical branch
- [x] Slice 9: T18 Session continuity architecture
  - Objective: define a canonical continuity architecture spanning repo handoff docs, root planning files, and runtime `~/.evokore` session artifacts
  - Result: merged in PR `#100` as commit `ab334b2`
- [x] Gate 9: refresh from merged `main` and start `T19`
  - Why: `T19` should build directly on the canonical session manifest shipped in `T18`
- [x] Slice 10: T19 Auto-memory system
  - Objective: define the memory bootstrap/storage contract on top of the new continuity manifest without duplicating `CLAUDE.md`
  - Result: merged in PR `#101` as commit `728610f`
- [x] Gate 10: refresh from merged `main` and start `T21`
  - Why: status-line work should consume the shipped manifest and managed memory set from `T18` + `T19`
- [x] Slice 11: T21 Live status line display
  - Objective: surface a compact operator status line backed by the canonical session manifest and managed memory state
  - Result: merged in PR `#102` as commit `c1e21de`
- [x] Gate 11: refresh from merged `main` and start `T20`
  - Why: voice follow-through should build on the merged continuity, memory, and status runtime
- [x] Slice 12: T20 Voice sidecar follow-through
  - Objective: close the remaining operator/runtime gaps in the standalone voice sidecar path after the aggregation and status slices landed
  - Result: merged in PR `#103` as commit `db22242`

### 4. Wrap and Handoff
- [x] T22: Session-wrap updates (`docs/session-logs/`, `next-session.md`, `CLAUDE.md`)
  - Blockers: cleared during closeout
  - Dependencies: all completed slices in this session
  - Full cycle: summarize -> update docs -> verify tracker consistency

### 5. Post-Roadmap Hygiene
- [x] T23: Remove stale auxiliary worktrees and prune merged local branches
  - Blockers: dirty root branch prevented branch checkout; cleanup had to preserve `feature/damage-control-expansion`
  - Dependencies: T22
  - Full cycle: verify safe targets -> remove stale `security-ci` worktree -> snap local `main` to `origin/main` -> delete merged branches -> persist results

### 6. Post-Roadmap Branch and Control-Plane Follow-Through
- [x] T24: Audit stale local and remote branches plus root-branch divergence
  - Blockers: root repo is intentionally dirty, and the active branch predates merged roadmap work
  - Dependencies: T23
  - Full cycle: inspect local/remote branches -> compare against GitHub PR state -> classify salvage vs prune targets -> document findings
- [x] T25: Reconcile and port `feature/damage-control-expansion` onto current `main`
  - Blockers: branch is 34 commits behind `main`, carries pre-roadmap hook/settings files, and has no active PR
  - Dependencies: T24
  - Full cycle: research existing diff -> create fresh worktree from `main` -> port or replay valid changes -> resolve conflicts -> test -> docs -> PR
  - Result: reconciled in fresh worktree and opened as PR `#104`
- [x] T26: Implement repo-state audit automation for startup and handoff drift
  - Blockers: no current automated guard reports stale local branches, gone upstreams, root-control drift, or worktree/branch divergence in one place
  - Dependencies: T24
  - Full cycle: research current validation surface -> design CLI/report contract -> implement script/tests/docs -> PR
  - Result: implemented in fresh worktree and opened as PR `#105`
- [x] T27: PR-manager review sweep and session-wrap follow-through for new slices
  - Blockers: cleared; PRs `#104` and `#105` are both published and green
  - Dependencies: T25, T26
  - Full cycle: review generated PRs/comments/checks -> update session log -> refresh `next-session.md` and `CLAUDE.md`

## PR Strategy

| Task | Expected PR Strategy |
|------|----------------------|
| T02-T06 | Reuse existing PRs if valid; otherwise reconcile locally and reopen/new PR |
| T07-T08 | One decision PR if code/docs change, otherwise docs-only rationale PR |
| T09-T20 | One PR per roadmap item/phase to minimize drift and simplify `pr-manager` review |
| T21 | Final session continuity/handoff PR or direct `main` update only if user prefers |
| T23 | Root-control-plane only, no PR; hygiene state is intentionally kept in the dirty handoff branch |
| T24 | Docs/research audit artifact only unless automation or code changes emerge |
| T25 | One PR from a fresh `main`-based worktree to salvage and modernize the damage-control expansion |
| T26 | One PR from a fresh `main`-based worktree for repo-state audit automation, tests, and operator docs |
| T27 | Final docs/session-wrap PR only if shared handoff artifacts need publication beyond root control-plane updates |

## Orchestration Rules

| Rule | Rationale |
|------|-----------|
| Work strictly in sequence unless a task is explicitly independent and non-conflicting | Minimizes context drift and merge thrash |
| Research before implementation for every roadmap slice | Matches user request for full cycles |
| Write findings to disk before switching tasks | Preserves continuity across crashes |
| Use fresh execution context per slice | Emulates fresh-agent handoff even when running sequentially |
| Do not update shared trackers from feature branches unless that slice owns them | Prevents tracker merge conflicts |
| Preserve intentionally dirty root handoff files during cleanup | The root control plane is the durable live state for future sessions |
| Prefer replaying valid feature commits onto current `main` over reviving stale pre-roadmap branches in place | Reduces hidden regression risk from outdated runtime and config surfaces |

## Key Questions
1. What is the actual current state of PRs `#81-#85` relative to local branches and `main`?
2. Does the repo need a code change for skill indexing, or only a documented architecture decision?
3. Which Agent33 roadmap items can be executed in this repo as implementation work versus documentation/handoff artifacts only?
4. Does `feature/damage-control-expansion` still provide valid security coverage after the hook/runtime changes landed on `main`?
5. What is the smallest automated audit surface that can detect stale branch/worktree/handoff drift before a new session starts?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Use root planning files plus repo docs for persistence | Survives session loss and keeps one source of truth on disk |
| Process work sequentially instead of parallel branch swarms | User prioritized minimal context drift over throughput |
| Treat each roadmap item as a full cycle with research, implementation, tests, docs, and PR intent | Matches requested review and handoff discipline |
| Use disposable worktrees as fresh-agent boundaries for active PR remediation | Gives each slice an isolated execution context without losing the root session plan |
| Split the new work into `T25` feature reconciliation and `T26` repo-control automation | The current recommendations collapse naturally into one stale-feature salvage slice and one durable prevention slice |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Reused `.commit-msg.txt` path during PR `#86` remediation and accidentally re-staged it | 1 | Corrected with a second isolated commit using a temp file outside the repo for the commit message |

## Notes
- Re-read this plan before each major decision or task transition.
- Update checklist state immediately after each task changes status.
- If a requested multi-agent action is not possible with available tools, document the limitation and emulate it with sequential fresh-slice handoffs.
- The roadmap chain is complete through `T22`, and the post-roadmap hygiene slice `T23` is complete locally.
- The post-roadmap execution window `T24-T27` is complete locally.
- The PR follow-through and cleanup closeout are also complete: PR `#104` merged as `0e1eabb`, PR `#105` merged as `a606d98`, local `main` matches `origin/main`, the root handoff worktree now sits on `handoff/post-pr105-session`, and `repo:audit` reports no stale branch candidates.
- Post-cleanup publication is now split into two reviewable slices: PR `#106` for the canonical docs refresh, and a separate session-wrap/control-plane publication branch for the remaining shared handoff artifacts.
- There is no additional unpublished source-code slice in the local working tree beyond those documentation and control-plane updates.
