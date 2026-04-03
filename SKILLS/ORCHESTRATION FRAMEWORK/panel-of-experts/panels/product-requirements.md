---
name: panel-product-requirements
description: Expert panel for PRD quality, user story rigor, acceptance criteria completeness, market validation, and technical feasibility alignment
aliases: [product-requirements-panel, prd-panel, requirements-panel, spec-panel, product-review]
category: orchestration
tags: [product, requirements, prd, user-stories, acceptance-criteria, specification, product-management]
version: 1.0.0
requires: [panel-of-experts]
resolutionHints:
  - PRD review
  - product requirements review
  - feature specification review
  - user story quality
  - acceptance criteria review
  - scope review
  - product-engineering alignment
---

# Product Requirements & Specification Panel

## Panel Composition

| Expert | Role | Primary Lens |
|---|---|---|
| **Diana Morrison** | Product Manager & Specification Expert | Specification completeness, acceptance criteria, scope boundaries |
| **Nathan Brooks** | User Research Synthesizer | User need validation, problem-solution fit, research grounding |
| **Christine Lavoie** | Business Analyst & Scope Manager | Business alignment, scope control, dependency mapping |
| **Tomoko Ito** | Technical Feasibility Assessor (Staff Engineer) | Implementation cost, technical risk, simpler alternatives |

See [expert-roster.md](../expert-roster.md) for full persona definitions.

## When to Invoke

- New PRD or feature specification review
- Epic scoping and story breakdown
- When development starts and engineers report ambiguous requirements
- Before architecture review (to ensure requirements are solid first)
- Quarterly product-engineering alignment reviews
- When scope creep is suspected on an active project
- Post-launch retrospective on requirements quality

## Review Modes

### Mode A: PRD Quality Review
Evaluate a product requirements document for completeness, clarity, testability, and edge case coverage.

### Mode B: Scope & Prioritization Review
Assess scope boundaries, MVP definition, feature prioritization, and dependency management.

### Mode C: Technical Feasibility Pre-Check
Pre-screen requirements for technical feasibility, hidden complexity, and cost-value alignment before architecture review.

---

## Review Protocol

### Step 1: CONVENE — Select Mode and Experts

| Mode | Active Experts |
|---|---|
| PRD Quality | Diana, Nathan, Tomoko |
| Scope & Prioritization | Christine, Diana, Nathan |
| Technical Feasibility Pre-Check | Tomoko, Christine, Diana |

### Step 2: BRIEF — Present the Artifact

**For PRD Quality (Mode A):**
```
## PRD Under Review
- **Feature Name:** [name]
- **Document:** [file path or link]
- **Author:** [who wrote it]
- **Target User:** [persona or segment]
- **Problem Statement:** [what problem this solves]
- **Proposed Solution:** [high-level approach]
- **Acceptance Criteria:** [list or "not yet defined"]
- **Edge Cases Addressed:** [list or "not yet identified"]
- **Dependencies:** [other features, teams, or services required]
```

**For Scope & Prioritization (Mode B):**
```
## Scope Under Review
- **Project/Epic:** [name]
- **Feature List:** [all features in scope with priority labels]
- **Timeline:** [deadline or sprint count]
- **Team Size:** [engineers, designers, PMs available]
- **MVP Definition:** [what constitutes minimum viable product, or "not yet defined"]
- **Dependencies:** [cross-team, external, or technical dependencies]
- **Stakeholder Alignment:** [who has approved scope, who hasn't been consulted]
```

**For Technical Feasibility Pre-Check (Mode C):**
```
## Requirements for Feasibility Pre-Check
- **Requirements Document:** [file path or link]
- **Technical Constraints:** [platform, performance, compatibility requirements]
- **Existing System:** [what the current system looks like]
- **Integration Points:** [systems this feature must integrate with]
- **Performance Requirements:** [latency, throughput, scale targets]
- **Known Technical Risks:** [areas of uncertainty or complexity]
```

