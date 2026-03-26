# Session Contract - M1.1 (2026-03-26)

## Overview

This document defines the session lifecycle, persistence guarantees, and boundary conditions for EVOKORE-MCP HTTP transport sessions as implemented in M1.1.

## Session Lifecycle

### 1. Session Creation

A new session is created when a client sends a `POST /mcp` request without an `mcp-session-id` header.

1. `HttpServer` creates a `StreamableHTTPServerTransport` with a UUID session ID.
2. On `onsessioninitialized`, the transport is stored in `this.transports`.
3. `SessionIsolation.createSession(id, role)` creates in-memory state.
4. `FileSessionStore.set(id, state)` persists to disk (fire-and-forget).

### 2. Session Access

Subsequent requests include the `mcp-session-id` header:

1. `HttpServer.handleMcpRequest()` looks up the session ID in `this.transports`.
2. If found, the request is routed to the existing transport.
3. `SessionIsolation.getSession(id)` touches `lastAccessedAt` on each access.

### 3. Session Reattachment (after restart)

If the server restarts and a client sends a request with a previously-valid `mcp-session-id`:

1. `this.transports.has(sessionId)` returns `false` (in-memory map is empty after restart).
2. `SessionIsolation.loadSession(sessionId)` is called to check the persistent store.
3. If found and not expired: a new `StreamableHTTPServerTransport` is created, bound to the same session ID via `sessionIdGenerator: () => sessionId`.
4. The MCP server connects to the new transport.
5. The transport is registered in `this.transports`.
6. A `session_resumed` webhook event is emitted.
7. The request is handled by the new transport.
8. If not found or expired: the server returns `404 Session not found`.

### 4. Session Expiry

Sessions expire after `EVOKORE_SESSION_TTL_MS` milliseconds (default: 1 hour) of inactivity:

- `lastAccessedAt` is updated on each `getSession()` call.
- `loadSession()` checks TTL and deletes expired entries from the store.
- `cleanExpired()` runs every 60 seconds to remove expired in-memory sessions.
- Orphaned transports for expired sessions are also closed during cleanup.

### 5. Session Destruction

Sessions are explicitly destroyed on:

- Transport close event (client disconnect).
- Server shutdown (all sessions are destroyed before transport close).
- LRU eviction when the session count exceeds `maxSessions` (default: 100).

## Persistence Points

Session state is persisted to the backing store at three points:

1. **On creation** -- `createSession()` fires a fire-and-forget `store.set()`.
2. **On mutation** -- `persistSession()` is called after tool activation state changes (e.g., after `discover_tools` activates proxied tools).
3. **Periodic checkpoint** -- Every 30 seconds, all active sessions are persisted via a periodic interval in `HttpServer`.

## Persisted State (Session Contract)

The following fields are part of the session contract and are guaranteed to survive a server restart:

```typescript
interface PersistedSessionState {
  sessionId: string;
  createdAt: number;
  lastAccessedAt: number;
  activatedTools: string[];    // Set<string> serialized as array
  role: string | null;
  rateLimitCounters: Record<string, { tokens: number; lastRefillAt: number }>;
  metadata: Record<string, unknown>;
}
```

## NOT Part of the Session Contract

The following are explicitly NOT preserved across restarts:

- **`StreamableHTTPServerTransport` instance** -- SSE connections are non-persistent. The transport is recreated on reattachment.
- **In-flight SSE event streams** -- Active SSE connections are lost on restart. The client must reconnect.
- **Pending tool call responses** -- Any tool calls in progress at the time of shutdown are lost.
- **MCP Server connection state** -- The `Server.connect()` binding is re-established on reattachment, not restored.

The contract guarantees that session *identity and state* survive, not the transport connection itself. Clients must re-establish their SSE connection after a restart.

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `EVOKORE_SESSION_STORE` | `file` (HTTP mode) | Session store backend. Set to `memory` to opt out of file persistence. |
| `EVOKORE_SESSION_TTL_MS` | `3600000` (1 hour) | Session time-to-live in milliseconds. |
| `EVOKORE_HTTP_MODE` | `false` | Enable HTTP transport mode (also settable via `--http` flag). |

## Store Backends

| Backend | When Used | Persistence |
|---------|-----------|-------------|
| `MemorySessionStore` | stdio mode, or `EVOKORE_SESSION_STORE=memory` | None (in-memory only) |
| `FileSessionStore` | HTTP mode (default) | `~/.evokore/session-store/{sessionId}.json` |

## Limitations

1. **Single-node only** -- `FileSessionStore` writes to the local filesystem. Multi-node deployments require a shared store (e.g., Redis, planned for M3).
2. **No SSE recovery** -- Reattachment creates a new transport. The client must re-establish SSE streaming.
3. **No cross-identity-plane unification** -- Hook-side sessions (`~/.evokore/sessions/`) and HTTP transport sessions (`~/.evokore/session-store/`) remain separate. They use different schemas, lifecycles, and identity semantics.
4. **Atomic write safety** -- `FileSessionStore` uses write-then-rename for atomicity, but a crash during the write window could lose the last persist.
