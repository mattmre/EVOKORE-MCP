---
name: panel-performance-optimization
description: Expert panel for performance analysis, scalability assessment, and operational readiness
aliases: [performance-panel, perf-experts, scale-panel, performance-review]
category: orchestration
tags: [performance, scalability, optimization, capacity, reliability, operations]
version: 1.0.0
requires: [panel-of-experts]
resolutionHints:
  - performance review or optimization
  - scalability assessment
  - capacity planning
  - operational readiness review
---

# Performance & Scale Panel

## Panel Composition

| Expert | Role | Primary Lens |
|---|---|---|
| **Dr. Raj Patel** | Performance Engineer | Hot paths, complexity, memory, I/O, caching |
| **Maya Williams** | Capacity Planning Lead | Resource utilization, cost, bottleneck prediction |
| **Carlos Mendez (SRE)** | Site Reliability Engineer | Operational readiness, observability, incident response |

See [expert-roster.md](../expert-roster.md) for full persona definitions.

## When to Invoke

- Performance-critical code paths (hot loops, request handlers, data pipelines)
- Scaling decisions (horizontal vs vertical, caching layers, read replicas)
- Pre-launch operational readiness assessment
- Cost optimization for infrastructure
- Diagnosing performance regressions
- Evaluating caching strategies

## Review Protocol

### Step 1: CONVENE

| Artifact Type | Active Experts |
|---|---|
| Hot path code | Raj, Carlos |
| Scaling architecture | All 3 |
| Cost optimization | Maya, Raj |
| Operational readiness | Carlos, Maya |
| Caching design | Raj, Maya |

### Step 2: BRIEF
```
## Performance Review Target
- **Component:** [what is being reviewed]
- **Current Load:** [RPS, concurrent users, data volume]
- **Expected Growth:** [projected load increase over what period]
- **SLOs:** [latency targets (p50, p95, p99), availability, throughput]
- **Known Bottlenecks:** [any already-identified performance issues]
- **Resource Constraints:** [budget, infrastructure limits]
```

### Step 3: SOLO — Independent Expert Reviews

**Dr. Raj Patel (Performance Engineer) reviews:**
- Algorithmic complexity — O(n) analysis on hot paths
- Memory allocation patterns — unnecessary allocations, GC pressure
- I/O efficiency — batching, connection pooling, unnecessary round trips
- Caching effectiveness — hit rates, invalidation correctness, cache stampede risk
- Serialization overhead — JSON parsing, protobuf, string manipulation in loops
- Lock contention — shared resources, mutex granularity
- "Profile under realistic load. Where does 80% of the time go?"

**Maya Williams (Capacity Planning) reviews:**
- Resource utilization patterns — CPU/memory/disk/network under various loads
- Scaling characteristics — linear, superlinear, or sublinear with load?
- Cost per unit of work — and how it changes with scale
- Bottleneck prediction — what saturates first?
- Headroom analysis — how much spare capacity exists before degradation?
- Growth modeling — when does current architecture hit its ceiling?
- "At 10x current load, what breaks first and what does it cost to fix?"

**Carlos Mendez (SRE) reviews:**
- Observability — can we see what's happening in production?
- Alert quality — are alerts actionable? Do they fire before users notice?
- Runbook completeness — can oncall diagnose and fix without escalation?
- Graceful degradation — what sheds load under pressure?
- Recovery time — how quickly does the system recover after overload?
- Deployment impact — does deploy cause a performance cliff?
- "It's 3am and this service is at 95% CPU. What do I look at? What do I do?"

### Step 4: CHALLENGE

1. **Raj vs Maya:** "This optimization saves CPU" vs "The engineering time costs more than the compute savings"
2. **Carlos vs Raj:** "This needs a cache" vs "This cache will be impossible to debug at 3am"
3. **Maya vs Carlos:** "We need more headroom" vs "Over-provisioning is waste we can't justify"

### Step 5: CONVERGE

```markdown
## Performance & Scale Panel Report

### Performance Verdict: [MEETS SLOs / AT RISK / DOES NOT MEET SLOs]

### Critical Performance Issues
1. [Issue] — impact: [latency/throughput/cost], severity: [measured impact]

### Scaling Risks
| Risk | Current Headroom | Projected Timeline to Saturation | Mitigation |
|---|---|---|---|
| [Component] | [%] | [when] | [approach] |

### Optimization Recommendations (Prioritized by ROI)
1. [Optimization] — expected improvement: [X%], effort: [H/M/L]

### Operational Readiness Gaps
1. [Gap] — impact on incident response: [description]

### Cost Projections
| Load Level | Current Cost | Projected Cost | Notes |
|---|---|---|---|
| Current | [$X] | - | Baseline |
| 2x | - | [$Y] | [what needs to change] |
| 10x | - | [$Z] | [architectural changes needed] |
```
