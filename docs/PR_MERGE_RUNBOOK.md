# PR Merge Runbook

Operator runbook for reliable merges and context-rot prevention.

## Pre-merge Checklist

- [ ] PR scope matches approved plan
- [ ] PR description is filled using `.github/PULL_REQUEST_TEMPLATE.md`
- [ ] PR metadata automation check (`scripts/validate-pr-metadata.js`) is passing for pull_request CI runs
- [ ] Required tests pass locally/CI
- [ ] Docs updated for user-facing behavior changes
- [ ] Release-impacting changes called out
- [ ] Follow-up issues captured (if any)

## Required Checks by Change Type

Use this as the minimum check set before approval and merge:

| Change type | Required checks |
| --- | --- |
| Docs-only changes | `npm run docs:check` |
| Ops/docs process changes (`docs/PR_MERGE_RUNBOOK.md`, `next-session.md`, orchestration docs) | `npm run docs:check` |
| Source/tooling/config changes (`src/`, `scripts/`, workflow/config files) | Relevant targeted tests for touched area plus CI-required suite |
| Release-flow changes | `npm run release:check` plus docs/link checks |

If a PR spans multiple change types, run the union of required checks.

## Reviewer Responsibilities

- Confirm PR scope and dependency assumptions are explicit in description.
- Confirm PR metadata fields from `.github/PULL_REQUEST_TEMPLATE.md` are complete.
- Verify required checks for each change type are attached in PR evidence.
- Block approval if dependency base PR is not merged or branch is stale.
- Approve only the current chain head; do not pre-approve non-head dependent PRs.
- Confirm all review conversations are resolved before final approval.
- Ensure merge strategy and rollback notes are documented for risky changes.

## Merge Steps

1. Rebase or update branch with latest target branch.
2. Re-run required validations.
3. Confirm reviewer approvals and resolved conversations.
4. Merge via approved strategy.
5. Record merge commit/PR number in tracker.

## Merge-boundary Checkpoints

At every dependency merge boundary (`base -> dependent`):

1. Rebase dependent PR branch on latest `main` immediately after parent merge.
2. Re-run required checks and attach updated evidence in PR metadata.
3. Revalidate approvals for the new head state (stale approvals must be refreshed).
4. Confirm merge-boundary revalidation notes are updated before merge.

## Merge-order Controls (Dependency Chain)

1. Define merge order explicitly in PR descriptions (`base -> dependent`).
2. Merge only the current chain head; hold dependents until parent merge is complete.
3. After each merge, rebase dependent PRs on latest `main` and re-run required checks.
4. If a parent PR changes behavior materially, request re-review on dependents.
5. Do not batch-merge dependent PRs without per-PR validation to prevent queue drift.

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
