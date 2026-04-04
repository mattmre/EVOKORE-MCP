---
name: panel-incident-post-mortem
description: Expert panel for incident response review, root cause analysis, post-mortem quality, and resilience design
aliases: [incident-panel, post-mortem-panel, rca-panel, sre-panel, incident-review]
category: orchestration
tags: [incident, post-mortem, rca, resilience, chaos-engineering, runbooks, sre]
version: 1.0.0
requires: [panel-of-experts]
resolutionHints:
  - incident post-mortem review
  - root cause analysis
  - incident response process design
  - runbook quality review
  - chaos engineering design
  - on-call rotation or escalation design
  - resilience review
---

# Incident Response & Post-Mortem Panel

## Panel Composition

| Expert | Role | Primary Lens |
|---|---|---|
| **Dr. Aisha Mbeki** | Human Factors & Incident Analyst | Cognitive load, hindsight bias, decision points, systemic factors |
| **Viktor Sorokin** | Distributed Systems Failure Analyst | Cascading failures, failure propagation, circuit breakers |
| **Patricia Gomez** | Incident Commander & Process Designer | IC process, roles, communication, escalation timing |
| **Ryan Nakamura** | Chaos Engineering & Resilience Architect | Failure injection, game-day programs, resilience testing |

See [expert-roster.md](../expert-roster.md) for full persona definitions.

## When to Invoke

- After any P1/P2 incident (mandatory)
- After data loss or data corruption events
- When designing or revising incident response procedures
- Reviewing on-call rotation or escalation policies
- Chaos engineering experiment design
- Quarterly resilience reviews
- When evaluating runbook quality and coverage
- After near-misses that were caught before customer impact

## Review Modes

### Mode A: Post-Mortem Review
Evaluate the quality of a completed root cause analysis -- is the RCA finding the real root cause? Are action items actionable? Are systemic factors addressed?

### Mode B: Incident Process Design
Review incident response procedures, IC rotation, escalation policies, and communication templates for completeness and usability.

### Mode C: Resilience Assessment
Proactively evaluate system resilience -- what failure modes haven't been tested? Where are the gaps in circuit breakers, fallbacks, and degraded-mode operation?

---

## Review Protocol

### Step 1: CONVENE -- Select Mode and Experts

| Mode | Active Experts |
|---|---|
| Post-Mortem Review | Dr. Mbeki, Viktor, Patricia |
| Incident Process Design | Patricia, Dr. Mbeki, Ryan |
| Resilience Assessment | Ryan, Viktor, Dr. Mbeki |

### Step 2: BRIEF -- Present the Artifact

**For Post-Mortem Review (Mode A):**
```
## Post-Mortem Under Review
- **Incident ID:** [identifier]
- **Severity:** [P1/P2/P3]
- **Duration:** [time from detection to resolution]
- **Customer Impact:** [what users experienced]
- **Timeline:** [key events with timestamps]
- **Root Cause (as stated):** [the RCA's conclusion]
- **Action Items:** [list of proposed remediation]
- **Contributing Factors:** [secondary causes identified]
- **Detection Method:** [how was the incident discovered -- alert, user report, etc.]
```

**For Incident Process Design (Mode B):**
```
## Incident Process Under Review
- **Process Document:** [file path or description]
- **Scope:** [which services/teams this covers]
- **Roles Defined:** [IC, Communications Lead, etc.]
- **Escalation Path:** [how and when to escalate]
- **Communication Channels:** [Slack, PagerDuty, status page, etc.]
- **Severity Definitions:** [how P1/P2/P3 are classified]
- **On-Call Rotation:** [structure, handoff process]
- **Post-Incident Process:** [how post-mortems are triggered and conducted]
```

**For Resilience Assessment (Mode C):**
```
## Resilience Review
- **System/Service:** [what's being assessed]
- **Architecture Diagram:** [reference to architecture docs]
- **Known Failure Modes:** [previously experienced failures]
- **Existing Resilience:** [circuit breakers, retries, fallbacks, bulkheads]
- **SLO/SLA Targets:** [reliability commitments]
- **Last Game Day:** [when was resilience last tested?]
- **Incident History:** [relevant past incidents]
```

### Step 3: SOLO -- Independent Expert Reviews

**Dr. Aisha Mbeki (Human Factors & Incident Analyst) reviews:**
- Root cause depth -- is this RCA finding the root cause, or the most recent cause?
- Hindsight bias -- does the post-mortem use "should have known" language that wasn't reasonable in the moment?
- Decision point analysis -- at what point did responders first suspect the actual root cause, and what delayed that recognition?
- Cognitive load -- were the right signals available to responders? Did dashboards and alerts support or hinder diagnosis?
- Blame language -- does the post-mortem avoid blame while still being honest about what happened?
- System vs individual -- are action items fixing systemic factors (tooling, processes, architecture) or just telling people to "be more careful"?
- Organizational learning -- has this same type of incident happened before? If so, why didn't previous action items prevent it?
- "If a completely different on-call engineer had been paged, would the outcome have been different? If yes, that's a systemic gap, not a personnel issue."

**Viktor Sorokin (Distributed Systems Failure Analyst) reviews:**
- Failure propagation path -- draw the failure propagation path from trigger to customer impact. Is it complete?
- Cascading failure analysis -- what circuit breaker should have fired and didn't? Why did the failure cascade?
- Retry storms -- did retries amplify the failure? Were there retry budgets or exponential backoff?
- Partial failure handling -- how did the system behave under partial failure? Was there graceful degradation?
- Timeout configuration -- were timeouts configured appropriately, or did they allow failures to propagate slowly?
- Resource exhaustion -- did the failure involve connection pool exhaustion, thread starvation, or memory pressure?
- Recovery mechanics -- how did the system recover? Was it self-healing or did it require manual intervention?
- "If I replay the exact sequence of events that caused this incident, does the system now handle it differently? Prove it."

