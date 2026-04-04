---
name: panel-presentation
description: Expert panel for crafting stakeholder presentations, progress reports, decision packages, and technical communication
aliases: [presentation-panel, stakeholder-panel, comms-panel, reporting-panel, pitch-panel]
category: orchestration
tags: [presentation, communication, stakeholders, reporting, progress, decisions, narrative]
version: 1.0.0
requires: [panel-of-experts]
resolutionHints:
  - preparing a presentation
  - stakeholder update or report
  - decision package for leadership
  - progress communication
  - presenting repo analysis or integration plan
  - packaging findings for non-technical audience
---

# Presentation Panel

## Purpose

Transforms technical artifacts — plans, analyses, repo evaluations, architecture decisions, panel review findings — into compelling stakeholder-ready presentations. This panel identifies what matters to the audience, structures the narrative for maximum impact, and catches the gap between "technically correct" and "persuasively communicated."

Invoked after any analysis or planning phase to extract presentation-worthy content and structure it for the target audience.

## Panel Composition

| Expert | Role | Primary Lens |
|---|---|---|
| **Claudia Reeves** | Technical Communication Director | Narrative structure, audience calibration, clarity |
| **Marcus Webb** | Data Visualization Specialist | Visual storytelling, chart selection, information density |
| **Diana Reyes** | Program Manager | Progress framing, milestone communication, risk messaging |
| **Tomoko Sato** | Executive Briefing Specialist | Decision framing, C-suite language, strategic alignment |
| **Rafael Dominguez** | Demo & Live Presentation Coach | Flow, pacing, live demo design, Q&A preparation |

## Expert Profiles

### Claudia Reeves — Technical Communication Director
- **Years:** 16
- **Background:** Led technical communication for two IPO-stage companies. Has turned 50-page engineering documents into 5-slide executive decks that secured multi-million dollar budgets. Specializes in bridging the gap between engineering reality and stakeholder understanding. "If the audience leaves confused, the presentation failed — not the audience."
- **Lens:** Narrative arc, audience calibration, jargon elimination, key message distillation, logical flow, opening hooks, clear calls to action.
- **Known Biases:** May oversimplify nuance that engineers need preserved. Prioritizes clarity over completeness.
- **Challenge Prompt:** "Read me your opening slide. Do I know WHY I should care within 10 seconds? Now read me your closing slide. Do I know WHAT to do next?"

### Marcus Webb — Data Visualization Specialist
- **Years:** 11
- **Background:** Built dashboards and reports for product, engineering, and executive audiences. Has seen every way a chart can lie — and every way it can illuminate. Believes the right visualization eliminates the need for explanation. "If you need a paragraph to explain your chart, the chart is wrong."
- **Lens:** Chart type selection, data-ink ratio, color accessibility, comparison clarity, trend visibility, annotation quality, misleading scale detection.
- **Known Biases:** Visualization-first thinking — sometimes a table or bullet list is genuinely better than a chart. Can over-design simple metrics.
- **Challenge Prompt:** "Cover the axis labels. Can I still tell the story from the shape alone? If not, the visualization isn't working."

### Diana Reyes — Program Manager
*(Cross-referenced from Architecture & Planning Panel)*
- **Years:** 17
- **Background:** Has communicated program status to leadership for 50+ engineering programs. Knows how to frame "we're behind" as "we've de-risked the critical path and adjusted scope" without being dishonest. Expert at milestone-based progress narratives.
- **Lens:** Progress framing, milestone clarity, risk communication, timeline visualization, scope change messaging, dependency status.
- **Challenge Prompt:** "If you only have 60 seconds with the VP, what three things do they need to know? Are those three things in your presentation?"

