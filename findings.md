---
name: orchestration-findings
description: Persistent findings for the sequential execution checklist and crash-safe session recovery.
---

# Findings & Decisions

## Requirements
- Produce a strict execution-order checklist with blockers and dependencies.
- Save the checklist to disk so the session can recover after a crash.
- Maintain live progress and completion state as work proceeds.
- Minimize context drift by processing sequentially and keeping durable notes.
- Research and architect features before implementation.
- Document research in `docs/` when useful for future sessions.
- Create PR-ready slices for review through the existing PR workflow.
- Keep session log and handoff artifacts current.

## Research Findings
- `next-session.md` defines the immediate queue as PRs `#81-#85`, then a skill-indexing decision, then Agent33 reverse-instruction priorities focused on hooks, HITL, and dynamic tool discovery.
- `docs/PRIORITY_STATUS_MATRIX.md` marks the original 15 EVOKORE priorities complete as of 2026-03-10; remaining work is follow-through and the Agent33 roadmap.
- `CLAUDE.md` captures operational guardrails that must stay in the checklist: `.commit-msg.txt`, `unlink` for `.git/index.lock`, and aggressive worktree cleanup.
- The repo includes persistent session patterns already: `docs/session-logs/`, `next-session.md`, and `CLAUDE.md`.
- No root `task_plan.md`, `findings.md`, or `progress.md` existed before this session; these files now become the durable session spine.
- Live repository state differs from `next-session.md`: PRs `#81-#85` are already merged; the current active open queue is `#86-#90`.
- Current local branch is `feature/damage-control-expansion` with no linked PR.
- `git worktree list` shows only the primary worktree; there are no extra active worktrees at the moment.
- The active open PRs `#86-#90` all report `mergeStateStatus: UNSTABLE`, so CI/regression issues are the immediate operational blocker.
- PR `#86` changes only documentation files and has passing build/test/type/windows checks; its instability appears to come solely from the security-scan set.
- PR `#88` changes `scripts/purpose-gate.js` plus an Agent33 research doc and also passes build/test/type/windows checks.
- PR `#89` changes `src/VoiceSidecar.ts`, `dist/VoiceSidecar.js`, related tests, and research docs; build/test/type/windows checks pass.
- PRs `#87` and `#90` both change `SkillManager` and both fail the test suite, making skill indexing the current shared hotspot and likely the critical path.
- PR `#86` included an accidentally committed `.commit-msg.txt`; remediation has been pushed to the PR branch to delete it and ignore it going forward.
- The revised sequential queue is `#86` -> `#88` -> `#89` -> `#90` -> `#87`; `#90` now precedes `#87` because both touch `SkillManager` and monitoring should layer onto the chosen indexing shape.
- The shared failing checks are likely infrastructure failures, not PR-content failures. `gh run view --log-failed` shows Trivy-based jobs failing during the Trivy setup/install path, and `Trivy SARIF Upload` then fails because `results/trivy-results.sarif` was never produced.
- This makes the security workflow a repo-wide blocker that should be fixed once, ahead of trying to land the rest of the active PR queue.
- A dedicated CI fix slice is now prepared in `.orchestrator/worktrees/security-ci`:
  - containerized `aquasec/trivy:0.68.1` CLI execution in all four jobs
  - `github/codeql-action/upload-sarif@v4`
  - new `test-security-scan-workflow-validation.js`
