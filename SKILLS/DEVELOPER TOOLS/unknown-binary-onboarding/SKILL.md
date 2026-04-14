---
name: unknown-binary-onboarding
description: Establish the first analysis charter for an unfamiliar binary, library, firmware image, or package. Use when the target is new and you need to choose the right tool lane before diving in.
aliases: [binary-onboarding, sample-intake, re-intake, unknown-sample-workflow]
category: Developer Tools
tags: [reverse-engineering, onboarding, ghidra, ilspy, jadx, triage]
version: 1.0.0
resolutionHints:
  - open an unfamiliar binary
  - choose the right reverse-engineering tools
  - classify sample before decompiling
metadata:
  source: evokore
  derived_from: [Ghidra, JADX, ILSpy, capa, x64dbg]
---

# Unknown Binary Onboarding

The first session should create an analysis charter, not a mess. This skill keeps the initial pass focused on classification, scoping, and target selection.

## Workflow

1. Record the operator question, constraints, and whether execution is allowed.
2. Classify the target quickly:
   - native PE / ELF / Mach-O
   - .NET
   - JVM / Android
   - firmware / embedded
   - suspicious sample needing early capability triage
3. Run recon before interpretation:
   - imports / exports
   - strings / resources
   - sections / format markers
   - compiler or runtime signals
4. Choose the first specialist lane:
   - Ghidra for broad native analysis
   - ILSpy for .NET-first work
   - JADX or Vineflower for Android / JVM decompilation
   - malware triage if suspicious behavior appears early
5. Produce a target queue of priority routines, subsystems, or artifacts.

## Required Outputs

- target profile
- primary goal
- subsystem guesses
- first-pass tool choice
- priority function or class queue
- unresolved questions that drive the next session

## Pairings

- Use **`ghidra-core-recon`** immediately after this skill for native binaries.
- Use **`malware-triage-workflow`** in parallel if suspicion is non-trivial.
- Run **`orch-panel re`** in `unknown-binary-onboarding` mode when the sample is high-risk or strategically important.
