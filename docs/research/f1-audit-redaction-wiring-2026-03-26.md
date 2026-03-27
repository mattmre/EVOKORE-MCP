# F1 Audit Redaction Wiring — 2026-03-26

## Objective

Close post-M2 finding F1 by ensuring `redactForAudit()` is applied on the real
audit log write path, not just exported and unit-tested in isolation.

## Current Call Site Inventory

All current `auditLog.log()` call sites in `src/`:

- `src/index.ts`
  - `tool_call` success with metadata `{ source, latencyMs }`
  - `tool_call` failure with metadata `{ source, error }`
  - `session_create` (stdio) with metadata `{ transport }`
  - `session_create` (http bootstrap) with metadata `{ transport, host, port }`
- `src/HttpServer.ts`
  - `auth_failure` (WebSocket auth) with metadata `{ path, error }`
  - `auth_failure` (HTTP auth) with metadata `{ path, error }`
  - `auth_success` with metadata `{ path }`
  - `session_create` (per-HTTP session) with metadata `{ transport }`
  - `session_expire` and `session_resume` currently do not include metadata

## Decision

Use a centralized code fix in `AuditLog.write()` rather than patching each call
site individually.

Rationale:

- It satisfies F1 for all current metadata-bearing writes.
- It also protects future direct `write()` usage, not just current `log()` call
  sites.
- It keeps the fix small and reduces drift risk across `src/index.ts` and
  `src/HttpServer.ts`.

## Risk Notes

- Current metadata call sites are mostly low-risk, but they are not
  demonstrably "known-safe" enough to justify documentation-only closure.
- In particular, auth logging in `HttpServer` records the raw request `url`,
  which can include query strings. Centralized metadata redaction is therefore
  the safer closure path than asserting the current sites are permanently safe.
- `redactForAudit()` is shallow and key-based. It does not scrub secrets
  embedded inside arbitrary strings. That is acceptable for F1 closure, but the
  lower-priority F3 consolidation follow-up remains valid.

## Validation Plan

- Keep the existing helper-level unit test for `redactForAudit()`.
- Add a runtime-facing test proving `AuditLog.log()` persists redacted metadata
  to disk.
- No historical ARCH-AEP artifact rewrite is required; this document records
  the closure decision for the follow-up PR.
