---
name: sparc-spec
description: "Use when you need to run SPARC Phase 1 (Specification) for a feature — produces phase_1_<slug>.md with Functional Requirements, Non-Functional Requirements, and Gherkin acceptance scenarios."
aliases: [spec, sparc-phase1, specification]
category: orchestration
tags: [sparc, specification, requirements, gherkin, planning]
archetype: AGT-018
version: 1.0.0
---

# /sparc-spec — SPARC Specification Phase

Runs SPARC Phase 1: Specification. Produces a structured specification document with functional requirements, non-functional requirements, and Gherkin acceptance scenarios.

## Usage

```
/sparc-spec "feature name"
/sparc-spec "Add user authentication with OAuth2"
```

## What it does

1. Elicits functional requirements from the feature description
2. Derives non-functional requirements (performance, security, reliability)
3. Writes Gherkin scenarios for happy path + top 3 edge cases
4. Saves output to `docs/session-phases/phase_1_<slug>.md`

## Output Format

Creates `docs/session-phases/phase_1_<slug>.md`:

```markdown
# Phase 1: Specification — {feature name}

**Generated:** {timestamp}
**SPARC Phase:** 1 of 5
**Slug:** {slug}

## Functional Requirements

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| FR-01 | {requirement} | {criteria} |
| FR-02 | ... | ... |

## Non-Functional Requirements

| ID | Category | Requirement | Threshold |
|----|----------|-------------|-----------|
| NFR-01 | Performance | {requirement} | {threshold} |
| NFR-02 | Security | ... | ... |

## Gherkin Acceptance Scenarios

### Happy Path

```gherkin
Feature: {feature name}
  Scenario: {happy path description}
    Given {precondition}
    When {action}
    Then {expected outcome}
```

### Edge Cases

```gherkin
  Scenario: {edge case 1}
    Given {precondition}
    When {action}
    Then {expected outcome}
```

## Done Criteria

- [ ] All FRs are testable (measurable acceptance criteria)
- [ ] NFRs have quantitative thresholds
- [ ] Gherkin covers happy path + 3 edge cases
- [ ] No ambiguous requirements ("fast", "secure" without thresholds)

## Next Phase

Run `/sparc-pipeline {feature name}` to continue through all 5 phases, or start Phase 2 manually:
`Create docs/session-phases/phase_2_{slug}.md with pseudocode for each FR from the spec.`
```

## Done Criteria

The specification is complete when:
1. All functional requirements have measurable acceptance criteria
2. NFRs have explicit numeric thresholds (not "fast" — "p50 < 200ms")
3. At least one Gherkin scenario exists per FR
4. Edge cases cover: invalid input, concurrent access, resource limits

## Integration

- Output feeds into AGT-018 (Governance Gate) policy alignment check
- Phase 1 document is required input for `/sparc-pipeline`
- FR list becomes the test spec for AGT-017 (Quality Engineer)
