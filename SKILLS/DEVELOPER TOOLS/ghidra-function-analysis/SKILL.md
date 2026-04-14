---
name: ghidra-function-analysis
description: Analyze a target function through decompilation, xrefs, callers/callees, and supporting evidence. Use when a function has been identified as important and its real semantics need to be recovered.
aliases: [function-analysis, ghidra-decompile-analysis, xref-driven-analysis]
category: Developer Tools
tags: [reverse-engineering, ghidra, decompiler, xrefs, callgraph, pcode]
version: 1.0.0
resolutionHints:
  - decompile a function
  - analyze xrefs and callers
  - understand function semantics
metadata:
  source: evokore
  derived_from: [GhidraMCP, ghidra-headless-mcp]
---

# Ghidra Function Analysis

Recover semantics by correlating decompiler output with xrefs, control flow, strings, and surrounding call paths. Do not trust decompiler prose alone.

## Workflow

1. Select the function by name or address.
2. Pull both decompiler output and low-level context:
   - disassembly
   - callers and callees
   - xrefs to and from
   - referenced strings and constants
   - surrounding graph edges or pcode if needed
3. Explain the function in terms of:
   - inputs
   - outputs
   - side effects
   - data structures touched
   - external APIs invoked
4. State what is still uncertain.
5. Decide whether the next step is renaming/retyping, graph expansion, or debugger confirmation.

## Tool Families to Prefer

- `ghidra_headless_decomp.function`
- `ghidra_headless_function.at` or `ghidra_headless_function.by_name`
- `ghidra_headless_function.callers`
- `ghidra_headless_function.callees`
- `ghidra_headless_reference.to`
- `ghidra_headless_reference.from`
- `ghidra_headless_pcode.function`
- `ghidra_headless_graph.*`

GhidraMCP-style equivalents:

- decompile function
- disassemble function
- get xrefs to / from
- list strings

## Evidence Rules

1. Confirm every semantic claim with at least one of:
   - API call evidence
   - xref pattern
   - string/constant evidence
   - control-flow structure
   - dynamic observation
2. Separate "confirmed behavior" from "best current hypothesis."
3. Mark any security-relevant branches, error paths, or anti-analysis checks explicitly.

## Deliverable Format

- Function summary in 3-6 sentences
- Inputs / outputs / side effects
- Key evidence bullets
- Open questions
- Recommended next pivot
