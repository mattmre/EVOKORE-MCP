---
name: panel-feasibility-research
description: Expert panel for evaluating recommendation viability, researching best approaches, and validating implementation paths
aliases: [feasibility-panel, feasibility-experts, viability-panel, research-panel]
category: orchestration
tags: [feasibility, research, viability, estimation, approach-selection, roi]
version: 1.0.0
requires: [panel-of-experts]
resolutionHints:
  - feasibility assessment
  - approach evaluation
  - implementation viability
  - research best approach
  - ROI analysis for recommendations
---

# Feasibility Research Panel

## Purpose

The Feasibility Panel is the **final gate** in every panel review cycle. It receives the top recommendations from domain-specific panels and evaluates them for practical viability. Brilliant recommendations that can't be implemented are noise — this panel separates actionable insight from theoretical ideals.

## Panel Composition

| Expert | Role | Primary Lens |
|---|---|---|
| **Dr. Michael Torres** | Research Engineer | State of the art, alternatives, prior art |
| **Angela Wright** | Cost & Effort Analyst | Effort, ROI, hidden costs, total cost of ownership |
| **David Okonkwo** | Technical Program Manager | Sequencing, dependencies, incremental delivery |
| **Dr. Ingrid Svensson** | Implementation Specialist | Prototype viability, technical spikes, shortcuts |

See [expert-roster.md](../expert-roster.md) for full persona definitions.

## When to Invoke

- As the final gate in any panel review cycle (automatic)
- Independently when evaluating approach options for a known problem
- When comparing multiple implementation strategies
- Before committing to a multi-session effort
- When a domain panel's recommendations seem impractical

## Standalone Use

While other panels always route through Feasibility as a gate, this panel can also be invoked independently:

```
Run a standalone Feasibility Panel assessment on [these recommendations / this approach / these competing options].

Context: [why we're evaluating this]
Options: [what alternatives exist]
Constraints: [budget, timeline, skill, tooling]
```

## Review Protocol

### Step 1: RECEIVE — Intake from Domain Panel

The Feasibility Panel receives:
```
## Recommendations to Evaluate
- **Source Panel:** [which domain panel]
- **Recommendations:** [prioritized list from convergence report]
- **Dissenting Opinions:** [minority views that may be worth investigating]
- **Constraints:** [from the original briefing]
```

### Step 2: SOLO — Independent Feasibility Reviews

**Dr. Michael Torres (Research Engineer) reviews:**
- Prior art — has this been done before? What were the results?
- Alternative approaches — are there simpler ways to achieve the same outcome?
- Tooling landscape — what tools exist that could accelerate this?
- Community solutions — has the open source community solved this already?
- Technology maturity — is the proposed approach using battle-tested or experimental tech?
- State of the art — is there recent research or tooling that changes the calculus?
- "Before we build this, has someone already solved it? If so, how well?"

**Angela Wright (Cost & Effort Analyst) reviews:**
- Build effort — realistic estimate including testing, docs, and edge cases
- Maintenance burden — ongoing cost after initial build
- Opportunity cost — what else could we do with this time?
- Hidden costs — training, migration, debugging, incident response
- ROI projection — when does the investment pay back?
- Total cost of ownership over 6 months, 1 year
- Effort confidence — how certain are we about this estimate?
- "This 'small' change. Now add the tests, the docs, the three edge cases nobody mentioned, and the bug you'll ship. What's the real cost?"

**David Okonkwo (Technical PM) reviews:**
- Dependency chain — what must exist before this can start?
- Parallel tracks — what can be done simultaneously?
- Incremental delivery — can this be split into smaller, independently valuable pieces?
- Critical path impact — does this recommendation block other work?
- Risk-adjusted schedule — what's the realistic timeline including unknown unknowns?
- Minimum viable implementation — what's the smallest version that delivers value?
- "Reorder this to deliver value earliest. What's independently shippable in week 1?"

