# Presentation Panel Report: ECC Integration Plan Review

**Date:** 2026-03-30
**Panel:** Presentation Extraction (Mode A)
**Source Artifacts:** ECC Integration Plan, Architecture & Planning Panel Findings, Repo Ingestion Panel Findings
**Target Audience:** Engineering team leads + project owner/operator
**Format:** Written report (async, pre-planning-session read)
**Decision Requested:** Approval to proceed with revised Phase 0 + Phase 1, with modified scope based on panel findings

---

## PHASE 1: SOLO REVIEWS

Each panelist independently reviews the source material through their professional lens.

---

### 1.1 Claudia Reeves -- Technical Communication Director

**Overall Assessment:** The integration plan is well-structured as a technical document but fails as a communication artifact for decision-making. It presents 9 phases of work as a fait accompli rather than as a proposal requiring evaluation and approval.

**Structural Concerns:**

1. **Narrative inversion.** The plan opens with an executive summary that makes the strategic case ("complementary, not competing") but then immediately dives into implementation details. The audience needs to understand the *problem being solved* before the solution architecture. What pain points does EVOKORE have today that ECC addresses? The plan assumes the reader already agrees the integration is worth doing.

2. **Capability matrix is a wall.** The 17-row comparison matrix is comprehensive but overwhelming. It mixes critical gaps with areas where EVOKORE is already stronger. A reader scanning this table cannot distinguish "we must fix this" from "nice to have." The matrix needs triage -- the "CRITICAL" and "LARGE" labels help but are inconsistent (why is Multi-IDE "LARGE" when the Architecture Panel recommends removing it?).

3. **Verdict framing is buried.** The Repo Ingestion Panel's "Needs Changes" verdict and the Architecture Panel's resequencing recommendation are the most important outputs, but they exist only in the panel findings, not in any consolidated view. The audience will receive conflicting signals: the plan says "go," the panels say "not yet."

4. **Effort estimates communicate false precision.** "28-43 sessions" with "session" undefined is worse than no estimate at all. It creates a number the audience will anchor on while having no idea what it means. Diana's instinct will be the same.

5. **The "What NOT to Import" section is strong.** This is the clearest writing in the plan -- direct, opinionated, justified. The rest of the plan should match this tone.

**Recommendation:** Restructure the presentation around three questions: (a) What gap are we closing? (b) What is the minimum viable first move? (c) What must be true before we go further?

---

### 1.2 Marcus Webb -- Data Visualization Specialist

**Overall Assessment:** The plan is text-heavy with no visual assets. The dependency graph is ASCII art that no one will study closely. The capability matrix is the closest thing to a visual element, but it encodes too many dimensions in a flat table.

**Visual Gaps Identified:**

1. **The capability matrix needs a heat map, not a table.** A 2x2 or radar chart showing ECC strengths vs. EVOKORE strengths would communicate the complementary thesis in one glance. The current table requires row-by-row reading to reach the same conclusion.

2. **The dependency graph needs to be a real diagram.** The ASCII art obscures the critical path. A proper flow diagram would show: (a) what can start now (Phase 0/1), (b) what blocks on what (Phase 4 blocks on Phase 2), (c) what is independent (Phase 6). Color-coding by priority or risk would add another dimension.

3. **Effort vs. impact is not visualized.** The audience needs to see which phases are high-impact/low-effort (Phase 1, Quick Wins) vs. high-effort/uncertain-impact (Phase 4, Phase 9). A simple scatter plot of effort vs. impact would expose Phase 4's "VERY HIGH effort / TRANSFORMATIVE impact" as the plan's biggest bet.

4. **Finding severity needs a consolidated dashboard.** Between the two panels, there are 4 Critical, 6 High, and 10+ additional findings. The audience needs a single visual showing: how many findings block execution, how many require design work, how many are documentation fixes. A stacked bar or simple severity table would work.

5. **The resequencing recommendation needs a before/after timeline.** The Architecture Panel proposes a different execution order. Show the original 9-phase waterfall alongside the recommended resequenced plan. The contrast itself is informative.

**Recommendation:** Create 4 visual assets: (1) capability radar chart, (2) resequenced dependency flow diagram, (3) effort-impact scatter, (4) findings severity dashboard.

---

### 1.3 Diana Reyes -- Program Manager

**Overall Assessment:** This plan has significant execution risk that is not acknowledged in the document. The scope is large, the estimates are ungrounded, and there is no test strategy. That said, the strategic thesis is sound, and the quick-wins are well-identified.

**Concerns by Category:**

