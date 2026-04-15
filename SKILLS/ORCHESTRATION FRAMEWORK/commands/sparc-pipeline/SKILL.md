---
name: sparc-pipeline
description: "Use when you need to run the full 5-phase SPARC methodology (Specification→Pseudocode→Architecture→Refinement→Completion) for a complex feature. Each phase has explicit done-criteria gates."
aliases: [sparc, sparc-full, full-sparc]
category: orchestration
tags: [sparc, methodology, pipeline, full-cycle, planning, architecture]
archetype: AGT-018
version: 1.0.0
---

# /sparc-pipeline — Full SPARC Development Pipeline

Runs all 5 SPARC phases sequentially with mandatory done-criteria gates between each phase. Suitable for features requiring structured, verifiable development.

## Usage

```
/sparc-pipeline "feature name"
/sparc-pipeline "Implement multi-tenant session isolation"
```

## The 5 Phases

Each phase produces a document in `docs/session-phases/` and must pass its done-criteria gate before the next phase begins.

### Phase 1: Specification

**Produces:** `docs/session-phases/phase_1_<slug>.md`

Done criteria gate:
- All FRs are testable (measurable acceptance criteria)
- NFRs have numeric thresholds
- Gherkin scenarios cover happy path + 3 edge cases

### Phase 2: Pseudocode

**Produces:** `docs/session-phases/phase_2_<slug>.md`

Done criteria gate:
- Every FR has corresponding pseudocode
- Error states enumerated (no "TODO: handle errors")
- Algorithm complexity documented

### Phase 3: Architecture

**Produces:** `docs/session-phases/phase_3_<slug>.md`

Done criteria gate:
- All component interfaces defined
- No circular dependencies
- ADR written for non-obvious design choices

### Phase 4: Refinement (Implementation)

**Produces:** Working code + tests

Done criteria gate:
- All Gherkin scenarios from Phase 1 pass as vitest tests
- TypeScript compiles clean (`npx tsc --noEmit`)
- Truth score >= 0.90 (see verification-quality skill)

### Phase 5: Completion

**Produces:** PR with all sections + updated docs

Done criteria gate:
- CI green (Build + TypeCheck + Tests pass)
- PR template sections filled (Description, Type of Change, Testing, Evidence)
- CLAUDE.md updated if any new patterns discovered
- next-session.md updated

## Gate Failure Handling

If a phase fails its gate:
1. Document the failure reason in the phase file
2. Fix the gap in the current phase
3. Re-check the gate criteria
4. Do NOT proceed to the next phase until the gate passes

## Output Summary

At completion, the pipeline produces:
- 3 phase documents (`phase_1`, `phase_2`, `phase_3`)
- Working code with full test coverage
- A merged PR

## Integration

- Phase 1 can be run independently via `/sparc-spec`
- Phase 4 uses `/verify-quality` for truth scoring
- Phase 5 uses AGT-021 (Release Engineer) gate enforcement for release PRs
- Each phase document is tracked in the session manifest
