# EVOKORE-MCP Release Flow

This repository publishes to npm through a guarded GitHub Actions workflow: `.github/workflows/release.yml`.

## Triggers

- **Git tag push**: `v*.*.*` (for normal releases)
- **Manual run**: `workflow_dispatch` (for supervised reruns)

## Safe Publish Sequence

The release job runs the same quality gates used in development:

1. `npm ci`
2. `npm test`
3. `npm run build`
4. `npm publish` (only when `NPM_TOKEN` is configured)

If `NPM_TOKEN` is not set in repository secrets, publish is skipped and the workflow still reports the guard condition.

## Operator Checklist

1. Confirm local branch is clean and merged to `main`.
2. Update package version as needed.
3. Create and push a version tag:
   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```
4. Verify the Release workflow completed and published successfully.
