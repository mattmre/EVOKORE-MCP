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
| p13 | Voice sidecar contract | done | `docs/USAGE.md`, `test-voice-contract-validation.js`, `test-voice-sidecar-hotreload-validation.js` | Formalized protocol contract (`text`/`persona`/`flush`) and hot-reload expectations. |
| p14 | Sync-config safety | done | `scripts/sync-configs.js`, `test-sync-configs-mode-validation.js`, `test-sync-configs-preserve-force-validation.js`, `docs/USAGE.md` | Added preserve-existing default, `--force` override, and conflict guards. |
| p15 | Orchestration tracking and PR slicing | done | `docs/ORCHESTRATION_TRACKER.md`, `scripts/validate-tracker-consistency.js`, `test-tracker-consistency-validation.js`, `test-next-session-freshness-validation.js`, `docs/RESEARCH_DECISIONS_LOG.md`, `docs/session-logs/session-2026-02-25-priority-orchestration.md`, `docs/session-logs/session-2026-02-25-context-rot-orchestration.md` | Added tracker evidence-path integrity checks and next-session freshness guard evidence for context-rot-resistant orchestration continuity; PR chain explicitly tracked as `#30 -> #31 -> #32 -> #33 -> #38` (`#38` chain head). |

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
- **PR chain tracking refresh:** Orchestration docs now explicitly record `#30 -> #31 -> #32 -> #33 -> #38` with `#38` as chain head.

