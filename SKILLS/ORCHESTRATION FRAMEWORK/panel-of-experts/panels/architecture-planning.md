---
name: panel-architecture-planning
description: Expert panel for system architecture decisions, phase planning, and strategic technical direction
aliases: [architecture-panel, planning-panel, arch-experts, phase-planning-panel]
category: orchestration
tags: [architecture, planning, system-design, strategy, phases, roadmap]
version: 1.0.0
requires: [panel-of-experts]
resolutionHints:
  - architecture review or decision
  - phase planning review
  - system design critique
  - strategic technical planning
  - roadmap validation
---

# Architecture & Phase Planning Panel

## Panel Composition

| Expert | Role | Primary Lens |
|---|---|---|
| **Dr. Robert Nakamura** | Enterprise Architect | Trade-offs, evolutionary architecture, governance |
| **Diana Reyes** | Program Manager | Sequencing, dependencies, risk, delivery confidence |
| **Dr. Wei Zhang** | Principal Engineer | Implementation feasibility, hidden complexity |
| **Carmen Vega** | Product Strategist | Value alignment, user impact, opportunity cost |
| **Yusuf Al-Rashid** | Risk Analyst | Failure modes, reversibility, contingency planning |

See [expert-roster.md](../expert-roster.md) for full persona definitions.

## When to Invoke

- New system architecture proposals
- Major refactoring initiatives
- Phase planning for multi-session work
- Integration architecture for external systems
- Evaluating competing architectural approaches
- Roadmap validation and sequencing decisions

## Review Modes

### Mode A: Architecture Decision Review
Evaluate a specific architectural decision or design.

### Mode B: Phase Plan Review
Review a phased implementation plan for sequencing, feasibility, and value delivery.

### Mode C: Strategic Direction Review
Evaluate high-level technical strategy and roadmap direction.

---

## Review Protocol

### Step 1: CONVENE — Select Mode and Experts

| Mode | Active Experts |
|---|---|
| Architecture Decision | Robert, Wei, Yusuf |
| Phase Plan | Diana, Wei, Carmen, Yusuf |
| Strategic Direction | All 5 |

### Step 2: BRIEF — Present the Artifact

**For Architecture Decisions (Mode A):**
```
## Architecture Decision
- **Decision:** [what is being proposed]
- **Context:** [why this decision is needed now]
- **Options Considered:** [alternatives that were evaluated]
- **Proposed Approach:** [the recommended option]
- **Constraints:** [non-negotiable requirements]
- **Assumptions:** [what must be true for this to work]
```

**For Phase Plans (Mode B):**
```
## Phase Plan Under Review
- **Document:** [file path]
- **Scope:** [what the plan covers]
- **Phases:** [number, with 1-line summaries]
- **Timeline:** [estimated sessions/time]
- **Dependencies:** [between phases, and external]
- **Resources:** [team size, skill requirements]
- **Success Criteria:** [how we know each phase worked]
```

**For Strategic Direction (Mode C):**
```
## Strategic Direction
- **Vision:** [where we're trying to get]
- **Current State:** [where we are]
- **Proposed Path:** [how we get there]
- **Time Horizon:** [how far out this plan looks]
- **Key Bets:** [what we're betting on being true]
```

### Step 3: SOLO — Independent Expert Reviews

**Dr. Robert Nakamura (Enterprise Architect) reviews:**
- Architectural trade-offs — what are we giving up for what we're gaining?
- Reversibility — can we change course if this is wrong?
- Evolutionary path — does this architecture allow incremental evolution or require big-bang transitions?
- Accidental complexity — is complexity justified by requirements or is it self-inflicted?
- Prior art — has this pattern been tried before? What were the results?
- Governance — how do we ensure the architecture is followed, not just documented?
- "What's the architectural decision we're making today that we'll regret in 18 months?"

**Diana Reyes (Program Manager) reviews:**
- Critical path identification — what's the longest sequential chain?
- Dependency health — are dependencies real or assumed? Circular dependencies?
- Risk-adjusted timeline — what's the realistic schedule given historical accuracy?
- Incremental delivery — does each phase deliver independently valuable output?
- Scope creep indicators — where is scope likely to expand?
- Resource contention — do phases compete for the same resources?
- Rollback points — where can we stop and still have something useful?
- "If Phase 3 takes 3x longer than estimated, do we cancel, compress scope, or extend timeline?"