**Scope & Estimation:**
- "28-43 sessions" with no session definition is not a plan, it is a wish. Using ranges does not substitute for grounding. The Architecture Panel (H2) is correct that this must be resolved before commitment.
- The plan proposes ~75-110 new files. That is a significant surface area expansion. What is the maintenance burden per phase? Who owns these files post-integration?
- Phase 4 (Learning Loop) is estimated at "5-8 sessions" with no data model, no design RFC, and no acceptance criteria. This is a research project masquerading as an implementation phase.

**Risk Management:**
- Zero acceptance criteria across all phases (Architecture Panel H5). Without these, there is no definition of "done," which means there is no way to know if a phase succeeded.
- Phase 7 remote plugin installation is flagged as a critical security concern by the Repo Ingestion Panel. This needs a threat model before implementation, not just a "leverage existing RegistryManager" hand-wave.
- The instinct evolution system (Phase 4.3-4.4) allowing AI to auto-modify behavioral constraints without HITL gate (Architecture Panel C3) is a safety issue that should be called out explicitly to leadership.

**What the audience needs to decide in 60 seconds:**
1. The integration concept is validated -- ECC's declarative layer complements EVOKORE's runtime enforcement.
2. The plan as written cannot be executed -- it has wrong numbers, missing designs, and no acceptance criteria.
3. The recommendation is to approve a corrected Phase 0 + Phase 1 (2-4 sessions of well-defined work) while the remaining phases undergo design review.

**Recommendation:** Frame the decision as a two-gate approval: Gate 1 (approve now) covers Phase 0 quick wins + Phase 1 identity foundation. Gate 2 (approve after design spikes) covers everything else.

---

### 1.4 Tomoko Sato -- Executive Briefing Specialist

**Overall Assessment:** The strategic narrative is correct but poorly framed for decision-making. The audience is asked to approve a 9-phase, multi-month integration without clear success criteria, risk quantification, or resource commitment.

**Decision-Framing Analysis:**

1. **The ask is unclear.** What exactly is the audience being asked to approve? The full 9-phase plan? Phase 0 only? The concept? The document reads as an informational brief, not a decision document. Every decision document needs three elements: the recommendation, the alternatives considered, and the cost of inaction. This plan has none of those.

2. **Strategic alignment is assumed, not argued.** The plan states "these approaches are complementary" as fact. For a technical audience, this is acceptable. But the framing should acknowledge: what happens if we do nothing? EVOKORE works today. The pain of not integrating ECC is not articulated. This is a growth/capability argument, not a survival argument, and the framing should match that lower urgency.

3. **The "TRANSFORMATIVE" label on Phase 4 is a red flag.** In executive communication, "transformative" means "we do not know if this will work." The Architecture Panel's finding that Phase 4 has no data model confirms this. The honest framing is: Phase 4 is a research bet. If the automated learning loop works, it changes the game. If it does not, Phases 0-3 still deliver concrete value. That is the pitch.

4. **Resource implications are invisible.** 28-43 sessions is a number without context. Is this one developer? A team? What is the opportunity cost? What other work is deferred? These are the questions the audience will ask. The plan should preempt them.

5. **The panel findings are the most valuable output.** The Architecture and Repo Ingestion panels have done the due diligence the plan itself lacked. The presentation should lead with the panel findings, not the original plan. The narrative arc should be: "We researched an integration. Expert review found problems. Here is the corrected path."

**Recommendation:** Restructure as a decision memo: (1) Opportunity, (2) Expert review findings, (3) Recommended first step, (4) Conditions for proceeding further, (5) Risk register.

---

### 1.5 Rafael Dominguez -- Demo & Live Presentation Coach

**Overall Assessment:** This is an async written report, so live demo considerations are limited. However, the document would benefit from "demonstration thinking" -- showing, not just telling.

**Flow & Pacing Analysis:**

1. **The plan front-loads theory and back-loads evidence.** A reader starting from the top gets: strategic thesis, capability matrix, 9 phases of implementation detail, then estimated scope. The panel findings that challenge all of this come separately. For pacing, the challenges should appear alongside the claims, not after them. Otherwise the reader commits to the plan's frame before encountering the counterarguments.

2. **The quick-wins section is the strongest hook.** "Can Do Right Now" with 5 concrete items is compelling. This should open the actionable portion of the document, not appear as a footnote at the bottom. The audience needs to feel "we can start tomorrow" before they are asked to commit to months of work.

3. **Show one thing working.** Even in a written report, a concrete example helps. What would SOUL.md actually look like? What would steering modes feel like in practice? A 10-line example of SOUL.md content, or a before/after of purpose-gate with steering modes, would make Phase 1 feel real instead of abstract.

