---
name: reverse-engineering-company-system
description: Run reverse engineering as a coordinated EVOKORE operating system with expert panels, additive workflows, and lightweight learning loops. Use when the target is complex enough that you want more than isolated tool calls.
aliases: [re-company, reverse-engineering-operating-model, binary-analysis-company, re-system]
category: Developer Tools
tags: [reverse-engineering, orchestration, ghidra, debugger, decompiler, memory, workflow]
version: 1.0.0
resolutionHints:
  - build a reverse-engineering workflow system
  - coordinate ghidra debugger and malware triage work
  - run company-grade binary analysis
  - improve reverse-engineering skills over time
metadata:
  source: evokore
  derived_from: [Ghidra, radare2, rizin, Cutter, x64dbg, pwndbg, angr, qiling, JADX, ILSpy, capa, Pharos]
---

# Reverse Engineering Company System

Use this skill when reverse engineering needs to behave like a practiced research organization instead of a sequence of disconnected tool invocations. The goal is additive output: static recon informs semantic recovery, semantic recovery sharpens debugger plans, dynamic evidence hardens capability claims, and every session leaves behind reusable memory.

## Core Operating Model

1. **Intake and segmentation** — classify the target and decide whether the main lane is native, .NET, JVM/Android, firmware, or suspicious-sample triage.
2. **Static recon** — imports, exports, strings, entry points, subsystem map, priority function queue.
3. **Semantic recovery** — decompilation, xrefs, renaming, typing, comments, structure recovery, certainty scoring.
4. **Dynamic hypothesis testing** — x64dbg / WinDbg / pwndbg-style flows, Qiling or other emulator help when execution context matters.
5. **Capability synthesis** — threat behavior, ATT&CK framing, persistence / C2 / credential / anti-analysis claims when relevant.
6. **Learning capture** — evidence, unresolved questions, automation candidates, persona/workflow improvements.

## EVOKORE-Native Building Blocks

- **Panel:** `orch-panel re` uses the Reverse Engineering Panel for unknown binaries, semantic campaigns, debugger planning, and workflow refinement.
- **Workflow:** `panel-of-experts/workflows/reverse-engineering-analysis.json`
- **Research workflow:** `panel-of-experts/workflows/reverse-engineering-repo-research.json`
- **Learning loop:** `panel-of-experts/workflows/reverse-engineering-improvement-loop.json`

## Complementary Skill Stack

Start from the skill that matches the phase:

1. **`unknown-binary-onboarding`** — establish the first analysis charter and choose tool lanes.
2. **`ghidra-core-recon`** — map the binary before interpreting it.
3. **`ghidra-function-analysis`** — recover subsystem semantics.
4. **`semantic-recovery-campaign`** — run naming/type cleanup as a disciplined campaign.
5. **`debugger-driven-analysis`** — resolve runtime-only ambiguity.
6. **`malware-triage-workflow`** — escalate suspicious behavior into capability-oriented triage.
7. **`reverse-engineering-improvement-loop`** — convert session evidence into better future workflows.

## Design Rules

1. Do not let decompiler output outrun evidence.
2. Do not debug without a concrete question.
3. Prefer tool specialization early: ILSpy for .NET, JADX/Vineflower for managed/JVM targets, Ghidra for broad native analysis.
4. Escalate to automation only when the ambiguity is recurring or expensive enough to justify it.
5. Every major conclusion should survive a session handoff without requiring the next run to rediscover it.

## Memory and Self-Improvement

Use lightweight memory, not bloated transcripts:

- hypothesis ledger
- evidence ledger
- naming/type ledger
- dynamic validation log
- improvement backlog

Those artifacts should feed EVOKORE's existing continuity surfaces:

- `session-replay`
- `evidence-capture`
- `persistent-narratives`
- `improvement-cycles`
- `session-wrap`

## Bundled References

- `references/operating-model.md`
- `references/repo-pattern-matrix.md`
- `references/learning-loop.md`
