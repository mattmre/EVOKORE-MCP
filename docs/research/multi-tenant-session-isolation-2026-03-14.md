# Multi-Tenant Session Isolation Architecture

**Date:** 2026-03-14
**Status:** Implemented (initial in-memory version)
**Task:** T30

## Problem Statement

When EVOKORE-MCP runs in HTTP mode (via `StreamableHTTPServerTransport`), multiple
clients can connect concurrently. Without session isolation, all clients share the
same activated tool sets, RBAC role, rate limit counters, and any other per-session
state. This means:

- **Tool activation leakage:** Client A's `discover_tools` call activates tools
  that Client B then sees in their `tools/list` response.
- **Permission confusion:** If the server role is changed for one client, it
  affects all clients.
- **Rate limit bypass:** Per-tool rate limit counters are shared, allowing a
  multi-client attack to exhaust or share quotas in unintended ways.

## Session Lifecycle

### 1. Session Creation

Each HTTP connection is assigned a unique session ID by the
`StreamableHTTPServerTransport` (via `randomUUID()`). When the `HttpServer`
receives a new connection without an `mcp-session-id` header, it creates a new
transport instance. The `SessionIsolation` manager creates corresponding session
state at this point.

### 2. Active Session

During the session lifetime:
- **Activated tools** are scoped to the session. `discover_tools` calls only
  modify the calling session's tool projection.
- **Role** can be set per-session, independent of the server-wide default.
- **Rate limit counters** track per-tool token buckets isolated to this session.
- **Custom metadata** allows integrations to attach arbitrary key-value pairs.

Every access to the session refreshes `lastAccessedAt`, extending the TTL window.

### 3. Session Expiry

Sessions expire after a configurable TTL (default: 1 hour, configurable via
`EVOKORE_SESSION_TTL_MS` environment variable). Expired sessions are cleaned up:
- **Lazily:** When `getSession()` encounters an expired session, it is removed.
- **Eagerly:** The `cleanExpired()` method removes all expired sessions at once.
- **During listing:** `listSessions()` prunes expired sessions as a side effect.

### 4. Session Destruction

Explicit destruction via `destroySession()` immediately removes all session state.
This is called when an HTTP transport closes (via the `onclose` callback).

## Security Boundaries Between Tenants

### Tool Activation Isolation
Each session maintains its own `activatedTools` set. When dynamic tool discovery
mode is active, `discover_tools` calls only modify the calling session's set.
Other sessions' tool projections are unaffected.

### RBAC Role Isolation
Each session can have its own RBAC role (`role` field in `SessionState`). This
allows the same server instance to serve an admin client and a read-only client
simultaneously. If no session-specific role is set, the server-wide default
(from `EVOKORE_ROLE` env var or `permissions.yml`) applies.

### Rate Limit Isolation
Per-tool rate limit counters are stored per-session in `rateLimitCounters`. This
prevents one client from exhausting another client's rate limit quota. The token
bucket algorithm operates independently for each session.

### Metadata Isolation
The `metadata` map allows integrations (hooks, dashboards, audit logs) to attach
session-scoped data without cross-contamination.

### Boundaries NOT Covered (Current Scope)
- **Proxy connections** to child servers are still shared. All sessions route
  through the same `ProxyManager` instances and child server connections.
- **Skill index** is shared and read-only from the session perspective.
- **Security rules** (`permissions.yml`) are loaded once at server startup and
  shared across all sessions.

## Data Structures

```typescript
interface SessionState {
  sessionId: string;
  createdAt: number;
  lastAccessedAt: number;
  activatedTools: Set<string>;
  role: string | null;
  rateLimitCounters: Map<string, { tokens: number; lastRefillAt: number }>;
  metadata: Map<string, unknown>;
}
```

All state is stored in a single `Map<string, SessionState>` keyed by session ID.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `EVOKORE_SESSION_TTL_MS` | `3600000` (1 hour) | Time-to-live for idle sessions |

## Future Persistence Options

The current implementation is in-memory only. If persistence is needed for
server restarts or horizontal scaling, the following options should be evaluated:

### Redis
- **Pros:** Fast, supports TTL natively, widely deployed, supports pub/sub for
  invalidation across instances.
- **Cons:** External dependency, requires serialization of `Set` and `Map` types.
- **Fit:** Best for multi-instance deployments behind a load balancer.

### SQLite
- **Pros:** Zero external dependencies (embedded), durable, supports complex
  queries for session analytics.
- **Cons:** Single-writer limitation, serialization overhead, no native TTL.
- **Fit:** Best for single-instance deployments that need crash recovery.

### File-Based (JSON)
- **Pros:** Simplest implementation, no dependencies.
- **Cons:** Poor performance at scale, no atomic operations, no TTL support.
- **Fit:** Development/testing only.

### Recommendation
For the first persistence iteration, SQLite is recommended because it aligns with
EVOKORE's zero-external-dependency philosophy and supports the single-server
deployment model. Redis should be considered if multi-instance scaling becomes a
requirement.

## Integration Points

The `SessionIsolation` module is designed to integrate with:

1. **`HttpServer`** — Creates/destroys sessions on transport connect/close.
2. **`index.ts` (EvokoreMCPServer)** — Passes session context to tool handlers
   for scoped tool activation and permission checks.
3. **`SecurityManager`** — Per-session role overrides.
4. **Rate limiting** — Per-session token bucket counters.
5. **Session Dashboard** — `listSessions()` for admin visibility.

## Related Files

- `src/SessionIsolation.ts` — Implementation
- `src/HttpServer.ts` — HTTP transport that creates session IDs
- `src/index.ts` — Server that manages per-session tool activation
- `src/SecurityManager.ts` — RBAC permission checks
- `tests/integration/session-isolation.test.ts` — Test suite
