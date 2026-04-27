---
name: setup-pre-commit
description: Use when bootstrapping or extending the pre-commit hook chain (Husky + lint-staged + Prettier + typecheck + integration tests) for an EVOKORE-style TypeScript repo, including detecting an existing setup, surfacing the diff, and never silently overwriting a configured chain.
category: developer-tools
tags: [husky, lint-staged, prettier, pre-commit, ci, typescript, evokore]
version: 1.0.0
upstream: mattpocock/skills
upstream-sha: 90ea8eec03d4ae8f43427aaf6fe4722653561a42
upstream-path: setup-pre-commit/SKILL.md
license: MIT
aliases: [husky-setup, precommit-setup, install-husky, lint-staged-setup]
resolutionHints:
  - install Husky + lint-staged
  - configure pre-commit hooks
  - set up Prettier + typecheck + tests on commit
  - extend an existing pre-commit chain
---

# Setup Pre-Commit Hooks

Set up (or extend) the EVOKORE pre-commit chain: **Husky** + **lint-staged** + **Prettier** + **typecheck** + a **fast-failing integration-test slice**. Detect the existing setup before writing anything; if the repo already has Husky configured, this skill is an UPLIFT (extend, never overwrite).

## When to use this skill

Use when an operator asks to install pre-commit hooks, set up Husky, configure lint-staged, add commit-time formatting / typechecking / testing to an EVOKORE-style TypeScript repo, or extend an existing pre-commit chain that's already partially configured.

Trigger phrases that should activate this skill:
- "set up pre-commit hooks"
- "install Husky"
- "add lint-staged"
- "extend the pre-commit chain"
- "wire Prettier into commits"
- "add a typecheck pre-commit step"

Do **not** use this skill for:
- CI / GitHub-Actions pre-merge gates (those are separate from local pre-commit hooks; use a CI-focused skill).
- Bypassing the pre-commit hook (`git commit --no-verify`) — see "Bypass and debugging" below.
- Repos that aren't TypeScript-based and Node-toolchain compatible — adapt manually instead of running this skill blindly.

## Adapted From Upstream

This skill is adapted from [`mattpocock/skills @ 90ea8eec03d4ae8f43427aaf6fe4722653561a42 / setup-pre-commit/SKILL.md`](../../upstream/mattpocock-skills/setup-pre-commit/SKILL.md), MIT licence (c) 2026 Matt Pocock. Upstream attribution and licence text live in the repo-root `NOTICE` and at `SKILLS/upstream/mattpocock-skills/LICENSE`.

The upstream provides a clean greenfield install. EVOKORE's port adds: detection, uplift (no silent overwrite), an EVOKORE-style integration-test slice on commit, a typecheck step keyed off `npm run build` when no `typecheck` script exists, and a damage-control-aware bypass note. The upstream content remains in the read-only `SKILLS/upstream/mattpocock-skills/` submodule and is not indexed by SkillManager.

## EVOKORE-Specific Adaptations

1. **Detect-first, write-second.** Inspect `package.json` for `husky` / `lint-staged` keys, check `.husky/` directory, and read any `.prettierrc*` or `.lintstagedrc*` files before writing anything. If any are present, surface the diff and uplift; do not silently overwrite.
2. **Integration-test slice on commit.** Upstream runs `npm run test` (the full suite) on every commit. EVOKORE's full vitest suite (~2053 tests across 121 files) is too slow for pre-commit, so the EVOKORE pre-commit runs only `npx vitest run --bail=1 tests/integration/` (98 integration tests, sub-minute on the dev box). Full-suite gating moves to CI.
3. **Typecheck graceful fallback.** Upstream calls `npm run typecheck`. EVOKORE's `package.json` exposes `npm run build` (which is `npx tsc`) as the typecheck path. If `typecheck` script is absent, the hook uses `npx tsc --noEmit` directly so the commit doesn't emit `dist/` artefacts.
4. **Damage-control-aware bypass note.** `git commit --no-verify` is the standard escape hatch but EVOKORE's damage-control hook (`scripts/hooks/damage-control.js`) may flag it under DC-rules. The skill documents `npx lint-staged --no-stash` as the debug path instead of teaching `--no-verify`.
5. **Composition.** Terminal skill — no `next, invoke X skill` chain. Once installed, the hook runs in-process on every git commit; nothing further to orchestrate.

## Process

### 1. Detect existing setup

Capture the current state before changing anything. Read and report:

- `package.json` — does it declare `husky`, `lint-staged`, or `prettier` under `dependencies` / `devDependencies`?
- `package.json` — does it declare a `prepare`, `typecheck`, or `lint-staged` script?
- `.husky/` directory — does it exist? If so, list its contents (`pre-commit`, `commit-msg`, etc.) and read `.husky/pre-commit` if present.
- `.lintstagedrc`, `.lintstagedrc.json`, `.lintstagedrc.js`, or a `lint-staged` key in `package.json` — present?
- `.prettierrc*` or a `prettier` key in `package.json` — present?
- `.prettierignore` — present?

