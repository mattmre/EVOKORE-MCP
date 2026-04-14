# Reverse-Engineering Repo Shortlist

GitHub scan performed for recently updated, high-star repos relevant to decompiling, debugging, and binary analysis.

## Strong Matches

| Repo | Why it matters |
|---|---|
| `NationalSecurityAgency/ghidra` | Core SRE framework; canonical source for disassembly, decompilation, symbols, data types, and project workflows |
| `radareorg/radare2` | Broad CLI-first reverse-engineering framework; strong source for recon, graph, and scripting workflows |
| `rizinorg/rizin` | Modernized reverse-engineering framework; useful for command ergonomics and debugger-oriented workflows |
| `rizinorg/cutter` | GUI platform powered by rizin; good source for analyst-facing debugger and graph workflows |
| `x64dbg/x64dbg` | Windows user-mode debugger optimized for reverse engineering and malware analysis |
| `pwndbg/pwndbg` | High-signal debugger augmentation patterns for exploit and reverse-engineering workflows |
| `angr/angr` | Symbolic/program analysis platform; good source for deeper graph and constraint-driven workflows |
| `skylot/jadx` | Strong Android decompilation workflows and code recovery ergonomics |
| `Vineflower/vineflower` | High-quality Java decompiler; useful for clean decompilation heuristics and output expectations |
| `cmu-sei/pharos` | Automated binary analysis and semantic recovery patterns |

## Secondary Repos

| Repo | Why it matters |
|---|---|
| `decalage2/oletools` | Office document and VBA malware triage patterns |
| `chainguard-dev/malcontent` | Malware-focused detection patterns for suspicious binaries |
| `wargio/r2dec-js` | Pseudo-C generation over disassembly |

## Extraction Priorities

1. **Ghidra + GhidraMCP** -> function recon, decompilation, xrefs, rename/retype, comments
2. **x64dbg + pwndbg** -> breakpoint strategy, register/stack observation, dynamic evidence capture
3. **radare2 / rizin / cutter** -> graph-first recon and dynamic/static pivot patterns
4. **angr / pharos** -> advanced graph, semantic, and automation ideas for future EVOKORE skills
5. **jadx / Vineflower** -> language-specific decompiler quality patterns
