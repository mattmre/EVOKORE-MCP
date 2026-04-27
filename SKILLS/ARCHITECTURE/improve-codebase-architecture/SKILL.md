---
name: improve-codebase-architecture
description: Use when surfacing architectural friction inside a single EVOKORE bounded context and proposing deepening refactors (shallow modules, leaky seams, low locality) that turn shallow modules into deep ones — informed by ADR-0005 bounded contexts and the project's domain language.
category: architecture
tags: [architecture, refactoring, deepening, seams, ddd, ousterhout, feathers]
version: 1.0.0
upstream: mattpocock/skills
upstream-sha: 90ea8eec03d4ae8f43427aaf6fe4722653561a42
upstream-path: improve-codebase-architecture/SKILL.md
license: MIT
aliases: [deepening, find-deepening-opportunities, architecture-deepening]
resolutionHints:
  - find architectural friction
  - deepen shallow modules
  - propose interface widening
  - apply the deletion test
  - improve testability and AI-navigability
  - architecture refactor opportunities
---

# Improve Codebase Architecture

Surface architectural friction inside one EVOKORE bounded context and propose **deepening opportunities** — refactors that turn shallow modules into deep ones. The aim is testability, locality, and AI-navigability. Vocabulary is shared and load-bearing: see [./LANGUAGE.md](./LANGUAGE.md).

## When to use this skill

Use when an operator or panel asks for an architectural review, a deepening pass, or refactor candidates inside a specific area of EVOKORE — not for repo-wide audits.

**Adjacency precondition (HARD GATE):** before producing any candidate, identify the EVOKORE bounded context the target module lives in. Read [`docs/adr/0005-bounded-contexts.md`](../../../docs/adr/0005-bounded-contexts.md) and name one of the eight contexts (Skill Registry & Discovery, Proxy & Routing, Auth & Security, Session & Continuity, Orchestration & Fleet, Audit & Webhooks, Telemetry & Analytics, Memory & Knowledge). If you cannot name the bounded context this module belongs to (per ADR-0005), STOP and invoke `domain-model` discipline first — that aep-framework Phase 1 step gives you the context map.

This skill REFUSES to operate repo-wide. One bounded context per invocation. A repo-wide deepening pass is a meta-task and must be split into one invocation per context, with each context's findings reviewed independently.

Trigger phrases that should activate this skill:
- "find deepening opportunities in the Proxy & Routing context"
- "review the SkillManager / Skill Registry context for shallow modules"
- "where are the leaky seams in Session & Continuity?"
- "apply the deletion test to <module>"

Do **not** use this skill for:
- Cross-cutting refactors that span multiple bounded contexts (split per context first, or run `orch-plan` to sequence them).
- Behaviour changes (this skill is invariant-preserving; it proposes shape changes only).
- Routine code review — use `orch-review` or the panel-of-experts code-quality panel instead (alias `code-experts`).

## Adapted From Upstream

This skill is adapted from [`mattpocock/skills @ 90ea8eec03d4ae8f43427aaf6fe4722653561a42 / improve-codebase-architecture/SKILL.md`](../../upstream/mattpocock-skills/improve-codebase-architecture/SKILL.md), MIT licence (c) 2026 Matt Pocock. Upstream attribution and licence text live in the repo-root `NOTICE` and at `SKILLS/upstream/mattpocock-skills/LICENSE`. The vendored upstream tree is read-only; this adapter is the EVOKORE-consumable port.

The upstream's three reference documents (`DEEPENING.md`, `INTERFACE-DESIGN.md`, `LANGUAGE.md`) are bundled as sibling files in this skill folder rather than re-exported from the submodule, so EVOKORE's SkillManager and the composition graph derive cleanly without indexing upstream paths. Each bundled file carries its own attribution header.

## EVOKORE-Specific Adaptations