4. **The Q&A gap is critical.** The audience will ask: "How does this affect our current hook latency?" (Architecture Panel H6). "What is the license situation?" (Repo Ingestion Panel). "Why 9 phases and not 4?" (everyone). The report needs anticipated questions and prepared answers.

5. **The "Needs Changes" verdict needs careful framing.** "Needs Changes" sounds like failure. The correct framing is: "Expert review validated the concept and identified corrections that make the plan executable." The verdict is positive (the idea survived scrutiny) with conditions (specific fixes required).

**Recommendation:** Restructure for pacing: Hook (quick wins + one concrete example) -> Context (what we studied and why) -> Expert findings (what we learned) -> Recommendation (what to do next) -> Risk register (what could go wrong).

---

## PHASE 2: CHALLENGE ROUND

### Challenge 1: Claudia vs. Marcus -- "Do we need 4 visual assets for a written async report?"

**Claudia:** Marcus, you are recommending four custom visual assets for an asynchronous written report that engineering leads will read on their own time. A capability radar chart and effort-impact scatter plot require design time and tooling. We are not presenting to a conference. A well-structured table with clear triage labels will be scanned faster than a radar chart that requires a legend.

**Marcus:** Claudia, the capability matrix already has 17 rows. You yourself called it "a wall." A radar chart collapses 17 dimensions into a shape the eye parses in two seconds: "EVOKORE is strong on the right half, ECC is strong on the left half, therefore complementary." That is the thesis, and the visual proves it faster than any sentence. I will grant you that the effort-impact scatter can be replaced with a simpler 2x2 quadrant grid -- less production overhead, same insight. But the dependency flow diagram and findings severity table are non-negotiable. The ASCII art dependency graph is actively misleading because it suggests a strict waterfall when the Architecture Panel recommends parallel tracks.

**Resolution:** Include 3 visual assets: (1) simplified capability comparison (2x2 or grouped bar, not full radar), (2) resequenced dependency flow diagram, (3) findings severity summary table. Drop the effort-impact scatter in favor of a simpler effort/impact column in the phase summary table.

---

### Challenge 2: Diana vs. Tomoko -- "Is the two-gate approval too conservative?"

**Diana:** I propose Gate 1 (Phase 0 + Phase 1, approve now) and Gate 2 (everything else, approve after design spikes). Tomoko, you seem to agree but your "decision memo" framing implies a single decision point. Are you suggesting we ask for blanket approval with conditions, or sequential gates?

**Tomoko:** Diana, sequential gates are operationally correct but strategically weak. If you ask leadership to approve only Phase 0 + Phase 1, you are asking them to approve 2-4 sessions of work and then come back later. That is not a decision worth their time -- any team lead can greenlight 2 sessions of markdown file creation. The real decision is: "Do we commit to the ECC integration as a strategic direction?" That is the Gate 1 question. Gate 2 then becomes: "Here are the specific phases we will execute next quarter, with designs reviewed." You need both the strategic commitment and the tactical restraint.

**Diana:** That changes the ask. Gate 1 is not "approve Phase 0 + 1" but "approve the integration direction and Phase 0 + 1 as the immediate scope." Gate 2 is "approve subsequent phases individually as design spikes complete." This way leadership understands the full arc but only commits resources incrementally.

**Tomoko:** Exactly. And the presentation should make clear that the panel review was the due diligence. They are not approving a plan with known errors -- they are approving a corrected path that expert review has validated.

**Resolution:** Frame as strategic direction approval (Gate 1) with incremental phase approval (Gate 2). Gate 1 includes immediate execution of Phase 0 + Phase 1 as the first concrete deliverable.

---

### Challenge 3: Rafael vs. Claudia vs. Diana -- "Should the quick wins lead or follow the strategic context?"

**Rafael:** I said the quick wins should open the actionable section. The audience needs to feel momentum before committing to a long plan. Lead with what we can do tomorrow.

**Claudia:** I disagree. If you lead with quick wins, you undermine the strategic framing. The audience will think "just do the quick wins and skip the rest." The quick wins only make sense in context -- SOUL.md is not just a markdown file, it is the foundation for the behavioral identity system in Phase 4. Without that context, it looks trivial.

**Diana:** You are both right at different scales. For a 10-15 minute read, the structure should be: (1) one-paragraph strategic context (why we are here), (2) quick wins as proof of immediate value, (3) full strategic arc with panel findings, (4) recommendation and gates. This way the quick wins serve as a "hook" (Rafael) while still being contextualized (Claudia). The reader knows within 2 minutes that there is both immediate value and a larger plan, then spends the remaining 8-13 minutes understanding the details and risks.

