# PR Merge Runbook

Operator runbook for reliable merges and context-rot prevention.

## Pre-merge Checklist

- [ ] PR scope matches approved plan
- [ ] Required tests pass locally/CI
- [ ] Docs updated for user-facing behavior changes
- [ ] Release-impacting changes called out
- [ ] Follow-up issues captured (if any)

## Merge Steps

1. Rebase or update branch with latest target branch.
2. Re-run required validations.
3. Confirm reviewer approvals and resolved conversations.
4. Merge via approved strategy.
5. Record merge commit/PR number in tracker.

## Post-merge Verification

- [ ] Pull latest target branch locally
- [ ] Run smoke checks for changed workflows
- [ ] Verify docs links and scripts still resolve
- [ ] Confirm any release gates remain green

## Rollback Plan

1. Identify failing change and impacted files.
2. Revert merge commit in a dedicated PR.
3. Re-run validation suite before re-merge.
4. Document root cause and prevention update.

## Initial Entry (This Execution)

- Scope: Sync config mode controls, docs updates, and validation coverage.
- Critical checks: `test-sync-configs-mode-validation.js`, `test-ops-docs-validation.js`, full `npm test`.
- Merge note: Ensure `sync` remains explicit apply while default CLI invocation is dry-run safe.
