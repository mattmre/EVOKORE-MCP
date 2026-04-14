---
name: panel-reverse-engineering
description: Expert panel for reverse engineering, decompilation, debugger-guided analysis, malware triage, and workflow refinement
aliases: [re-panel, binary-analysis-panel, decompilation-panel, ghidra-panel]
category: orchestration
tags: [reverse-engineering, binary-analysis, debugging, decompiler, malware-analysis, workflow-design]
version: 1.0.0
requires: [panel-of-experts]
resolutionHints:
  - reviewing an unknown binary or firmware image
  - planning a decompilation and debugger workflow
  - refining reverse-engineering operating model
  - validating malware triage or semantic recovery findings
---

# Reverse Engineering & Binary Analysis Panel

## Panel Composition

| Expert | Role | Primary Lens |
|---|---|---|
| **Evelyn Hart** | Principal Reverse Engineer | Binary triage, subsystem mapping, target prioritization |
| **Dr. Tomasz Nowak** | Decompiler & Type Recovery Specialist | Semantic confidence, type recovery, pcode / IR grounding |
| **Rachel Kim** | Debugger & Emulation Analyst | Runtime validation, unpacking, breakpoint discipline |
| **Malik Adeyemi** | Malware Capability Analyst | Behavior mapping, ATT&CK framing, anti-analysis, triage |
| **Sofia Petrenko** | Binary Automation Engineer | Automation candidates, symbolic/emulation leverage, scaling |
| **Nora Bennett** | Evidence & Learning Systems Architect | Findings durability, memory loops, handoff quality |

See [expert-roster.md](../expert-roster.md) for full persona definitions.

## When to Invoke

- Opening an unknown binary, library, driver, Android package, .NET assembly, or firmware blob
- Planning the next pivot between static analysis, decompilation cleanup, and debugger work
- Reviewing semantic recovery claims before renaming, retyping, or reporting them as fact
- Triage of suspicious or malicious samples where capability claims need evidence
- Designing or refining EVOKORE reverse-engineering workflows, skills, and learning loops

## Review Modes

### Mode A: Unknown Binary Onboarding
Use when the sample is new and the goal is to establish the first analysis charter.

### Mode B: Semantic Recovery Campaign
Use when a target subsystem has been identified and naming, signatures, data structures, and comments need disciplined recovery.

### Mode C: Dynamic Hypothesis Testing
Use when static analysis left important behavior ambiguous and a precise debugger or emulation plan is needed.

### Mode D: Malware / Capability Escalation
Use when malicious or evasive behavior is suspected and capability claims must be structured, prioritized, and defended.

### Mode E: Workflow Refinement
Use when reviewing EVOKORE skills, panels, notes, or session evidence to improve future reverse-engineering runs.

---

## Review Protocol

### Step 1: CONVENE — Select Mode and Experts

| Mode | Active Experts |
|---|---|
| Unknown Binary Onboarding | Evelyn, Tomasz, Rachel, Malik, Nora |
| Semantic Recovery Campaign | Evelyn, Tomasz, Rachel, Nora |
| Dynamic Hypothesis Testing | Rachel, Evelyn, Tomasz, Sofia |
| Malware / Capability Escalation | Malik, Rachel, Evelyn, Sofia, Nora |
| Workflow Refinement | Sofia, Nora, Evelyn, Tomasz |

### Step 2: BRIEF — Present the Artifact or Question

**For Unknown Binary Onboarding (Mode A):**
```
## Sample Intake
- **Target:** [file path / hash / repo artifact]
- **Format / Platform Hint:** [PE, ELF, APK, .NET, JVM, firmware, unknown]
- **Primary Goal:** [understand behavior / patch / triage / decompile / capability map]
- **Constraints:** [time, safety, environment, no-execution, tool limits]
- **Known Signals:** [imports, strings, prior notes, alerts, YARA hits]
```

**For Semantic Recovery (Mode B):**
```
## Recovery Scope
- **Subsystem / Functions:** [target addresses, names, or themes]
- **Current Hypothesis:** [best understanding so far]
- **Evidence Collected:** [xrefs, strings, APIs, dynamic observations]
- **Desired Output:** [renames, types, comments, call graph, report]
- **Confidence Risks:** [what still feels speculative]
```

**For Dynamic Testing (Mode C):**
```
## Runtime Question
- **Question to Answer:** [specific ambiguity]
- **Candidate Breakpoints / Hooks:** [entry, API, target routines]
- **Safety Constraints:** [sandbox, isolated VM, no network, no persistence]
- **Expected Evidence:** [decoded config, branch outcome, runtime import, buffer]
```