**Rafael:** That works. But add the concrete SOUL.md example right there in the quick-wins section, not buried in Phase 1 details. Show five lines of what it would actually say. Make it tangible.

**Claudia:** Agreed, as long as we label it as illustrative, not prescriptive. The actual SOUL.md content is a Phase 1 deliverable, not a presentation artifact.

**Resolution:** Structure follows Diana's compromise. Quick wins appear early with a concrete SOUL.md example (labeled illustrative), followed by full strategic context, panel findings, and gated recommendations.

---

### Challenge 4: Marcus vs. Tomoko -- "Are the panel findings the lead or supporting evidence?"

**Marcus:** Tomoko said "lead with panel findings." But a findings-first document reads like an audit report, not a strategic proposal. If I put the severity dashboard at the top, the audience's first impression is "this plan has problems" rather than "this is an opportunity."

**Tomoko:** The audience for this document is engineering leads who will be doing the work, plus the project owner who commissioned the plan. They already know the opportunity -- they asked for the plan. What they do not know is whether the plan is executable. The panel findings answer that question. Leading with findings says: "We did the homework. Here is what we learned. Here is the corrected path." That is more credible than leading with the opportunity pitch and then revealing the problems.

**Marcus:** Then the visual assets should reflect that. The findings severity table goes in section 2 (after the one-paragraph context), not at the end. The dependency flow diagram shows the *corrected* sequence, not the original. We never show the broken version -- we show the version that incorporates the panel feedback.

**Tomoko:** Agreed. The original plan's 9-phase waterfall exists only as context ("here is what was proposed"), never as the recommended path.

**Resolution:** Panel findings appear in section 2 as due-diligence results. All diagrams and recommendations reflect the corrected/resequenced plan. The original plan is referenced, not reproduced.

---

### Challenge 5: Diana vs. Rafael -- "Is a demo plan appropriate for a written async report?"

**Diana:** Rafael, you are a demo coach. This is a written document. Is there anything from your domain that is actually applicable here?

**Rafael:** Yes. "Demo thinking" is not about live demos -- it is about making the abstract tangible. In this case:
- A 5-line SOUL.md excerpt makes the identity concept real.
- A before/after of `purpose-gate.js` with steering modes shows what changes at the code level.
- A mock screenshot of the findings severity table shows the due-diligence rigor.
These are not demos. They are "proof artifacts" embedded in the document. They serve the same function as a live demo: they shift the audience from "I understand the concept" to "I can see how this works."

**Diana:** Fair. Include proof artifacts where they reduce abstraction. Do not include them where they pad the document.

**Resolution:** Include 2 proof artifacts: (1) illustrative SOUL.md excerpt (5-8 lines), (2) before/after purpose-gate flow showing steering mode integration. No mock screenshots -- the findings table serves that purpose natively.

---

## PHASE 3: CONVERGED PANEL OUTPUT

---

### 3.1 Extracted Presentation Content

