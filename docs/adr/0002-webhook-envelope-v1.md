# ADR 0002: Webhook Envelope v1 Contract

**Status:** Accepted  
**Date:** 2026-04-14  
**Deciders:** 4-round successive expert panel (RuFlo assimilation R4 synthesis)  
**Related:** `docs/WEBHOOK_ENVELOPE_V1.md` (full schema spec)

---

## Context

`src/WebhookManager.ts` dispatches HMAC-SHA256 signed event payloads to HTTP subscriber
endpoints. The payload shape (`WebhookPayload`) evolved organically during PR #221 and
was never formally frozen as a versioned contract. The current implementation sends:

```json
{
  "id": "<uuid>",
  "timestamp": "<ISO8601>",
  "event": "<event_type>",
  "data": { ... }
}
```

With the HTTP signature header:

```
X-EVOKORE-Signature: <hmac-sha256-hex>
```

And an optional replay-protection header:

```
X-EVOKORE-Timestamp: <unix-epoch-ms>
```

As EVOKORE moves toward multi-operator deployments (OAuth/JWKS, SessionIsolation,
tenant scoping), external subscribers — CI pipelines, audit sinks, dashboard backends —
will begin depending on this shape. Changing the envelope after subscribers exist is a
breaking change that is difficult to coordinate across operator environments.

The RuFlo assimilation analysis identified 70+ ADRs in the ruvnet/ruflo codebase as a
key reason for its architectural stability. EVOKORE has none. The webhook envelope is the
highest-value contract to freeze first because:

1. It is the primary integration surface for operators extending EVOKORE
2. It already exists in production code (`WebhookManager.ts`)
3. Subscribers have no version signal to detect a schema change

---

## Decision

Freeze the current `WebhookPayload` shape as **Envelope v1** and document it as a
stable, versioned contract in `docs/WEBHOOK_ENVELOPE_V1.md`.

### Envelope v1 fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` (UUIDv4) | Yes | Globally unique delivery ID |
| `timestamp` | `string` (ISO 8601 UTC) | Yes | Event emission time |
| `event` | `WebhookEventType` | Yes | One of 10 defined event types |
| `data` | `object` | Yes | Event-specific payload (see per-event schemas) |

### Versioning policy

- The `id`, `timestamp`, `event`, and `data` top-level fields are **frozen** in v1.
- New **optional** fields may be added to the envelope without a version bump
  (additive extension).
- Removing a field, changing a field's type, or changing the signing scheme requires
  bumping to v2 and a deprecation window of ≥90 days.
- A future `envelopeVersion` field will appear on v2+ envelopes; its absence means v1.

### Security contract

- HMAC is computed as `HMAC-SHA256(secret, "${timestamp_ms}.${json_body}")` when the
  webhook config includes a `secret`. Delivered in `X-EVOKORE-Signature`.
- Timestamp replay window: ±5 minutes. Deliveries outside this window must be rejected
  by subscribers.
- Sensitive fields in `data` (keys matching: `token`, `secret`, `password`, `key`,
  `credential`) are redacted to `"[REDACTED]"` before signing and delivery.

---

## Consequences

**Positive:**
- Operators can build subscribers today with a stable target shape.
- Versioning path is established before the subscriber ecosystem grows.
- Security contract (HMAC + replay protection) is explicit and documented in one place.

**Negative / accepted trade-offs:**
- Freezing v1 before a schema review means minor improvements (e.g., adding a
  `tenantId` top-level field) would require an additive extension or v2 bump.
  Accepted: the alternative (no contract) is strictly worse.

---

## Alternatives Considered

| Option | Verdict | Rationale |
|--------|---------|-----------|
| No formal contract; evolve ad hoc | Rejected | Breaks subscribers silently; no version signal |
| CloudEvents spec envelope | Deferred | CloudEvents adds `specversion`, `source`, `type` — valid future target for v2; premature to mandate now |
| JSON Schema file as primary spec | Accepted as supplement | `WEBHOOK_ENVELOPE_V1.md` is primary; a `.json` schema may be added as tooling aid in a later PR |

---

## References

- `docs/WEBHOOK_ENVELOPE_V1.md` (full schema and per-event payload docs)
- `src/WebhookManager.ts` — `WebhookPayload` interface, `computeSignature()`, `verifySignature()`
- `docs/research/ruflo-assimilation-final-2026-04-14.md` — D2 (ClaimsManager) references webhook infrastructure
- PR #221 — Original WebhookManager implementation
