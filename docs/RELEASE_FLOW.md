# EVOKORE-MCP Release Flow

This repository publishes to npm through a guarded GitHub Actions workflow: `.github/workflows/release.yml`.

## Current State Verification

Do not rely on static values in this document for release state.
Always verify current release status at runtime with commands:

```bash
# Latest pushed release tag in the remote repository
git ls-remote --tags origin "v*" | sed 's/.*refs\/tags\///' | sort -V | tail -n 1

# Latest GitHub release metadata (if releases are created)
gh release list --limit 1

# Most recent Release workflow runs and outcomes
gh run list --workflow release.yml --limit 5
```

If `NPM_TOKEN` is not configured, the workflow completes successfully with publish explicitly skipped.

## Triggers

- **Git tag push**: `v*.*.*` (for normal releases)
- **Manual run**: `workflow_dispatch` (for supervised reruns only after dependency chain completion)

## Dependency Chain Requirement

Before any release (including manual reruns), confirm the full dependency chain is complete.
Manual workflow dispatches are blocked unless the `chain_complete` input is explicitly set to `true`.

## Manual Dispatch Gate Details

For `workflow_dispatch` runs:

- Input: `chain_complete` (`boolean`)
- Required value to proceed: `true`
- If `chain_complete != true`, the workflow exits early before publish steps

## Safe Publish Sequence

The release job runs the same quality gates used in development:

1. Verify the release commit (`GITHUB_SHA`) is an ancestor of `origin/main`.
2. `npm ci`
3. `npm test`
4. `npm run build`
5. `npm publish` (only when `NPM_TOKEN` is configured)

If `NPM_TOKEN` is not set in repository secrets, publish is skipped and the workflow still reports the guard condition.

## Operator Checklist

1. Confirm local branch is clean and merged to `main`.
2. Update package version as needed.
3. Create and push a version tag:
   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```
4. For manual `workflow_dispatch` runs, set `chain_complete=true` only after verifying dependency chain completion.
5. Verify the Release workflow completed and published successfully.
