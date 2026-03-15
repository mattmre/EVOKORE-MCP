# SessionIsolation-HttpServer Wiring Architecture

**Date:** 2026-03-15
**Status:** Implemented
**Depends on:** T30 (Multi-Tenant Session Isolation), T26 (StreamableHTTP Server Transport)

## Problem Statement

Prior to this change, EVOKORE-MCP had two independent session tracking systems:

1. **`SessionIsolation`** (`src/SessionIsolation.ts`) -- a purpose-built module for
   per-session state with TTL, activated tools, RBAC role, rate limit counters, and
   metadata. Introduced in T30.
2. **`activatedToolSessionsBySession`** (`src/index.ts`) -- a parallel `Map` of
   `ActivatedToolSessionState` objects with hand-rolled TTL pruning and LRU eviction.
   This was the original per-session tool activation tracking.

Neither module referenced the other:
- `HttpServer` did not create `SessionIsolation` sessions when transports connected.
- `index.ts` did not use `SessionIsolation` for tool activation state.
- Both had independent TTL logic and eviction strategies.

This duplication violated the single-source-of-truth principle and meant that
session lifecycle events (creation, destruction, expiry) were not synchronized
between the HTTP transport layer and the tool activation layer.

## Integration Architecture

### HttpServer <-> SessionIsolation

`HttpServer` now accepts an optional `SessionIsolation` instance via its options:

```typescript
interface HttpServerOptions {
  port?: number;
  host?: string;
  sessionIsolation?: SessionIsolation;
}
```

Lifecycle hooks:
- **`onsessioninitialized`**: Calls `sessionIsolation.createSession(newSessionId)`
  immediately after the transport assigns a session ID.
- **`transport.onclose`**: Calls `sessionIsolation.destroySession(sid)` when the
  transport closes, ensuring session state is cleaned up immediately.
- **`stop()`**: Iterates all transport session IDs and calls `destroySession` for
  each before closing transports, ensuring no leaked sessions on server shutdown.

A cleanup interval runs every 60 seconds calling `sessionIsolation.cleanExpired()`
to sweep sessions whose TTL has elapsed but whose transport never formally closed
(e.g., network disconnects). The interval is `unref()`-ed so it does not prevent
Node.js process exit.

### index.ts <-> SessionIsolation

`EvokoreMCPServer` now owns a `SessionIsolation` instance:

```typescript
private sessionIsolation: SessionIsolation;
```

The old `activatedToolSessionsBySession` Map, `ActivatedToolSessionState` type,
`MAX_ACTIVATED_TOOL_SESSIONS`, and `ACTIVATED_TOOL_SESSION_TTL_MS` constants are
removed. The old `getActivatedToolSession()`, `pruneActivatedToolSessions()`, and
`isSessionStateStale()` methods are removed.

The new `getActivatedTools(extra)` method:
1. Resolves the session ID from the request extra (defaulting to `DEFAULT_SESSION_ID`).
2. Calls `sessionIsolation.getSession(sessionId)`.
3. If no session exists (first access or expired), creates one via `createSession()`.
4. Returns `session.activatedTools`.

For stdio mode, `run()` pre-creates the default session before connecting the transport.

For HTTP mode, `runHttp()` passes `{ sessionIsolation: this.sessionIsolation }` to
the `HttpServer` constructor, so the same instance is shared.

## Why the Duplicate Tracking Was Removed

The old `activatedToolSessionsBySession` Map reimplemented functionality that
`SessionIsolation` already provides:

| Feature | Old Map | SessionIsolation |
|---------|---------|------------------|
| Per-session tool sets | `tools: Set<string>` | `activatedTools: Set<string>` |
| TTL-based expiry | `lastTouchedAt` + manual check | `lastAccessedAt` + `isExpired()` |
| LRU eviction | `pruneActivatedToolSessions()` | `evictIfAtCapacity()` |
| Max session cap | `MAX_ACTIVATED_TOOL_SESSIONS = 100` | `maxSessions` option (default 100) |
| Session creation | Implicit on first access | Explicit `createSession()` |
| Session destruction | Implicit via pruning | Explicit `destroySession()` |

The old system also lacked RBAC role isolation, rate limit counter isolation, and
metadata -- all of which `SessionIsolation` provides. Keeping both would mean
divergent state for the same logical session.

## Cleanup Timer Strategy

The 60-second cleanup interval in HttpServer:
- Catches sessions that expired via TTL but were never formally closed (network drops).
- Runs `cleanExpired()` which iterates all sessions and removes expired ones.
- Is `unref()`-ed so it does not keep the Node.js process alive.
- Is cleared in `stop()` to prevent leaks.
- Is only created when a `SessionIsolation` instance is provided (no-op for tests
  that create HttpServer without session isolation).

## LRU Eviction Addition

`SessionIsolation.createSession()` now enforces a `maxSessions` cap (default 100,
matching the old `MAX_ACTIVATED_TOOL_SESSIONS`). When at capacity:

1. First, `cleanExpired()` runs to remove any already-expired sessions.
2. If still at capacity, the session with the oldest `lastAccessedAt` is evicted.

This is a simpler and more correct eviction strategy than the old approach, which
ran both TTL pruning and overflow eviction as separate passes with a reserved-session
exemption. The SessionIsolation approach is cleaner because the caller (HttpServer or
index.ts) manages session creation and destruction explicitly at lifecycle boundaries.

## Modified Files

- `src/SessionIsolation.ts` -- Added `maxSessions` option and LRU eviction
- `src/HttpServer.ts` -- Accepts and uses `SessionIsolation`, cleanup interval
- `src/index.ts` -- Replaced `activatedToolSessionsBySession` with `SessionIsolation`
- `tests/integration/session-isolation-httpserver-wiring.test.ts` -- Integration tests
- `tests/integration/http-server-transport.test.ts` -- Updated constructor assertion
