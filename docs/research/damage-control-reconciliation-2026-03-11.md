# Damage-Control Reconciliation Research

**Date:** 2026-03-11  
**Slice:** `T25`  
**Base:** `main` `db22242`

## Why this slice exists

`feature/damage-control-expansion` still contains two unmerged feature commits, but the branch itself is stale. It predates the merged roadmap chain and still carries old runtime surfaces such as legacy `.claude/settings.json` wiring and no `statusLine` integration.

## Audit findings

- Branch divergence from `main`: 34 behind, 2 ahead.
- No GitHub PR exists for `feature/damage-control-expansion`.
- The intended feature work is valid: expanded damage-control regex coverage, broader sensitive-path protection, and better path extraction.
- A direct replay of the stale branch is not valid:
  - it downgrades `@modelcontextprotocol/sdk` from `^1.27.1` to `^1.26.0`
  - it drops the current `overrides` block
  - it rewrites the `test` script back to a pre-roadmap shape
  - it includes a stray `.commit-msg.txt` change unrelated to the feature

## Decision

Port the feature manually onto fresh `main` instead of reviving the stale branch in place.

## Port scope

1. Expand `damage-control-rules.yaml` with rule IDs and additional protections `DC-15` through `DC-30`.
2. Harden `scripts/damage-control.js` path extraction so no-delete and zero-access rules can catch more realistic shell inputs.
3. Add a dedicated `test-damage-control-validation.js` regression suite.
4. Wire the new test into the default `npm test` path.
5. Keep current post-roadmap package/runtime state intact.

## Risks to validate

- YAML regex quoting must still compile under the existing parser.
- Added rules must not create false positives for benign commands like `git log --format`, `echo "shutdown"`, or ordinary path reads.
- Path extraction changes must not weaken current zero-access, read-only, or no-delete behavior.
