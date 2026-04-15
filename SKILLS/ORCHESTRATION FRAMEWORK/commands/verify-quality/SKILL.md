---
name: verify-quality
description: "Use when you need to run quality verification with truth scoring (0.0-1.0) and environment-tiered thresholds. Produces machine-readable JSON gate output for CI integration."
aliases: [verify, quality-check, truth-score-check]
category: quality
tags: [verification, quality, truth-score, ci-gate, thresholds]
archetype: AGT-017
version: 1.0.0
---

# /verify-quality — Quality Verification with Truth Scoring

Runs the verification-quality skill to produce a truth score (0.0–1.0) and machine-readable JSON gate output. Compares against environment-tiered thresholds.

## Usage

```
/verify-quality
/verify-quality --env staging
/verify-quality --env production
```

## What it does

1. Runs `npx tsc --noEmit` (type check)
2. Runs `npx vitest run` (tests)
3. Computes truth_score = 0.4*tests_pct + 0.3*type_check + 0.2*lint + 0.1*no_regressions
4. Compares against environment threshold
5. Emits JSON gate output to stdout

## Thresholds

| Environment | Minimum Truth Score |
|-------------|---------------------|
| production  | 0.99 |
| staging     | 0.95 |
| development | 0.80 |
| ci          | 0.90 |

## Output

```json
{ "truth_score": 0.97, "threshold": 0.95, "gate_passed": true, "environment": "staging" }
```

## Integration

- Used in SPARC Phase 4 (Refinement) done-criteria check
- Feeds into AGT-021 (Release Engineer) preflight gate
- Blocks Phase 5 (Completion) if score < threshold
