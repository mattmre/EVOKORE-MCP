---
name: arch-aep-pr-queue-audit-2026-03-16
description: Current sequential task plan after verifying live PR state, review coverage, and remaining repo work.
---

# Task Plan: ARCH-AEP PR Queue Audit

## Goal
Verify the live PR queue, audit review coverage since the last dedicated ARCH-AEP review run, synchronize tracking docs, and define the next safe sequential work items.

## Current Phase
FileSessionStore restart smoke/evidence merged and re-validated on `main`. The next decision point is whether to close the historical PR review audit as sufficient coverage or spend time backfilling retroactive comments on already-merged PRs.

## Baseline State (2026-03-16)
- **Current branch:** `main`
- **HEAD:** `6d6aef4`
- **Open PRs:** none
- **Version:** 3.0.0 (npm publish still pending)
- **Audit artifact:** `docs/research/arch-aep-pr-review-audit-2026-03-16.md`

## Findings That Change Execution
- There is no live PR queue to review, fix, or merge sequentially.
- Since the previous dedicated review-cycle run on `2026-03-04`, `117` PRs were created in scope (`#55` through `#171`).
- `29` PRs have at least one submitted review.
- `88` PRs have PR comments but no submitted review record.
- `0` PRs are comment-free, so the literal "if no comments exist then do a full review" rule does not currently trigger any new live review work.

## Sequential Plan

### Phase 1: Verify Live PR Queue
- [x] Query GitHub for open PRs
- [x] Confirm there are no open PRs as of `2026-03-16`
- [x] Confirm any future retroactive review would have to be posted as normal comments on merged/closed PRs

### Phase 2: Audit Review Coverage
- [x] Use `2026-03-04` ARCH-AEP review run as the cutoff
- [x] Inventory all PRs created on or after `2026-03-05`
- [x] Distinguish submitted reviews from plain PR comments
- [x] Save the audit to `docs/research/arch-aep-pr-review-audit-2026-03-16.md`

### Phase 3: Sync Tracking Docs
- [x] Replace stale current-plan references to old open PR state
- [x] Add a dated session log for this audit
- [x] Carry the review-coverage gap into the handoff docs
- [x] Add a durable PR-audit learning to `CLAUDE.md`

### Phase 4: Next Executable Work, In Order
- [ ] Execute npm publish flow for `v3.0.0` after secret/release readiness verification
- [ ] Decide whether to backfill retroactive review comments for the `88` comment-only PRs
- [ ] If retro review is approved, process sequentially from newest to oldest to minimize drift in follow-up fixes
- [ ] If no retro review is needed, move to production validation for v3.1 surfaces (STT, session store, registry, dashboard auth)

## Merge Plan
- None currently. There are no open PRs to merge.
- If new PRs are opened from future fixes, merge base-first and validate on `main` between each merge.

## Session Addendum (2026-03-19)

### Goal
Convert the first actionable post-audit item into a clean PR-sized slice by fixing broken validation entrypoints and release workflow drift discovered during release-readiness verification.

### Phase A: Live Queue and Blocker Confirmation
- [x] Re-check `gh pr list --state open`
- [x] Confirm the open PR queue is still empty on `2026-03-19`
- [x] Pivot from blocked PR review/merge work to the next executable remaining slice

### Phase B: Research and Scope
- [x] Re-check release workflow, package scripts, and active operator docs
- [x] Confirm `npm run release:check` fails because it runs a Vitest file through raw Node
- [x] Confirm docs/ops validation commands are affected by the same migration gap
- [x] Confirm the release workflow still uses Node 18 despite `package.json` requiring Node 20+

### Phase C: Implementation Slice 1
- [x] Fix `release:check` to run through Vitest
- [x] Add a stable `docs:check` entrypoint for docs link and ops-doc validations
- [x] Align `.github/workflows/release.yml` to Node 20
- [x] Tighten release validation coverage so workflow/script drift is caught automatically
- [x] Update active operator docs to use the package-level validation commands

### Phase D: Verification
- [x] `npm run release:check`
- [x] `npm run docs:check`
- [x] `npm run build`

### Phase E: Publication
- [x] Determine whether the release-validation slice still needs its own PR
- [x] Confirm the branch commits already landed on `origin/main` as `#172` and `#173`
- [ ] Keep shared trackers/session logs out of the feature PR
- [ ] Prepare follow-on merge order from the post-audit backlog

### Follow-on Order After Slice 1
- [ ] Slice 2: registry live-validation harness or local mock-registry validation path
- [ ] Slice 3: FileSessionStore restart smoke and operator evidence
- [ ] Slice 4: optional dashboard auth operator-doc cleanup if still needed after review
- [ ] External action: verify `NPM_TOKEN`, then tag/push `v3.0.0`
- [ ] Credential-gated validation: Whisper live, Supabase live, then `v3.1.0` planning

