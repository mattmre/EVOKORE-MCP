# Priority Status Matrix

Snapshot of the requested 15 priority items/phases, grounded in current repository evidence.

| # | Priority item/phase | Status | Evidence (files/tests/workflows) | Notes |
|---|---|---|---|---|
| 1 | End-to-end hook validation | done | `hook-e2e-validation.js`, `.claude/settings.json`, `package.json` (`npm test`) | Hook config and E2E checks are automated. |
| 2 | Merge open PRs | ops/manual | `docs/PR_MERGE_RUNBOOK.md` | Operational GitHub action, not fully provable from repo files alone. |
| 3 | Hook test suite in npm test | done | `hook-test-suite.js`, `package.json` (`npm test`) | Included in default test chain. |
| 4 | TillDone `--session auto` | done | `scripts/tilldone.js`, `hook-test-suite.js` | Env-based auto session resolution implemented and tested. |
| 5 | Voice E2E pipeline validation | done | `test-voice-e2e-validation.js`, `test-voice-sidecar-smoke-validation.js`, `scripts/voice-hook.js` | Hook-to-sidecar transport and sidecar runtime startup/connect/shutdown smoke coverage are validated. |
| 6 | CI tests on PRs | done | `.github/workflows/ci.yml` | Pull requests to `main` run `npm test`. |
| 7 | NPM publishing/release flow | ops/manual | `.github/workflows/release.yml`, `docs/RELEASE_FLOW.md`, `test-npm-release-flow-validation.js` | Workflow and guardrails are implemented; execution/publish remains an operational/manual step. |
| 8 | Voice refinement (persona/speed/ffmpeg) | done | `test-voice-refinement-validation.js`, `src/VoiceSidecar.ts`, `voices.json` | Persona merge and speed/refinement checks covered by tests. |
| 9 | HITL approval-token flow + tool-prefix collision guard | done | `test-hitl.js`, `test-hitl-hardening.js`, `test-tool-prefix-collision-validation.js`, `src/ProxyManager.ts` | Restricted-tool approval/token hardening is verified; duplicate prefixed tool registration keeps the first tool, skips later duplicates with warning, and logs duplicate-skip summary. |
| 10 | Submodule-safe documentation workflow | done | `docs/SUBMODULE_WORKFLOW.md`, `test-submodule-doc-workflow.js` | Submodule commit order and parent pointer workflow validated. |
| 11 | Dist path resolution correctness | done | `test-dist-path-validation.js` (includes runtime dry-run assertion), `docs/USAGE.md`, `docs/TROUBLESHOOTING.md` | Runtime validation now asserts dist-path behavior, not docs-only coverage. |
| 12 | Windows executable handling | done | `test-windows-exec-validation.js`, `test-voice-windows-docs-validation.js`, `src/ProxyManager.ts`, `docs/USAGE.md`, `docs/TROUBLESHOOTING.md` | `npx.cmd` fallback behavior and VoiceMode Windows setup/troubleshooting guidance are covered. |
| 13 | Environment interpolation in config | done | `test-env-sync-validation.js`, `src/ProxyManager.ts`, `mcp.config.json` | `${VAR}` interpolation behavior validated. |
| 14 | Docs canonical mapping to physical paths | done | `test-docs-canonical-links.js`, `docs/README.md` | Legacy-to-canonical mapping checks are automated. |
| 15 | Cross-CLI sync dry-run/apply safety | done | `scripts/sync-configs.js`, `test-sync-configs-mode-validation.js`, `package.json`, `docs/USAGE.md` | Confirmed gap was implemented: explicit mode behavior (`--apply` vs dry-run default) plus validation coverage. |

