---
name: panel-meta-improvement
description: Optional post-cycle review that evaluates and improves expert personas, panel composition, and workflow effectiveness
aliases: [meta-panel, improvement-cycle, persona-review, self-improvement-panel]
category: orchestration
tags: [meta, improvement, self-reflection, personas, workflow-optimization, quality]
version: 1.0.0
requires: [panel-of-experts]
resolutionHints:
  - improve expert personas
  - review panel effectiveness
  - optimize panel workflow
  - meta-analysis of expert reviews
---

# Meta-Improvement Panel (Optional Cycle)

## Purpose

An optional post-cycle step that reviews the expert personas, panel composition, and workflow execution after a panel review completes. Identifies improvement areas in the experts' narratives, coverage gaps, and workflow bottlenecks.

**This is intentionally optional.** It should NOT be run on every panel cycle — that would bloat workflows and create diminishing returns. Use it when:
- A panel review felt incomplete or missed obvious issues
- New domain expertise is needed that no current expert covers
- The workflow steps created friction or bottlenecks
- You want to evolve the expert roster after a significant project shift

## Panel Composition

The Meta-Improvement Panel uses a dedicated set of reviewers who evaluate the panel system itself:

| Expert | Role | Primary Lens |
|---|---|---|
| **Dr. Helena Marsh** | Organizational Psychologist | Group dynamics, cognitive bias, perspective diversity |
| **Kai Nishida** | Process Optimization Engineer | Workflow efficiency, bottleneck analysis, feedback loops |
| **Serena Okafor** | Domain Expertise Curator | Knowledge gaps, persona accuracy, expertise evolution |

## Expert Profiles

### Dr. Helena Marsh — Organizational Psychologist
- **Years:** 19
- **Background:** Studies how expert panels and review boards make decisions. Has published research on groupthink in technical review processes, confirmation bias in code review, and how persona diversity affects outcome quality. Consults on structuring review panels for maximum insight.
- **Lens:** Cognitive bias detection, perspective diversity, groupthink indicators, challenge effectiveness, dissent quality, Devil's Advocate effectiveness.
- **Challenge Prompt:** "Did the panel actually disagree, or did they politely agree from different angles? Real challenge produces uncomfortable insights, not comfortable variations."

### Kai Nishida — Process Optimization Engineer
- **Years:** 13
- **Background:** Process engineer who optimizes engineering workflows. Has measured the ROI of code review processes, sprint ceremonies, and quality gates. Believes every process step should justify its existence with measurable value. "If a workflow step doesn't change the outcome, it's ceremony, not process."
- **Lens:** Step-by-step value analysis, bottleneck identification, parallel opportunity, information flow efficiency, output quality per time invested.
- **Challenge Prompt:** "Remove one step from this workflow. If the output quality doesn't change, that step was waste. If it does change, that step is critical — make it faster."

### Serena Okafor — Domain Expertise Curator
- **Years:** 15
- **Background:** Built and maintained expert networks for consulting firms. Specializes in identifying knowledge gaps, evolving expertise profiles as domains change, and ensuring panels have the right mix of perspectives. Has seen expert panels fail because the experts' knowledge was 3 years stale.
- **Lens:** Expertise currency (is the knowledge up-to-date?), coverage gaps (what perspective is missing?), persona authenticity (does the persona behave like a real expert would?), blind spot detection.
- **Challenge Prompt:** "What did this panel miss that a real expert in this domain would have caught? That gap tells you which persona needs updating — or which new persona you need."

## Review Protocol

### Input: Post-Cycle Artifacts
```
## Meta-Improvement Input
- **Panel Used:** [which domain panel ran]
- **Artifact Reviewed:** [what was reviewed]
- **Panel Report:** [the convergence report]
- **Feasibility Report:** [if applicable]
- **Time Spent:** [approximate — quick/standard/extended]
- **User Feedback:** [any user reaction to the panel output]
```

### Step 1: Persona Effectiveness Review

**Serena Okafor evaluates each expert persona:**
- Did this expert find something that generic analysis would have missed?
- Was the expert's "lens" actually different from other panelists, or did they overlap?
- Did the expert's "known biases" manifest? Were they acknowledged or did they silently skew findings?
- Is the expert's background current enough for this domain? (e.g., a "cloud architect" persona that still thinks in VMs)
- Were the challenge prompts actually used? Did they surface insights?