### Tomoko Sato — Executive Briefing Specialist
- **Years:** 14
- **Background:** Former chief of staff to a CTO at a public tech company. Has prepared hundreds of board decks and executive briefings. Knows that executives make decisions in 3-5 minutes and everything after that is Q&A defense. Translates engineering initiatives into business impact language.
- **Lens:** Decision framing (recommend, don't just inform), business impact quantification, risk-adjusted messaging, strategic narrative alignment, executive attention management.
- **Known Biases:** Business-metric obsession — may push to quantify things that are genuinely not quantifiable yet. Can strip too much technical context.
- **Challenge Prompt:** "What decision are you asking them to make? If you're not asking for a decision, why is this a meeting instead of an email?"

### Rafael Dominguez — Demo & Live Presentation Coach
- **Years:** 10
- **Background:** Developer advocate who has given 200+ conference talks and live demos. Has recovered from every possible live demo failure (network down, wrong branch, database empty, projector dying). Designs presentations for engagement, not just information transfer. "The demo is not proof that it works — it's the moment the audience feels it."
- **Lens:** Presentation flow and pacing, live demo design, audience engagement points, Q&A anticipation, failure recovery plans, slide-to-demo transitions.
- **Known Biases:** Entertainment-oriented — may prioritize engagement over information density. Not every presentation needs a live demo.
- **Challenge Prompt:** "Your demo is going to break. What's your recovery? Do you have a pre-recorded backup? Can you explain the concept without the demo if needed?"

## When to Invoke

- After completing any analysis, plan, or decision document
- Before stakeholder meetings, sprint reviews, or board updates
- After repo ingestion — packaging findings for team/leadership
- After panel reviews — distilling expert findings into actionable communication
- Progress reporting for multi-phase initiatives
- Decision packages that need approval
- Technical demos or showcases

## Review Modes

### Mode A: Presentation Extraction
Take an existing artifact (plan, analysis, panel report) and identify what belongs in a presentation.

### Mode B: Presentation Review
Review an existing presentation/deck for effectiveness.

### Mode C: Progress Report Packaging
Package current project state into a stakeholder update.

### Mode D: Decision Package
Frame a technical decision for executive approval.

## Review Protocol

### Step 1: CONVENE

| Scenario | Active Experts |
|---|---|
| Presentation extraction from analysis | Claudia, Tomoko, Marcus |
| Full presentation review | All 5 |
| Progress report | Diana, Claudia, Marcus |
| Executive decision package | Tomoko, Claudia, Diana |
| Demo preparation | Rafael, Claudia, Marcus |
| Conference/external talk | All 5 |

### Step 2: BRIEF
```
## Presentation Review Target
- **Source Artifact:** [plan, analysis, panel report, etc.]
- **Target Audience:** [executives / engineering team / stakeholders / external]
- **Audience Technical Level:** [non-technical / semi-technical / technical]
- **Format:** [slides / written report / live demo / async update]
- **Time Constraint:** [5 min / 15 min / 30 min / 60 min]
- **Decision Needed:** [yes — what decision / no — informational only]
- **Key Message:** [the one thing the audience must remember]
```

### Step 3: SOLO — Independent Expert Reviews

**Claudia Reeves reviews:**
- Narrative arc — does it have a beginning (why), middle (what), end (so what)?
- Audience calibration — language appropriate for the audience's technical level?
- Jargon audit — every technical term either eliminated or defined on first use
- Key message clarity — can the audience state the main point after the presentation?
- Opening hook — does the first 30 seconds capture attention?
- Call to action — does the audience know what to do next?
- "If the audience only remembers one thing, is it the right thing?"

**Marcus Webb reviews:**
- Visual support — which points need charts/diagrams/screenshots?
- Chart selection — is each visualization type appropriate for its data?
- Comparison clarity — are comparisons fair and visually honest?
- Information density — enough to be substantive, not so much it overwhelms?
- Color and a11y — accessible to colorblind audience members?
- "Can someone in the back row read your chart? Can someone without color vision understand it?"

**Diana Reyes reviews:**
- Progress framing — is the current state communicated honestly and constructively?
- Milestone visibility — are achievements and upcoming milestones clear?
- Risk messaging — are risks communicated with mitigations, not just problems?
- Timeline clarity — does the audience understand where we are and where we're going?
- Scope communication — are scope changes explained with rationale?
- "If the project is late, does this presentation acknowledge that with a plan, or pretend it's not happening?"

**Tomoko Sato reviews:**
- Decision framing — if a decision is needed, is the recommendation clear?
- Business impact — are technical improvements translated to business outcomes?
- Strategic alignment — does this connect to organizational priorities?
- Executive summary — can the key points be consumed in under 3 minutes?
- Risk/reward framing — are trade-offs presented as options, not complaints?
- "What would a board member ask after slide 3? Is the answer in slide 4?"

**Rafael Dominguez reviews:**
- Flow and pacing — does the presentation build momentum or drag?
- Engagement points — where does the audience interact or react?
- Demo design — if applicable, is the demo self-contained and recoverable?
- Q&A preparation — what are the top 5 questions this will generate?
- Transitions — are transitions between sections smooth and logical?
- Backup plan — what if the demo fails? What if time is cut in half?
- "Rehearse this out loud. Where do you stumble? That's where the presentation is weak."

### Step 4: CHALLENGE

1. **Claudia vs Tomoko:** "This needs more narrative context" vs "Executives don't have time for narrative — lead with the ask"
2. **Marcus vs Diana:** "This progress needs a Gantt chart" vs "Nobody reads Gantt charts — use milestones"
3. **Rafael vs Claudia:** "Start with the demo to hook them" vs "Start with the problem to set context"
4. **Tomoko vs Rafael:** "Cut the demo and just show results" vs "The demo is what makes this real"
5. **Diana vs Marcus:** "Show the risks prominently" vs "Leading with risks kills momentum"

### Step 5: CONVERGE

```markdown
## Presentation Panel Report

### Presentation Readiness: [READY / NEEDS REVISION / MAJOR REWORK]

### Extracted Presentation Content
(For Mode A — what belongs in the presentation from the source artifact)

| Source Section | Presentation Slide/Point | Audience Value |
|---|---|---|
| [section from artifact] | [how it becomes a presentation point] | [why audience cares] |

### Narrative Structure Recommendation
1. **Opening:** [hook — why this matters NOW]
2. **Context:** [minimal background — only what's needed to understand the update]
3. **Key Findings/Progress:** [the substance — 3-5 points max]
4. **Implications:** [so what? what changes?]
5. **Ask/Next Steps:** [decision needed or action items]

### Visual Recommendations
| Point | Visualization Type | Data Source | Notes |
|---|---|---|---|
| [point] | [chart/diagram/screenshot] | [where data comes from] | [design notes] |

### Anticipated Questions & Answers
| Question | Prepared Answer | Backup Evidence |
|---|---|---|
| [likely question] | [concise answer] | [where to find supporting data] |

### Risk Messaging Guide
| Risk | How to Frame It | What NOT to Say |
|---|---|---|
| [risk] | [constructive framing] | [panic-inducing framing to avoid] |

### Demo Plan (If Applicable)
- **Demo scenario:** [what to show]
- **Setup requirements:** [what must be ready]
- **Failure recovery:** [what to do if it breaks]
- **Pre-recorded backup:** [Y/N, location]
```

## Example Invocations

### Post-Analysis Presentation Extraction
```
Run the Presentation Panel in extraction mode on docs/ECC-INTEGRATION-PLAN.md.

Audience: Engineering team leads + VP of Engineering
Time: 15 minutes
Decision needed: Approval to proceed with Phase 1-2
Key message: We can adopt ECC's best ideas while keeping our runtime enforcement advantages
```

### Progress Report Packaging
```
Run the Presentation Panel in progress report mode.

Context: We're 3 sessions into the ECC integration. Phase 1 (Identity) is
complete. Phase 2 (Hooks) is 60% done. No blockers.

Audience: Product stakeholders (semi-technical)
Format: Written async update (Slack/email)
```

### Repo Analysis Presentation
```
Run the Presentation Panel to package the everything-claude-code repo
analysis findings for our engineering team.

Source: 20 research agent reports + docs/ECC-INTEGRATION-PLAN.md
Audience: Full engineering team (technical)
Time: 30 minutes with Q&A
Key message: Here's what we can learn from the most-starred Claude Code repo
```
