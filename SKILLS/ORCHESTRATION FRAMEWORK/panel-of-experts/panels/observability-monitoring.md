---
name: panel-observability-monitoring
description: Expert panel for logging strategy, metrics design, distributed tracing, alerting quality, SLO/SLI definition, and observability architecture
aliases: [observability-panel, monitoring-panel, slo-panel, alerting-panel, tracing-panel, observability-review]
category: orchestration
tags: [observability, monitoring, logging, metrics, tracing, slo, sli, alerting, opentelemetry]
version: 1.0.0
requires: [panel-of-experts]
resolutionHints:
  - observability design review
  - SLO or SLI definition
  - alerting rule review
  - distributed tracing design
  - logging strategy
  - monitoring dashboard review
  - on-call readiness review
---

# Observability & Monitoring Design Panel

## Panel Composition

| Expert | Role | Primary Lens |
|---|---|---|
| **Fatima Al-Zahra** | Observability Architect | Three pillars, instrumentation, high-cardinality costs, structured logging |
| **Derek Washington** | SRE & SLO Practitioner | SLI/SLO correctness, error budgets, organizational discipline |
| **Ingrid Larsson (Ops)** | Alert Design Specialist | Alert actionability, noise reduction, runbook coverage, 3 AM test |
| **Chen Bao** | Distributed Tracing Specialist | Trace completeness, context propagation, sampling strategy, latency attribution |

See [expert-roster.md](../expert-roster.md) for full persona definitions.

## When to Invoke

- New service or feature instrumentation design
- SLO/SLI definition or revision
- Alerting rule changes or new alert creation
- Dashboard design or review
- Incident response readiness reviews
- When on-call engineers report "couldn't debug" an issue
- Observability stack selection or migration (e.g., to OpenTelemetry)
- Log volume or metrics cardinality cost concerns

## Review Modes

### Mode A: New Service Instrumentation
Evaluate instrumentation design for a new service or feature -- are the right signals collected at the right granularity?

### Mode B: SLO/SLI Definition Review
Review SLO/SLI definitions for correctness, achievability, and alignment with user experience.

### Mode C: Alert Quality Audit
Evaluate alerting rules for actionability, noise-to-signal ratio, and runbook coverage.

---

## Review Protocol

### Step 1: CONVENE -- Select Mode and Experts

| Mode | Active Experts |
|---|---|
| New Service Instrumentation | Fatima, Chen, Ingrid (Ops) |
| SLO/SLI Definition Review | Derek, Fatima, Ingrid (Ops) |
| Alert Quality Audit | Ingrid (Ops), Derek, Fatima |

### Step 2: BRIEF -- Present the Artifact

**For New Service Instrumentation (Mode A):**
```
## Service Instrumentation Under Review
- **Service Name:** [name]
- **Service Type:** [API, worker, event consumer, scheduled job]
- **Dependencies:** [downstream services, databases, external APIs]
- **Current Instrumentation:** [what exists today]
- **Proposed Instrumentation:** [what's being added]
- **Observability Stack:** [Datadog, Grafana, New Relic, OpenTelemetry, etc.]
- **Traffic Pattern:** [requests/sec, batch size, event rate]
- **Critical User Journeys:** [which user-facing workflows depend on this service]
```

**For SLO/SLI Definition Review (Mode B):**
```
## SLO/SLI Under Review
- **Service:** [which service or user journey]
- **Proposed SLIs:** [what's being measured -- latency, error rate, throughput]
- **Proposed SLO Targets:** [specific targets -- e.g., 99.9% of requests < 200ms]
- **Measurement Method:** [how SLIs are collected -- server-side, client-side, synthetic]
- **Error Budget:** [how much budget, and what happens when exhausted]
- **Current Performance:** [actual metrics for the last 30/90 days]
- **Contractual SLA:** [if applicable, what's promised to customers]
- **Stakeholders:** [who consumes these SLOs for decision-making]
```

