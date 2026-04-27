# Architecture Decision Records (ADRs)

This directory holds the architectural decision records for EVOKORE-MCP.
Each ADR captures a single architecturally-significant decision, its
context, the alternatives considered, and the consequences.

ADR identifiers are sequential and **never reused**. A superseded ADR is
kept in place; its successor links back via the `Supersedes:` header.

For shorter, lower-stakes records (sprint-scoped fixes, blocker resolutions,
operational call-its) see [`../decisions/`](../decisions/).

## Index

- [ADR 0001 — Session Manifest Append-Only JSONL](0001-session-manifest-jsonl.md) — replaces the read-modify-write JSON manifest with an append-only JSONL log so concurrent hook processes cannot clobber each other.
- [ADR 0002 — Webhook Envelope v1 Contract](0002-webhook-envelope-v1.md) — freezes the `WebhookManager` payload shape and HMAC signing scheme as a versioned contract for external subscribers.
- [ADR 0003 — Tenant Directory Layout](0003-tenant-directory-layout.md) — adopts an opt-in `~/.evokore/tenants/{tenantId}/` layout for per-tenant filesystem isolation under HTTP / OAuth deployments.
- [ADR 0004 — Vector Memory Trigger Gate](0004-vector-memory-trigger.md) — gates the introduction of vector / embedding-based skill search behind a measurable corpus-size + latency dual trigger.
- [ADR 0005 — Bounded Contexts of EVOKORE-MCP](0005-bounded-contexts.md) — names the eight bounded contexts of the MCP server and their context-map relationships, before any glossary or repo-wide architecture work ships.

## Authoring

New ADRs should:

1. Use the next free integer (current next: `0006`).
2. Follow the section structure used by the existing ADRs: **Status / Date / Deciders**, **Context**, **Decision**, **Consequences**, **Alternatives Considered**, **References**.
3. Mark `Status: Accepted` once the corresponding code or policy is in place; `Proposed` while still under review; `Superseded by ADR-XXXX` once replaced.
4. Add an entry to this index in the same PR.
