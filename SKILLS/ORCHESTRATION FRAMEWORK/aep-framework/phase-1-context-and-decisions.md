# Phase 1: Context and Decisions Discipline

> **Trigger.** Use during the AEP **Align** phase whenever a cycle plans work that
> spans more than one bounded context (per ADR-0005), introduces or sharpens a
> domain term, or makes an architectural choice that future readers will not
> reconstruct from the code alone.
>
> **Discipline adapted from** [`mattpocock/skills/domain-model`](https://github.com/mattpocock/skills/tree/90ea8eec03d4ae8f43427aaf6fe4722653561a42/domain-model)
> (MIT, commit `90ea8eec`). Folded into AEP Phase 1 instead of shipping as a
> sibling skill so EVOKORE keeps a single decision-log surface (`docs/adr/`) and
> a single context surface (`CONTEXT.md` per bounded context).

---

## Summary (5-second read)

During AEP **Align**, before remediation PRs are written:

1. For each bounded context the cycle touches, write or refresh a small
   `CONTEXT.md` capturing the domain, primary use cases, key invariants, key
   models, and open questions.
2. Crystallize each architectural decision into an ADR in `docs/adr/`
   **as the decision is made**, not retrospectively.
3. After two `panel-of-experts` review passes converge, the ADR moves to
   `Status: Accepted` and the chain stops. Re-opening the decision requires a
   new superseding ADR.

This section folds the discipline of `mattpocock/skills/domain-model` into AEP
Phase 1. Do **not** create a sibling `domain-model` skill; everything lives here
and in the existing `docs/adr/` directory.

---

## Context Crystallization

EVOKORE-MCP is decomposed into eight bounded contexts in
[`docs/adr/0005-bounded-contexts.md`](../../../docs/adr/0005-bounded-contexts.md).
Every context that the cycle is going to touch must have a current `CONTEXT.md`
before EXECUTE begins.

### Where `CONTEXT.md` lives

EVOKORE uses a multi-context layout. There is **no** repo-wide `CONTEXT.md`.

- One `CONTEXT.md` per bounded context, scoped to that context only.
- Canonical home: `docs/contexts/<context-slug>/CONTEXT.md`.
  Example: `docs/contexts/skill-registry-and-discovery/CONTEXT.md`.
- The slug must match a bounded context named in ADR-0005
  (kebab-case of the `### N. Title` heading,
  e.g. `Skill Registry & Discovery` → `skill-registry-and-discovery`).

### What `CONTEXT.md` must contain

Use [`templates/context-template.md`](templates/context-template.md) as the
skeleton. The required headings are:

- **Bounded Context Name** (must match ADR-0005)
- **Domain** — one paragraph describing what this context is responsible for
- **Primary Use Cases** — bulleted, 3-7 items, expressed in user/operator language
- **Key Invariants** — what must always be true within this context
- **Key Models** — Aggregates / Value Objects / Domain Services / Repositories
  named with their TypeScript symbols where they exist
- **Open Questions** — explicit, dated, with proposed owner
- **Last Updated** — ISO 8601 date + the cycle ID that touched it
- **Citations** — replay JSONL line IDs and evidence E-NNN IDs that informed
  the current contents

### Compression rule

`CONTEXT.md` MUST be ≤ 200 lines per context. The 200-line ceiling forces
compression: if a context cannot be summarised in that budget, the context is
either too broad (split it; raise a new ADR superseding ADR-0005) or the
document is leaking implementation detail that belongs in source code, not
glossary.

### When to update

Update a context's `CONTEXT.md` whenever **the dominant model in that context
changes**. The trigger is not "I touched a file in `src/`," it is "the words a
domain expert would use to describe this context have shifted."

Source the change from:

- `panel-of-experts` `CONVERGE` artifacts (the panel already named the model
  shift)
- session-replay JSONL entries that show repeated terminology drift
  (`~/.evokore/sessions/*-replay.jsonl`)
- evidence-capture entries where a test or fix renamed a domain concept
  (`~/.evokore/sessions/*-evidence.jsonl`)

Cite those sources in the `## Citations` block of `CONTEXT.md` so the next
reader can audit the change.

---

## ADR Crystallization

ADRs live in `docs/adr/NNNN-<slug>.md` with sequential numbering. The next
ADR uses the highest existing number + 1; numbers are never reused.

### Required structure

Mirror the structure of
[`docs/adr/0005-bounded-contexts.md`](../../../docs/adr/0005-bounded-contexts.md):

- **Title** (`# ADR NNNN: <short title>`)
- **Status** (one of `Proposed`, `Accepted`, `Deprecated`, `Superseded`)
- **Date** (ISO 8601, required for `Accepted` / `Deprecated` / `Superseded`)
- **Deciders** (panel name, agent name, or human owner)
- **Supersedes** (ADR id or `None`)
- **Context** (why we needed to decide; what was painful before)
- **Decision** (what we decided, in concrete enough terms that a reader can
  identify the corresponding code)
- **Consequences** (positive, negative, accepted trade-offs)
- **Related Decisions** (cross-links to other ADRs and CONTEXT.md files)

Use [`docs/adr/TEMPLATE.md`](../../../docs/adr/TEMPLATE.md) as the skeleton.

### Status lifecycle

```
Proposed  ──►  Accepted  ──►  Deprecated
                  │
                  └────────►  Superseded by ADR-NNNN
```

- **Proposed** — drafted, not yet ratified by two panel passes.
- **Accepted** — ratified per the Freeze rule below.
- **Deprecated** — the underlying need has gone away; no successor exists.
- **Superseded** — replaced by a newer ADR; the new ADR's `Supersedes` field
  names this one.

### When to write an ADR

Write an ADR when **all three** are true:

1. **Hard to reverse** — the cost of changing course later is meaningful.
2. **Surprising without context** — a future reader will look at the code and
   ask "why on earth was it done this way?"
3. **The result of a real trade-off** — there were genuine alternatives.

If any of the three is missing, do not write an ADR. The ADR directory is
expensive to scan; do not pollute it with restatements of the obvious.

### Crystallize inline, not retrospectively

The ADR is written **as the decision is made**, in the same PR or cycle that
implements it. Retrospective ADRs lose the trade-off context that made them
worth writing. AEP Phase 1's `phase-planning.md` Decision Log section must
reference the ADR id once the ADR is filed.

---

## Freeze rule

After **two `panel-of-experts` review passes converge** on the same decision,
the ADR moves from `Status: Proposed` to `Status: Accepted` and the iteration
loop stops. Reopening that decision requires:

1. A new ADR (next sequential number) with `Supersedes: ADR-NNNN`.
2. The superseded ADR's status flips to `Status: Superseded` with a pointer
   to the new ADR.
3. The new ADR runs through its own two-pass panel cycle.

Rationale: the upstream `mattpocock/skills/domain-model` interview loop
encourages indefinite iteration. The DDD panel flagged that pattern as the
"iterate forever" failure mode. The two-pass freeze rule is what AEP adopts
instead. Two passes are the floor — if a third panel pass would change the
decision, that signals a missing constraint, which itself is grounds for a
**new** superseding ADR rather than mutating an `Accepted` one.

---

## When to invoke from aep-framework Phase 1

Trigger conditions during AEP `Align`:

- The scope-locked PR range touches modules in **more than one** bounded
  context per ADR-0005 → **before** discovery + normalization, invoke
  `ubiquitous-language skill` once **per affected context** so each context's
  glossary is current. Do not run a single repo-wide pass.
- The cycle introduces a new term, renames an existing term, or merges two
  previously distinct terms → invoke `ubiquitous-language skill` for the
  owning context, then update that context's `CONTEXT.md` inline.
- The cycle is going to make an architectural choice meeting the
  hard-to-reverse / surprising / real-trade-off test → draft a `Proposed` ADR
  in `docs/adr/`, then run `panel-of-experts skill` twice to ratify.

If none of those triggers fire, Phase 1 proceeds without touching CONTEXT.md
or `docs/adr/`. The discipline is **trigger-driven**, not "always-on busywork."

---

## Anti-pattern: repo-wide CONTEXT.md

**Never** create a single repo-wide `CONTEXT.md` at the repo root. EVOKORE-MCP
is a multi-context system per ADR-0005. A repo-wide glossary collapses
distinct meanings into one false-unified vocabulary, which is the classical
DDD failure mode of treating a multi-context system as one homogeneous
codebase.

Concrete examples of words that are **legitimately polysemous** across
contexts (taken from ADR-0005 Context section):

- "Session" in `SessionIsolation` (HTTP MCP transport session) vs. "session"
  in `SessionManifest` (local hook session keyed by
  `~/.evokore/sessions/{sessionId}.jsonl`).
- "Tool" in `SkillManager`/`ToolCatalogIndex` (an MCP tool surfaced via
  `tools/list`) vs. "tool" in webhook redaction logic (invocation arguments).
- "Resource" in MCP Resources, "resource" in `ClaimsManager`, and
  "resource" in `OAuthProvider` JWT audience claims.

Each of those words has a stable, correct meaning **inside its context**. A
repo-wide glossary would have to either pick one and break the others, or
list all three and gain no resolving power. The fix is the multi-context
layout this section mandates.

The `validate-context-and-adrs.js` script (see Composition below) refuses to
pass if a `CONTEXT.md` is found at the repo root or if a context-scoped
`CONTEXT.md` references a context name that is not present in ADR-0005.

---

## Composition

This Phase 1 section participates in the following skill chains. Phrasing is
kept literal so the static skill composition graph
(`scripts/derive-skill-composition.js`) picks the edges up.

### Invokes (downstream)

- For per-context glossary refresh: invoke `ubiquitous-language skill` once
  per affected bounded context.
- For two-pass ADR ratification: invoke `panel-of-experts skill` against the
  `Proposed` ADR file.
- For evidence linkage on the `## Citations` block of `CONTEXT.md`: invoke
  `session-replay skill` and consult evidence-capture JSONL output.

### Invoked by (upstream)

- AEP cycle entry: the `aep-framework skill` calls into this Phase 1 section
  during the Align phase.
- Architecture sweeps: invoke this section whenever
  `improve-codebase-architecture skill` (when present) flags a
  cross-context concern.

### Validation

- Run `node scripts/validate-context-and-adrs.js` before merging any PR that
  modifies `docs/adr/**` or `docs/contexts/**`. The script asserts ADR Status
  / Date wiring and CONTEXT.md ↔ ADR-0005 alignment.
- A `vitest` integration wrapper at
  `tests/integration/context-and-adrs-validation.test.ts` runs the validator
  in CI.
