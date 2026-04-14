---
name: debugger-driven-analysis
description: Drive runtime analysis with debugger-first workflows for breakpoint planning, register and memory observation, and static-to-dynamic correlation. Use when static analysis is insufficient or runtime behavior must be confirmed.
aliases: [dynamic-analysis, debugger-triage, x64dbg-workflow, runtime-re-validation]
category: Developer Tools
tags: [reverse-engineering, debugger, x64dbg, windbg, pwndbg, dynamic-analysis]
version: 1.0.0
resolutionHints:
  - debug suspicious binary
  - use x64dbg for reverse engineering
  - confirm behavior at runtime
metadata:
  source: evokore
  derived_from: [binary-mcp, x64dbg, pwndbg, cutter, rizin]
---

# Debugger-Driven Analysis

Use runtime evidence to resolve questions that static analysis cannot answer cleanly: unpacking, argument decoding, branch conditions, environment checks, IPC, crypto state, and anti-analysis behavior.

## Workflow

1. Start from a concrete question, not "debug everything."
2. Choose the debugger mode:
   - x64dbg for Windows user-mode binaries
   - WinDbg for deeper Windows/system scenarios
   - pwndbg-like workflows for low-level register/stack discipline
3. Set a minimal breakpoint plan:
   - process entry / unpacking point
   - suspicious imported APIs
   - target functions identified in static recon
   - memory write / allocation pivots when needed
4. Capture:
   - arguments and calling convention state
   - register snapshots before/after call
   - buffers, decoded strings, and memory changes
   - control-flow decisions at critical branches
5. Feed confirmed runtime facts back into static naming, signatures, and comments.

## Tool Families to Prefer

- `binary_analysis_*x64dbg*`
- `binary_analysis_*windbg*`
- `binary_analysis_*session*`
- `binary_analysis_*report*`

If the exact prefixed names are unclear, use `discover_tools` with `x64dbg debugger winDbg reverse engineering`.

## Debugger Heuristics

1. Break on semantic pivots, not every instruction.
2. Snapshot before patching or forcing branches.
3. Record the minimum evidence needed to answer the current hypothesis.
4. Correlate every important dynamic observation to a static function or address.

## Deliverable Format

- Question being tested
- Breakpoints and why they were chosen
- Runtime observations
- Static addresses/functions updated from those observations
- Recommended next action
