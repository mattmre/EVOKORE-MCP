# Reverse-Engineering Capability Slices

This reference captures the capability slices extracted into EVOKORE skills from the current local tooling stack.

## Source Repos

1. **GhidraMCP**
   - Core live-Ghidra workflows: decompile, list methods/classes/imports/exports, rename function/data/variables, set comments, set prototypes, list strings, inspect xrefs.
2. **ghidra-headless-mcp**
   - Larger structured taxonomy: project/program lifecycle, listing/memory/patching, symbols/namespaces, references/xrefs, functions/signatures/variables, types/layout recovery, decompiler/pcode, search/graph extraction.
3. **binary-mcp**
   - Broader static + dynamic surface: Ghidra-backed analysis, ILSpy/.NET, x64dbg, WinDbg, control flow, malware behavior, YARA, PE triage, function hashing.

## Skill Coverage

### 1. Initial Reconnaissance

- List functions, imports, exports, namespaces, strings, and likely entry points
- Identify hot regions by string references, imported APIs, and graph shape

### 2. Function Semantics

- Decompile target functions
- Pull callers, callees, xrefs, graph edges, constants, and pcode when needed
- Summarize intent and unresolved hypotheses

### 3. Semantic Recovery

- Rename functions, globals, locals, and data labels
- Apply signatures, return types, comments, and structures only after evidence collection

### 4. Dynamic Confirmation

- Use x64dbg / WinDbg style workflows for runtime arguments, breakpoints, memory, and state transitions
- Feed debugger evidence back into static naming and comments

### 5. Malware / Suspicious Binary Triage

- Use imports, strings, entropy, control flow, YARA, function hashes, and debugger confirmation to build a behavior-first report

## Intentionally Deferred

- Full Ghidra GUI plugin replacement
- One-to-one reimplementation of every upstream MCP tool as an EVOKORE native tool
- Advanced patch/export automation beyond workflow guidance