### Phase F: Branch Hygiene and Fresh Sequential Slice
- [x] Fetch and compare the current branch against `origin/main`
- [x] Confirm the current branch is behind `origin/main` because its commits were merged independently
- [x] Avoid reopening or force-pushing fixes to a stale already-landed slice
- [x] Return to a fresh `main`-based branch for the next executable slice

### Phase G: Registry Validation Slice Planning
- [x] Review `RegistryManager`, `SkillManager`, and existing registry tests
- [x] Identify the current gap: source/schema tests exist, but local registry execution coverage is still missing
- [x] Identify a concrete behavior gap worth fixing in the slice: `listRegistrySkills()` only handles flat arrays / `skills`, not canonical `{ entries: [...] }` registry indexes
- [x] Save a dated research note for the registry validation slice under `docs/research/`
- [x] Define a focused implementation plan and file list for the new PR

### Phase H: Registry Validation Slice Execution
- [x] Implement shared registry fetch/parsing flow in `SkillManager`
- [x] Align `SkillManager` config-path resolution with `EVOKORE_MCP_CONFIG_PATH`
- [x] Preserve registry metadata and normalize relative URLs consistently
- [x] Add local/mock registry runtime coverage for non-empty registries, query behavior, partial failure, caching, and base-URL path prefixes
- [x] Update active docs to the object-based `skillRegistries` schema
- [x] Run targeted registry tests, docs checks, and full Vitest suite
- [x] Open PR `#174` for the slice
- [x] Perform self-review, push follow-up hardening, and wait for CI
- [x] Merge PR `#174` to `main`
- [x] Re-validate the merged slice on `main`

## New Findings That Change Execution (2026-03-19)
- There are still `0` open PRs, so the requested review/fix/comment loop remains blocked by repo state.
- Branch `fix/release-validation-entrypoints-20260319` is obsolete for new work; both branch commits are already represented on `origin/main`.
- The registry slice is now merged as `32bee20` (`PR #174`), so follow-on work should start from merged `main`, not the feature branch.
- `SkillManager` and `ProxyManager` must stay aligned on `EVOKORE_MCP_CONFIG_PATH`; registry-listing helpers should not fork their own parsing rules.
- Active docs must use the object-based `skillRegistries` schema (`{ name, baseUrl, index }`), not bare URL strings.

## Session Addendum (2026-03-20)

### Goal
Execute the requested PR-manager workflow safely from the current repo reality: confirm whether any open PR review/fix work exists, reconcile the stale dirty handoff branch, then move sequentially through the remaining backlog with FileSessionStore restart smoke/evidence as the first executable slice.

### Phase I: Live PR Queue Reality Check
- [x] Re-check `gh pr list --state open`
- [x] Confirm the open PR queue is still empty on `2026-03-20`
- [x] Confirm the requested open-PR comment review/fix loop is blocked by live GitHub state, not by access/tooling

### Phase J: Repo State and Tracking Reconciliation
- [x] Inspect `git status --short --branch`
- [x] Confirm the root worktree is still parked on stale branch `fix/registry-validation-harness-20260319`
- [x] Confirm only tracker/docs state is currently dirty in the root worktree
- [x] Preserve tracker continuity in `task_plan.md`, `findings.md`, and `progress.md`
- [x] Decide whether implementation should happen in the root worktree or a fresh `main`-based worktree after reconciling local dirty state
- [x] Run `npm run repo:audit` and capture the current branch/worktree warnings

### Phase J Outcome
- Root worktree remains the control plane because it contains local tracker drift on a stale branch.
- The active implementation slice is isolated in clean worktree `D:/GITHUB/EVOKORE-MCP-PR173` on branch `fix/file-session-store-restart-smoke-20260320`.
- Repo audit shows `0` open PRs, branch drift on the stale root worktree, `2` live worktrees, and `14` stale local branch candidates that can be cleaned up after the active slice.

### Phase K: FileSessionStore Restart Smoke / Evidence Slice
- [x] Research `FileSessionStore` implementation, current coverage, and exact persistence/restart gaps
- [x] Save new slice research under `docs/research/`
- [x] Define the smallest safe PR-sized implementation and file list
- [x] Implement restart/persistence smoke coverage and any minimal supporting code
- [x] Add operator-facing evidence/docs for restart behavior
- [x] Run targeted tests, lint/build, and broader validation as needed
- [x] Prepare PR, self-review, fix findings, and merge sequentially

