# ARCH-AEP: M1 — Runtime Continuity Platform

## Architectural Question

**Can a session survive and be resumed correctly?**

Today the answer is no. `SessionIsolation.loadSession()` exists and is unit-tested with `FileSessionStore`, but it is not wired into any runtime path. After an HTTP server restart, a client presenting a previously-valid `mcp-session-id` header receives a `404 Session not found` response. The existing test suite documents this gap explicitly (section 9 of `file-session-store-validation.test.ts`: "HTTP mcp-session-id reattachment NOT implemented").

M1 will make the answer yes, under well-defined conditions.

## Current State Analysis

### Session Identity Models in Use

The system currently has **two independent session identity models** that do not communicate:

| Surface | Identity Mechanism | State Location | Persisted? |
|---|---|---|---|
| **HTTP transport** (`HttpServer.ts`) | UUID from `StreamableHTTPServerTransport.sessionIdGenerator` | In-memory `Map<string, StreamableHTTPServerTransport>` + `SessionIsolation` in-memory Map | No (MemorySessionStore) |
| **Claude Code hooks** (purpose-gate, session-replay, evidence-capture, tilldone) | `payload.session_id` from Claude Code runtime | `~/.evokore/sessions/{sessionId}.json` + sibling JSONL/JSON files | Yes (filesystem) |

Additionally:
- The **dashboard** reads from `~/.evokore/sessions/` directly, listing `.json` manifest files
- The **auto-memory sync** finds the latest session manifest by scanning `~/.evokore/sessions/*.json` and matching by `canonicalRepoRoot`
- The **status runtime** resolves session state by direct ID lookup or latest-session-for-workspace fallback

### Component Assessment

| Component | M1-Ready? | Change Needed |
|---|---|---|
| `SessionStore` interface | Yes | None |
| `FileSessionStore` | Yes | None |
| `MemorySessionStore` | Yes | None |
| `SessionIsolation.loadSession()` | Yes | None |
| `SessionIsolation.persistSession()` | Yes | None |
| `index.ts` constructor | No | Wire `FileSessionStore` for HTTP mode |
| `HttpServer.handleMcpRequest()` | No | Add `loadSession()` before 404 |
| `WebhookManager` | Minor | Add `session_resumed` event type |
| `scripts/claude-memory.js` | No | Add auto-trigger at session-wrap |
| `scripts/dashboard.js` | No | Align session filtering across directories |

## Session Contract Specification

### HTTP Transport Session Lifecycle

```
  [Client POST /mcp without session header]
        |
        v
  HttpServer creates StreamableHTTPServerTransport
  Transport assigns UUID session ID
  SessionIsolation.createSession(id, role)
  FileSessionStore.set(id, state)    <-- NEW: persistent on creation
  transports.set(id, transport)
        |
        v
  [Client sends requests with mcp-session-id header]
        |
        v
  HttpServer routes to existing transport
  SessionIsolation.getSession(id) -- touches lastAccessedAt
        |
        v
  [Server restart]
        |
        v
  [Client sends request with old mcp-session-id header]
        |
        v
  HttpServer: transports.has(id) = false
        |
  NEW PATH:
        v
  SessionIsolation.loadSession(id)
        |
    +---+---+
    |       |
  found   not found
    |       |
    v       v
  Create new   Return 404
  transport    (session truly
  bound to id   does not exist)
    |
    v
  transports.set(id, transport)
  Connect MCP server to transport
  Resume normal request handling
```

### Persistence Points

1. **Session creation** — on `createSession()`
2. **Session mutation** — after `activatedTools` changes, role changes, or metadata changes
3. **Periodic checkpoint** — every 30 seconds via cleanup timer

### Session State Contract (persisted fields)

```typescript
interface PersistedSessionState {
  sessionId: string;
  createdAt: number;
  lastAccessedAt: number;
  activatedTools: string[];
  role: string | null;
  rateLimitCounters: Record<string, { tokens: number; lastRefillAt: number }>;
  metadata: Record<string, unknown>;
}
```

### NOT Part of the Session Contract

- `StreamableHTTPServerTransport` instance (SSE connections are non-persistent)
- In-flight SSE event streams
- Pending tool call responses

Client must re-establish SSE connection after restart. The contract guarantees session *identity and state* survive, not the transport connection.

## Scope Boundary

### IN Scope

