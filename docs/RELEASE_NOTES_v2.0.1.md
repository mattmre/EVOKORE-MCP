# EVOKORE-MCP Release Notes - v2.0.1

This release consolidates operational hardening, documentation controls, and merge/release safety guardrails.

## Highlights

1. **PR governance and merge-boundary controls**
   - Added `.github/pull_request_template.md` for required metadata.
   - Expanded `docs/PR_MERGE_RUNBOOK.md` with chain-head approval and merge-boundary checkpoint guidance.
   - Updated `CONTRIBUTING.md` to require PR metadata for process/tooling/release-impacting changes.

2. **Release workflow hardening**
   - Manual `workflow_dispatch` runs now require `chain_complete=true`.
   - Release still enforces ancestry check (`GITHUB_SHA` must be on `origin/main`).
   - Publish remains gated by `NPM_TOKEN`.

3. **Windows executable resolution contract**
   - Runtime command resolution remaps only `npx` to `npx.cmd` on Windows.
   - `uv` / `uvx` are not remapped and must resolve directly from PATH.

4. **Hook observability telemetry**
   - Added `scripts/hook-observability.js`.
   - Hook events are written to `~/.evokore/logs/hooks.jsonl`.
   - Hook logging is best-effort and does not alter fail-safe execution behavior.

5. **Submodule safety guard reliability**
   - CI submodule validation now correctly handles submodule paths that contain spaces.
   - Added `.gitmodules` mapping and refreshed submodule pointers to reachable commits for CI checkout reliability.

## Operational Notes

- Merged stacked implementation/reconcile PR chain into `main`.
- Release prep PR merged for `v2.0.1`.
- Tag `v2.0.1` pushed and Release workflow succeeded.
- npm publish step was skipped when `NPM_TOKEN` was not configured.

## Validation Evidence

- `node test-ops-docs-validation.js`
- `node test-docs-canonical-links.js`
- `node test-npm-release-flow-validation.js`
- `node test-windows-exec-validation.js`
- `node hook-test-suite.js`
- `node hook-e2e-validation.js`
- `node test-submodule-commit-order-guard-validation.js`
- `npm test`
