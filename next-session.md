# Next Session Priorities

## Implemented This Cycle

- Voice sidecar hot-reload validation added and tracked as completed (`test-voice-sidecar-hotreload-validation.js`).
- Voice docs + sidecar smoke coverage and tool-prefix collision hardening shipped in pending PRs.

## Next Actions (Prioritized)

1. **Rebuild dependency chain before review**: Classify open PRs as `base -> dependent` and record merge order in each PR description.
2. **Approve only chain head PRs**: Hold dependent PR approvals until base PRs are merged and branches are rebased on latest `main`.
3. **Merge sequentially with revalidation**: Merge one chain step at a time using `docs/PR_MERGE_RUNBOOK.md`; re-run required checks after each rebase to prevent queue drift/context rot.
4. **Run release flow after chain completion**: When dependency chain is fully merged and green, execute `docs/RELEASE_FLOW.md`.
