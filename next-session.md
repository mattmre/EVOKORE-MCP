# Next Session Priorities

Last Updated (UTC): 2026-02-25

## Next Actions (Prioritized)

1. **Review p01/p02/p04/p11/p15 slices in dependency order**: Review stacked chain `#30 -> #31 -> #32 -> #33 -> #38` (chain head: `#38`) and confirm `base -> dependent` metadata in each PR.
2. **Approve/merge base-first only**: Use strict base-first merge sequencing across `#30 -> #31 -> #32 -> #33 -> #38`; do not approve or merge dependents until parent PR merge + rebase are complete.
3. **Revalidate at each merge boundary**: Re-run required checks evidence (`test-pr-metadata-validation`, `test-release-doc-freshness-validation`, Windows runtime, tracker consistency, full `npm test`) after each rebase/revalidation boundary.
4. **Complete release sequence last**: After all slices are merged and green on `main`, run `docs/RELEASE_FLOW.md` with manual dispatch safeguards (`chain_complete=true`) as needed.

