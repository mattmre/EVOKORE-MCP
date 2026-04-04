---
name: panel-code-refinement
description: Expert panel for code quality review, pattern analysis, and implementation refinement
aliases: [code-review-panel, code-experts, code-panel]
category: orchestration
tags: [code-review, refactoring, patterns, quality, bugs]
version: 1.0.0
requires: [panel-of-experts]
resolutionHints:
  - expert code review
  - multi-perspective code analysis
  - deep code quality review
  - code refinement with experts
---

# Code Refinement Panel

## Panel Composition

| Expert | Role | Primary Lens |
|---|---|---|
| **Margaret Chen** | Principal Software Engineer | Readability, maintainability, SOLID, naming |
| **Dr. James Okafor** | Senior Reliability Engineer | Error handling, failure modes, edge cases |
| **Priya Sharma** | Enterprise Systems Architect | Coupling, cohesion, system boundaries, data flow |
| **Alex Rivera** | Senior Front-End Engineer | Component architecture, a11y, render perf, UX |
| **Sofia Andersson** | Senior Back-End Engineer | API design, data modeling, concurrency, caching |
| **Marcus Thompson** | DevOps/Platform Engineer | Deployability, observability, build reproducibility |

See [expert-roster.md](../expert-roster.md) for full persona definitions.

## When to Invoke

- PR review for critical or complex changes
- Post-implementation refinement passes
- Before merging features into main
- Refactoring planning and validation
- Code architecture decisions within a module

## Review Protocol

### Step 1: CONVENE — Select Active Experts
Not all 6 experts review every artifact. Select based on what's being reviewed:

| Artifact Type | Active Experts |
|---|---|
| Full-stack feature | All 6 |
| API endpoint | Sofia, James, Priya, Marcus |
| UI component | Alex, Margaret, Marcus |
| Data pipeline | Sofia, James, Priya, Marcus |
| Infrastructure/config | Marcus, James, Priya |
| Utility/library code | Margaret, James, Sofia |

### Step 2: BRIEF — Present the Code
Structure the briefing:
```
## Code Under Review
- **Files:** [list of files and line ranges]
- **Purpose:** [what this code does]
- **Context:** [PR description, related issue, why this change exists]
- **Known Concerns:** [anything the author already flagged]
- **Constraints:** [performance requirements, backward compat, etc.]
```

### Step 3: SOLO — Independent Expert Reviews

Each active expert reviews the code through their specific lens. The review must include:

**Margaret Chen reviews for:**
- Naming clarity (variables, functions, classes, modules)
- Function length and single-responsibility
- Code duplication and abstraction quality
- Design pattern correctness (not just presence)
- Magic numbers, unclear conditionals, implicit behavior
- "Would I understand this code in 6 months without the PR description?"

**Dr. James Okafor reviews for:**
- Unhandled error paths
- Missing timeouts on I/O operations
- Retry logic without backoff or circuit breaking
- Silent failure modes (catch-and-ignore, empty catch blocks)
- Resource leaks (unclosed connections, unreleased locks)
- Race conditions and TOCTOU vulnerabilities
- "What's the worst thing that happens if every external call fails?"

**Priya Sharma reviews for:**
- Tight coupling between modules that should be independent
- Data flowing through too many layers
- God objects or modules with too many responsibilities
- Dependency direction violations (lower layers depending on higher)
- Missing abstraction boundaries
- "If I need to replace component X, how many other files change?"

**Alex Rivera reviews for:**
- Component reusability and composability
- State management correctness (unnecessary re-renders, stale closures)
- Accessibility violations (missing labels, keyboard nav, ARIA)
- Responsive design gaps
- Bundle size impact
- User-facing error state handling
- "Does this degrade gracefully on slow connections?"

**Sofia Andersson reviews for:**
- N+1 queries and unnecessary database round trips
- Missing or incorrect indexes
- Cache invalidation correctness
- API contract clarity (request/response shapes, error codes)
- Concurrency issues (shared mutable state, lock ordering)
- Backward compatibility breaks
- "What happens when two users do this simultaneously?"

**Marcus Thompson reviews for:**
- Environment-dependent behavior (hardcoded paths, missing config)
- Log quality (structured? appropriate level? useful context?)
- Health check and observability hooks
- Configuration management (env vars, feature flags)
- Build/deploy impact
- "Can I troubleshoot this in production with only logs and metrics?"

### Step 4: CHALLENGE — Cross-Expert Debate

After solo reviews, experts challenge each other:

1. **Margaret vs Sofia:** Is this abstraction helping or hurting performance?
2. **James vs Priya:** Is this error handling at the right layer?
3. **Alex vs Sofia:** Is this API shape right for the frontend that consumes it?
4. **Marcus vs James:** Is this observable enough to debug in production?
5. **Priya vs Margaret:** Is this coupling justified by readability?

Each challenge must be specific:
```
[Expert A] challenges [Expert B]:
"You recommended [X], but that would cause [Y] from my perspective.
Specifically, [concrete example]. Can you reconcile this?"
```

### Step 5: CONVERGE — Synthesize Findings

The Synthesis Lead (rotating) produces:

```markdown
## Panel Convergence Report

### Critical (Must Fix Before Merge)
1. [Finding] — flagged by [N] experts, consensus: [rationale]

### High (Fix in Next Iteration)
1. [Finding] — flagged by [experts], impact: [description]

### Medium (Track as Tech Debt)
1. [Finding] — flagged by [expert], trade-off: [description]

### Dissenting Opinions
1. [Expert] argued [position] against consensus because [reason]
   — Panel response: [why consensus disagreed, or "noted for monitoring"]

### Acknowledged Strengths
1. [What the code does well] — noted by [experts]
```

### Step 6: FEASIBILITY → DELIVER
Top findings go to the [Feasibility Panel](feasibility-research.md) for approach evaluation. Final delivery includes the convergence report + feasibility assessment + specific remediation steps.

## Example Invocation

```
Run a Code Refinement Panel review on src/SessionIsolation.ts.

Context: This is the multi-tenant session isolation layer for an MCP server.
It handles per-connection state, TTL management, and LRU eviction.
Performance matters — this is in the hot path for every tool call.

Known concerns: The TTL check runs on every access. Is this the right trade-off?
Constraints: Must maintain backward compatibility with existing session store interface.

Use the full panel cycle: CONVENE → SOLO → CHALLENGE → CONVERGE → DELIVER.
```

## Output Template

```markdown
# Code Refinement Panel Report
**Artifact:** [files reviewed]
**Date:** [date]
**Active Experts:** [list]
**Synthesis Lead:** [name]

## Solo Reviews
[Each expert's independent review]

## Challenge Phase Highlights
[Key debates and their resolution]

## Convergence Report
[Prioritized findings with consensus levels]

## Feasibility Assessment
[From Feasibility Panel on top recommendations]

## Remediation Plan
[Specific, ordered action items]
```