1. **Bundle-split.** The upstream inlines references inside one tree but EVOKORE splits them into separate sibling files: [./DEEPENING.md](./DEEPENING.md), [./INTERFACE-DESIGN.md](./INTERFACE-DESIGN.md), [./LANGUAGE.md](./LANGUAGE.md). The body references them as `See ./DEEPENING.md` etc. so the SKILL.md stays under the skill-creator size budget and progressive-disclosure principle.
2. **Adjacency precondition (ADR-0005).** Upstream operates against any `CONTEXT.md`. EVOKORE replaces the freeform `CONTEXT.md` lookup with a hard gate against `docs/adr/0005-bounded-contexts.md`. The skill refuses to run repo-wide; one bounded context per invocation.
3. **`domain-model` discipline fallback.** If the operator cannot identify the bounded context, the skill stops and routes to the aep-framework Phase 1 `domain-model` discipline rather than guessing.
4. **`orch-refactor` composition.** Upstream ends at "ask the user what to do next." EVOKORE composes downstream into `orch-refactor` so any chosen candidate is implemented under EVOKORE's existing extract / rename / simplify discipline (which itself is a Mandatory Injection Point for the panel-of-experts code-quality panel — coverage compounds).
5. **Interface design via panel.** Where upstream's `INTERFACE-DESIGN.md` spawns ad hoc `Agent`-tool sub-agents, EVOKORE routes interface-design exploration through the `panel-of-experts` `design-an-interface` panel archetype so the output is structured, persisted to `docs/interface-designs/<slug>-comparative.md`, and feasibility-gated alongside other expert reviews.
6. **Vocabulary disambiguation.** EVOKORE's "bounded context" (DDD, ADR-0005) and Feathers' "seam" (this skill) operate at different scales. [./LANGUAGE.md](./LANGUAGE.md) is explicit that they must not be conflated.

## Process

The deepening procedure runs in three phases. Use `panel-of-experts` Architecture & Planning panel as a feasibility gate after Step 2 if the candidate spans more than three modules.

### 1. Read the bounded context (HARD GATE)

- Read [`docs/adr/0005-bounded-contexts.md`](../../../docs/adr/0005-bounded-contexts.md) and confirm which of the eight bounded contexts the target module lives in.
- Read any context-specific ADRs in `docs/adr/` whose titles or scope match the chosen context.
- Read the source files for the target module and its direct callers inside the same bounded context. Do **not** load callers from other contexts in this phase — those are external to the seam by definition.
- If you cannot name the bounded context, STOP and invoke `domain-model` discipline first.

### 2. Identify seams and run the deletion test

Walk the target context's modules and note where you experience friction:

- Where does understanding one concept require bouncing between many small modules?
- Where are modules **shallow** — interface nearly as complex as the implementation?
- Where have pure functions been extracted just for testability, but the real bugs hide in how they're called (no **locality**)?
- Where do tightly-coupled modules leak across their seams?
- Which parts are untested, or hard to test through their current interface?

For every suspected shallow module, apply the **deletion test** (see [./LANGUAGE.md](./LANGUAGE.md)): imagine deleting it. If complexity vanishes (it was a pass-through), it's a deepening candidate. If complexity reappears across N callers (it was earning its keep), it stays.

Classify each candidate's dependencies into one of the categories in [./DEEPENING.md](./DEEPENING.md) — including the EVOKORE-specific note about child-server / proxied-tool seams.

### 3. Propose interface widening / impl deepening

Present a numbered list of deepening opportunities. For each candidate:

- **Files** — which files/modules are involved
- **Bounded context** — which of the eight (per ADR-0005)
- **Problem** — why the current architecture is causing friction
- **Solution** — plain-English description of what would change (interface widening, impl deepening, port-and-adapter introduction, etc.)
- **Benefits** — explained in terms of locality and leverage, and in how tests would improve
- **Deletion test result** — what concentrates vs. moves

Use [./LANGUAGE.md](./LANGUAGE.md) vocabulary for architecture and the chosen context's domain vocabulary for the domain. If a candidate contradicts an existing ADR, mark it clearly (e.g. _"contradicts ADR-0007 — but worth reopening because…"_) and do not silently re-litigate.

If the user wants to explore alternative interfaces for a chosen candidate, follow [./INTERFACE-DESIGN.md](./INTERFACE-DESIGN.md), which routes through the `design-an-interface` panel archetype.

Do NOT propose interfaces, write code, or modify files in this skill. Stop at proposals.

## Composition

This skill is **not terminal**. After the user picks a candidate and the design (if interface alternatives were explored) is decided, next, invoke `orch-refactor` skill on the chosen module with the type that fits (`extract` for new seam, `rename` for terminology drift, `simplify` for shallow-module merging, `dead-code` for failed deletion-test candidates).

`orch-refactor` is in the EVOKORE composition graph's transitive-expand allowlist (`TRANSITIVE_CLOSE_EXPAND` in `scripts/derive-skill-composition.js`), so the runtime auto-activates its tooling once this skill emits the `nextSteps[]` edge. `orch-refactor` itself is a Mandatory Injection Point for the panel-of-experts code-quality panel, so coverage compounds without further action.

If the candidate's interface design is unresolved, route through `panel-of-experts` first (specifically the `design-an-interface` panel archetype) and only then invoke `orch-refactor`.
