# Priority Status Matrix

Snapshot of the requested 15 priority items/phases, grounded in current repository evidence.

| Priority ID | Priority item/phase | Status | Evidence (files/tests/workflows) | Notes |
|---|---|---|---|---|
| p01 | PR review/approval playbook | done | `docs/PR_MERGE_RUNBOOK.md`, `.github/pull_request_template.md`, `scripts/validate-pr-metadata.js`, `test-pr-metadata-validation.js`, `test-ops-docs-validation.js`, `next-session.md` | Added enforceable PR metadata validation for required review evidence fields. |
| p02 | Merge-order controls | done | `docs/PR_MERGE_RUNBOOK.md`, `.github/workflows/ci.yml` (`Validate PR metadata`), `scripts/validate-pr-metadata.js`, `test-pr-metadata-validation.js`, `test-ci-workflow-validation.js`, `next-session.md` | Dependency-chain and chain-head metadata are now CI-validated for pull requests. |
| p03 | CI verification on push + PR | done | `.github/workflows/ci.yml`, `test-ci-workflow-validation.js`, `package.json` | CI test job now runs on both `push` and `pull_request` for `main`. |
| p04 | Release flow hardening | done | `.github/workflows/release.yml`, `docs/RELEASE_FLOW.md`, `test-release-doc-freshness-validation.js`, `test-npm-release-flow-validation.js` | Added release-doc freshness guard plus manual `chain_complete` and ancestry gates before publish. |
| p05 | HITL token flow operator guidance | done | `docs/USAGE.md`, `docs/TROUBLESHOOTING.md`, `test-hitl-token-docs-validation.js` | Documented one-time, arg-bound, short-lived token behavior and retry workflow. |
| p06 | Tool-prefix collision safety | done | `src/ProxyManager.ts`, `test-tool-prefix-collision-validation.js` | Added structured duplicate collision summary telemetry; first-registration-wins remains enforced. |
| p07 | Submodule commit-order safety | done | `.github/workflows/ci.yml`, `scripts/validate-submodule-cleanliness.js`, `test-submodule-commit-order-guard-validation.js` | Added CI guard for uninitialized/mismatched/dirty submodules. |
| p08 | Dist path resolution safety | done | `test-dist-path-validation.js` | Dist/runtime path validation remains passing and unchanged by this cycle. |
| p09 | Frontmatter regex robustness | done | `test-regex-frontmatter-standardization.js`, `src/SkillManager.ts` | Added SkillManager canonical regex coverage to regression guard. |
| p10 | Docs canonical mapping | done | `test-docs-canonical-links.js`, `docs/README.md`, `README.md`, `CONTRIBUTING.md` | Docs-wide internal markdown link crawl now validates recursive link targets plus canonical alias mappings. |
| p11 | Windows command resolution | done | `.github/workflows/ci.yml` (`windows-runtime` job), `src/utils/resolveCommandForPlatform.ts`, `src/ProxyManager.ts`, `test-windows-command-runtime-validation.ts`, `test-windows-exec-validation.js`, `test-voice-windows-docs-validation.js` | Targeted Windows CI runtime job executes command-resolution validations for higher platform confidence. |
| p12 | Env interpolation guarantees | done | `src/ProxyManager.ts`, `test-env-sync-validation.js`, `test-unresolved-env-placeholder-validation.js`, `docs/TROUBLESHOOTING.md` | Unresolved placeholders now fail fast with explicit server/key diagnostics. |
| p13 | Voice sidecar contract | done | `docs/USAGE.md`, `package.json`, `test-voice-contract-validation.js`, `test-voice-sidecar-hotreload-validation.js`, `test-voice-sidecar-live-validation.js` | Formalized protocol contract (`text`/`persona`/`flush`), hot-reload expectations, and opt-in live artifact capture validation. |
| p14 | Sync-config safety | done | `scripts/sync-configs.js`, `test-sync-configs-mode-validation.js`, `test-sync-configs-preserve-force-validation.js`, `docs/USAGE.md` | Added preserve-existing default, `--force` override, and conflict guards. |
| p15 | Orchestration tracking and PR slicing | done | `docs/ORCHESTRATION_TRACKER.md`, `scripts/validate-tracker-consistency.js`, `test-tracker-consistency-validation.js`, `test-next-session-freshness-validation.js`, `docs/RESEARCH_DECISIONS_LOG.md`, `docs/session-logs/session-2026-02-25-priority-orchestration.md`, `docs/session-logs/session-2026-02-25-context-rot-orchestration.md`, `docs/session-logs/session-2026-03-06-phase-3-tracking-wrap.md`, `docs/session-logs/session-2026-03-06-phase-3-review-readiness.md`, `docs/session-logs/session-2026-03-06-phase-3-stack-landing.md` | Tracker continuity now carries the full Phase 3 landing reconciliation: `#65`, `#66`, `#67`, and standalone cleanup `#69` are merged, stale/superseded `#61/#63/#64` are closed, and `#68` carries the final docs-only continuity refresh so the closed stack can hand off without context rot. |

