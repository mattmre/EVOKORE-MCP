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
2. Use Node.js `20`
3. `npm ci`
4. `npm test`
5. `npm run build`
6. `npm publish` (only when `NPM_TOKEN` is configured)
7. Create GitHub Release (only on tag push; see below)

If `NPM_TOKEN` is not set in repository secrets, publish is skipped and the workflow still reports the guard condition.

## GitHub Release Auto-Creation

When the workflow is triggered by a tag push (`refs/tags/v*.*.*`), a GitHub Release is automatically created after the publish step using [softprops/action-gh-release@v2](https://github.com/softprops/action-gh-release). The release uses GitHub's auto-generated release notes, which summarize commits since the previous tag.

A `workflow_dispatch` run does not create a GitHub Release because the `if: startsWith(github.ref, 'refs/tags/')` condition is not satisfied. Manual releases should only be created via the GitHub UI if needed after a dispatch run.

The workflow requires `contents: write` permission on the `GITHUB_TOKEN` to allow release creation.

## Preflight Command

Before tagging a release, run the automated preflight checks:

```bash
npm run release:preflight
```

This executes `scripts/release-preflight.js`, which performs both blocking and warning-level checks in a single pass.

### Blocking checks (exit code 1 if any fail)

| Check | What it verifies |
|-------|-----------------|
| Version | `package.json` version is valid semver |
| CHANGELOG | An entry for the current version exists in `CHANGELOG.md` |
| Build | `dist/index.js` exists (runs `tsc` if missing) |
| Pack | `npm pack --dry-run` succeeds, tarball under 5 MB |
| Clean tree | No uncommitted changes in the working tree |
| Ancestor | Current HEAD is reachable from `origin/main` |
| Tag | Git tag `v{version}` does not already exist |

### Warning checks (exit code 0, printed as warnings)

| Check | What it verifies |
|-------|-----------------|
| NPM_TOKEN | `NPM_TOKEN` is present in GitHub repository secrets (checked via `gh secret list`) |
| Tarball size | Tarball is under 2 MB (advisory threshold) |

### Interpreting output

- Lines prefixed with a check mark indicate passing checks.
- Lines prefixed with an X indicate blocking failures. Fix these before tagging.
- Lines prefixed with a warning symbol are advisory. The release workflow will still succeed, but the operator should be aware (for example, a missing `NPM_TOKEN` means npm publish will be silently skipped).

### Dry-run mode

To run only the checks that do not depend on remote git state:

```bash
npm run release:preflight -- --dry-run
```

This skips the `origin/main` ancestry check, which is useful during local development or in CI environments where the full remote history may not be available.

### JSON output

For programmatic consumption:

```bash
node scripts/release-preflight.js --json
```

### Environment variables

- `EVOKORE_RELEASE_PREFLIGHT_SKIP_SECRETS` — Set to any truthy value to skip the `NPM_TOKEN` secret check. Useful in CI where secrets are not exposed to the preflight step.

## Operator Checklist

1. Confirm local branch is clean and merged to `main`.
2. Update package version as needed.
3. Run the preflight checks:
   ```bash
   npm run release:preflight
   ```
4. Run the release validators:
   ```bash
   npm run release:check
   npm run docs:check
   ```
5. Create and push a version tag:
   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```
6. For manual `workflow_dispatch` runs, set `chain_complete=true` only after verifying dependency chain completion.
7. Verify the Release workflow completed and published successfully.