**Patricia Gomez (Incident Commander & Process Designer) reviews:**
- Declaration timeliness -- when was the incident declared, and was that timely given the severity?
- Role clarity -- were IC, communications lead, and subject matter experts clearly assigned?
- Stakeholder communication -- were stakeholders informed within the SLA? Was the status page updated?
- Escalation appropriateness -- at what point should this have been escalated, and when was it actually escalated?
- Handoff quality -- if the incident spanned shifts, was the handoff clean?
- Documentation during incident -- were key decisions and findings documented in real-time, or reconstructed later?
- Action item quality -- are action items specific, assigned, and time-bound, or vague ("improve monitoring")?
- "If this incident happens again next Tuesday at 2 AM, does the on-call team have everything they need to resolve it without the original responders?"

**Ryan Nakamura (Chaos Engineering & Resilience Architect) reviews:**
- Prior testing -- had we ever tested this failure mode before it happened in production?
- Circuit breaker configuration -- are circuit breakers configured correctly, or set to thresholds that never actually trip?
- Fallback behavior -- does the system have tested fallback paths for this failure mode?
- Game-day coverage -- should this failure scenario be added to the game-day program?
- Blast radius containment -- was the blast radius appropriately contained, or did it spread beyond the affected component?
- Degraded mode operation -- can the system operate in a degraded mode, or is it all-or-nothing?
- Recovery automation -- is recovery automated, or does it require manual steps that are error-prone under pressure?
- "Design a chaos experiment that would have caught this failure mode before it hit production. How long would it take to implement?"

### Step 4: CHALLENGE -- Cross-Expert Debate

Key challenges for this panel:

1. **Dr. Mbeki vs Viktor:** "The system failed the humans -- the dashboard didn't show the right information" vs "The humans misconfigured the circuit breaker threshold -- this is a technical root cause"
2. **Patricia vs Ryan:** "The incident response process worked, but the system wasn't resilient enough" vs "The process didn't account for this failure mode -- the runbook was incomplete"
3. **Viktor vs Dr. Mbeki:** "We need a deep technical RCA tracing every system interaction" vs "The technical cause is the least interesting part -- why did the organization allow this failure mode to exist?"
4. **Ryan vs Patricia:** "We should run chaos experiments weekly on production" vs "We need to build organizational readiness before injecting failures regularly"
5. **Dr. Mbeki vs Patricia:** "The action item 'retrain the team' is blame in disguise" vs "Sometimes people genuinely need training on new tools"

### Step 5: CONVERGE -- Synthesize Findings

```markdown
## Incident Response & Post-Mortem Panel Report

### Overall Assessment: [THOROUGH / ADEQUATE / NEEDS DEEPER ANALYSIS]

### RCA Quality Assessment
1. **Root Cause Depth:** [surface-level / contributing factors identified / systemic root cause found]
2. **Blame-Free Language:** [yes / contains blame language]
3. **Completeness:** [timeline complete / gaps identified]

### Technical Failure Analysis
1. **[Failure Mechanism]** -- severity: [critical/high/medium/low], remediation: [approach]
- Propagation path: [how the failure spread]
- Containment: [what should have stopped it]

### Process Assessment
1. **[Process Gap/Strength]** -- recommendation: [approach]

### Risk Register
| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| [Risk 1] | [H/M/L] | [H/M/L] | [approach] | [who] |

### Resilience Gaps
1. **[Untested Failure Mode]** -- recommended test: [chaos experiment description]

### Action Item Assessment
| Original Action Item | Assessment | Revised Recommendation |
|---|---|---|
| [action item] | [adequate/vague/misguided] | [improved version] |

### Dissenting Opinions
1. [Expert] argued [position] -- [rationale]
```

### Step 6: FEASIBILITY -> DELIVER

Top recommendations and alternative approaches go to [Feasibility Panel](feasibility-research.md).

## Example Invocations

### Post-Mortem Review
```
Run an Incident Response & Post-Mortem Panel -- Mode A -- on the
post-mortem for INC-2024-0847 (payments processing outage).

The incident lasted 4 hours, affected 23% of payment transactions,
and the stated root cause is "database connection pool exhaustion
due to a slow query introduced in the 3:15 PM deployment."

Key concerns:
- Is "slow query from deployment" the root cause, or just the trigger?
- Why didn't the circuit breaker to the payment DB trip?
- The post-mortem blames the deploying engineer -- is that appropriate?
- Are the action items specific enough to prevent recurrence?

Full Mode A panel.
```

### Resilience Assessment
```
Run Mode C on our order processing service.

The service handles 2K orders/minute, depends on 4 downstream
services (inventory, payments, shipping, notifications), and has
circuit breakers configured but never tested in production.

Key concerns:
- What happens if any downstream service is unavailable for 5 minutes?
- Are the circuit breaker thresholds based on real failure patterns?
- Can the service operate in degraded mode (accept orders, process later)?
- What chaos experiments should we run first?
```

### Incident Process Design
```
Run Mode B on our incident response playbook. We're growing from
15 to 50 engineers and the current process of "page the person who
built it" won't scale.

Key concerns:
- IC rotation and training program
- Escalation paths for services with shared ownership
- Communication templates for customer-facing incidents
- Post-incident review process that actually produces useful action items
```