Report findings in a numbered list. Do not modify any file in this step.

### 2. Branch on detection result

#### 2a. Fresh install (none of the above present)

1. Add devDependencies:
   ```bash
   npm install --save-dev husky lint-staged prettier
   ```
2. Initialise Husky:
   ```bash
   npx husky init
   ```
   This creates `.husky/`, sets `prepare: "husky"` in `package.json`, and writes a starter `.husky/pre-commit`.
3. Overwrite `.husky/pre-commit` with the EVOKORE chain (Husky v9+, no shebang needed):
   ```sh
   npx lint-staged
   npm run build
   npx vitest run --bail=1 tests/integration/
   ```
   If the repo has a `typecheck` script, replace `npm run build` with `npm run typecheck`. If neither exists, fall back to `npx tsc --noEmit`.
4. Configure `lint-staged` in `package.json` (preferred over a separate `.lintstagedrc` so Renovate / version-control tooling sees the change):
   ```json
   "lint-staged": {
     "*.ts": [
       "prettier --write"
     ],
     "*.{js,json,md,yml,yaml}": [
       "prettier --write"
     ]
   }
   ```
   Add an `eslint --fix` entry to `*.ts` only if `eslint` is already a devDependency in this repo. Do not introduce ESLint as a side effect of this skill.
5. Write `.prettierrc.json` only if no Prettier config exists (any of `.prettierrc`, `.prettierrc.json`, `.prettierrc.yml`, `.prettierrc.js`, or a `prettier` key in `package.json`):
   ```json
   {
     "useTabs": false,
     "tabWidth": 2,
     "printWidth": 100,
     "singleQuote": false,
     "trailingComma": "es5",
     "semi": true,
     "arrowParens": "always"
   }
   ```
   `printWidth: 100` is the EVOKORE house rule (upstream defaults to 80).
6. Add `.prettierignore` if missing:
   ```
   dist/
   node_modules/
   coverage/
   *.log
   .env*
   ```

#### 2b. Uplift existing setup

If any artefact from step 1 was found:

1. Print the existing `.husky/pre-commit` contents and the existing `lint-staged` configuration. Diff against the EVOKORE target chain.
2. Propose **only the additions** as a unified diff. Do NOT overwrite. Common uplift cases:
   - Existing hook has `npx lint-staged` but no typecheck — add `npm run build` (or `npm run typecheck`) on a new line.
   - Existing hook runs `npm run test` (full suite) — propose narrowing to `npx vitest run --bail=1 tests/integration/` and call out the full-suite move to CI.
   - Existing `lint-staged` config covers `*.js` only — propose extending to `*.ts` and `*.{json,md,yml,yaml}`.
3. Ask the operator to confirm the uplift before writing. If confirmed, apply only the proposed lines.

### 3. Verify

Run these checks and report each as pass / fail:

- [ ] `.husky/pre-commit` exists.
- [ ] `package.json` `prepare` script equals `"husky"` (or includes a Husky invocation).
- [ ] A Prettier config exists (any one of the recognised filenames or the `prettier` key).
- [ ] `lint-staged` config exists (in `package.json` or a `.lintstagedrc*` file).
- [ ] `npx lint-staged --no-stash` runs to completion against the current staged set without errors.

If any check fails, surface the specific file or step that failed. Do not declare "done."

### 4. Smoke-test commit

Stage all changed/created files and commit with the message `chore: install pre-commit hooks (husky + lint-staged + prettier + integration-test slice)`. The commit itself runs through the new pre-commit chain — a smoke test that everything wires correctly.

If the commit fails on the pre-commit hook, leave the failure visible to the operator. Do not bypass it. Diagnose with the bypass-and-debugging note below.

## Bypass and debugging

`git commit --no-verify` skips the entire pre-commit chain. EVOKORE's damage-control hook (`scripts/hooks/damage-control.js`) MAY block `--no-verify` under DC-rules in some operator configurations — treat `--no-verify` as a last-resort emergency lever, not a routine debugging tool.

For routine debugging (a hook is failing and you need to inspect why), use:

```bash
npx lint-staged --no-stash
```

`--no-stash` runs lint-staged against the actual working tree without stashing-and-restoring, which makes errors easier to read and prevents lint-staged from silently restoring an old state on failure. Run `npm run build` (or `npm run typecheck`) and `npx vitest run --bail=1 tests/integration/` directly to isolate which stage of the hook is failing.

## Notes

- Husky v9+ does not need a shebang in hook files.
- `prettier --ignore-unknown` skips files Prettier cannot parse (images, binary, etc.) — useful when extending lint-staged globs.
- The pre-commit chain runs lint-staged first (fast, staged-only), then build/typecheck, then the integration test slice. Order matters: format errors are the cheapest to surface, type errors next, behavioural regressions last.
- The full-suite vitest run (`npx vitest run`) belongs in CI, not pre-commit.
- This skill is **terminal**. There is no `next, invoke X skill` chain — once the chain is installed, every subsequent `git commit` exercises it.
