# Reverse Engineering Operating Model

This operating model turns EVOKORE's reverse-engineering skills into a coordinated system with clear lanes, decision gates, and memory surfaces.

## Stages

### 1. Intake
- Identify target type, risk, constraints, and operator objective.
- Decide whether execution is allowed.
- Produce a short analysis charter.

### 2. Static Recon
- Map format, architecture, runtime, imports, exports, strings, resources, and entry points.
- Build the first subsystem map and target queue.
- Choose the likely specialist tool path:
  - native: Ghidra, radare2/rizin-style logic, Cutter for UI-heavy graph work
  - .NET: ILSpy-first, then Ghidra for native bridges
  - JVM / Android: JADX or Vineflower first, then native tools as needed
  - suspicious samples: capa / YARA / sandbox-aware triage in parallel with static recon

### 3. Semantic Recovery
- Recover meaning at subsystem level before polishing every function.
- Use xrefs, constants, strings, API evidence, and surrounding call paths to justify names and types.
- Record confidence levels:
  - confirmed
  - likely
  - speculative

### 4. Dynamic Hypothesis Testing
- Only execute when static evidence cannot answer the key question.
- Choose the narrowest runtime lane that answers it:
  - x64dbg for Windows user-mode pivots
  - WinDbg for deeper Windows/system contexts
  - pwndbg-like discipline for Linux/low-level register and memory work
  - Qiling or other emulation when the environment is part of the problem

### 5. Capability and Threat Synthesis
- Convert technical observations into behavior claims.
- For suspicious samples, cluster behaviors into capability buckets instead of dumping raw API notes.
- Distinguish:
  - observed behavior
  - defensible hypothesis
  - unresolved question

### 6. Learning Capture
- Extract workflow lessons while the evidence is still fresh.
- Ask:
  - what should become a reusable skill?
  - what should become a persistent expert narrative?
  - what should become a checklist, rule, or automation target?

## Panel Usage

| Stage | Primary Panel / Skill | Why |
|---|---|---|
| Intake | `unknown-binary-onboarding` + `orch-panel re` | Forces explicit charter and target queue |
| Static recon | `ghidra-core-recon` | Prevents premature semantics |
| Semantic recovery | `ghidra-function-analysis`, `semantic-recovery-campaign` | Converts raw findings into defensible meaning |
| Dynamic validation | `debugger-driven-analysis` + `orch-panel re` | Keeps debugger work hypothesis-driven |
| Malware triage | `malware-triage-workflow` | Turns suspicious signals into operator-usable output |
| Learning capture | `reverse-engineering-improvement-loop` | Improves future sessions instead of only closing the current one |

## Decision Gates

1. **Do we understand the binary map yet?**
   - If no, stay in recon.
2. **Do we have evidence to rename or retype?**
   - If no, keep hypotheses separate from facts.
3. **Will runtime evidence collapse major uncertainty?**
   - If yes, design a minimal breakpoint or emulation plan.
4. **Is the sample suspicious enough to need capability reporting now?**
   - If yes, run malware triage in parallel with deeper RE.
5. **Did this session surface a recurring gap?**
   - If yes, add it to the improvement loop.

## What "Better Than a Team of Humans" Means Here

Not bigger prompts. Better system design:

- specialists with explicit lenses
- evidence-backed convergence
- strong handoff artifacts
- recurring-gap detection
- workflow and persona evolution over time
- additive, not redundant, tool composition
