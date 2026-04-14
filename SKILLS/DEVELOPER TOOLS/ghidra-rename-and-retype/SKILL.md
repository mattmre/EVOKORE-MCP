---
name: ghidra-rename-and-retype
description: Turn raw analysis into a cleaner knowledge base by renaming functions, variables, and data while applying signatures, comments, and types. Use when enough evidence exists to improve semantic clarity without guessing.
aliases: [semantic-recovery, ghidra-rename, ghidra-retype, signature-recovery]
category: Developer Tools
tags: [reverse-engineering, ghidra, renaming, retyping, signatures, comments, structs]
version: 1.0.0
resolutionHints:
  - rename functions in ghidra
  - set prototype and comments
  - recover variable and type information
metadata:
  source: evokore
  derived_from: [GhidraMCP, ghidra-headless-mcp]
---

# Ghidra Rename and Retype

Convert analysis notes into durable semantic improvements. Rename, comment, and retype only after the supporting evidence is explicit.

## Workflow

1. Start from a confirmed function-analysis result.
2. Rename in this order:
   - function
   - globals/data labels
   - parameters
   - local variables
3. Add comments for:
   - behavior summary
   - argument meaning
   - protocol / file format meaning
   - unresolved caveats
4. Apply type improvements:
   - function signature
   - return type
   - variable types
   - parsed C definitions
   - structure filling from decompiler output when justified
5. Re-run decompilation and verify the output became clearer, not noisier.

## Tool Families to Prefer

- `ghidra_headless_function.rename`
- `ghidra_headless_variable.rename`
- `ghidra_headless_variable.retype`
- `ghidra_headless_function.signature.set`
- `ghidra_headless_function.return_type.set`
- `ghidra_headless_type.parse_c`
- `ghidra_headless_type.apply_at`
- `ghidra_headless_layout.struct.fill_from_decompiler`

GhidraMCP-style equivalents:

- rename function
- rename data
- rename variable
- set function prototype
- set decompiler comment
- set disassembly comment

## Guardrails

1. Avoid generic names like `handler`, `func1`, or `process_data` unless there is no stronger evidence.
2. Preserve uncertainty in the name when needed, for example `maybe_parse_config`.
3. Prefer short behavioral comments over long essays.
4. Batch related renames together so call chains stay coherent.

## Deliverable Format

- Old name -> new name mappings
- Signature/type updates applied
- Comments added
- Remaining semantic gaps that still need evidence