- Local validation in the CI-fix worktree passed for both `node test-security-scan-workflow-validation.js` and `node test-ci-workflow-validation.js`.
- A first attempt using explicit `setup-trivy@v0.2.2` still failed inside the bootstrap step; the containerized CLI path is the second-pass remediation now pushed to PR `#91`.
- The containerized workflow fix exposed real dependency CVEs rather than workflow bootstrap failures.
- PR `#91` now also bumps `@modelcontextprotocol/sdk` to `^1.27.1` and adds deterministic `overrides` for `hono`, `@hono/node-server`, and `express-rate-limit`.
- In the CI-fix worktree, `npm install --package-lock-only` and `npm audit --json` now report `0` vulnerabilities.
- `node_modules` is tracked in this repository despite `.gitignore`; generated install churn was explicitly restored before commit so PR `#91` stays limited to intended files.
- PR `#91` has a follow-up commit `e7c23b8` (`fix: pin patched transitive security dependencies`) and fresh checks are pending.
- PR `#91` has now merged to `main` as commit `ed0909e`.
- PR `#86` was rebased-forward by merging `origin/main` into its branch, then revalidated locally with full `npm test` and clean `npm audit --json` before being pushed as `a55d98d`.
- PR `#86` has now merged to `main` as commit `9604d1b`.
- A fresh worktree for PR `#88` is active at `.orchestrator/worktrees/pr-88`.
- PR `#88` merged `origin/main` cleanly with no conflicts, but its new status-hook behavior lacked direct test coverage.
- Added hook-suite coverage for `EVOKORE_STATUS_HOOK=true` cache-only status injection before pushing refreshed PR `#88` as commit `b054da8`.
- PR `#88` has now merged to `main` (post-`#86`, pre-`#89` in the strict queue).
- A fresh worktree for PR `#89` is active at `.orchestrator/worktrees/pr-89`.
- The original PR `#89` test failure was real: `VOICE_SIDECAR_MAX_CONNECTIONS` was referenced in `src/VoiceSidecar.ts` but missing from `.env.example`, which broke env-contract validation.
- PR `#89` also needed a `package.json` merge resolution to combine the voice-hardening validator with the newer security workflow validator from `main`.
- After fixing the env contract and resolving the base merge, PR `#89` was revalidated locally with full `npm test` and clean `npm audit --json`, then pushed as `6674e2d`.
- PR `#89` has now merged to `main`.
- A fresh worktree for PR `#90` is active at `.orchestrator/worktrees/pr-90`.
- PR `#90`'s historical failures were only the stale security jobs; its functional/type/build checks were already green.
- On the refreshed repo state, recursive indexing measured ~319-572ms across repeated local runs while indexing 336 skills, which materially contradicts the branch's older 37-39s research claim.
- The recursive indexing research doc and validation gate were updated to reflect current measurements before pushing refreshed PR `#90` as commit `7cf81c3`.
- PR `#90` has now merged to `main`.
- A fresh worktree for PR `#87` is active at `.orchestrator/worktrees/pr-87`.
- PR `#87` conflicted directly with the recursive indexing architecture in `src/SkillManager.ts`, `dist/SkillManager.js`, and `package.json`; it was reconciled by keeping recursive traversal and layering metrics/monitoring on top.
- The historical PR `#87` test failure came from a stale test script list after later queue items added `test-voice-sidecar-hardening-validation.js` and `test-security-scan-workflow-validation.js`.
- Monitoring thresholds had to be recalibrated for the recursive index shape: load remained ~300-450ms, while representative search queries landed roughly in the ~170-490ms range on 336 indexed skills.
- Refreshed PR `#87` was pushed as commit `d708cb7` after full `npm test` and clean `npm audit --json`.
- PR `#87` has now merged to `main`.
- Post-queue verification on updated `main` passed with the full `npm test` suite in the dedicated `main` worktree.
- The active PR reconciliation wave is complete; remaining work is the post-queue decision/roadmap chain in tasks `T08-T22`.
- The skill indexing architecture decision is now resolved in favor of recursive indexing with weighted search, composite keys, subcategory tracking, and performance monitoring on top.
- Skill indexing performance validation is complete on the merged `main` state: roughly 336 indexed skills, ~300-450ms load times in repeated local runs, and representative searches roughly ~170-490ms.
- The roadmap critical path is now explicit: `T10 -> T11 -> T12 -> T13 -> T14`, then split into aggregation/retrieval (`T15 -> T16 -> T17`), continuity/operator UX (`T18 -> T19 -> T21`), and voice follow-through (`T20`), with `T22` as final wrap.
- `T10` is the first post-queue implementation slice. The likely remaining hook-system gap is not hook behavior itself, but canonical Agent33 lifecycle layout parity: Agent33 specifies `scripts/hooks/{damage-control,purpose-gate,session-replay,tilldone}.js`, while EVOKORE currently wires `.claude/settings.json` to top-level `scripts/*.js`.
- EVOKORE already has richer hook behavior than the base Agent33 spec, including `evidence-capture.js`, hook observability JSONL, log rotation, and compatibility CLIs. The T10 slice should preserve those behaviors while aligning the hook runtime layout and lifecycle wiring.
- `T10` is now implemented and packaged as PR `#92` (`feat: port canonical hook entrypoints`): canonical `scripts/hooks/*.js` entrypoints were added, `.claude/settings.json` now uses those paths, canonical-path tests pass, and legacy top-level entrypoints remain covered.
- PR `#92` is now merged as commit `f259b5b`.
- `T11` is now merged as PR `#93` / commit `129d153`. The active hook lifecycle is routed through a shared fail-safe bootstrap, and `evidence-capture` now sits behind the same canonical hook surface.
- `T12` is not a net-new HITL system build; EVOKORE already had the approval-token flow. The remaining real gap was schema-contract coverage for proxied tools with object schemas but no declared `properties`.
- `T12` is now merged as PR `#94` / commit `a3b279b`. `ProxyManager` guarantees `_evokore_approval_token` schema injection for proxied object tools, and the contract is covered by dedicated validation.
- `T13` is not greenfield work; EVOKORE already has dynamic tool discovery, session-scoped activation, fused catalog search, `discover_tools`, and benchmark/validation coverage.
- The real `T13` gap is now a hardening/documentation gap: operator-surface behavior, guardrails around activation semantics, and any missing regression coverage against the existing MVP contract.
- `T13` is now merged as PR `#95` / commit `7c9412c`: the activation-session map is bounded and stale sessions reset/prune opportunistically, `tools/list_changed` now has direct regression coverage, and docs clarify stdio-versus-session-aware discovery semantics.
- Early T14 reconnaissance shows EVOKORE already contains many of the Agent33-target skill imports: `repo-ingestor`, `mcp-builder`, `planning-with-files`, `docs-architect`, `pr-manager`, `webapp-testing`, `skill-creator`, HIVE skills, and the WSHOBSON library are already present in `SKILLS/`.
- The likely remaining T14 work is therefore not bulk skill import, but architecture/metadata/indexing follow-through for the already-imported library.
- `T14` is now merged as PR `#96` / commit `522043d`: `SkillManager` preserves declared categories, nested metadata, and tags from imported skills, the search index includes metadata-aware signals like aliases and taxonomy tags, and a dedicated validation test proves the imported-library footprint.
- Early T15 reconnaissance shows EVOKORE already has the core multi-server aggregation runtime in `ProxyManager`: prefixed tool names, env interpolation, server-state tracking, duplicate-collision policy, cooldown protection, and aggregated tool loading from `mcp.config.json`.
- The likely remaining T15 gap is therefore operator-facing aggregation proof and introspection, not the existence of the aggregator itself.
- `T15` is now implemented locally as PR `#97`: `ProxyManager` tracks `registeredToolCount` per child server, `SkillManager` exposes a native `proxy_server_status` tool, and the docs now treat aggregated child-server health as an operator-visible surface.
- `T15` also required two test hardening fixes while validating the slice: `test-tool-discovery-list-changed-validation.js` now starts its timeout after the discovery call instead of before server boot completes, and `test-skill-perf-monitoring.js` now uses hard failure thresholds with warning-only recommended targets so Windows cold-cache variance does not create false negatives.
- PR `#97` is now merged as commit `e2f8be8`. The aggregation branch of the roadmap is unblocked, so the next critical-path slice is `T16` semantic skill resolution.
- `T16` is not greenfield. EVOKORE already had recursive Fuse.js indexing plus `resolve_workflow`, but it still missed real natural-language objectives like `wrap up session handoff` and tended to prefer deep reference leaves over primary actionable skills such as `mcp-builder`.
- `T16` is now implemented locally as PR `#98`: `SkillManager` preserves aliases and semantic hints, expands ambiguous objective queries, reranks toward actionable root skills, and emits `Why matched:` explanations in `resolve_workflow`.
- PR `#98` is now merged as commit `7b7e9cc`. The retrieval branch is advanced to the final `T17` cross-CLI follow-through slice.
- `T17` is not greenfield either. EVOKORE already had cross-CLI sync, but running `scripts/sync-configs.js` from a disposable worktree registered the worktree's `dist/index.js` path in user CLI configs.
- `T17` is now implemented locally as PR `#99`: the sync script resolves the canonical git common root by default, supports `EVOKORE_SYNC_PROJECT_ROOT` override, and has dedicated worktree-safety regression coverage.
- PR `#99` is now merged as commit `5e45dce`. The aggregation/retrieval branch is complete; the remaining roadmap is now the continuity/operator UX branch (`T18`, `T19`, `T21`) plus voice follow-through (`T20`) and final session-wrap (`T22`).
- Root handoff docs drifted behind the merged roadmap state: `next-session.md` still described March 10 stabilization PRs, and `CLAUDE.md` still described 2-level skill indexing plus pre-canonical hook wiring.
- There are currently no open GitHub PRs after `#99`; the next active implementation slice is the fresh `roadmap/t18-session-continuity` worktree at `.orchestrator/worktrees/t18-continuity`, based on `origin/main` commit `5e45dce`.
- The `planning-with-files` skill's session-catchup helper path is stale for this machine: the actual installed path is under `C:\Users\mattm\.codex\skills\...`, not `C:\Users\mattm\.claude\skills\...`.
- Early `T18` reconnaissance confirms continuity is not greenfield. EVOKORE already has continuity surfaces in `docs/RESEARCH_AND_HANDOFFS.md`, `docs/session-logs/`, the root planning files, and runtime artifacts under `~/.evokore/{logs,sessions}`. The real gap is canonicalizing those surfaces into one documented/testable session architecture before layering auto-memory and live status on top.
- `T18` is now merged as PR `#100` / commit `ab334b2`. EVOKORE now has a canonical runtime continuity manifest at `~/.evokore/sessions/{sessionId}.json`, and the existing purpose/replay/evidence/task artifacts update that shared manifest instead of remaining disconnected siblings.
- `T18` deliberately stopped short of auto-memory and live status rendering. The continuity manifest is the new foundation; `T19` should add memory bootstrap/storage rules on top of it, and `T21` should consume it for operator-facing status.
- `T19` is now merged as PR `#101` / commit `728610f`. EVOKORE now has repo-aware Claude memory sync utilities (`scripts/claude-memory.js`, `scripts/sync-memory.js`) that generate managed files in `~/.claude/projects/*/memory/` from repo state plus the `T18` session manifest.
- The live EVOKORE memory directory at `C:\Users\mattm\.claude\projects\D--GITHUB-EVOKORE-MCP\memory` has been updated in-place by `npm run memory:sync`, replacing stale March 10 content with managed `MEMORY.md`, `project-state.md`, `patterns.md`, and `workflow.md`.
- `T21` is now merged as PR `#102` / commit `c1e21de`. The status line is no longer the old network-heavy location/weather helper; it is now a shared continuity-backed runtime that surfaces branch/worktree pressure, session purpose, task pressure, continuity health, and context usage, with managed Claude memory fallback when no live repo-scoped manifest exists.
- `.claude/settings.json` now carries the real `statusLine` command (`node scripts/status.js`), and `purpose-gate` reuses the same status-runtime summary instead of emitting a disconnected cache-only status string.
- A real `T21` slice bug surfaced during validation: `purpose-gate` initially built its status summary without the active `session_id`, which let it fall back to unrelated repo sessions. The fix was to pass the live payload into the shared status-runtime path and compute the status line after session-state writes.
- `T20` is now merged as PR `#103` / commit `db22242`. The remaining voice gap was upstream of the hardened sidecar: the bundled `scripts/voice-hook.js` now forwards personas via `VOICE_SIDECAR_PERSONA` or payload metadata, so the default Claude hook path can actually use the persona system described by `voices.json`.
- The fresh `T20` worktree was initially created in parallel with the `origin/main` fetch, so it started from stale `main` `728610f`; it has since been fast-forwarded cleanly to merged `main` `c1e21de`.
- A second test-only follow-through fix landed with `T20`: `test-status-line-validation.js` now isolates its fallback leg to a temp workspace and derives the active branch dynamically, so it no longer depends on ambient repo session state from the operator machine.
- The sequential roadmap chain is now complete through `T22`; no roadmap implementation slices remain open.
- Post-roadmap cleanup is now complete locally: the stale `.orchestrator/worktrees/security-ci` worktree has been removed, local `main` has been realigned from `129d153` to `origin/main` `db22242`, and merged roadmap/agent helper branches have been pruned.
- The only remaining worktree is the root repo on `feature/damage-control-expansion`; its dirty state is intentional because it holds the live handoff/control-plane files (`task_plan.md`, `findings.md`, `progress.md`, `next-session.md`, `CLAUDE.md`, and session logs).
- A follow-up stale-branch audit on 2026-03-11 showed that `feature/damage-control-expansion` is not just tracker drift: it has two unmerged feature commits (`42d067f`, `46f9cf9`) touching `damage-control-rules.yaml`, `scripts/damage-control.js`, `test-damage-control-validation.js`, `package.json`, and a research doc, with no associated GitHub PR.
- That branch is 34 commits behind `main` and 2 commits ahead, so reviving it in place would reintroduce pre-roadmap runtime/config surfaces rather than only the intended damage-control changes.
- The active root worktree on `feature/damage-control-expansion` still contains an outdated `.claude/settings.json` that points to legacy top-level hook scripts and lacks the merged `statusLine` configuration, confirming the branch predates the T10/T21 roadmap work.
- The same stale branch also lacks `scripts/status-runtime.js` even though the root handoff docs say it exists, which means the current control-plane docs describe `main`, not the checked-out branch state.
- The right recovery path is therefore a fresh `main`-based worktree that replays only the intended damage-control expansion onto current architecture, followed by a separate repo-control automation slice to prevent this class of drift from going undetected again.
- The remote branch set still includes multiple historical topic branches (`origin/roadmap/t15-*` through `origin/roadmap/t21-*`, docs branches, and feature branches) even though the associated PR chain is merged; these need explicit audit/accounting before any deletion decisions.
- `T25` is now executed in fresh worktree `.orchestrator/worktrees/t25-damage-control` on branch `review/t25-damage-control-reconcile`. The stale feature was ported manually onto `main` and published as PR `#104` instead of reviving `feature/damage-control-expansion`.
- The manual port preserved the valid security work while explicitly avoiding stale-branch regressions: no dependency downgrade, no removal of `overrides`, no rollback of the current `npm test` chain, and no replay of the stray `.commit-msg.txt` change.
- The reconciled slice adds a dedicated `test-damage-control-validation.js` suite with 69 passing checks and keeps full `npm test` plus `npm audit --json` green on current `main`.
- `T26` is now executed in fresh worktree `.orchestrator/worktrees/t26-repo-audit` on branch `feat/t26-repo-state-audit` and published as PR `#105`.
- `scripts/repo-state-audit.js` now provides both human-readable and `--json` repo-state reporting for current-branch divergence, live worktrees, stale local branches with gone upstreams, merged remote branch candidates without open PRs, open PR heads, and root control-plane drift.
- A real parser bug surfaced during `T26`: trimming the full `git status --short` output stripped the first line's leading status whitespace and corrupted path parsing. The fix was to preserve leading whitespace and remove trailing newlines only.
- `pr-manager` sweep results on 2026-03-11: PR `#104` is `CLEAN` with all CI/security checks green. PR `#105` initially failed in GitHub CI because the repo-state audit assumed a local `main` ref existed; that CI-only issue was fixed in commit `581ce00`, and the follow-up run is now fully green. Both PRs only have Gemini quota-warning comments, not actionable code review feedback.
- PR `#104` has now merged as commit `0e1eabb`, and `node test-damage-control-validation.js` passed in a fresh post-merge `main` worktree.
- PR `#105` required a merge-refresh onto the new `main` after `#104` landed. The only conflict was in `package.json`, and the correct resolution was to keep both the `repo:audit` script entry point and the `test-damage-control-validation.js` addition in the default `npm test` chain.
- The refreshed PR `#105` branch passed `npm run repo:audit -- --json`, `node test-repo-state-audit-validation.js`, `node test-ops-docs-validation.js`, and full `npm test` locally before it merged as commit `a606d98`.
- GitHub auto-deleted several merged PR branches before explicit remote cleanup. Running `git fetch --prune origin` before remote deletions avoided false failures and left the real remote cleanup set smaller than the initial audit output suggested.
- The root handoff worktree no longer sits on stale feature history. It now tracks `origin/main` on `handoff/post-pr105-session`, and the stale local `feature/damage-control-expansion` branch has been removed.
- Final root `repo:audit` state after cleanup: current branch `handoff/post-pr105-session` at `a606d98`, one worktree, zero open PRs, zero stale local branch candidates, zero stale remote branch candidates, and only local control-plane drift.
- Post-cleanup publication sweep on 2026-03-12 found no outstanding uncommitted source-code delta. The remaining local drift is split cleanly into a canonical docs refresh PR (`#106`) and a separate control-plane/session-wrap publication slice.
- The refreshed docs portal introduced direct links to dated cleanup artifacts. Those linked docs must ship with the docs refresh itself or the canonical link validation fails.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Treat stabilization PR closure as the first execution wave | It is the current handoff priority and blocks clean roadmap work |
| Separate EVOKORE follow-through from Agent33 roadmap work | Prevents architecture and repo-maintenance concerns from mixing |
| Use full-cycle slices per roadmap item | Preserves reviewability and reduces inter-PR drift |
| Prefer sequential fresh-slice handoffs over simultaneous edits | Available tooling does not expose true teammate spawning here, and the user prioritized low drift |
| Use disposable worktrees as fresh-agent boundaries for active PR remediation | Gives each slice an isolated execution context without losing the root session plan |
| Treat post-roadmap branch/worktree hygiene as a tracked slice (`T23`) | Keeps repo cleanup durable and recoverable instead of leaving it as implicit terminal state |
| Replay stale feature work onto fresh `main` instead of reviving the stale branch in place | The checked-out branch predates canonical hook/status work and would otherwise reintroduce outdated runtime/config surfaces |
| Refresh the next open PR branch onto `origin/main` after each merge in a shared-surface cleanup wave | Keeps sequential PR merges low-drift and catches conflicts before GitHub merge time |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| Planning artifacts were missing at repo root | Created root planning files as the durable source of truth |
| `next-session.md` is stale relative to GitHub PR state | Reconciled live PR data with `gh pr list/view` and updated the checklist before execution |
| The active queue is not independent | Identified a likely dependency/conflict cluster around `SkillManager` in PRs `#87` and `#90`; treating that as the critical path |
| PR `#86` remediation initially re-staged the helper file | Corrected with a follow-up commit that deleted the tracked file for real using a temp commit-message file outside the repo |
| Shared security jobs are failing across multiple PRs | Classified as a repo-wide CI workflow blocker; added a dedicated task before continuing queue landing |
| `git branch -d` refused to delete `roadmap/t10` through `t14` from the dirty root branch | Verified each branch was already an ancestor of `origin/main`, then deleted them with `git branch -D` as already-landed history |
| The root branch state no longer matches the merged handoff docs | Classified as real branch divergence, not docs noise; plan is now a fresh-worktree salvage of the damage-control feature plus a dedicated audit-automation slice |
| GitHub CLI `--json` fields were split by PowerShell during cleanup accounting | Re-ran each command with the field list wrapped as one quoted argument |
| Initial remote branch deletion attempted to delete refs GitHub had already auto-removed | Pruned remotes first with `git fetch --prune origin`, then deleted only the still-present candidate refs |

## Resources
- `next-session.md`
- `CLAUDE.md`
- `docs/PRIORITY_STATUS_MATRIX.md`
- `docs/research/remaining-items-research.md`
- `docs/AGENT33_IMPROVEMENT_INSTRUCTIONS.md`
- `docs/session-logs/`

## Visual/Browser Findings
- None yet.

*Update this file after every 2 view/browser/search operations*