**Output per persona:**
```yaml
expert: [name]
effectiveness: [high/medium/low]
unique_findings: [count of findings only this expert caught]
bias_manifestation: [did their bias help or hurt?]
suggested_updates:
  - [specific change to background, lens, or challenge prompt]
coverage_gap_found: [something they should have caught but didn't]
```

### Step 2: Panel Composition Review

**Dr. Helena Marsh evaluates group dynamics:**
- Was there genuine disagreement or false consensus?
- Did the challenge phase produce new insights or just restate positions?
- Was the Devil's Advocate actually contrarian, or did they agree with extra steps?
- Were there perspectives missing that would have changed the outcome?
- Did any expert dominate while others were underutilized?

**Output:**
```yaml
diversity_score: [1-5, where 5 = highly diverse perspectives]
challenge_quality: [genuine/surface/performative]
missing_perspectives:
  - [perspective that would have added value]
groupthink_indicators:
  - [signs of false consensus]
recommended_panel_changes:
  - [add/remove/modify expert for this panel type]
```

### Step 3: Workflow Effectiveness Review

**Kai Nishida evaluates the workflow:**
- Which steps produced the highest-value output?
- Which steps could be parallelized or combined?
- Was the CONVENE step actually useful, or was the default "all experts" always used?
- Did the CHALLENGE phase add insights beyond the SOLO phase?
- Was the FEASIBILITY gate informative or rubber-stamp?
- What was the information density of the final report? (signal-to-noise ratio)

**Output:**
```yaml
highest_value_steps: [which steps contributed most to quality]
lowest_value_steps: [which steps had least impact]
bottlenecks: [where did the workflow stall or produce low-value output]
parallel_opportunities: [steps that could run concurrently]
suggested_changes:
  - step: [step name]
    change: [what to modify]
    rationale: [why]
output_quality: [signal-to-noise ratio assessment]
```

### Step 4: CONVERGE — Improvement Recommendations

```markdown
## Meta-Improvement Report

### Cycle Reviewed: [panel type] on [artifact]

### Persona Updates Recommended
| Expert | Current | Recommended Change | Rationale |
|---|---|---|---|
| [name] | [current lens/background detail] | [specific update] | [why] |

### New Personas Suggested
| Role | Lens | Why Missing Matters |
|---|---|---|
| [role] | [what they'd review] | [what was missed without them] |

### Personas to Retire or Merge
| Expert | Recommendation | Rationale |
|---|---|---|
| [name] | [retire/merge with X] | [why — overlap or low value] |

### Workflow Improvements
| Step | Current | Recommended | Impact |
|---|---|---|---|
| [step] | [current behavior] | [change] | [expected improvement] |

### Coverage Gaps Identified
1. [Domain/topic not covered by any current expert]

### Quality Metrics
- Unique findings per expert: [distribution]
- Challenge phase value-add: [high/medium/low]
- Feasibility gate accuracy: [were verdicts useful?]
- Report signal-to-noise: [ratio assessment]
```

## When to Invoke

**DO invoke when:**
- A panel review missed something obvious in hindsight
- The user expressed that the panel output wasn't useful enough
- A new domain or technology has emerged that existing experts don't cover
- It's been 5+ review cycles since the last meta-improvement
- You're about to start a major new project and want to tune the experts

**DO NOT invoke when:**
- The panel review went well and the user was satisfied
- You're in the middle of a time-sensitive workflow
- The same meta-improvement was run recently with no significant changes
- The review was a quick/targeted review (not worth the overhead)

## Applying Improvements

Meta-improvement recommendations should be:
1. **Reviewed by the user** before applying — persona changes affect all future reviews
2. **Applied incrementally** — change one or two personas at a time, not the whole roster
3. **Tested** — run the improved panel on the same artifact and compare output quality
4. **Versioned** — update the `version` field in affected panel skill files

Changes are applied to:
- `expert-roster.md` — persona background, lens, biases, challenge prompts
- `panels/*.md` — panel composition, review protocol, EVOKORE-specific checklists
- `workflows/*.json` — step ordering, parallelization, conditionals
- `~/.evokore/panel-narratives/` — persistent cross-session expert evolution records
