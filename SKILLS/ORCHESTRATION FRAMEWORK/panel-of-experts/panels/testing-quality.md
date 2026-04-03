---
name: panel-testing-quality
description: Expert panel for test strategy, coverage analysis, quality engineering, and resilience testing
aliases: [testing-panel, qa-panel, quality-experts, test-review-panel]
category: orchestration
tags: [testing, quality, coverage, resilience, qa, test-strategy]
version: 1.0.0
requires: [panel-of-experts]
resolutionHints:
  - test strategy review
  - coverage analysis
  - QA process review
  - test quality assessment
  - resilience or chaos testing
---

# Testing & Quality Panel

## Panel Composition

| Expert | Role | Primary Lens |
|---|---|---|
| **Dr. Patricia Okonkwo** | QA Architect | Strategy, coverage quality, assertion strength |
| **Ryan Kowalski** | Chaos Engineer | Resilience, fault injection, degradation |
| **Jun Watanabe** | Test Automation Lead | Speed, reliability, CI pipeline efficiency |

See [expert-roster.md](../expert-roster.md) for full persona definitions.

## When to Invoke

- Designing test strategy for new features or systems
- Reviewing test suite quality (not just coverage numbers)
- CI pipeline optimization
- Pre-release quality gate assessment
- Evaluating test reliability (flakiness analysis)
- Designing resilience/chaos testing approach

## Review Protocol

### Step 1: CONVENE

| Artifact Type | Active Experts |
|---|---|
| Test strategy design | Patricia, Jun |
| Coverage quality audit | Patricia, Ryan |
| CI pipeline | Jun, Patricia |
| Resilience testing | Ryan, Jun |
| Flakiness investigation | Jun, Patricia |

### Step 2: BRIEF
```
## Testing Review Target
- **System Under Test:** [what is being tested]
- **Current Coverage:** [line %, branch %, meaningful %]
- **Test Count:** [unit / integration / e2e breakdown]
- **CI Duration:** [how long the full suite takes]
- **Known Issues:** [flaky tests, coverage gaps, slow tests]
- **Risk Areas:** [parts of the system most likely to have bugs]
```

### Step 3: SOLO — Independent Expert Reviews

**Dr. Patricia Okonkwo (QA Architect) reviews:**
- Assertion quality — do tests verify behavior or just exercise code paths?
- Coverage gaps — not line coverage, but scenario coverage. What inputs aren't tested?
- Test isolation — do tests depend on execution order or shared state?
- Boundary testing — edge cases, off-by-one, empty inputs, max values
- Test naming — does the test name tell you what broke when it fails?
- Mock fidelity — do mocks accurately represent the system they replace?
- Mutation testing potential — would mutating code actually fail tests?
- "Your tests pass. Now I've introduced a subtle bug. Do they catch it?"

**Ryan Kowalski (Chaos Engineer) reviews:**
- Failure injection points — where can faults be introduced?
- Dependency failure testing — what happens when each dependency fails?
- Graceful degradation verification — does the system shed load correctly?
- Recovery testing — after failure, does the system return to healthy state?
- Data integrity under failure — are writes atomic? Can partial failures corrupt state?
- Timeout testing — are timeouts tested, not just configured?
- "Kill every dependency one at a time. Which one causes the biggest mess?"

**Jun Watanabe (Test Automation) reviews:**
- CI pipeline structure — what runs in parallel? What's sequential?
- Test execution time — where's the bottleneck?
- Fixture efficiency — are test fixtures reused appropriately?
- Flake detection — is there automated flake tracking and quarantine?
- Test data management — how is test data created, isolated, and cleaned?
- Feedback loop speed — how quickly does a developer know if their change broke something?
- "A developer pushes a commit. How many seconds until they know if it's broken?"

### Step 4: CHALLENGE

1. **Patricia vs Jun:** "We need more integration tests" vs "Integration tests are too slow for CI"
2. **Ryan vs Patricia:** "We need chaos testing" vs "We need to fix the unit tests first"
3. **Jun vs Ryan:** "Tests should be fast and deterministic" vs "Real systems aren't deterministic"

### Step 5: CONVERGE

```markdown
## Testing & Quality Panel Report

### Quality Verdict: [PRODUCTION READY / NEEDS IMPROVEMENT / NOT READY]

### Coverage Quality Assessment
- Meaningful coverage: [% — not line count, but scenario coverage]
- Highest-risk uncovered areas: [list]
- Mutation testing estimate: [% of mutations that would be caught]

### Test Strategy Gaps
1. [Gap] — risk: [what bugs this would miss], fix: [approach]

### CI Pipeline Recommendations
1. [Recommendation] — current: [state], target: [state], improvement: [X%]

### Resilience Findings
1. [Failure scenario not tested] — blast radius: [description]

### Test Reliability Issues
1. [Flaky test/pattern] — frequency: [how often], root cause: [analysis]

### Priority Remediation
| Priority | Action | Expected Outcome | Effort |
|---|---|---|---|
| 1 | [action] | [outcome] | [H/M/L] |
```

## EVOKORE-Specific Testing Checklist

- [ ] All 2053+ vitest tests pass consistently (`npx vitest run`)
- [ ] Hook scripts have integration tests (not just unit tests on logic)
- [ ] HITL approval flow is tested end-to-end
- [ ] Session isolation prevents cross-session state leakage under concurrent load
- [ ] Plugin hot-reload doesn't drop in-flight requests
- [ ] WebSocket approval transport handles connection drops gracefully
- [ ] Proxied tool calls respect rate limits under burst conditions