**For Malware / Capability Escalation (Mode D):**
```
## Capability Review
- **Sample / Family Context:** [campaign, alert, hash, suspected family]
- **Current Signals:** [capa/YARA/sandbox/static observations]
- **Top Concerns:** [C2, credential theft, persistence, injection, anti-analysis]
- **Decision Need:** [operator report, deeper RE, escalation, detection content]
```

**For Workflow Refinement (Mode E):**
```
## Workflow Under Review
- **Artifact:** [skill, workflow file, session log, evidence bundle]
- **Repeated Friction:** [what kept slowing analysis]
- **Missed Opportunities:** [automation, panel coverage, missing memory]
- **Desired Improvement:** [new skill, panel tweak, memory update, better defaults]
```

### Step 3: SOLO — Independent Expert Reviews

**Evelyn Hart reviews:**
- Sample classification and likely subsystem map
- Priority functions vs noise
- Static triage sufficiency and missing recon
- Whether the next pivot is decompilation cleanup, graph expansion, or runtime work

**Dr. Tomasz Nowak reviews:**
- Which semantic claims are defensible
- Type, prototype, and structure recovery quality
- Decompiler blind spots or misleading simplifications
- What evidence is still required before durable renames/retypes

**Rachel Kim reviews:**
- Minimum breakpoint or emulation plan to answer the open question
- Best debugger/emulator choice
- Runtime state that must be captured
- Anti-debug, unpacking, and branch-forcing risks

**Malik Adeyemi reviews:**
- Capability clusters and ATT&CK-style behavior claims
- Anti-analysis / evasion signals
- What should be reported now vs deferred pending proof
- Which routines matter most for threat understanding

**Sofia Petrenko reviews:**
- Repeated manual steps worth automating
- Whether symbolic execution, emulation, rule-writing, or batch extraction would help
- What this case teaches about workflow scale and reuse

**Nora Bennett reviews:**
- Hypothesis log quality and evidence durability
- Whether the findings would survive a session handoff
- Missing memory surfaces: notes, evidence capture, persistent narratives, improvement backlog
- What the next run should inherit automatically

### Step 4: CHALLENGE — Cross-Expert Debate

Key challenges for this panel:

1. **Evelyn vs Rachel:** "Do we already have enough static evidence, or are we debugging because we're impatient?"
2. **Tomasz vs Malik:** "Is this semantic recovery actually proven, or are we turning suspicious patterns into confident behavior claims too early?"
3. **Rachel vs Sofia:** "Should we solve this one case with a clean breakpoint plan, or is it recurring enough to automate?"
4. **Malik vs Nora:** "What belongs in a high-confidence operator report now, and what belongs in an 'unresolved' queue?"
5. **Tomasz vs Evelyn:** "Is the subsystem map stable enough to rename broadly, or are we still naming around uncertainty?"

### Step 5: CONVERGE — Synthesize Findings

```markdown
## Reverse Engineering Panel Report

### Verdict: [PROCEED STATIC / PROCEED DYNAMIC / ESCALATE MALWARE / REFRAME WORKFLOW]

### Confirmed Findings
1. [Finding] — evidence: [APIs / xrefs / strings / dynamic observation]

### Highest-Value Hypotheses
1. [Hypothesis] — next proof step: [specific action]

### Priority Functions / Subsystems
1. [Address / name / subsystem] — why it matters

### Dynamic Validation Plan
1. [Breakpoint / hook / emulation checkpoint] — question answered

### Memory / Workflow Updates
1. [Finding that should become a skill, checklist, or persistent narrative]

### Dissenting Opinions
1. [Expert] argued [position] — rationale
```

### Step 6: FEASIBILITY → DELIVER

Top workflow changes go to [Feasibility Panel](feasibility-research.md).
If the goal is process improvement, follow with the [Meta-Improvement Panel](meta-improvement.md).

## Example Invocations

### Unknown Binary
```
Run a Reverse Engineering Panel on samples/acme_updater.exe.

Mode: unknown-binary-onboarding
Goal: determine whether the updater is benign, packed, or pulling stage-two code.
Constraints: isolated VM only, no Internet access, operator wants a breakpoint plan before execution.
```

### Semantic Recovery
```
Run a Reverse Engineering Panel on the networking subsystem notes for sample.dll.

Mode: semantic-recovery
We have 18 renamed functions, 6 unresolved wrappers, and one suspected config parser.
Review the naming confidence, missing types, and whether dynamic validation is still needed.
```

### Workflow Refinement
```
Run a Reverse Engineering Panel on SKILLS/DEVELOPER TOOLS/reverse-engineering-company-system/ references/learning-loop.md.

Mode: workflow-refinement
We want to know if the memory loop is lightweight enough for agentic reversing and where it still leaks analyst insight.
```
