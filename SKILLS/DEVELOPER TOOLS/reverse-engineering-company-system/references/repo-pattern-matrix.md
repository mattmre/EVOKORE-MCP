# Reverse Engineering Repo Pattern Matrix

This matrix captures the high-signal patterns extracted from recently active, well-established reverse-engineering repositories reviewed during the April 2026 research pass.

| Repo | Primary Strength | Pattern to Extract | EVOKORE Adoption Target |
|---|---|---|---|
| `NationalSecurityAgency/ghidra` | Broad static analysis platform | Extensible analysis engine, headless + interactive workflows, durable semantic edits | Ghidra-centered recon, semantic cleanup, and structured evidence capture |
| `radareorg/radare2` | Composable CLI framework | Small verbs, scripting, plugins, diffing, debugger/disassembler coexistence | Tool-family routing and narrowly scoped workflow steps instead of monolith prompts |
| `rizinorg/rizin` | Usability-focused fork of radare-style core | Cleaner UX over powerful low-level primitives | Maintain narrow tool primitives while improving analyst ergonomics |
| `rizinorg/cutter` | GUI workflow on top of rizin | UI-assisted graphing, plugin-driven analyst pivots, same engine across modes | Keep headless and analyst-assisted paths aligned in the same workflow |
| `x64dbg/x64dbg` | Windows user-mode debugging | Breakpoint-driven runtime confirmation, plugin ecosystem, memory/register centric analysis | Minimal-question debugger plans and runtime evidence templates |
| `pwndbg/pwndbg` | Debugger ergonomics | Opinionated state views, low-friction memory/register context, exploit/RE friendly defaults | Better dynamic evidence structure and debugging checklists |
| `angr/angr` | Program analysis automation | Symbolic execution, CFG/value/data-dependency analysis, library-friendly APIs | Automation lane for recurring high-cost ambiguities |
| `qilingframework/qiling` | Cross-platform emulation | Isolated runtime experiments, snapshotting, hooks, cross-arch analysis | Emulation lane for firmware, packed binaries, and controlled dynamic experiments |
| `skylot/jadx` | Android / Dex decompilation | Domain-specific decompilation, usage search, debugger support | Early classification so Android work does not start in the wrong toolchain |
| `Vineflower/vineflower` | JVM decompilation quality | Clean Java output and modern language support | JVM-specific decompiler branch for managed targets |
| `icsharpcode/ILSpy` | .NET decompilation | Strong managed-code navigation, CLI + editor extensions, metadata exploration | .NET-first branch before dropping into native-only tooling |
| `mandiant/capa` | Semantic capability extraction | Rule-driven mapping from features to behavior claims across static and dynamic inputs | Capability layer, ATT&CK-friendly reporting, and rule-authoring mindset |
| `cmu-sei/pharos` | Semantic/OO recovery | API sequence analysis, OO recovery, function similarity signals | Structure/class recovery and subsystem-level semantic campaigns |

## Secondary Patterns Worth Reusing

- `decalage2/oletools` — document and macro triage for office-malware workflows
- `chainguard-dev/malcontent` — policy- and rule-driven malware scanning mindset
- `wargio/r2dec-js` — decompiler-as-plugin pattern

## Portfolio Lessons

1. No single repo wins every lane.
2. The best workflows combine a broad static platform with specialist decompilers and a debugger/emulation lane.
3. Semantic extraction tools like `capa` and `pharos` matter because they convert low-level evidence into reusable meaning.
4. Plugin and scripting ecosystems are as important as the core engine because they determine how fast a workflow can evolve.
5. EVOKORE should extract operating patterns and decision logic, not attempt a shallow clone of every tool surface.
