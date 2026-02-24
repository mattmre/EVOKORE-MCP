# Priority Status Matrix

Snapshot of the requested 15 priority items/phases, grounded in current repository evidence.

| Priority ID | Priority item/phase | Status | Evidence (files/tests/workflows) | Notes |
|---|---|---|---|---|
| p01 | PR review/approval playbook | done | `docs/PR_MERGE_RUNBOOK.md`, `.github/pull_request_template.md`, `test-ops-docs-validation.js`, `next-session.md` | Added required-check matrix and reviewer responsibility guidance. |
| p02 | Merge-order controls | done | `docs/PR_MERGE_RUNBOOK.md`, `next-session.md`, `test-ops-docs-validation.js` | Added dependency-chain merge controls and durable sequencing language. |
| p03 | CI verification on push + PR | done | `.github/workflows/ci.yml`, `test-ci-workflow-validation.js`, `package.json` | CI test job now runs on both `push` and `pull_request` for `main`. |
| p04 | Release flow hardening | done | `.github/workflows/release.yml`, `docs/RELEASE_FLOW.md`, `test-npm-release-flow-validation.js` | Added manual `workflow_dispatch` `chain_complete` gate plus `origin/main` ancestry gate before publish. |
| p05 | HITL token flow operator guidance | done | `docs/USAGE.md`, `docs/TROUBLESHOOTING.md`, `test-hitl-token-docs-validation.js` | Documented one-time, arg-bound, short-lived token behavior and retry workflow. |
| p06 | Tool-prefix collision safety | done | `src/ProxyManager.ts`, `test-tool-prefix-collision-validation.js` | Added structured duplicate collision summary telemetry; first-registration-wins remains enforced. |
| p07 | Submodule commit-order safety | done | `.github/workflows/ci.yml`, `scripts/validate-submodule-cleanliness.js`, `test-submodule-commit-order-guard-validation.js` | Added CI guard for uninitialized/mismatched/dirty submodules. |
| p08 | Dist path resolution safety | done | `test-dist-path-validation.js` | Dist/runtime path validation remains passing and unchanged by this cycle. |
| p09 | Frontmatter regex robustness | done | `test-regex-frontmatter-standardization.js`, `src/SkillManager.ts` | Added SkillManager canonical regex coverage to regression guard. |
| p10 | Docs canonical mapping | done | `test-docs-canonical-links.js`, `docs/README.md` | Extended docs link validation to resolve internal links and mapped canonical targets. |
| p11 | Windows command resolution | done | `src/ProxyManager.ts` (`resolveCommandForPlatform` helper), `test-windows-exec-validation.js`, `test-voice-windows-docs-validation.js` | `npx.cmd` fallback and Windows guidance remain validated. |
| p12 | Env interpolation guarantees | done | `src/ProxyManager.ts`, `test-env-sync-validation.js`, `test-unresolved-env-placeholder-validation.js`, `docs/TROUBLESHOOTING.md` | Unresolved placeholders now fail fast with explicit server/key diagnostics. |
| p13 | Voice sidecar contract | done | `docs/USAGE.md`, `test-voice-contract-validation.js`, `test-voice-sidecar-hotreload-validation.js` | Formalized protocol contract (`text`/`persona`/`flush`) and hot-reload expectations. |
| p14 | Sync-config safety | done | `scripts/sync-configs.js`, `test-sync-configs-mode-validation.js`, `test-sync-configs-preserve-force-validation.js`, `docs/USAGE.md` | Added preserve-existing default, `--force` override, and conflict guards. |
| p15 | Orchestration tracking and PR slicing | done | `docs/ORCHESTRATION_TRACKER.md`, `docs/RESEARCH_DECISIONS_LOG.md`, `docs/session-logs/session-2026-02-24-agentic-orchestration-implementation.md` | Current implementation run is captured with phase timeline, validation outcomes, and PR slicing follow-ups. |

## Fresh Evidence Refresh (2026-02-24)

- **Governance:** `.github/pull_request_template.md` now serves as an explicit reviewer/chain metadata anchor.
- **Release manual gate:** `.github/workflows/release.yml` enforces `workflow_dispatch` input `chain_complete=true` before publish continues.
- **Hooks observability:** `scripts/hook-observability.js` provides JSONL telemetry (`~/.evokore/logs/hooks.jsonl`) with validation in `hook-test-suite.js` and `hook-e2e-validation.js`.
- **Windows execution:** `src/ProxyManager.ts` includes platform command resolution helper (`resolveCommandForPlatform`) and remains guarded by `test-windows-exec-validation.js`.

