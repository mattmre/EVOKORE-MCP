# Next Session Priorities

## Next Actions (Prioritized)

1. **Review p01/p02/p04/p11/p15 slices in dependency order**: Confirm `base -> dependent` chain is explicit in each PR and matches `docs/PR_MERGE_RUNBOOK.md`.
2. **Approve/merge base-first only**: Do not approve or merge dependent PRs until parent PR merge + rebase are complete.
3. **Revalidate at each merge boundary**: Re-run required checks evidence (`test-pr-metadata-validation`, `test-release-doc-freshness-validation`, Windows runtime, tracker consistency, full `npm test`) after each rebase.
4. **Complete release sequence last**: After all slices are merged and green on `main`, run `docs/RELEASE_FLOW.md` with manual dispatch safeguards (`chain_complete=true`) as needed.
