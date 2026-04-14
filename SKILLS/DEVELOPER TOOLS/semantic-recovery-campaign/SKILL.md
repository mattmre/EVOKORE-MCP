---
name: semantic-recovery-campaign
description: Recover subsystem meaning through disciplined decompilation, xref analysis, renaming, typing, and evidence tracking. Use when a binary is partly mapped and you want durable semantic cleanup instead of ad hoc notes.
aliases: [semantic-recovery, naming-campaign, retype-campaign, decompiler-cleanup]
category: Developer Tools
tags: [reverse-engineering, ghidra, decompiler, types, xrefs, naming]
version: 1.0.0
resolutionHints:
  - rename and retype a subsystem
  - turn decompiler output into real semantics
  - recover data structures and function roles
metadata:
  source: evokore
  derived_from: [Ghidra, Pharos, GhidraMCP]
---

# Semantic Recovery Campaign

Use this skill when the goal is no longer "find something interesting" but "make a subsystem understandable and durable for future analysis."

## Campaign Rules

1. Work subsystem-first, not function-random.
2. Promote names and types only when evidence can defend them.
3. Keep confidence levels explicit: confirmed, likely, speculative.
4. Batch related renames and type updates so the codebase becomes more coherent with each pass.
5. Stop and escalate to dynamic validation if the same uncertainty keeps blocking semantic cleanup.

## Workflow

1. Define the subsystem scope: networking, config, crypto, installer, UI bridge, anti-analysis, and so on.
2. Pick representative functions and recover their real role using:
   - callers / callees
   - xrefs to and from
   - strings and constants
   - structure and API evidence
3. Create a local glossary:
   - subsystem terms
   - recovered struct or class names
   - prefixes or naming conventions
4. Apply durable edits:
   - function names
   - variable names
   - prototypes
   - local types
   - comments for branch purpose, not narration
5. Record what is still blocking confidence.

## Best Pairings

- **`ghidra-function-analysis`** for each representative routine
- **`ghidra-rename-and-retype`** for durable semantic edits
- **`debugger-driven-analysis`** when runtime proof is required
- **`orch-panel re`** in `semantic-recovery` mode for high-stakes conclusions

## Deliverable Format

- subsystem summary
- naming glossary
- confirmed edits
- speculative edges
- next proof steps
