# M0 Release Preflight — Implementation Research

- **Date:** 2026-03-26
- **Milestone:** M0 (Release Closure)
- **Status:** Complete

## Existing Release Infrastructure

### What was found

1. **`.github/workflows/release.yml`** triggers on `v*.*.*` tag pushes and manual `workflow_dispatch`. It runs `npm ci`, `npm test`, `npm run build`, then conditionally publishes to npm only when `NPM_TOKEN` is set. A GitHub Release is auto-created on tag pushes via `softprops/action-gh-release@v2`.

2. **Silent npm skip gap**: When `NPM_TOKEN` is not configured, the workflow prints a message but still exits 0. There is no pre-tag gate that warns the operator about this. The GitHub Release is created regardless, giving the impression of a successful release even though npm publish was skipped.

3. **Existing validation tests**: `test-npm-release-flow-validation.js` validates workflow YAML structure and `package.json` publish readiness. `test-release-doc-freshness-validation.js` validates that `docs/RELEASE_FLOW.md` uses runtime commands rather than stale static values.

4. **`docs/RELEASE_FLOW.md`** documents the workflow triggers, dependency chain, and publish sequence but had no automated preflight section.

5. **No `prepack` script**: The `package.json` did not have a `prepack` hook, so `npm pack` could produce a stale tarball if the build was outdated.

## Design Decisions

### Self-contained operator tool

The preflight script lives in `scripts/` and imports nothing from `src/`. This keeps it independent of the runtime build — it should work even when `dist/` does not exist yet (the build check will trigger a build attempt).

### execFileSync over execSync

Per project convention (CLAUDE.md security patterns), all subprocesses use `execFileSync('git', [...args])` or `execFileSync('npm', [...args])` to avoid shell injection. No shell expansion is used.

### No cross-spawn dependency

The project does not have `cross-spawn` installed. Since the script only calls `git`, `npm`, `npx`, and `gh` — all of which are `.exe` on Windows and resolve via PATH — `child_process.execFileSync` works directly without `.cmd` suffix handling. The `npx` call in `checkBuild` is the only borderline case, but it runs through `execFileSync` which handles PATH resolution.

### Blocking vs. warning separation

Checks are split into two tiers:
- **Blocking** (exit 1): Issues that would cause a broken release (wrong version, missing build, dirty tree, duplicate tag).
- **Warning** (exit 0): Issues that are advisory but do not prevent the release from working (missing NPM_TOKEN just means npm publish is skipped, which is an existing known behavior).

### Dry-run mode

The `--dry-run` flag skips checks that depend on remote git state (`checkAncestor`). This lets the script run safely during local development or in CI steps where `origin/main` may not be available.

### JSON output

The `--json` flag enables programmatic consumption, returning a structured object with version, dry-run status, and an array of results.

### Exported check functions

Each check is exported individually so tests can validate the return shape and behavior of each check in isolation.

## Check Coverage

| # | Check | Why |
|---|-------|-----|
| 1 | Semver validity | Prevents nonsense versions from being tagged |
| 2 | CHANGELOG entry | Ensures release notes exist before the tag is created |
| 3 | Build artifact | Catches stale or missing dist/ — the `prepack` script also helps here |
| 4 | Pack dry-run | Validates the tarball contents and size before publishing |
| 5 | Clean tree | Prevents accidental inclusion of uncommitted changes |
| 6 | Ancestor check | Matches the workflow's own `merge-base --is-ancestor` gate |
| 7 | Tag uniqueness | Prevents double-tagging, which creates confusing release history |
| 8 | NPM_TOKEN (warn) | Surfaces the silent-skip gap that motivated this milestone |
| 9 | Tarball size (warn) | Early warning for accidental bloat from submodules or generated files |