**Dr. Wei Zhang (Principal Engineer) reviews:**
- Implementation feasibility — can this actually be built as described?
- Hidden complexity — what looks simple in the plan but is hard in practice?
- Unstated assumptions — what must be true about the codebase/tools/team for this to work?
- Tooling maturity — are the required tools production-ready or experimental?
- Team skill fit — does the team have the skills this plan requires?
- Integration risk — where do components need to connect, and how hard is that connection?
- "Show me the first 3 PRs that would implement Phase 1. If you can't describe them concretely, the plan isn't detailed enough."

**Carmen Vega (Product Strategist) reviews:**
- Value sequencing — are we delivering the highest-value items first?
- Opportunity cost — what are we NOT doing while we execute this plan?
- User impact — does each phase improve the user experience measurably?
- Incremental value — if we stop after any phase, do users benefit?
- Alignment — does this plan serve the product vision or diverge from it?
- "Delete the last phase. Is the remaining plan still worth doing? If yes, should the last phase exist at all?"

**Yusuf Al-Rashid (Risk Analyst) reviews:**
- Top 3 failure modes — what are the most LIKELY ways this plan fails?
- Single points of failure — what dependency, if it breaks, takes down the whole plan?
- Cascading risk — does failure in one phase cascade to others?
- Reversibility per phase — can each phase be independently rolled back?
- External dependency risk — what's outside our control that this plan depends on?
- Contingency gaps — where do we have no fallback?
- "What's the pre-mortem? Imagine this plan failed. Write the post-mortem. What went wrong?"

### Step 4: CHALLENGE — Cross-Expert Debate

Key challenges for this panel:

1. **Robert vs Wei:** "This architecture is elegant, but can it be implemented by this team with these tools?"
2. **Diana vs Carmen:** "This sequencing optimizes for delivery speed, but does it optimize for value?"
3. **Wei vs Yusuf:** "This complexity is justified by the requirements" vs "This complexity is a risk we haven't priced in"
4. **Carmen vs Diana:** "Phase 2 has the most user value" vs "Phase 2 has the most dependencies and should be Phase 4"
5. **Yusuf vs Robert:** "This architecture has too many failure modes" vs "The alternative is worse"

### Step 5: CONVERGE — Synthesize Findings

```markdown
## Architecture & Planning Panel Report

### Overall Assessment: [APPROVED / APPROVED WITH MODIFICATIONS / NEEDS REWORK]

### Architecture Findings
1. **[Decision/Trade-off]** — verdict: [accept/modify/reject], rationale: [why]

### Phase Sequencing Recommendations
1. [Resequencing suggestion] — rationale: [why this order is better]

### Feasibility Concerns
1. [Concern] — severity: [high/medium/low], mitigation: [approach]

### Risk Register
| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| [Risk 1] | [H/M/L] | [H/M/L] | [approach] | [who] |

### Value Alignment Assessment
- Phase with highest value: [which and why]
- Phase with lowest value-to-effort ratio: [which and recommendation]
- Recommended MVP scope: [minimum viable delivery]

### Dissenting Opinions
1. [Expert] argued [position] — [rationale]
```

### Step 6: FEASIBILITY → DELIVER

Top recommendations and alternative approaches go to [Feasibility Panel](feasibility-research.md).

## Example Invocations

### Phase Plan Review
```
Run an Architecture & Planning Panel review on docs/ECC-INTEGRATION-PLAN.md.

This is a 9-phase integration plan for adopting features from the
everything-claude-code repo into EVOKORE-MCP. Total estimated scope
is 28-43 sessions across ~75-110 new files.

Key concerns:
- Is the phase sequencing optimal for value delivery?
- Are the effort estimates realistic?
- What phases could be cut or combined?
- What dependencies are we missing?

Full panel, all experts. Include feasibility gate.
```

### Architecture Decision
```
Run an Architecture Decision review for the proposed Continuous Learning
v2 system (Phase 4 of ECC Integration Plan).

The system extracts patterns from session evidence, evolves behavioral
instincts with confidence scores, and injects evolved rules into session
context via the purpose-gate hook.

Key question: Is this architecture sound, or are we building a system
that will drift in unpredictable ways?
```
