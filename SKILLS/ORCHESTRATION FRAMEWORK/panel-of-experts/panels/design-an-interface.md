---
name: panel-design-an-interface
description: Use when an operator needs 3+ radically different interface designs for a deepening candidate, evaluated under "Design It Twice" (Ousterhout) constraint differentiation, with prior PRD/ADR consumed in place of ad-hoc requirements gathering.
aliases: [design-an-interface, interface-design-panel, design-it-twice]
category: orchestration
tags: [panel, interface-design, ousterhout, design-it-twice, architecture]
version: 1.0.0
requires: [panel-of-experts]
upstream: mattpocock/skills
upstream-sha: 90ea8eec03d4ae8f43427aaf6fe4722653561a42
upstream-path: design-an-interface/SKILL.md
license: MIT
resolutionHints:
  - design an interface
  - design it twice
  - parallel interface designs
  - compare interface shapes
  - explore module shapes
---

# Design-an-Interface Panel

## When to use this skill

Use when a deepening candidate (typically surfaced by `improve-codebase-architecture`) has 3+ viable interface shapes and the operator needs structured, parallel design exploration before committing. The panel is the EVOKORE replacement for upstream's free-form `Agent`-tool sub-agent spawn — output is structured, persisted to `docs/interface-designs/<slug>-comparative.md`, and feasibility-gated alongside other panel-of-experts reviews.

This panel is the `design-an-interface` archetype registered in panel-of-experts SKILL.md `## Injection Points`.

## Adapted From Upstream

This panel archetype is adapted from `mattpocock/skills @ 90ea8eec03d4ae8f43427aaf6fe4722653561a42 / design-an-interface/SKILL.md`, MIT licence (c) 2026 Matt Pocock. EVOKORE adaptations:

1. **Collapsed from sibling skill into panel archetype.** Upstream ships `design-an-interface` as a standalone skill. EVOKORE registers it as a panel-of-experts archetype so output flows through the panel CONVENE -> SOLO -> CHALLENGE -> CONVERGE -> FEASIBILITY -> DELIVER cycle and benefits from persistent narratives, evidence-capture, and feasibility gating.
2. **Requirements-gathering replaced with prior-PRD/ADR read.** Upstream asks the operator for requirements interactively. EVOKORE reads `docs/prd/<slug>.md` (produced by Phase 3 PRD work) and any matching ADR at `docs/adr/<slug>*.md` first, falling back to the operator only when neither artifact exists.
3. **Convergence artifact required.** EVOKORE persists all 3-4 designs side by side at `docs/interface-designs/<slug>-comparative.md` with the panel's recommendation and dissenting position. The path is mandatory; no ephemeral output.
4. **Vocabulary alignment.** All panellists use [LANGUAGE.md](../../../ARCHITECTURE/improve-codebase-architecture/LANGUAGE.md) terminology (module, interface, seam, adapter, depth, leverage, locality) plus the chosen bounded context's domain vocabulary (per `docs/adr/0005-bounded-contexts.md`). No drift to "service," "component," or "boundary."

## Panel Composition

| Expert | Role | Primary Lens |
|---|---|---|
| **Dr. Hana Yamamoto** | Minimum-Surface Designer | Aim for 1-3 entry points max. Maximise leverage per entry point. Allergic to wide interfaces. |
| **Marcus Beresford** | Flexibility Designer | Orthogonal capabilities, support many use cases and extension paths. Allergic to baked-in assumptions. |
| **Sofia Andersson** | Common-Case Designer | Optimise for the most common caller; default case trivial; asymmetric escape hatch for edge cases. Allergic to "principle-of-least-power" violations on the hot path. |
| **Dr. Lin Wei** *(optional)* | Paradigm Designer | Design around a specific paradigm (event-driven, declarative, ports & adapters, CRDT). Activated only when dependency category warrants it. |
| **Priya Sharma** | Feasibility & Convergence (Devil's Advocate) | Stress-tests every design against the bounded context, locality, and rollout cost. |

Sofia Andersson and Priya Sharma are existing personas in `expert-roster.md`. Yamamoto, Beresford, and Lin Wei are new constraint-differentiation personas introduced for this archetype; they will be added to the roster on first invocation per the persistent-narratives discipline.

## When to Invoke

- A deepening candidate from `improve-codebase-architecture` has 3+ viable interface shapes.
- Operator says "design it twice" or "compare interface options."
- A new bounded-context-spanning seam is being introduced (rare; prefer in-context seams first).
- A widely-imported module is being widened — the leverage-vs-surface trade-off needs an explicit panel decision.

Do **not** invoke for trivial single-method modules; one designer's opinion suffices.

## Review Protocol

### 1. CONVENE — Frame the problem space

Before solo work begins, the convening expert (typically Priya) writes a user-facing problem-space brief:

- Constraints any new interface must satisfy. Read `docs/prd/<slug>.md` and `docs/adr/<slug>*.md` first; lift constraints rather than re-eliciting.
- Dependencies and their categories per [DEEPENING.md](../../../ARCHITECTURE/improve-codebase-architecture/DEEPENING.md).
- The bounded context (per `docs/adr/0005-bounded-contexts.md`).
- A rough illustrative code sketch — not a proposal, just a way to ground the constraints.

### 2. SOLO — Each designer produces a radically different design

Each active designer outputs:

1. Interface (types, methods, params — plus invariants, ordering, error modes).
2. Usage example showing how callers use it.
3. What the implementation hides behind the seam.
4. Dependency strategy and adapters (per [DEEPENING.md](../../../ARCHITECTURE/improve-codebase-architecture/DEEPENING.md)).
5. Trade-offs — where leverage is high, where it's thin.

Designs MUST be radically different. If two designers produce similar shapes, the convening expert sends one back with a sharpened constraint.

### 3. CHALLENGE — Cross-examine

Each designer challenges at least one other design specifically (e.g., "Marcus's flexibility design adds an extension hook that no caller in the bounded context will ever need — that's premature generality"). Challenges are recorded.

### 4. CONVERGE — Compare and recommend

Compare designs in prose (no tables) by:

- **Depth** (leverage at the interface)
- **Locality** (where change concentrates)
- **Seam placement** (where the interface lives, what's behind it)

Give one opinionated recommendation. If elements from multiple designs combine well, propose an explicit hybrid with rationale. Capture the dissenting position separately.

### 5. FEASIBILITY — Gate the recommendation

Feasibility Panel applies its standard gate (rollout cost, blast radius, test surface, ADR drift). If the recommendation passes, proceed to DELIVER. If not, the panel returns to CONVERGE with the feasibility findings as new constraints.

### 6. DELIVER — Persist the comparative

Write `docs/interface-designs/<slug>-comparative.md` containing:

- Problem-space brief (from CONVENE).
- All 3-4 solo designs, side by side.
- Challenge log.
- Recommendation (with rationale) and dissenting position.
- Feasibility gate result.

Hand the persisted artifact back to the invoking skill (typically `improve-codebase-architecture`). The downstream `orch-refactor` invocation reads from this artifact rather than the raw panel output.

## Anti-Patterns

- **Don't let designers converge prematurely.** Radical difference is the point.
- **Don't skip the comparative artifact.** Ephemeral "let me describe these in chat" loses the trade-off log.
- **Don't evaluate by implementation effort.** Effort belongs to feasibility, not design.
- **Don't propose interfaces that span bounded contexts.** That's the bounded-context-violation anti-pattern; route to ADR amendment first.
- **Don't re-elicit requirements when a PRD/ADR exists.** Read them.
