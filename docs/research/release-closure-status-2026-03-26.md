# Release Closure Status — 2026-03-26

## Purpose

Capture the actual release-closure state after the S3.1 and S3.2 stabilization
merges so the next session does not have to rediscover whether the remaining
release work is code-related or operator-gated.

## Evidence Gathered

### Local Preflight (clean `origin/main` worktree)

Command:

```powershell
npm run release:preflight
```

Result after installing dependencies in the clean worktree:

- Version: `3.1.0` valid
- CHANGELOG entry for `v3.1.0` present
- Build passes and `dist/index.js` exists
- `npm pack --json` parses successfully
- Git working tree clean
- HEAD is ancestor of `origin/main`
- Blocking issue: git tag `v3.1.0` already exists
- Warning: `NPM_TOKEN` not found in GitHub secrets

Interpretation:

- Release automation/code paths are healthy.
- The remaining blockers are release-state/operator issues, not missing code.

### Git Tag State

Command:

```powershell
git tag --list v3.1.0
```

Result:

- `v3.1.0` exists locally and on GitHub

### GitHub Release State

Command:

```powershell
gh release view v3.1.0 --json 'name,tagName,isDraft,isPrerelease,publishedAt,url'
```

Result:

- GitHub release exists
- Published at `2026-03-26T11:12:49Z`
- URL: `https://github.com/mattmre/EVOKORE-MCP/releases/tag/v3.1.0`

### npm Registry State

Command:

```powershell
npm view evokore-mcp version
```

Result:

- `404 Not Found`

Interpretation:

- The package is not currently published on npm under `evokore-mcp`

### GitHub Secrets Visibility

Command:

```powershell
gh secret list
```

Observed result:

- no visible repository secrets in this environment

Practical conclusion:

- Treat `NPM_TOKEN` as absent/unconfirmed until an operator verifies it

## Release Closure Conclusion

The remaining release-closure work is **not a code PR first**.

It is an operator-gated release-state problem:

1. `v3.1.0` GitHub release already exists
2. npm publication is still absent
3. `NPM_TOKEN` is not visible in repo secrets from the current environment

## Recommended Next Actions

1. Operator verifies or sets `NPM_TOKEN` in GitHub repository secrets
2. Decide whether npm publication should happen by:
   - rerunning the existing release workflow if it supports the desired path, or
   - using a dedicated publish workflow/manual publish step that targets the
     existing `v3.1.0` tag cleanly
3. After operator action, rerun `npm run release:preflight`
4. Verify npm publication externally

## What This Slice Does Not Need

- No application code changes
- No release-preflight script changes
- No version bump yet

Those would add churn without addressing the actual blocker.