| Source Section | Key Presentation Point | Priority | Notes |
|---|---|---|---|
| ECC Plan: Executive Summary | ECC (declarative config) and EVOKORE (runtime enforcement) are complementary, not competing | LEAD | This is the thesis. One sentence. |
| ECC Plan: Capability Matrix | EVOKORE is stronger on security/runtime; ECC is stronger on identity/learning/breadth | HIGH | Visualize as grouped comparison, not 17-row table |
| ECC Plan: Quick Wins | 5 items achievable in 1-2 sessions with no runtime risk | HIGH | Lead the actionable section with these |
| ECC Plan: Phase 1 | SOUL.md + RULES.md + Steering Modes = behavioral foundation | HIGH | Include illustrative excerpt |
| ECC Plan: Phase 4 | Automated learning loop is the highest-value, highest-risk bet | MEDIUM | Frame as research, not implementation |
| ECC Plan: Phases 2-9 | 8 additional phases spanning hooks, agents, commands, plugins, CI, orchestration | CONTEXT | Reference, do not detail -- these are Gate 2 items |
| ECC Plan: Estimated Scope | ~75-110 new files, 28-43 sessions | CONTEXT | Flag as ungrounded (no session definition) |
| Arch Panel: C1 | Context budget for meta-injection is unquantified -- 1,500+ tokens/prompt risk | CRITICAL | This could make the integration counterproductive |
| Arch Panel: C2 | Phase 4 has no data model -- needs design RFC | CRITICAL | Blocks the highest-value phase |
| Arch Panel: C3 | Instinct evolution without HITL gate = safety risk | CRITICAL | Non-negotiable: must have human approval |
| Arch Panel: C4 | Authority conflict between RBAC, damage-control, steering modes | CRITICAL | Needs precedence rules before implementation |
| Arch Panel: H1 | Restructure Phase 3: Loop Operator first, language reviewers deferred | HIGH | Reduces Phase 3 scope by ~60% |
| Arch Panel: H2 | "Session" as effort unit is undefined | HIGH | Blocks all estimation |
| Arch Panel: H3 | Replace cross-IDE adapters with MCP discovery docs | HIGH | Eliminates Phase 8.1 entirely |
| Arch Panel: H5 | No acceptance criteria for any phase | HIGH | Blocks definition of "done" |
| Arch Panel: Resequencing | Revised order: P0 -> P1 -> P2 -> P4 design -> P3* -> P5* -> P4 impl -> backlog | HIGH | This IS the recommended execution plan |
| Repo Panel: Tool count wrong | Plan says 5 native tools; actual count is 14+ | CRITICAL | Undermines plan's credibility on EVOKORE knowledge |
| Repo Panel: ECC numbers unverifiable | No file-level evidence from ECC repo for any capability claim | CRITICAL | All ECC numbers are assertions, not facts |
| Repo Panel: CLAUDE.md stale | Webhook events: docs say 6, code has 10; hooks: docs say 5, actual 7+ | HIGH | The plan was built on stale documentation |
| Repo Panel: Read tool gap | damage-control only matches Bash/Edit/Write, not Read | CONFIRMED | Quick Win #3 addresses this; validates urgency |
| Repo Panel: Remote plugin security | Phase 7 remote installation = code execution outside sandbox | CRITICAL | Needs threat model before any implementation |
| Repo Panel: No license analysis | ECC content has no license review | HIGH | Legal risk for any code/content import |
| Repo Panel: No test strategy | No phase has a defined test approach | HIGH | "How do we know it works?" is unanswered |

---

### 3.2 Narrative Structure Recommendation

The report should follow a 5-section arc optimized for a 10-15 minute async read by a technical audience making a go/no-go decision.

#### Section 1: Strategic Context (1-2 minutes)

**Title:** "ECC and EVOKORE: Complementary Architectures"

**Content:**
- One paragraph: EVOKORE-MCP is a runtime enforcement server. ECC is a declarative configuration framework. 119K stars. 20 parallel research agents analyzed the overlap.
- One paragraph: The integration thesis -- these are complementary layers, not competing products. ECC adds identity, breadth, and learning. EVOKORE adds enforcement, security, and runtime control.
- Simplified capability comparison (visual): grouped into 4 categories (Identity/Behavior, Development Tools, Learning/Evolution, Infrastructure). For each category, show which system is stronger and what the integration adds.

**Tone:** Confident but measured. This is an opportunity, not an emergency.

#### Section 2: Due Diligence Results (3-4 minutes)

**Title:** "What Expert Review Found"

**Content:**
- One paragraph: Two expert panels (Architecture & Planning, Repo Ingestion) independently reviewed the integration plan. Combined output: 4 critical findings, 6 high findings, 10+ additional risks.
- Findings severity table (visual): 3 columns (Finding ID, Description, Required Action). Group by severity. Keep descriptions to one line each.
- Highlight the three most consequential findings:
  1. **The plan's own numbers are wrong.** EVOKORE has 14+ native tools, not 5. All ECC capability numbers are unverified. The plan was built on stale documentation.
  2. **Phase 4 (Learning Loop) is a research project, not an implementation phase.** No data model, no eval harness design, no HITL gate on instinct evolution.
  3. **Context budget is unquantified.** Adding SOUL.md + RULES.md + steering modes + instincts could consume 1,500+ tokens per prompt, potentially degrading the system it is meant to improve.

**Tone:** Direct, evidence-based. "We found problems. Here is what they are."

#### Section 3: Corrected Execution Plan (3-4 minutes)

**Title:** "The Recommended Path Forward"

**Content:**
- Resequenced dependency flow diagram (visual): Show the Architecture Panel's recommended order with parallel tracks where applicable.
- Phase 0 (Quick Wins) detail: 5 items, no code risk, 1-2 sessions. Include the SOUL.md illustrative excerpt.
- Phase 1 (Identity Foundation) detail: SOUL.md + RULES.md + steering modes. Before/after purpose-gate flow showing steering mode integration.
- Phase 2 (Hooks Hardening) summary: Read tool gap closure, after-edit hook, subagent tracking.
- Everything else: one-line summary per phase with the note "requires design spike before approval."
- Effort framing: Define "session" (recommend: 1 focused work session = ~3-4 hours of implementation + validation). Restate estimates with this definition. Phase 0 + Phase 1 = 3-6 sessions = roughly 1-2 weeks of focused work.