### Phase K Outcome
- The safe gap is evidence at the storage/isolation layer, not runtime HTTP session reattachment.
- PR `#175` (`test: add file session store restart smoke evidence`) merged to `main` as `a3d05b0`.
- Local validation on the feature branch passed:
  - `npm run build`
  - `npx vitest run tests/integration/session-store.test.ts`
  - `npm run docs:check`
- Post-merge validation on `main` passed:
  - `npm run build`
  - `npx vitest run tests/integration/session-store.test.ts`
  - `npm run docs:check`
- The current PR explicitly documents the non-goal that unknown HTTP `mcp-session-id` values still `404` after restart because runtime reattachment is not implemented.

### Phase L: Historical PR Review Coverage Decision
- [x] Re-open `docs/research/arch-aep-pr-review-audit-2026-03-16.md`
- [x] Decide whether the `88` comment-only PRs need retroactive review comments
- [x] If retro review is required, define the newest-to-oldest execution order and comment template
- [x] If retro review is not required, record the decision in handoff docs and findings

### Phase L Outcome
- Recommendation accepted: do **not** backfill retroactive comments across the `88` already-merged/closed PRs by default.
- Rationale: the audit already captures the historical review gap, every PR in scope already has at least one PR comment, there are `0` open PRs left to action, and retroactive comments would create high noise with little corrective value.
- Re-open retro review only if a policy, compliance need, or stakeholder explicitly requires post-hoc comment artifacts on merged PRs.

### Phase M: Publish Readiness and Release Action
- [x] Verify `NPM_TOKEN` and release workflow readiness
- [ ] Tag and push `v3.0.0` when operator-gated prerequisites are satisfied
- [ ] Record release outcome and any blockers

### Phase M Status
- `git tag --list v3.0.0` returned no tag, so the release tag has not been created yet.
- `gh secret list` returned no repository secrets in the current environment, so `NPM_TOKEN` remains unverified and should be treated as missing/unconfirmed for the publish workflow.
- Result: npm publish is still blocked on operator-side release secret verification and tag creation.

### Phase N: Credential-Gated Production Validation
- [ ] Validate STT voice input with real Whisper credentials
- [ ] Validate `FileSessionStore` persistence across real restarts
- [ ] Validate dashboard auth with configured credentials
- [ ] Run live Supabase integration validation
- [ ] Record evidence and follow-up fixes sequentially

### Phase O: Merge/Handoff Discipline
- [ ] Keep shared trackers/session logs out of feature branches
- [ ] Validate on `main` between sequential merges
- [ ] Update `next-session.md` with the next true blocking item after each merged slice
- [ ] Prepare session-wrap artifacts once the current executable slice is complete

### Phase P: Repo Hygiene Cleanup
- [x] Move the dirty root worktree off obsolete branch `fix/registry-validation-harness-20260319`
- [x] Switch the control plane onto fresh `origin/main`-based branch `chore/control-plane-wrap-20260320`
- [x] Remove the duplicate root-only Stitch drop and temp patch now preserved in PR `#176`
- [x] Prune confirmed already-landed stale local branches after verifying active worktrees
- [x] Re-run `npm run repo:audit` after branch cleanup
- [x] Publish the control-plane tracker/session-log preservation branch as PR `#177`
- [ ] Fast-forward and clean the root worktree after that control-plane PR lands

### Phase P Outcome
- Root control plane now lives on `chore/control-plane-wrap-20260320` instead of the obsolete registry branch.
- Stale local branch candidates were reduced from `14` to `0`; only `main`, the active control-plane branch, and active Stitch branch `feat/stitch-skills-and-mcp-20260320` remain.
- The raw root `mcp.config.json` / `SKILLS/Stitch Skills/` drop was removed from the control plane because the cleaned version is already preserved in PR `#176`.
- Repo audit after branch cleanup reported one open PR; live state now has two open PRs: `#176` (Stitch MCP/skills) and `#177` (control-plane preservation).
- PR `#176` is mergeable but not merge-ready yet because CI still shows failing shard checks.
- PR `#177` also fails the same shard-2 CI case, which confirms the blocker is not specific to Stitch or tracker-doc changes.
- The shared failure is `tests/integration/session-store.test.ts` restart smoke on Linux: `ENOENT` during rename from `restart-smoke.json.tmp` to `restart-smoke.json` in `FileSessionStore.set`.

## Recommended Next Move
- First isolate and fix the Linux `FileSessionStore` atomic-write failure now exposed by PRs `#176` and `#177`.
- After that fix lands on `main`, rebase or refresh PRs `#176` and `#177`, rerun CI, and clear them in order.
- After both open PRs are clear, return to `v3.0.0` publish readiness and the credential-gated production validation queue.
