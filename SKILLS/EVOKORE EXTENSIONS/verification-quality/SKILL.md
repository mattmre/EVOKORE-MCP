---
name: verification-quality
description: "Use when you need to verify work quality using truth scoring (0.0–1.0) with environment-tiered thresholds and machine-readable JSON CI gate output."
aliases: [verify-quality, quality-gate, truth-score]
category: quality
tags: [verification, quality, truth-score, ci-gate, thresholds]
archetype: AGT-017
version: 1.0.0
---

# Verification Quality Skill

Applies tiered truth scoring to verify work meets environment-specific quality thresholds. Produces machine-readable JSON output for CI gate integration.

## Trigger

Use this skill when:
- Completing a feature implementation and need to verify correctness
- Validating test coverage meets environment thresholds
- Generating CI gate output for automated quality enforcement

## Truth Score Formula

```
truth_score = (tests_passing_pct * 0.4) + (type_check_passes * 0.3) + (lint_clean * 0.2) + (no_regressions * 0.1)
```

## Environment Thresholds

| Environment | Minimum Truth Score |
|-------------|---------------------|
| Production  | 0.99 |
| Staging     | 0.95 |
| Development | 0.80 |
| CI Gate     | 0.90 |

## Output Format

```json
{
  "truth_score": 0.97,
  "threshold": 0.95,
  "gate_passed": true,
  "breakdown": {
    "tests_passing_pct": 1.0,
    "type_check_passes": true,
    "lint_clean": true,
    "regressions_detected": 0
  },
  "environment": "staging",
  "timestamp": "2026-04-15T00:00:00Z"
}
```

## Usage

Run this skill after completing any feature or fix:
1. Establish environment context (prod/staging/dev)
2. Run test suite and capture pass rate
3. Run TypeScript compiler and linter
4. Compute truth_score
5. Compare against threshold
6. Emit JSON gate output

## Integration

- Works with AGT-017 (Quality Engineer) for defect prediction
- Feeds into AGT-021 (Release Engineer) release gates
- Output is consumed by CI pipelines via exit code (0=pass, 1=fail)