**Tone:** Constructive, actionable. "Here is what we can do, in what order, with what confidence."

#### Section 4: Risk Register & Mitigations (2-3 minutes)

**Title:** "What Could Go Wrong and How We Handle It"

**Content:**
- Table format: Risk | Severity | Mitigation | Owner
- Top risks to include:
  1. Context budget exhaustion (C1) -- Mitigation: token budget measurement in Phase 1 before adding more injection surfaces
  2. Instinct evolution safety (C3) -- Mitigation: mandatory HITL approval gate, no auto-modification of behavioral files
  3. Authority conflict (C4) -- Mitigation: precedence rules documented before steering modes ship
  4. Remote plugin code execution (Repo Panel) -- Mitigation: threat model + sandbox extension before Phase 7
  5. License risk on ECC content import (Repo Panel) -- Mitigation: license analysis before any Phase 6 skill import
  6. Hook latency degradation (H6) -- Mitigation: latency budget and measurement for PreToolUse hook chain
  7. ECC number verification (Repo Panel) -- Mitigation: file-level audit of ECC repo before any phase that depends on ECC capability counts

**Tone:** Honest, not alarmist. Every risk has a mitigation. The message is "we have identified these and have plans."

#### Section 5: Decision Request & Next Steps (1 minute)

**Title:** "What We Are Asking For"

**Content:**
- **Gate 1 decision (requesting now):** Approve the ECC integration as a strategic direction. Authorize immediate execution of Phase 0 (Quick Wins) and Phase 1 (Identity Foundation). Estimated scope: 3-6 sessions over 1-2 weeks. No runtime risk -- these phases produce markdown files and minor hook enhancements.
- **Gate 2 (future):** Each subsequent phase requires a completed design spike with acceptance criteria, test strategy, and panel review before execution approval. Phase 4 specifically requires a 2-session design RFC producing a data model and eval harness specification.
- **Immediate pre-conditions for Gate 1:**
  - Correct all EVOKORE capability numbers in the plan (14+ tools, 10 webhook events, 7+ hooks)
  - Define "session" as an effort unit (recommended: ~3-4 hours)
  - Add acceptance criteria for Phase 0 and Phase 1
  - Verify ECC repo license compatibility

**Tone:** Clear, decisive. "Here is the decision. Here is what we need from you."

---

### 3.3 Visual Recommendations

| Visual Asset | Type | Purpose | Placement |
|---|---|---|---|
| Capability Comparison | Grouped bar chart or 2-column summary | Show complementary strengths at a glance | Section 1 |
| Findings Severity Table | Structured table (Critical/High/Medium rows) | Consolidate all panel findings into one scannable view | Section 2 |
| Resequenced Dependency Flow | Flow diagram with parallel tracks | Show the corrected execution order with gates | Section 3 |
| Risk Register | Table (Risk/Severity/Mitigation/Owner) | Make risk management visible and concrete | Section 4 |

**Production notes:**
- All visuals can be produced as markdown tables or simple Mermaid diagrams. No external design tooling required.
- The capability comparison could be rendered as a Mermaid quadrant chart if the presentation tool supports it, otherwise a two-column table with checkmarks/ratings is sufficient.
- The flow diagram should use Mermaid `graph TD` or `graph LR` syntax for easy maintenance.

---

### 3.4 Anticipated Questions & Answers

**Q1: "Why not just fork ECC's files directly? It's MIT-licensed (presumably) and we could have everything in a day."**

A: ECC's files are designed for a zero-runtime, declarative-only environment. Dropping them into EVOKORE without integration creates two parallel control surfaces that can contradict each other. For example, ECC's RULES.md could declare a tool as "allowed" while EVOKORE's RBAC denies it. The integration work is not copying files -- it is wiring declarative intent into runtime enforcement. Also, the ECC license has not been verified yet, which is itself a finding from the Repo Ingestion Panel.

**Q2: "The plan says 28-43 sessions. What does that mean in calendar time?"**

A: The Architecture Panel flagged this as a high-severity finding (H2). "Session" is undefined in the plan. If we define a session as ~3-4 hours of focused implementation + validation, the full plan is roughly 84-172 hours of work, or 10-22 working weeks for a single developer. However, the panel recommendation is to not approve the full plan -- only Phase 0 + Phase 1 (3-6 sessions, 1-2 weeks) with subsequent phases gated on design review.

