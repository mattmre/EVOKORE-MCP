# ADR 0004: Vector Memory Trigger Gate

**Status:** Accepted
**Date:** 2026-04-15
**Deciders:** Wave 7 planning synthesis
**Supersedes:** None (new architectural gate)

---

## Context

EVOKORE-MCP currently resolves workflows and skills through a Fuse.js-based lexical
search layered on top of the `SkillManager` index. The merged skill corpus is ~336
skills/files after recursive indexing (see `CLAUDE.md` "Skill Indexing"), and
`resolve_workflow` enriches lexical matches with aliases, semantic hints, and a
reranking pass (see `CLAUDE.md` "Semantic Resolution").

Adding a vector-memory / embedding-based semantic search layer is frequently proposed
as a next step. However, embeddings carry non-trivial operational cost:

- Embedding API calls (if using a hosted provider) spend real credits per skill and
  per query, and require managing a provider key + rate limits.
- Local embedding models (e.g., via `transformers.js`) pull multi-hundred-megabyte
  model weights and add cold-start latency.
- Maintaining an on-disk vector index adds a new persistence surface that must be
  kept in sync with skill adds/removes and schema migrations.
- Operator complexity grows: new env vars, new failure modes, new validation.

At the current corpus size (~336 entries) and current lexical-search performance,
the incremental value of vector search is unproven. Premature optimization here
would pay cost today for value that may never materialize.

---

## Decision

Gate the introduction of vector memory / embedding-based semantic search behind
a **dual trigger** that must be satisfied simultaneously:

1. **Corpus size trigger:** skill corpus ≥ **500 entries** (measured as the final
   `SkillManager.loadSkills()` count after recursive indexing).
2. **Latency trigger:** `resolve_workflow` p50 latency > **200 ms** over the last
   **1,000 calls** (measured from `TelemetryManager` `recordToolCall` data).

Until both conditions are met, lexical + alias + reranking search (the current
implementation) is the default and only search path. Vector memory work remains
design-only.

### Implementation

When the gate triggers, `scripts/check-vector-trigger.js` (to be built at that point)
will:

- Read `SkillManager` corpus count via a lightweight entry-count helper.
- Read `resolve_workflow` call latencies from `TelemetryManager.recordToolCall`
  history (or the on-disk telemetry export if live state is unavailable).
- Compute p50 over the last 1,000 calls.
- Emit a structured JSON result: `{ triggered: boolean, corpusSize: number, p50Ms: number, thresholds: {...} }`.

Until then, the script is intentionally not written. Adding a placeholder that
"does nothing" would itself be premature. The trigger lives in this ADR and in
the follow-up session log entry until the gate fires.

### Measurement windows

- Corpus size is checked at server boot and again on `refresh_skills`.
- Latency is a rolling window over the most recent 1,000 `resolve_workflow`
  invocations. Fewer than 1,000 historical calls → gate is considered
  **not triggered** (insufficient signal).

---

## Consequences

**Positive:**
- No premature optimization cost. Embedding infrastructure, provider keys, and
  index persistence are deferred until both size and latency say they are needed.
- Current lexical pipeline is fast and well-understood. Session startup stays
  sub-second on the current corpus.
- A concrete, measurable gate replaces vibes-based "should we add vectors?"
  debates. The answer is a number comparison.

**Negative / accepted trade-offs:**
- Semantic search (paraphrase, synonym handling beyond the current alias list)
  is not available until the gate fires. Users who would benefit from "find me
  the skill about X" where X is only semantically related to indexed terms will
  have to lean on aliases and hints.
- If the corpus stays small forever (e.g., organization never grows past 336
  entries) but latency degrades for unrelated reasons (slow disk, fragmented
  index), the gate will not trigger and operators will need to intervene
  manually.
- Thresholds (500 entries, 200 ms p50, 1000-call window) are judgment calls,
  not derived from a formal cost model. They can be revised in a later ADR if
  empirical data contradicts them.

---

## Alternatives Considered

| Option | Verdict | Rationale |
|--------|---------|-----------|
| Always-on vector memory from Wave 7 | Rejected | Cost before proven value; no operator pain currently justifies the infra |
| Time-based trigger ("ship vectors in 90 days") | Rejected | Calendar is a flawed proxy for actual need; corpus and latency are the real signals |
| Corpus size alone | Rejected | Large corpus with fast lexical resolution does not need embeddings |
| Latency alone | Rejected | Slow lexical on a small corpus means fixing the lexical implementation, not adding a new layer |
| Operator-flag-based trigger | Rejected | "Opt-in" feature flags become dead code if nobody turns them on; measurable gates force a decision |

---

## References

- `src/SkillManager.ts` — `loadSkills()` recursive indexer (corpus size source)
- `src/TelemetryManager.ts` — `recordToolCall()` (latency measurement source)
- `next-session.md` lines 107-113 — original vector-memory trigger proposal
- `CLAUDE.md` "Skill Indexing" and "Semantic Resolution" — current search stack
- `scripts/check-vector-trigger.js` — to be created when the gate triggers
