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

## Status: All Priorities Complete (2026-03-10)

All 15 original priorities are marked done. The matrix above is in monitoring posture.

## Historical Evidence

Evidence refresh narratives have been moved to [docs/archive/priority-evidence-refreshes-2026-Q1.md](./archive/priority-evidence-refreshes-2026-Q1.md).