## Fresh Evidence Refresh (2026-02-24)

- **Governance:** `.github/pull_request_template.md` now serves as an explicit reviewer/chain metadata anchor.
- **Release manual gate:** `.github/workflows/release.yml` enforces `workflow_dispatch` input `chain_complete=true` before publish continues.
- **Hooks observability:** `scripts/hook-observability.js` provides JSONL telemetry (`~/.evokore/logs/hooks.jsonl`) with validation in `hook-test-suite.js` and `hook-e2e-validation.js`.
- **Windows execution:** `src/ProxyManager.ts` includes platform command resolution helper (`resolveCommandForPlatform`) and remains guarded by `test-windows-exec-validation.js`.

## Fresh Evidence Refresh (2026-02-25)

- **Next-session freshness guard:** `test-next-session-freshness-validation.js` enforces `next-session.md` date recency in default validation flow.
- **Tracker evidence-path integrity:** `scripts/validate-tracker-consistency.js` validates evidence tokens as repo-relative existing files; negative path case is covered in `test-tracker-consistency-validation.js`.
- **Docs-wide link crawl:** `test-docs-canonical-links.js` recursively validates internal markdown links across `docs/`, `README.md`, and `CONTRIBUTING.md`.
- **Windows targeted runtime confidence:** `.github/workflows/ci.yml` `windows-runtime` job runs `node test-windows-exec-validation.js` and `npx tsx test-windows-command-runtime-validation.ts`.
- **PR chain tracking refresh:** Orchestration docs now explicitly record p-chain `#30 -> #31 -> #32 -> #33` and context-rot chain `#34 -> #35 -> #36 -> #37 -> #38` with correct chain heads (`#33`, `#38`).

## Fresh Evidence Refresh (2026-02-25 Final PR-Chain Outcome)

- **Final chain closure snapshot:** PRs `#30`, `#31`, `#32`, `#33`, `#34`, `#36`, `#37`, and `#38` are now merged, closing both tracked chains.
- **PR #35 contained-commit nuance:** PR `#35` is closed with `merged=false`; `head` SHA equals `base` SHA (`10c93dc64cc9b79ad5968161e90366e5409256cd`), confirming no merge commit was needed because content was already present in `main`.
- **Durable outcome artifact:** `docs/session-logs/session-2026-02-25-pr-chain-outcome.md` captures PR-by-PR final outcomes and evidence links.

## Fresh Evidence Refresh (2026-02-25 Post-Dispatch Release Verification)