**Q3: "Phase 4 (Learning Loop) is labeled TRANSFORMATIVE. Is it real or speculative?"**

A: It is speculative. The Architecture Panel found that Phase 4 has no data model (C2). The "eval harness" and "pattern extractor" are described only by name -- there is no specification for what they evaluate, what patterns they extract, or how confidence scores are calculated. This phase needs a 2-session design RFC before any implementation can begin. The honest framing: if it works, it is a significant capability. If it does not, Phases 0-3 still deliver concrete, independent value.

**Q4: "What is the risk of the AI auto-modifying its own behavioral constraints (instincts)?"**

A: This was flagged as Critical (C3) by the Architecture Panel. Without a human-in-the-loop gate, the instinct evolution system could suppress safety-relevant behaviors if the evidence data is biased or the evaluation logic is flawed. The mitigation is a mandatory HITL approval gate: the system can propose instinct changes, but a human must approve them before they take effect. This aligns with EVOKORE's existing HITL architecture and should be a hard requirement for Phase 4.

**Q5: "The Repo Ingestion Panel says the tool count is wrong. How wrong is the plan overall?"**

A: The plan states EVOKORE has 5 native tools. The actual count is 14+ (including `discover_tools`, `resolve_workflow`, `execute_skill`, `get_telemetry`, `reset_telemetry`, `reload_plugins`, and others). Similarly, CLAUDE.md says 6 webhook event types while the source code defines 10. The hooks count is also outdated (documented as 5, actual is 7+). These errors do not invalidate the strategic thesis, but they mean the gap analysis is built on inaccurate baselines. All EVOKORE numbers must be corrected, and all ECC numbers must be independently verified with file-level evidence, before the gap analysis can be trusted.

**Q6: "What about the existing 336+ skills? Won't importing ECC skills create namespace pollution?"**

A: Yes, this is a risk identified by the Repo Ingestion Panel. EVOKORE's `SkillManager` uses recursive indexing over the SKILLS directory. Mass-importing ECC skills without namespace planning could degrade semantic resolution quality (more candidates = more ambiguity in `resolve_workflow`). The mitigation is to import skills into dedicated subcategories with clear frontmatter, and to validate resolution quality before and after import.

**Q7: "Should we worry about hook latency? We already have 7+ hooks."**

A: The Architecture Panel flagged this as High (H6). Every PreToolUse hook adds latency to every tool invocation. Adding Read tool matching (Phase 2.1), after-edit processing (Phase 2.2), and steering mode context injection (Phase 1.3) will increase the per-tool-call overhead. The mitigation is to establish a latency budget for the hook chain (e.g., <50ms total) and measure actual impact after each phase. If latency exceeds the budget, subsequent hook additions must optimize or consolidate existing hooks before adding new ones.

---

### 3.5 Risk Messaging Guide

**Core principle:** The "Needs Changes" verdict is a success signal, not a failure signal.

**Frame as:** "The plan survived expert scrutiny and emerged with a clear, corrected path."

**Language to use:**
- "Expert review validated the strategic direction" (not "the plan has problems")
- "Panel findings identified corrections that make the plan executable" (not "the plan needs to be fixed")
- "The due diligence process worked as designed" (not "we caught errors")
- "The recommended first step is well-defined and low-risk" (not "we can only approve a small piece")

**Language to avoid:**
- "The plan is wrong" -- say "the plan's baselines need correction"
- "We can't proceed" -- say "we can proceed with Phase 0 + Phase 1 immediately"
- "Phase 4 is too risky" -- say "Phase 4 needs a design spike before implementation"
- "The estimates are bad" -- say "the estimates need grounding in defined effort units"

**Framing the numbers problem:**
The EVOKORE tool count error (5 stated vs. 14+ actual) and the ECC verification gap are factual corrections, not judgment calls. Present them as: "The plan was authored from documentation that had drifted from the codebase. The Repo Ingestion Panel caught this, which is exactly why we have a review process. Correcting the baselines is a pre-condition for Gate 1, not a reason to abandon the integration."

**Framing the scope reduction:**
The Architecture Panel recommends deferring language-specific reviewers (Phase 3), cross-IDE adapters (Phase 8.1), and most of Phase 5. Frame this as: "Expert review sharpened the plan's focus to the highest-value, lowest-risk phases first. The deferred work is not cancelled -- it enters the backlog for future gate approval when design spikes are complete."

---

### 3.6 Demo / Proof Artifact Plan

