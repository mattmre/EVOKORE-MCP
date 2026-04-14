---
name: ghidra-core-recon
description: Perform first-pass binary reconnaissance using Ghidra-oriented workflows for functions, strings, imports, exports, and symbols. Use when opening an unfamiliar program and needing a fast map before deep decompilation.
aliases: [ghidra-recon, binary-recon, ghidra-initial-triage]
category: Developer Tools
tags: [reverse-engineering, ghidra, binary-analysis, strings, imports, exports, triage]
version: 1.0.0
resolutionHints:
  - map unknown binary
  - list functions and strings
  - ghidra first pass
metadata:
  source: evokore
  derived_from: [GhidraMCP, ghidra-headless-mcp]
---

# Ghidra Core Recon

Run a structured first pass that answers: what is this binary, what are the obvious hot spots, and where should deeper analysis begin?

## Workflow

1. Activate the relevant tools with `discover_tools` using a query like `ghidra reverse engineering functions strings imports exports`.
2. Open or select the target program/project.
3. Collect the following baseline inventory:
   - function list
   - imports and exports
   - strings
   - namespaces/classes if present
   - entry points and suspicious external references
4. Cluster findings into likely subsystems:
   - loader / startup
   - networking / crypto
   - UI / CLI
   - persistence / filesystem
   - anti-analysis / protection
5. Promote only the highest-value functions into the next phase.

## Tool Families to Prefer

- `ghidra_headless_function.list`
- `ghidra_headless_external.imports.list`
- `ghidra_headless_external.exports.list`
- `ghidra_headless_search.text`
- `ghidra_headless_symbol.list`
- `ghidra_headless_reference.to` and `ghidra_headless_reference.from`

If the active child server exposes GhidraMCP-style names instead, use the equivalent live tools:

- list functions / methods
- list imports / exports
- list strings
- get xrefs to / from

## Recon Questions

- Which imports reveal the platform surface or runtime stack?
- Which strings indicate protocols, file formats, paths, registry keys, mutexes, or command channels?
- Which functions are large, highly connected, or referenced by many call sites?
- Which exports define the public interface?
- Which entry paths appear responsible for unpacking, initialization, configuration, or dispatch?

## Deliverable Format

Produce a compact recon brief with:

1. Binary purpose hypothesis
2. Top 10 functions to inspect next
3. High-signal strings
4. High-signal imports/exports
5. Three likely pivots for deeper semantic recovery
