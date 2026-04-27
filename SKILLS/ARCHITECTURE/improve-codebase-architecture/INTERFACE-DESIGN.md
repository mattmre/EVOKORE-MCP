> Adapted from mattpocock/skills @ 90ea8eec / improve-codebase-architecture/INTERFACE-DESIGN.md (MIT, (c) 2026 Matt Pocock)
> EVOKORE adaptations:
> - Bundled in the adapter skill folder; cross-links to `./LANGUAGE.md` and `./DEEPENING.md` updated.
> - Sub-agent spawning rerouted to EVOKORE's `panel-of-experts` framework via the `design-an-interface` panel archetype. Instead of free-form `Agent` tool spawns, the workflow invokes the panel so output is structured, persisted, and feasibility-gated alongside other EVOKORE expert reviews.
> - Step 1 (frame the problem space) reads any prior PRD at `docs/prd/<slug>.md` or ADR at `docs/adr/*.md` instead of asking the user for requirements ad hoc.
> - Convergence artifact is required at `docs/interface-designs/<slug>-comparative.md`.
> - No upstream content removed; only orchestration and persistence adjusted.

# Interface Design

When the user wants to explore alternative interfaces for a chosen deepening candidate, use this parallel sub-agent pattern. Based on "Design It Twice" (Ousterhout) — your first idea is unlikely to be the best.

Uses the vocabulary in [LANGUAGE.md](./LANGUAGE.md) — **module**, **interface**, **seam**, **adapter**, **leverage**.

## Process

### 1. Frame the problem space

Before spawning sub-agents, write a user-facing explanation of the problem space for the chosen candidate:

- The constraints any new interface would need to satisfy. Read any prior PRD at `docs/prd/<slug>.md` and any ADR at `docs/adr/<slug>*.md` first; lift their constraints rather than re-eliciting from the user.
- The dependencies it would rely on, and which category they fall into (see [DEEPENING.md](./DEEPENING.md)).
- A rough illustrative code sketch to ground the constraints — not a proposal, just a way to make the constraints concrete.
- The bounded context this module belongs to (per `docs/adr/0005-bounded-contexts.md`). The chosen interface must not leak across the context's boundary.

Show this to the user, then immediately proceed to Step 2. The user reads and thinks while the sub-agents work in parallel.

### 2. Spawn the design-an-interface panel

Invoke EVOKORE's `panel-of-experts` framework with the `design-an-interface` panel (see `SKILLS/ORCHESTRATION FRAMEWORK/panel-of-experts/panels/design-an-interface.md`). The panel runs 3+ design-experts in parallel — each producing a **radically different** interface for the deepened module under a specific design constraint:

- Expert 1 — **Minimum-Surface Designer**: minimise total method count (1-3 entry points max). Maximise leverage per entry point.
- Expert 2 — **Flexibility Designer**: maximise flexibility — orthogonal capabilities, support many use cases and extension paths.
- Expert 3 — **Common-Case Designer**: optimise for the most common caller — make the default case trivial, provide an asymmetric escape hatch for edge cases.
- Expert 4 (optional) — **Paradigm Designer**: design around a specific paradigm (event-driven, declarative, ports & adapters, CRDT, etc.) — only if the dependency category warrants it.

Each expert's brief includes:
- File paths and coupling details from the deepening candidate.
- The dependency category from [DEEPENING.md](./DEEPENING.md).
- What sits behind the seam.
- Both [LANGUAGE.md](./LANGUAGE.md) vocabulary and any project domain language (CONTEXT.md, ADRs) so each expert names things consistently.

Each expert outputs:

1. Interface (types, methods, params — plus invariants, ordering, error modes)
2. Usage example showing how callers use it
3. What the implementation hides behind the seam
4. Dependency strategy and adapters (see [DEEPENING.md](./DEEPENING.md))
5. Trade-offs — where leverage is high, where it's thin

### 3. Converge and persist

The panel converges per the panel-of-experts CONVERGE phase: present designs sequentially so the user can absorb each one, then compare them in prose. Contrast by **depth** (leverage at the interface), **locality** (where change concentrates), and **seam placement**.

After comparing, give an opinionated recommendation: which design is strongest and why. If elements from different designs would combine well, propose a hybrid. The user wants a strong read, not a menu.

Persist the comparative artifact to `docs/interface-designs/<slug>-comparative.md` with all designs side by side, the recommendation, and the dissenting position (if any). The Feasibility Panel gates the recommendation per panel-of-experts protocol.

If the user picks a design and wants to proceed, next, invoke `orch-refactor` skill on the affected files.