| Phase | Deliverable |
|---|---|
| M1.1 | Wire `FileSessionStore` into HTTP mode, add `loadSession()` to `HttpServer`, add `session_resumed` webhook event, document session contract |
| M1.2 | Auto-memory trigger at session-wrap boundary |
| M1.3 | Dashboard session-filter alignment across both session directories |

### OUT of Scope

- Unifying the two session identity planes (hook-side vs HTTP transport)
- Redis `SessionStore` (M3)
- Dashboard auth/authz (M2)
- SSE connection recovery
- Cross-node session sharing
- Telemetry or external observability (M2)
- WebSocket HITL transport (M3)
- Changing hook-side session manifest format

## Non-Goals

1. Do NOT merge the two session identity planes
2. Do NOT add new session state fields
3. Do NOT change FileSessionStore storage format
4. Do NOT add migration path from MemorySessionStore
5. Do NOT make stdio mode use FileSessionStore
6. Do NOT implement keep-alive/heartbeat for HTTP sessions
7. Do NOT redesign the dashboard

## Acceptance Criteria

### M1.1

| # | Criterion |
|---|---|
| AC-1 | `SessionIsolation` constructed with `FileSessionStore` in HTTP mode |
| AC-2 | `HttpServer` attempts `loadSession()` before returning 404 |
| AC-3 | Previously-valid `mcp-session-id` works after server restart (within TTL) |
| AC-4 | Expired sessions return 404 after restart |
| AC-5 | Session state (role, activatedTools, rateLimitCounters, metadata) preserved across restart |
| AC-6 | `session_resumed` webhook event emitted on reattachment |
| AC-7 | Gap-documentation tests replaced with positive reattachment tests |
| AC-8 | Session contract documented |
| AC-9 | `persistSession()` called after tool activation state changes |
| AC-10 | Full test suite passes |

### M1.2

| # | Criterion |
|---|---|
| AC-11 | `syncMemory()` auto-invoked at session-wrap boundary |
| AC-12 | Sync failure does not block session stop |
| AC-13 | Claude memory files refreshed after session with activity |
| AC-14 | Manual `npm run memory:sync` unchanged |

### M1.3

| # | Criterion |
|---|---|
| AC-15 | Dashboard lists both hook-side and HTTP transport sessions |
| AC-16 | Filters work across both session types |
| AC-17 | No duplicate entries |
| AC-18 | Validation tests cover aligned listing |

## Risk Assessment

| Risk | Level | Mitigation |
|---|---|---|
| Transport recreation after session recovery | High | Use `sessionIdGenerator: () => existingSessionId` to bind transport to recovered session ID |
| MCP Server re-connect for reattached transport | High | Review MCP SDK `Server.connect()` with multiple transports; existing code already does this per-session |
| Persistence overhead | Medium | Persist on creation + mutation + 30s interval, not every request |
| Two session directories | Medium | Keep `~/.evokore/session-store/` separate; dashboard reads both with type label |
| Auto-memory sync latency | Low | Spawn as detached process if >2s |

## PR Slicing Plan

### PR 1: M1.1a — Wire FileSessionStore + reattachment path
- `src/index.ts` — construct with `FileSessionStore` in HTTP mode
- `src/HttpServer.ts` — add `loadSession()` path, transport recreation
- `src/WebhookManager.ts` — add `session_resumed` event type
- Tests: replace gap tests, add reattachment tests
- Docs: session contract document

### PR 2: M1.1b — E2E acceptance validation
- End-to-end reattachment, expiry, concurrent reattachment tests

### PR 3: M1.2 — Auto-memory trigger
- Hook integration for `syncMemory()` at session-wrap

### PR 4: M1.3 — Dashboard session-filter alignment
- Dashboard reads both directories, filter tests

## Key Decisions

1. **Session store directory**: Keep `~/.evokore/session-store/` separate from hook-side `~/.evokore/sessions/`. Different schemas, lifecycles, and identity semantics.
2. **Persistence frequency**: On creation + tool activation changes + 30s periodic interval.
3. **FileSessionStore activation**: Default-on for HTTP mode. Opt-out via `EVOKORE_SESSION_STORE=memory`.

## Implementation Sequence

```
PR 1 (M1.1a) → PR 2 (M1.1b) → PR 3 (M1.2) → PR 4 (M1.3)
Sequential merge, each rebased on the previous
```
