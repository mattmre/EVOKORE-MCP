---
name: sparc-methodology
description: "Use when you need to structure complex development work using the 5-phase SPARC methodology (Specification, Pseudocode, Architecture, Refinement, Completion)."
aliases: [sparc, sparc-pipeline, 5-phase-sparc]
category: orchestration
tags: [sparc, methodology, specification, architecture, refinement, planning]
archetype: AGT-018
version: 1.0.0
---

# SPARC Methodology Skill

A 5-phase structured development approach that ensures correctness at each stage before proceeding.

## Trigger

Use this skill when:
- Starting a complex feature with unclear requirements
- Refactoring a large system component
- Building multi-service integrations
- Onboarding to an unfamiliar codebase

## The 5 Phases

### Phase 1: Specification (S)
**Output:** `phase_1_{slug}.md`  
Produces: Functional Requirements (FR-01..FR-N), Non-Functional Requirements (NFR-01..NFR-N), Gherkin scenarios (Given/When/Then), acceptance criteria.

Done criteria:
- All FRs are testable
- NFRs have measurable thresholds
- Gherkin scenarios cover happy path + top 3 edge cases

### Phase 2: Pseudocode (P)
**Output:** `phase_2_{slug}.md`  
Produces: Language-agnostic algorithm representation, data flow diagram, error handling strategy.

Done criteria:
- Pseudocode covers every FR
- Error states enumerated
- No ambiguous "do magic here" blocks

### Phase 3: Architecture (A)
**Output:** `phase_3_{slug}.md`  
Produces: Component diagram, interface contracts, dependency graph, ADR for key decisions.

Done criteria:
- All interfaces defined
- No circular dependencies
- ADR written for any non-obvious choice

### Phase 4: Refinement (R)
**Output:** Working code + tests  
Produces: Implementation iterating from pseudocode, test cases from Gherkin, TypeScript type-safe.

Done criteria:
- All Gherkin scenarios pass
- TypeScript compiles clean
- Truth score >= 0.90

### Phase 5: Completion (C)
**Output:** PR + docs  
Produces: PR with all sections filled, docs updated, CLAUDE.md updated if patterns changed.

Done criteria:
- CI green
- PR review checklist complete
- next-session.md updated

## Usage

```
/sparc-spec "{feature name}"     → Runs Phase 1 only
/sparc-pipeline "{feature name}" → Runs all 5 phases sequentially with gate checks
```
