# ADR 0003: Tenant Directory Layout

**Status:** Accepted  
**Date:** 2026-04-14  
**Deciders:** 4-round successive expert panel (RuFlo assimilation R4 synthesis)  
**Implements:** Phase 1-B (`feat/tenant-path-scoping`) — not yet in production code

---

## Context

EVOKORE-MCP v3.0 introduced OAuth/JWKS authentication, `SessionIsolation` per-connection
state, RBAC roles, and HTTP transport. These are platform primitives, not single-operator
features. The `SessionIsolation` class assigns each HTTP connection a `sessionId` and
stores state at:

```
~/.evokore/sessions/{sessionId}.json
~/.evokore/sessions/{sessionId}-replay.jsonl
~/.evokore/sessions/{sessionId}-evidence.jsonl
~/.evokore/sessions/{sessionId}-tasks.json
```

All sessions from all tenants co-mingle in a single flat `sessions/` directory. This
creates two active risks:

1. **Isolation failure:** A bug in sessionId generation or routing could expose one
   tenant's session artifacts to another.
2. **Audit complexity:** Operator compliance requirements (SOC 2, GDPR) expect per-tenant
   audit trails. Extracting a single tenant's data from a flat directory requires
   filtering by session metadata, not filesystem path.

The RuFlo assimilation panel identified "single-operator as dismissal" as a category
error: EVOKORE's own codebase contradicts the single-operator assumption. Once
OAuth/RBAC/HTTP transport are committed, tenant path scoping is a correctness issue, not
an optimization.

---

## Decision

Adopt the following canonical directory layout for tenant-scoped deployments:

```
~/.evokore/
  sessions/                          # Legacy flat layout (retained for compat)
    {sessionId}.jsonl
    ...
  tenants/
    {tenantId}/
      sessions/
        {sessionId}.jsonl
        {sessionId}-replay.jsonl
        {sessionId}-evidence.jsonl
        {sessionId}-tasks.json
      claims/
        {sha1(resource)}.lock        # ClaimsManager sentinel files
      workers/
        dead-letter.jsonl            # WorkerManager DLQ
```

### Activation

Tenant path scoping is gated behind the `EVOKORE_TENANT_SCOPING=true` environment
variable. When unset (default), `SessionIsolation` resolves paths using the existing
flat `~/.evokore/sessions/` layout. Existing single-operator deployments are unaffected.

### Implementation shim

`src/SessionIsolation.ts` gains a `resolveTenantSessionDir(tenantId?: string)` method:

```ts
resolveTenantSessionDir(tenantId?: string): string {
  if (!tenantId || process.env.EVOKORE_TENANT_SCOPING !== 'true') {
    return path.join(homedir(), '.evokore', 'sessions');
  }
  return path.join(homedir(), '.evokore', 'tenants', tenantId, 'sessions');
}
```

`tenantId` is sourced from the OAuth JWT `sub` claim (normalized: alphanumeric + `-`
only, max 64 chars, SHA-256 hashed if exceeding limit) once `OAuthProvider` validates
the token. It falls back to `'default'` for non-OAuth connections when tenant scoping
is enabled.

### Directory creation

All session path resolvers call `fs.mkdirSync(dir, { recursive: true })` before writing.
This is idempotent and safe on all platforms.

---

## Consequences

**Positive:**
- Per-tenant filesystem isolation: a bug in session routing cannot expose cross-tenant
  data at the filesystem level.
- Clean audit export: `ls ~/.evokore/tenants/{tenantId}/` gives the full artifact set
  for one tenant.
- `ClaimsManager` sentinel files are scoped per-tenant, preventing cross-tenant lock
  contention.
- Opt-in flag means zero risk to existing deployments.

**Negative / accepted trade-offs:**
- `EVOKORE_TENANT_SCOPING=true` must be added to `.env.example` and documented.
- Operators who enable tenant scoping mid-deployment must manually migrate existing
  flat-layout session files or accept a clean break.
- `tenantId` normalization adds a code path that must be tested on macOS, Linux, and
  Windows (path separator + filesystem character restrictions).

---

## Alternatives Considered

| Option | Verdict | Rationale |
|--------|---------|-----------|
| Flat layout forever | Rejected | Isolation failure risk grows with number of tenants; audit path is manual |
| SQLite per-tenant DB | Rejected | Native binary dep; overkill for session artifact tracking |
| Tenant prefix in sessionId | Rejected | Does not provide filesystem-level isolation; audit extraction still requires filtering |
| Mandatory (not opt-in) | Deferred | Too disruptive for existing deployments; revisit after 2 release cycles |

---

## References

- `docs/research/ruflo-assimilation-final-2026-04-14.md` — Decision D5 (tenant layout), Phase 1-B
- `src/SessionIsolation.ts` — to be updated in `feat/tenant-path-scoping` (Phase 1-B)
- `src/ClaimsManager.ts` — to be created in `feat/claims-manager` (Phase 1-A); uses tenant claims dir
- `src/auth/OAuthProvider.ts` — JWT `sub` claim sourced here
- `.env.example` — `EVOKORE_TENANT_SCOPING` must be added in the Phase 1-B PR