### Step 3: SOLO — Independent Expert Reviews

**Diana Morrison (Product Manager & Specification Expert) reviews:**
- Requirements clarity — is every requirement stated unambiguously? Could two engineers read the same requirement and build different things?
- Acceptance criteria testability — can each acceptance criterion be verified with a concrete test? Are criteria binary (pass/fail) or subjective?
- Edge case coverage — what happens when input is empty, malformed, at maximum size, or from an unexpected user state? Are failure modes specified?
- Scope boundaries — is "out of scope" explicitly stated? Are there requirements that seem in-scope but are actually deferred?
- User journey completeness — does the spec cover the full user journey, including error states, loading states, empty states, and permission denied states?
- Rollout and rollback — does the spec address how the feature is enabled, how it is disabled if problems arise, and how existing users are migrated?
- Success metrics — how will we know this feature is working? Are metrics defined, measurable, and tied to user outcomes rather than output?
- "What happens when [edge case]? How will we know this feature is done? What's explicitly out of scope?"

**Nathan Brooks (User Research Synthesizer) reviews:**
- Research grounding — is this requirement based on observed user behavior, user interviews, surveys, or analytics? Or is it based on internal assumptions?
- Problem validation — is the stated problem actually a problem for users? Has anyone asked users if this is painful, or are we assuming?
- Solution bias — does the requirements document describe a solution rather than a problem? Could the underlying need be met differently?
- User persona fit — which specific user persona does this serve? Has the team talked to representatives of that persona?
- Competing needs — does this requirement serve one user segment at the expense of another? Are trade-offs between personas acknowledged?
- Job-to-be-done — what job is the user hiring this feature to do? Is the feature aligned with that job, or does it address a symptom?
- Validation plan — after launch, how will the team validate that the feature actually solved the user's problem? Is there a learning plan?
- "What user research supports this requirement? Which user persona does this serve, and have we talked to them? Is this a solution masquerading as a requirement?"

**Christine Lavoie (Business Analyst & Scope Manager) reviews:**
- Business case alignment — does this requirement directly serve a business objective? Can the team articulate the business value in one sentence?
- MVP identification — what is the smallest version of this feature that delivers value? Can the scope be split into a smaller first release and a follow-up?
- Scope creep detection — are there requirements that were added as "clarifications" but actually expand scope? Are there requirements that are nice-to-have disguised as must-have?
- Dependency mapping — are all dependencies identified? Are dependent teams aware and committed? What happens if a dependency is delayed?
- Resource alignment — does the team have the skills and capacity to build this within the timeline? Are there resource conflicts with other projects?
- Stakeholder coverage — has every stakeholder who will be affected by this feature been consulted? Are there stakeholders who will block at review if not included now?
- Risk-adjusted timeline — given the dependencies and unknowns, what is the realistic timeline? Does the plan have buffer for discovery and iteration?
- "What's the business case for this specific requirement? Can this be split into a smaller first release and a follow-up?"

**Tomoko Ito (Technical Feasibility Assessor) reviews:**
- Implementation complexity — what looks simple in the requirements but is architecturally expensive? Are there requirements that require disproportionate engineering effort for marginal user value?
- Simpler alternatives — is there a 10x simpler alternative that delivers 80% of the value? Has the team considered lower-cost approaches before committing to the specified solution?
- System implications — does this requirement have implications for existing systems that the spec doesn't mention? Will it require changes to database schemas, APIs, or shared libraries?
- Performance feasibility — can the performance requirements be met with the current architecture? Are there requirements that would require fundamental architecture changes?
- Technical debt impact — does this requirement create technical debt? Does it build on existing technical debt that should be addressed first?
- Integration risk — where does this feature need to connect with other systems? How hard is that connection, and has the difficulty been reflected in the estimate?
- Prototype viability — can this be prototyped quickly to validate the approach before committing to full implementation? What would a spike look like?
- "What's the technical risk in this requirement? Is there a 10x simpler alternative that delivers 80% of the value?"

