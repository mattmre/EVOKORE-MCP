---
name: quality-gate
description: "Use when you need to check if current work meets quality thresholds before proceeding to the next phase or merging."
aliases: [gate, check-gate, quality-check]
category: quality
tags: [quality, gate, threshold, ci, verification]
archetype: AGT-017
version: 1.0.0
---

# /quality-gate — Quality Gate Check

Runs a comprehensive quality gate check: TypeScript compile, vitest, truth scoring, and PR template validation.

## Usage

```
/quality-gate
/quality-gate --strict  (use production thresholds)
```

## Gate Checks (in order)

1. **TypeScript compile:** `npx tsc --noEmit` — must exit 0
2. **Test suite:** `npx vitest run` — must have 0 failures
3. **Truth score:** >= 0.90 for CI, >= 0.99 for production
4. **PR template:** if creating a PR, verify Description/Type/Testing/Evidence sections
5. **Branch hygiene:** no uncommitted changes, no local-only commits

## Pass Criteria

All checks must pass. Any failure blocks progression.

## Integration

- Required before Phase 5 (Completion) in `/sparc-pipeline`
- Feeds into AGT-021 (Release Engineer) preflight gate
- Results logged as evidence for eval-harness PAT-002