Since this is a written async report, no live demo is applicable. Instead, include two embedded "proof artifacts" that make abstract concepts tangible:

#### Proof Artifact 1: Illustrative SOUL.md Excerpt

```markdown
# SOUL.md -- EVOKORE-MCP System Identity

## Who I Am
I am EVOKORE-MCP, a runtime MCP server that aggregates, enforces, and orchestrates.
I am not a suggestion engine. I am an enforcement layer with opinions.

## Values (in precedence order)
1. **Safety over speed** -- I will block a dangerous operation even if it delays the task.
2. **Evidence over assumption** -- I verify state before acting. I do not guess.
3. **Enforcement over suggestion** -- If a rule exists, I enforce it. I do not merely warn.
4. **Isolation by default** -- Sessions, tenants, and agents get their own boundaries.

## Core Instincts
- Verify before trust: read the file before editing, check the branch before committing.
- Fail safe: if a hook cannot determine safety, it permits the operation and logs a warning.
- Surface the evidence: every claim should be traceable to a session artifact.
```

**Note:** This is illustrative. Actual content is a Phase 1 deliverable subject to team review.

#### Proof Artifact 2: Purpose-Gate Steering Mode Flow

**Current behavior (without steering modes):**
```
User starts session
  -> purpose-gate asks: "What is your purpose?"
  -> User types: "Fix the auth bug in HttpServer"
  -> purpose-gate injects: "Session purpose: Fix the auth bug in HttpServer"
  -> (same injection for all sessions regardless of task type)
```

**Proposed behavior (with steering modes):**
```
User starts session
  -> purpose-gate asks: "What is your purpose? (modes: dev, research, review, debug, security-audit)"
  -> User types: "debug" or "Debug the auth flow in HttpServer"
  -> purpose-gate loads debug mode config:
     - Active context: SOUL.md core instincts + debug-specific tool preferences
     - Tool surface: Read, Bash, search_skills emphasized; Write de-emphasized
     - Focus injection: "You are in debug mode. Prioritize observation over modification.
       Read logs, trace execution paths, form hypotheses before changing code."
  -> (contextual injection shaped by task type, not generic)
```

---

### 3.7 Panel Consensus Statement

The Presentation Panel unanimously agrees on the following:

1. **The ECC integration concept is sound.** The declarative/runtime complementarity thesis is well-supported by the capability analysis. This is worth pursuing.

2. **The plan as written is not executable.** Wrong baselines, missing designs, undefined effort units, no acceptance criteria, and unverified source claims make the current document unsuitable for direct execution.

3. **The panel review process added significant value.** The Architecture and Repo Ingestion panels identified corrections that the original plan's authors could not have caught without systematic review. This validates the cascade panel approach.

4. **The recommended presentation structure is a 5-section decision memo** (Context, Findings, Corrected Plan, Risk Register, Decision Request) with 3-4 embedded visual assets and 2 proof artifacts.

5. **The decision ask is two-gated:** Gate 1 approves strategic direction + Phase 0/1 execution. Gate 2 gates each subsequent phase on completed design spikes with acceptance criteria.

6. **The "Needs Changes" verdict should be framed as successful due diligence,** not plan failure. The corrections are specific, actionable, and do not undermine the strategic thesis.

---

### 3.8 Pre-Conditions Checklist for Gate 1 Approval

Before presenting the Gate 1 decision request, the following must be completed:

- [ ] Correct EVOKORE native tool count in the plan (14+ tools, not 5)
- [ ] Correct webhook event count (10 types in source, not 6 as documented)
- [ ] Correct hook count (7+ hooks in scripts/hooks/, not 5 as documented in some surfaces)
- [ ] Define "session" as an effort unit with approximate hour range
- [ ] Write acceptance criteria for Phase 0 (5 quick wins) and Phase 1 (3 deliverables)
- [ ] Verify ECC repository license (MIT assumed but unconfirmed)
- [ ] Verify at least the top 5 ECC capability claims with file-level evidence
- [ ] Add context budget measurement to Phase 1 scope (quantify SOUL.md + RULES.md token cost)
- [ ] Add HITL gate requirement to Phase 4 instinct evolution (non-negotiable safety constraint)
- [ ] Document steering mode authority precedence relative to RBAC and damage-control

---

*Report produced by the Presentation Panel under the EVOKORE-MCP Panel of Experts framework.*
*Panel members: Claudia Reeves (Technical Communication), Marcus Webb (Data Visualization), Diana Reyes (Program Management), Tomoko Sato (Executive Briefing), Rafael Dominguez (Demo & Presentation).*