**Dr. Ingrid Svensson (Implementation Specialist) reviews:**
- Prototype viability — can we validate the riskiest part quickly?
- Technical spike design — what experiment would de-risk this fastest?
- Implementation shortcuts — pragmatic approaches that aren't tech debt
- Integration complexity — how hard is the last-mile wiring?
- Skill gap assessment — does the team have what's needed or will there be a learning curve?
- Build vs buy vs adapt — should we build this, adopt something, or modify something existing?
- "Build the hardest 10% in a day. If that works, the rest is time. If not, redesign."

### Step 3: CHALLENGE — Feasibility Debate

1. **Michael vs Ingrid:** "This existing tool solves it" vs "That tool doesn't fit our architecture"
2. **Angela vs David:** "The ROI is negative" vs "The strategic value exceeds the ROI calculation"
3. **Ingrid vs Angela:** "I can prototype this in a day" vs "The prototype doesn't include the hard parts"
4. **David vs Michael:** "We should do this incrementally" vs "The incremental path requires rework at each step"

### Step 4: CONVERGE — Feasibility Verdict

```markdown
## Feasibility Panel Report

### Source: [Domain Panel Name] Recommendations

### Recommendation Verdicts

#### Recommendation 1: [Title]
- **Verdict:** [FEASIBLE / FEASIBLE WITH MODIFICATIONS / INFEASIBLE / NEEDS SPIKE]
- **Effort Estimate:** [range, with confidence level]
- **Alternative Approach:** [if a better approach was identified]
- **Risk:** [primary implementation risk]
- **Minimum Viable Version:** [smallest valuable scope]
- **Suggested Spike:** [if NEEDS SPIKE — what to prototype first]
- **ROI Assessment:** [estimated return relative to effort]

#### Recommendation 2: [Title]
[same structure]

### Overall Feasibility Summary

| Recommendation | Verdict | Effort | ROI | Priority |
|---|---|---|---|---|
| [Rec 1] | [verdict] | [effort] | [H/M/L] | [1-N] |

### Recommended Implementation Sequence
1. [First — because it de-risks the rest]
2. [Second — because it depends on first and has high ROI]
3. [Third — independent, can run in parallel with second]

### Spikes to Run Before Committing
1. [Spike description] — validates: [assumption], effort: [time]

### Recommendations Rejected and Why
1. [Recommendation] — rejected because: [specific reason with evidence]

### Dissenting Opinions
1. [Expert] argued [position] — feasibility panel response: [rationale]
```

## Feasibility Assessment Rubric

### Verdict Criteria

| Verdict | Criteria |
|---|---|
| **FEASIBLE** | Proven approach, tools exist, team has skills, effort is justified by ROI |
| **FEASIBLE WITH MODIFICATIONS** | Core approach is sound but specific changes needed for practical implementation |
| **NEEDS SPIKE** | Promising but unproven — run a technical spike before committing |
| **INFEASIBLE** | Effort exceeds value, tools don't exist, fundamental approach flaw, or team lacks required skills with no reasonable ramp-up path |

### Effort Estimation Framework

Angela Wright uses this framework:

| Component | Multiplier |
|---|---|
| Core implementation | 1x (base estimate) |
| Testing | +0.5-1x |
| Documentation | +0.2x |
| Edge cases & error handling | +0.3-0.5x |
| Integration & wiring | +0.3x |
| Review & iteration | +0.2x |
| **Typical total** | **2.5-3.5x base estimate** |

### ROI Framework

| Category | Signal |
|---|---|
| **High ROI** | Used daily, reduces toil, prevents recurring incidents, enables multiple downstream improvements |
| **Medium ROI** | Used weekly, improves quality, reduces occasional pain points |
| **Low ROI** | Used rarely, marginal improvement, high maintenance relative to benefit |
| **Negative ROI** | Maintenance cost exceeds benefit, or creates more problems than it solves |