### Step 4: CHALLENGE — Cross-Expert Debate

Key tensions for this panel:

1. **Diana vs Christine:** "The spec needs to cover all edge cases before development starts" vs "Ship the MVP, learn from real usage, and iterate — perfect specs take longer than building the feature"
2. **Nathan vs Tomoko:** "We need more user research before building anything" vs "We can build a prototype faster than we can run a study — let users react to something concrete"
3. **Christine vs Nathan:** "Cut scope ruthlessly to hit the deadline" vs "You just cut the feature that users actually asked for — the remaining scope doesn't solve the problem"
4. **Diana vs Tomoko:** "The acceptance criteria require this specific behavior" vs "That specific behavior is architecturally expensive — a slightly different behavior delivers the same user value at a fraction of the cost"
5. **Nathan vs Diana:** "The problem statement needs to be rewritten — we're solving the wrong problem" vs "The problem statement has been validated — we need to move to solution specification"

### Step 5: CONVERGE — Synthesize Findings

```markdown
## Product Requirements & Specification Panel Report

### Overall Assessment: [APPROVED / APPROVED WITH MODIFICATIONS / NEEDS REWORK]

### Requirements Quality Findings
1. **[Requirement]** — verdict: [clear/ambiguous/untestable/missing], remediation: [approach]

### User Validation Findings
1. **[Finding]** — research status: [validated/assumed/contradicted], recommendation: [approach]

### Scope Assessment
- Recommended MVP scope: [what to include in first release]
- Deferred items: [what to move to follow-up]
- Scope creep items identified: [requirements that expanded scope without justification]

### Technical Feasibility Findings
1. **[Requirement]** — feasibility: [straightforward/complex/risky/infeasible], alternative: [if any], cost estimate: [relative]

### Dependency Map
| Dependency | Owner | Status | Risk if Delayed |
|---|---|---|---|
| [Dependency 1] | [team/person] | [confirmed/unconfirmed] | [impact] |

### Risk Register
| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| [Risk 1] | [H/M/L] | [H/M/L] | [approach] | [who] |

### Dissenting Opinions
1. [Expert] argued [position] — [rationale]
```

### Step 6: FEASIBILITY -> DELIVER

Top recommendations and alternative approaches go to [Feasibility Panel](feasibility-research.md) for implementation viability assessment.

---

## Example Invocations

### PRD Quality Review
```
Run a Product Requirements & Specification Panel review — Mode A
(PRD Quality) — on the proposed Skill Marketplace feature PRD.

The PRD describes a system where users can publish, discover,
and install community-created skills into their EVOKORE-MCP instance.

Key concerns:
- Are the acceptance criteria testable and unambiguous?
- Are edge cases covered (malicious skills, version conflicts, offline)?
- Is the scope clearly bounded for a first release?

Diana, Nathan, Tomoko active. Include feasibility gate.
```

### Scope & Prioritization Review
```
Run a Product Requirements & Specification Panel review — Mode B
(Scope & Prioritization) — on the v4.0 release epic.

The epic contains 14 features across 3 themes. The team has
4 engineers for 8 weeks. Several features have cross-team
dependencies on the platform team.

Key question: What is the MVP scope that delivers the most
value within the timeline? Which features should be deferred?

Christine, Diana, Nathan active.
```

### Technical Feasibility Pre-Check
```
Run a Product Requirements & Specification Panel review — Mode C
(Technical Feasibility Pre-Check) — on the real-time collaboration
requirements before they go to architecture review.

The requirements specify sub-100ms latency for collaborative
editing across distributed users with conflict resolution.

Key concern: Are the performance requirements achievable with
the current WebSocket infrastructure, or do they require a
fundamentally different approach (CRDT, OT)?

Tomoko, Christine, Diana active. Include feasibility gate.
```