**For Alert Quality Audit (Mode C):**
```
## Alerting Under Review
- **Alert Rules:** [list of current alerts with thresholds]
- **Alert Volume:** [alerts/day over last 30 days]
- **False Positive Rate:** [estimated or measured]
- **On-Call Feedback:** [common complaints from on-call engineers]
- **Runbook Coverage:** [percentage of alerts with runbooks]
- **Escalation Policy:** [when and how alerts escalate]
- **Notification Channels:** [PagerDuty, Slack, email, etc.]
```

### Step 3: SOLO -- Independent Expert Reviews

**Fatima Al-Zahra (Observability Architect) reviews:**
- Signal completeness -- can you answer "why is this request slow?" using only the existing instrumentation?
- Structured logging -- are logs structured (JSON) with consistent field names, or free-text that requires regex parsing?
- Metric cardinality -- what's the cardinality of this metric, and can your backend handle it at scale?
- Instrumentation overhead -- what's the performance cost of this instrumentation? CPU, memory, network?
- Correlation -- can you correlate logs, metrics, and traces for the same request?
- Custom metrics -- are custom metrics named following conventions (units in name, consistent prefixes)?
- Log levels -- are log levels used consistently? Is DEBUG actually debug-level, or is it INFO in disguise?
- "Show me how you debug a slow request end-to-end using only the instrumentation you've proposed. Where do you get stuck?"

**Derek Washington (SRE & SLO Practitioner) reviews:**
- SLI user-centricity -- does this SLI measure what the user experiences, or what the server measures?
- SLO achievability -- given the last 90 days of data, can this SLO target actually be met?
- Error budget mechanics -- what's the error budget, and what happens when it's exhausted? Who makes that decision?
- SLO granularity -- is the SLO at the right level? Per-endpoint, per-service, or per-user-journey?
- Burn rate alerts -- are there multi-window burn rate alerts, or just threshold alerts that fire too late?
- SLO documentation -- is the SLO documented with owner, review cadence, and escalation policy?
- Organizational alignment -- do stakeholders (product, engineering, business) agree on these targets?
- "If the error budget is exhausted next Tuesday, what concretely happens? Who stops feature work? Show me the policy."

**Ingrid Larsson (Ops) (Alert Design Specialist) reviews:**
- 3 AM test -- if this alert fires at 3 AM, does the on-call engineer know exactly what to do?
- Actionability -- is every alert actionable? Can the on-call engineer take a specific remediation step?
- False positive rate -- what's the false positive rate on this alert over the last 30 days?
- Alert fatigue -- are there alerts that fire so frequently they're ignored?
- Runbook linkage -- does every alert link to a current, tested runbook?
- Threshold calibration -- are thresholds based on actual performance baselines, or arbitrary round numbers?
- Alert grouping -- are related alerts grouped/correlated, or does one failure trigger a cascade of independent alerts?
- "Show me the last 10 times this alert fired. For each, was it actionable? Did someone actually respond? What did they do?"

**Chen Bao (Distributed Tracing Specialist) reviews:**
- End-to-end trace coverage -- can you follow a request from the edge to the database and back?
- Async boundary propagation -- is trace context propagated across message queues, event buses, and async workers?
- Sampling strategy -- what's your sampling strategy, and what signals do you lose because of it?
- Trace enrichment -- are traces enriched with business context (user ID, tenant, feature flag) for debugging?
- Latency attribution -- can you identify which service or database call contributes most to latency?
- Error attribution -- when a downstream service returns an error, does the trace show the full error context?
- Span naming -- are span names descriptive and consistent, or generic ("HTTP request", "DB query")?
- "Find me a trace where latency exceeded your P99. Can you identify the bottleneck from the trace alone, without looking at logs or metrics?"

### Step 4: CHALLENGE -- Cross-Expert Debate

Key challenges for this panel:

1. **Fatima vs Derek:** "Instrument everything so we can debug any issue" vs "Only instrument what serves an SLI -- everything else is cost without purpose"
2. **Ingrid (Ops) vs Derek:** "Delete this noisy alert -- it has a 40% false positive rate" vs "That alert covers an SLO breach condition -- it stays, but we need to fix the threshold"
3. **Chen vs Fatima:** "100% trace sampling so we never miss an interesting edge case" vs "The storage and network cost of 100% sampling will eat the entire observability budget"
4. **Derek vs Ingrid (Ops):** "We need burn-rate alerts at 1h, 6h, and 3d windows" vs "Three alerts for the same SLO means three pages for one incident -- that's alert fatigue, not rigor"
5. **Fatima vs Chen:** "Structured logs with trace IDs give us everything traces give us, at lower cost" vs "Logs can't show you the request dependency graph or latency waterfall"

### Step 5: CONVERGE -- Synthesize Findings

```markdown
## Observability & Monitoring Design Panel Report

### Overall Assessment: [APPROVED / APPROVED WITH MODIFICATIONS / NEEDS REWORK]

### Instrumentation Assessment
1. **Signal Coverage:** [comprehensive/adequate/gaps identified]
2. **Correlation:** [logs-metrics-traces correlated / gaps in correlation]
3. **Overhead:** [acceptable/concerning/excessive]

### SLO/SLI Assessment
1. **[SLI/SLO]** -- verdict: [accept/modify/reject], rationale: [why]
- User-centric: [yes/no]
- Achievable: [yes/no -- based on historical data]
- Error budget policy: [defined/missing]

### Alert Quality
1. **[Alert Name]** -- verdict: [keep/modify/delete], rationale: [why]
- Actionable: [yes/no]
- Runbook: [exists/missing/outdated]
- False positive rate: [percentage]

### Risk Register
| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| [Risk 1] | [H/M/L] | [H/M/L] | [approach] | [who] |

### Cost Estimate
- Estimated observability cost: [$X/month]
- Cardinality concerns: [specific metrics]
- Optimization opportunities: [sampling, aggregation, retention]

### Dissenting Opinions
1. [Expert] argued [position] -- [rationale]
```

### Step 6: FEASIBILITY -> DELIVER

Top recommendations and alternative approaches go to [Feasibility Panel](feasibility-research.md).

## Example Invocations

### New Service Instrumentation
```
Run an Observability & Monitoring Design Panel -- Mode A -- on
instrumentation for our new payment processing service.

The service handles credit card transactions via Stripe, writes
to PostgreSQL, and publishes events to Kafka. Expected volume is
500 transactions/minute with seasonal 3x spikes.

Key concerns:
- Can we debug a failed payment end-to-end using proposed instrumentation?
- Are we collecting the right metrics for SLO definition?
- Is trace context propagated through the Kafka consumer?
- What's the instrumentation overhead on a latency-sensitive payment path?

Full Mode A panel.
```

### SLO/SLI Definition Review
```
Run Mode B on the proposed SLOs for our user authentication service.

Proposed SLIs:
- Availability: percentage of login requests returning non-5xx
- Latency: P99 of login request duration
- Correctness: percentage of login attempts with correct auth decision

Proposed targets: 99.95% availability, P99 < 500ms, 99.999% correctness.

Key concerns:
- Is "non-5xx" the right availability SLI, or should we include auth failures?
- Is P99 < 500ms achievable given our OAuth provider dependency?
- How do we measure "correct auth decision" in practice?
```

### Alert Quality Audit
```
Run Mode C on the alerting rules for our API gateway.

We have 34 alert rules, generating an average of 12 alerts/day.
On-call engineers report that approximately half are non-actionable.
Only 8 of the 34 alerts have linked runbooks.

Key concerns:
- Which alerts should be deleted or consolidated?
- Are thresholds calibrated to actual performance baselines?
- Which missing runbooks are highest priority to write?
- Are we missing alerts for failure modes we've seen in incidents?
```
