# Release Validation Entry Points Research — 2026-03-19

## Objective

Identify the first safe implementation slice after confirming the open PR queue is empty, with priority on release-readiness and operator-path correctness.

## Live State

- Open PRs on GitHub: `0`
- Current branch: `main`
- Current `HEAD`: `6d6aef4`
- Package version: `3.0.0`

## Findings

### 1. `release:check` was not executable as documented

`package.json` defined:

```json
"release:check": "node test-npm-release-flow-validation.js"
```

But `test-npm-release-flow-validation.js` is a Vitest-style test file that uses the global `test(...)` API. Running it with raw Node fails immediately with `ReferenceError: test is not defined`.

### 2. Docs validation commands had the same migration gap

The active docs referenced:

- `node test-docs-canonical-links.js`
- `node test-ops-docs-validation.js`

Both files are also Vitest-style validators and fail the same way when run through plain Node.

### 3. Release workflow runtime drifted from package and CI expectations

- `package.json` requires `node >=20`
- `.github/workflows/ci.yml` already runs on Node `20`
- `.github/workflows/release.yml` still used Node `18.x`

That mismatch is release-risky because the publish path was no longer exercising the same runtime contract as CI and local development.

## Decision

Bundle the following into the first sequential PR-sized slice:

1. Make release validators runnable through `npm run release:check`
2. Add a stable `npm run docs:check` entrypoint for docs link and ops-doc validations
3. Align the release workflow to Node 20
4. Strengthen the release validator so future workflow/script drift is caught automatically
5. Update active operator docs to prefer the package-level commands

## Validation Run

- `npm run release:check` — passed
- `npm run docs:check` — passed
- `npm run build` — passed

## Remaining Blockers After This Slice

- `v3.0.0` publish still requires explicit operator action and `NPM_TOKEN`
- STT live validation still requires `OPENAI_API_KEY`
- Supabase live validation still requires `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF`
- Real registry URL validation still requires a non-empty registry configuration or dedicated harness

## Recommended Next Sequence

1. Publish this slice as its own PR
2. Add a registry validation harness or local mock-registry slice
3. Add FileSessionStore restart smoke/evidence
4. Verify `NPM_TOKEN`, then execute the `v3.0.0` tag/publish action
5. Run the credential-gated validations for Whisper and Supabase
