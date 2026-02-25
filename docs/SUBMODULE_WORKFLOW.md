# Submodule Documentation Workflow

This repository may consume external content through git submodules. Use this workflow to keep documentation updates reviewable and predictable.

## 1) Add or Register a Submodule

```bash
git submodule add <repo-url> <target-path>
git submodule update --init --recursive
```

Commit both:
- `.gitmodules`
- the submodule pointer change at `<target-path>`

## 2) Pull Latest Submodule Content

```bash
git submodule update --remote --merge
git submodule update --init --recursive
```

Then inspect:

```bash
git status
git diff --submodule
```

## 3) Validate Submodule Cleanliness (Local + CI)

Run the same guard used in CI before opening your PR:

```bash
git submodule status --recursive
node scripts/validate-submodule-cleanliness.js
```

Cleanliness semantics:

- `-` => uninitialized submodule
- `+` => submodule commit mismatch (worktree vs gitlink pointer)
- `U` => submodule merge conflict
- dirty submodule worktree => non-empty `git -C <submodule> status --porcelain`

Submodule paths can include spaces (for example `SKILLS/ANTHROPIC COOKBOOK`), so always quote path arguments when running manual `git -C` commands.

## 4) Update Docs in This Repo

When a submodule changes behavior, update:
- `docs/README.md` if canonical links changed
- `docs/USAGE.md` / `docs/TROUBLESHOOTING.md` if runtime guidance changed
- `README.md` / `CONTRIBUTING.md` if contributor workflow changed

## 5) PR Expectations

For submodule-related PRs:
1. Commit inside the submodule first.
2. Return to the parent repo and verify `git submodule status` has no unexpected `-dirty` entries.
3. Commit the updated submodule pointer in the parent repository.
4. Include any matching docs updates in this repository.
5. Mention the upstream submodule commit SHA in the PR description.
