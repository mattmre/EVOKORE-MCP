---
name: pattern-learn
description: "Use when you want to run the ECC learning loop (eval-harness + pattern-extractor) over current session evidence to extract behavioral patterns and update MEMORY.md."
aliases: [learn, extract-patterns, ecc-learn]
category: orchestration
tags: [ecc, learning, patterns, memory, eval-harness]
archetype: AGT-020
version: 1.0.0
---

# /pattern-learn — Run ECC Learning Loop

Runs `scripts/pattern-extractor.js` over current session evidence to extract behavioral patterns. If precision >= 0.70, updates `~/.evokore/patterns/` and optionally injects patterns into MEMORY.md.

## Usage

```
/pattern-learn
/pattern-learn --sessions ~/.evokore/sessions/ --inject
```

## What it does

1. Discovers all `*-evidence.jsonl` files in `~/.evokore/sessions/`
2. Calls `evaluateSession()` on each (scripts/eval-harness.js)
3. Extracts 5 pattern types (PAT-001 through PAT-005) with Laplace confidence
4. Applies precision gate: precision >= 0.70 → PROCEED, else ABANDON
5. If PROCEED and `--inject` flag: writes active patterns to MEMORY.md
6. Reports: sessions analyzed, patterns extracted, precision, decision gate

## Pattern Types

| ID | Pattern | Signal |
|----|---------|--------|
| PAT-001 | Read before Edit | editsWithPriorRead ratio |
| PAT-002 | Test before Commit | testsBeforeCommit ratio |
| PAT-003 | High error rate → stall | errorRate vs taskCompletion |
| PAT-004 | Subagent → task completion | subagent usage vs completion rate |
| PAT-005 | Purpose set → completion | purposeSet vs taskCompletionRate |

## Integration

- Backed by AGT-020 (Neural Optimizer) archetype
- Precision gate is the ECC Phase 4 decision gate (>=70% PROCEED)
- EVOKORE_PATTERN_INJECTION=true enables automatic MEMORY.md injection
- Use `/session-checkpoint` before to ensure evidence is up to date
