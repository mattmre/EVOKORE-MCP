---
name: reverse-engineering-workbench
description: Coordinate EVOKORE reverse-engineering work across Ghidra-style static analysis, semantic recovery, and debugger-guided triage. Use when opening an unfamiliar binary, planning a decompilation workflow, or choosing between static and dynamic analysis paths.
aliases: [re-workbench, binary-re-workbench, ghidra-workbench, decompilation-workbench]
category: Developer Tools
tags: [reverse-engineering, ghidra, decompiler, debugger, binary-analysis, malware-analysis]
version: 1.0.0
resolutionHints:
  - reverse engineer a binary
  - plan decompilation workflow
  - analyze executable with ghidra
  - choose between static and dynamic analysis
metadata:
  source: evokore
  derived_from: [GhidraMCP, ghidra-headless-mcp, binary-mcp]
---

# Reverse Engineering Workbench

Coordinate reverse-engineering work as a staged workflow instead of jumping straight into decompilation. Select the right tool family, define the evidence needed, and move from reconnaissance to semantic recovery to debugger confirmation.

## Use When

- Opening an unfamiliar executable, shared library, driver, or firmware blob
- Planning how to divide work between Ghidra-style static analysis and debugger sessions
- Building a repeatable workflow for decompilation, renaming, xref chasing, and malware triage
- Deciding whether a task should stay in EVOKORE skills or call proxied child tools directly

## Core Rule Set

1. Start with reconnaissance before renaming or patching.
2. Prefer static evidence first: imports, exports, strings, call graph shape, and decompiler output.
3. Escalate to dynamic analysis only when static analysis leaves behavior ambiguous.
4. Rename and retype only after collecting enough evidence to defend the new meaning.
5. Keep a short findings log: target, hypothesis, supporting evidence, unresolved questions, next pivot.

## EVOKORE Tool Activation Pattern

Run `discover_tools` first so the right child-tool families become visible for the session.

Suggested discovery prompts:

- `ghidra headless reverse engineering decompile xrefs strings imports exports`
- `binary analysis debugger x64dbg windbg malware triage pe dotnet`
- `reva ghidra assistant reverse engineering`

Expected tool families:

- `ghidra_headless_*` for structured static analysis, decompilation, xrefs, types, comments, and patching
- `binary_analysis_*` for static triage, .NET work, control flow, malware heuristics, YARA, x64dbg, and WinDbg
- `reva_*` for assistant-style Ghidra workflows if the ReVa child server is enabled

## Recommended Workflow

1. Run **`reverse-engineering-company-system`** if the target is large, ambiguous, or likely to span multiple RE lanes.
2. Run **`unknown-binary-onboarding`** to choose the right specialist tools and produce the first target queue.
3. Run **`ghidra-core-recon`** to map functions, strings, imports, exports, and likely entry points.
4. Run **`ghidra-function-analysis`** or **`semantic-recovery-campaign`** on priority routines and subsystems.
5. Run **`ghidra-rename-and-retype`** to clean names, signatures, variables, comments, and data types.
6. Run **`debugger-driven-analysis`** if runtime-only behavior, unpacking, crypto state, IPC, or anti-analysis logic remains unclear.
7. Run **`malware-triage-workflow`** if the sample is suspicious, packed, or clearly malicious.
8. Run **`reverse-engineering-improvement-loop`** after meaningful milestones so future sessions inherit the lessons instead of relearning them.

## Deliverables

Produce the following artifacts before declaring a slice complete:

- Binary summary: format, architecture, compiler/runtime signals, suspected role
- Priority function list with why each function matters
- Recovered names, signatures, and key data structures
- High-value xrefs and control-flow pivots
- Dynamic findings if runtime analysis was required
- Remaining unknowns that should drive the next session

## Bundled References

- `references/capability-slices.md` - capability map extracted from GhidraMCP, ghidra-headless-mcp, and binary-mcp
- `references/repo-shortlist.md` - recently updated high-signal repos to mine for future skill expansion
- `../reverse-engineering-company-system/references/operating-model.md` - company-grade RE stage model for EVOKORE
- `../reverse-engineering-company-system/references/repo-pattern-matrix.md` - repo patterns worth extracting from active RE ecosystems
- `../reverse-engineering-company-system/references/learning-loop.md` - slim memory loop for self-improving reverse-engineering sessions
