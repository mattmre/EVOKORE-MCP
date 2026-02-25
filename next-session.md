# Next Session Priorities

Last Updated (UTC): 2026-02-25

## Next Actions (Prioritized)

1. **Review dependency chains explicitly**: Review p01/p02/p04/p11/p15 chain `#30 -> #31 -> #32 -> #33` (head: `#33`) and context-rot chain `#34 -> #35 -> #36 -> #37 -> #38` (head: `#38`); confirm `base -> dependent` metadata in each PR.
2. **Approve/merge base-first per chain**: Use strict base-first sequencing within each chain (`#30 -> #31 -> #32 -> #33`, then `#34 -> #35 -> #36 -> #37 -> #38`); do not approve/merge dependents before parent merge + rebase.
3. **Revalidate at each merge boundary**: Re-run required checks evidence (`test-pr-metadata-validation`, `test-release-doc-freshness-validation`, Windows runtime, tracker consistency, full `npm test`) after each rebase/revalidation boundary.
4. **Complete release sequence last**: After all slices are merged and green on `main`, run `docs/RELEASE_FLOW.md` with manual dispatch safeguards (`chain_complete=true`) as needed.

