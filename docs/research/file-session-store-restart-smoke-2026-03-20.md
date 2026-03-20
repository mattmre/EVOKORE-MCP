# FileSessionStore Restart Smoke

Date: 2026-03-20
Branch: `fix/file-session-store-restart-smoke-20260320`

## Goal

Add a small operator-facing evidence slice proving that persisted session state survives across a fresh `FileSessionStore` plus fresh `SessionIsolation` boundary.

## Scope

- Add one restart smoke to `tests/integration/session-store.test.ts`
- Validate persistence of:
  - `activatedTools`
  - `role`
  - `metadata`
  - `rateLimitCounters`
- Keep the slice at the storage/isolation layer only

## Non-Goals

- No HTTP transport changes
- No `mcp-session-id` reattachment after process restart
- No runtime wiring of `loadSession()` into `HttpServer`
- No session-log or tracker updates in the feature branch

## Why This Slice

`FileSessionStore` already supports persistence, and `SessionIsolation` already exposes `persistSession()` and `loadSession()`. The missing evidence was a true fresh-instance smoke that matches the operator expectation of "persist state, start a new process boundary, then reload it."

This note intentionally does not claim runtime HTTP restart recovery. Today, an unknown HTTP session still returns `404` after restart because transport/session reattachment is not implemented in runtime request handling.

## Test Added

The new smoke test:

1. Creates a session through `SessionIsolation` backed by `FileSessionStore`
2. Mutates tool activation, role, metadata, and rate-limit counters
3. Persists that session
4. Creates a brand-new `FileSessionStore` and brand-new `SessionIsolation` pointed at the same directory
5. Calls `loadSession()` and verifies the persisted state survives the fresh boundary

## Validation Commands

```powershell
npm run build
npx vitest run tests/integration/session-store.test.ts
npm run docs:check
```

## Result

- Restart smoke added at the storage/isolation layer
- No runtime behavior changed
- Evidence now clearly distinguishes persisted-store recovery from HTTP session reattachment
