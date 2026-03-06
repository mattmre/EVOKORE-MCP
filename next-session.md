# Next Session Priorities

Last Updated (UTC): 2026-03-06

## Completed (Audited Open Phase 3 PR Stack)
- **PR #65 / `feat/phase2-proxy-hardening-20260306`:** Base `main`, mergeable state `clean`, no reviews yet. Proxy cooldown hardening remains backed by `test-proxy-cooldown.js` and `test-proxy-server-errors.js`.
- **PR #66 / `feat/dynamic-tool-discovery-mvp-20260306`:** Base `feat/phase2-proxy-hardening-20260306`, mergeable state `clean`, no reviews yet. Dynamic tool discovery MVP remains backed by `src/ToolCatalogIndex.ts`, `discover_tools`, `test-tool-discovery-validation.js`, and the benchmark harness.
- **PR #67 / `test/phase3-maintenance-live-provider-artifacts-20260306`:** Base `feat/dynamic-tool-discovery-mvp-20260306`, mergeable state `clean`, no reviews yet. Maintenance validation remains backed by deterministic benchmark artifact output plus opt-in live voice artifact capture coverage.
- **PR #68 / `docs/phase3-tracking-wrap-20260306`:** Base `test/phase3-maintenance-live-provider-artifacts-20260306`, mergeable state `clean`, no reviews yet. This docs-wrap PR remains the open chain head for `#65 -> #66 -> #67 -> #68`.
- **PR #69 / `fix/version-contract-consistency-20260306`:** Standalone cleanup PR is now open against `main` to align version/runtime/env contracts. Local validation passed as `npm run build && node test-version-contract-consistency.js && npm test`; review it independently from the stacked Phase 3 chain.
- **Validation evidence to trust right now:** GitHub status endpoints currently report `state=pending` and `total_count=0` for each head SHA, so the durable evidence is the recorded local validation. The current docs-wrap branch has now passed `npm run build && npm test` plus the post-refresh guardrail set: `node test-ops-docs-validation.js`, `node test-docs-canonical-links.js`, `node test-next-session-freshness-validation.js`, and `node test-tracker-consistency-validation.js`.

## Next Actions (Prioritized)
1. **Get reviews and merge strictly in order `#65 -> #66 -> #67 -> #68`:** None of these PRs is merged yet, and all four currently show no reviews.
2. **At every merge boundary, rebase the next child branch and re-run validations:** Reconfirm `npm run build`, the targeted discovery/benchmark/live-voice checks required by the rebased branch, and `npm test` before moving to the next PR in the chain.
3. **Do not start broader post-MVP Phase 3 implementation yet:** First close the current stack safely and keep the review/rebase surface area small.
4. **Review standalone cleanup PR #69 independently from the stack:** `fix/version-contract-consistency-20260306` targets `main` directly, so it should not be treated as part of the `#65 -> #66 -> #67 -> #68` dependency chain.