- **Release workflow outcome:** `workflow_dispatch` run `22404533191` completed with overall status `success` and `publish` job status `success` (evidence: https://github.com/mattmre/EVOKORE-MCP/actions/runs/22404533191).
- **Publish-step behavior:** In `publish`, step `Publish to npm` is `skipped` while step `Publish skipped (NPM_TOKEN missing)` is `success`.
- **Tag/release reconciliation:** Remote tags include `v2.0.0` and `v2.0.1`; latest releases API check returned `404`, indicating no GitHub release object in this run context.

## Fresh Evidence Refresh (2026-02-25 Post-Release Next-Slice Selection)

- **Priority #2 closure reaffirmed:** Final PR outcomes remain captured with contained-commit nuance for `#35` (`merged=false`, head SHA equals base SHA), as documented in `docs/session-logs/session-2026-02-25-pr-chain-outcome.md`.
- **Priority #5 closure completed:** Release verification is complete and next-priority selection is now finalized.
- **Selected next slice:** Dynamic Tool Discovery MVP (metadata index + retrieval-gated tool injection) with baseline benchmark harness.
- **Decision log artifact:** `docs/session-logs/session-2026-02-25-post-release-next-slice.md`.

## Fresh Evidence Refresh (2026-03-04 Routine Tracker Refresh)

- **Phase 1 & 2 Closure:** Phase 1 (Monitoring & Stability) and Phase 2 (Cleanup & Hygiene) closure tasks are complete.
- **Current Operational Focus:** Shifting away from queue closure operations into ongoing system monitoring and hygiene maintenance. All pending closure items have been merged or accounted for.

## Fresh Evidence Refresh (2026-03-06 Phase 3 Implementation Stack)

- **Proxy cooldown hardening:** Local branch `feat/phase2-proxy-hardening-20260306` (`9619b82`) completed cooldown-state hardening with regression coverage in `test-proxy-cooldown.js` and `test-proxy-server-errors.js`; recorded validation command: `npm run build && npm test`.
- **Dynamic tool discovery MVP:** Local branch `feat/dynamic-tool-discovery-mvp-20260306` (`5ad4254`) added `src/ToolCatalogIndex.ts`, `discover_tools`, `test-tool-discovery-validation.js`, `tests/helpers/mock-tool-discovery-server.js`, and `scripts/benchmark-tool-discovery.js`; recorded validation command: `npm run build && node test-tool-discovery-validation.js && npm test`.
- **Benchmark artifact contract:** `scripts/benchmark-tool-discovery.js` and `test-tool-discovery-benchmark-validation.js` now enforce deterministic JSON output (`generatedAt` fixed at epoch), `--output` artifact writing, and stdout/file parity. Recorded benchmark snapshot: `toolCounts legacy=56, dynamic=8, discovered=2`; `estimatedTokens legacy=2684, dynamic=347`.
- **Opt-in live voice validation:** `package.json` (`test:voice:live`) and `test-voice-sidecar-live-validation.js` provide live provider validation/artifact capture behind `EVOKORE_RUN_LIVE_VOICE_TEST=1`, with playback disabled via `VOICE_SIDECAR_DISABLE_PLAYBACK=1` and artifacts routed by `VOICE_SIDECAR_ARTIFACT_DIR`; recorded maintenance validation command: `npm run build && node test-tool-discovery-benchmark-validation.js && npm run test:voice:live && npm test`, where the live step skipped cleanly because the gate env var was not set.
- **Published review chain:** The implementation stack is now open on GitHub as stacked PRs `#65 -> #66 -> #67 -> #68`; review/merge order must follow that sequence, with dependent rebases and revalidation at each merge boundary.

## Fresh Evidence Refresh (2026-03-06 Phase 3 Review Readiness)

- **Live PR audit:** `#65` (`base=main`, `head=feat/phase2-proxy-hardening-20260306`), `#66` (`base=feat/phase2-proxy-hardening-20260306`, `head=feat/dynamic-tool-discovery-mvp-20260306`), `#67` (`base=feat/dynamic-tool-discovery-mvp-20260306`, `head=test/phase3-maintenance-live-provider-artifacts-20260306`), and `#68` (`base=test/phase3-maintenance-live-provider-artifacts-20260306`, `head=docs/phase3-tracking-wrap-20260306`) all remain open with `mergeable_state=clean` and no reviews recorded yet.
- **Checks-status nuance:** GitHub status endpoints currently return `state=pending` with `total_count=0` for each PR head SHA, so local validation evidence remains the reliable readiness signal.
- **Fresh baseline evidence:** The current docs-wrap branch preserved the already-passed baseline `npm run build && npm test`; the standard docs/tracker guardrails plus `npm test` remain the required validation set for this wrap refresh.
- **Scope control decision:** Do not begin broader post-MVP Phase 3 implementation until this chain is reviewed, merged, and rebased through closure.
- **Best next standalone follow-up after closure:** Version/config consistency cleanup for `README.md` v2.0.1 vs `package.json` 2.0.2 vs `src/index.ts` 2.0.0, plus stale `.env.example` discovery env naming.

## Fresh Evidence Refresh (2026-03-06 PR Publication Session Wrap)

- **No unpublished repo work remains to recover after the latest docs-wrap publication:** next session can start from the published PR set instead of looking for hidden local edits.
- **Live checks source:** `gh pr status` now shows checks passing for `#65`, `#66`, `#67`, `#68`, and standalone `#69`, while GitHub MCP `get_status` still reports stale `state=pending` / `total_count=0`.
- **Standalone cleanup publication:** Version/config consistency cleanup is now open as independent PR `#69` against `main`; it is not part of the `#65 -> #66 -> #67 -> #68` chain.

## Fresh Evidence Refresh (2026-03-06 Phase 3 Stack Landing Reconciliation)

- **Merged landing set on `main`:** `#65` (`623e6cd`), `#66` (`da9c811`), `#67` (`41b6f8d`), and standalone cleanup `#69` (`a32c9ae`) are now landed.
- **Closed stale/superseded PRs:** `#61`, `#63`, and `#64` are closed and should no longer be treated as active continuity items.
- **Final continuity refresh scope:** `#68` is the docs/session-wrap reconciliation item for this landing state only; it already carries the latest `origin/main`.
- **Validation baseline remains recorded, not re-opened:** rely on the previously captured landing evidence for `#65` (`npm run build && npm test`), `#66` (`npm run build && node test-tool-discovery-validation.js && npm test`), `#67` (`npm run build && node test-tool-discovery-benchmark-validation.js && npm run test:voice:live && npm test`), and `#69` (`npm run build && node test-version-contract-consistency.js && npm test`).

