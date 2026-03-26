---
title: "M3.1 Redis SessionStore Adapter Research"
date: 2026-03-26
milestone: M3.1
status: implemented
---

# M3.1 Redis SessionStore Adapter Research

## Current Architecture

The `SessionStore` interface in `src/SessionStore.ts` defines 5 async methods:

| Method | Signature | Purpose |
|--------|-----------|---------|
| `get` | `(sessionId: string) => Promise<SessionState \| undefined>` | Retrieve a session by ID |
| `set` | `(sessionId: string, state: SessionState) => Promise<void>` | Persist session state |
| `delete` | `(sessionId: string) => Promise<void>` | Remove a session |
| `list` | `() => Promise<string[]>` | List all session IDs |
| `cleanup` | `(maxAgeMs: number) => Promise<number>` | Remove stale sessions |

Shared serialization helpers `serializeSessionState()` and `deserializeSessionState()` handle `Set<string>` and `Map<K,V>` conversion to/from JSON-safe arrays and objects.

`SessionIsolation` uses fire-and-forget for most store calls (`.catch(() => {})`); only `persistSession()` and `loadSession()` are awaited by callers. This means write failures in the Redis store must not crash the server.

Existing implementations:
- `MemorySessionStore` -- in-process Map, no persistence
- `FileSessionStore` -- one JSON file per session, single-node persistence

Store instantiation is in `src/index.ts` with a conditional on `EVOKORE_SESSION_STORE`.

## Redis Implementation Approach

### Dependencies
- `ioredis` ^5.4.0 as an **optional** dependency
- Dynamic `await import('ioredis')` at first use so missing package throws a clear error rather than crashing the module system

### Key Design

| Aspect | Decision |
|--------|----------|
| Key pattern | `{prefix}:session:{sessionId}` |
| Value | JSON string of `SerializedSessionState` |
| TTL | `PEXPIRE` via `SET ... PX {ttlMs}` on every write |
| Listing | `SCAN` with `MATCH {prefix}:session:*` |
| Cleanup | Scan + check `lastAccessedAt` for sub-TTL cleanup |
| Connection | Lazy -- not created until first store operation |
| Error handling | Swallow on writes, return undefined/empty on reads |

### Configuration

| Env Variable | Default | Purpose |
|---|---|---|
| `EVOKORE_SESSION_STORE` | `file` | Set to `redis` to activate |
| `EVOKORE_REDIS_URL` | `redis://127.0.0.1:6379` | Redis connection URL |
| `EVOKORE_REDIS_KEY_PREFIX` | `evokore` | Key namespace prefix |
| `EVOKORE_SESSION_TTL_MS` | `3600000` | TTL for session keys |

### Wiring

In `src/index.ts`, the store selection block gains a third branch:

```typescript
if (storeOverride === "redis") {
  // Dynamic import to keep ioredis optional
  const { RedisSessionStore } = await import('./stores/RedisSessionStore');
  sessionStore = new RedisSessionStore({ url, keyPrefix, ttlMs });
}
```

Because the constructor runs synchronously but the import is async, the initialization creates a temporary `MemorySessionStore` and replaces `this.sessionIsolation` once the Redis module loads.

## Test Strategy

### Unit Tests (always run)
- Mock `ioredis` with `vi.mock`
- Verify all 5 `SessionStore` methods behave correctly
- Test lazy connection, error handling, TTL propagation
- Test key construction and sessionId extraction

### Integration Tests (gated on `EVOKORE_REDIS_URL`)
- `describe.skipIf(!process.env.EVOKORE_REDIS_URL)` blocks
- Cross-instance persistence (two separate RedisSessionStore instances)
- Round-trip all field types (Set, Map, role, metadata)
- TTL expiration behavior
- Concurrent access

### Env Documentation Sync
- Verify `EVOKORE_REDIS_URL` and `EVOKORE_REDIS_KEY_PREFIX` in env example
- Verify `EVOKORE_SESSION_STORE` documents `redis` option

## Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| ioredis not installed | Low | Dynamic import with clear error message |
| Redis unreachable | Medium | Lazy connect + error swallowing matches fire-and-forget contract |
| Multi-node write races | Low | Acceptable for M3.1; last-write-wins is consistent with existing MemorySessionStore semantics |
| SCAN performance at scale | Low | COUNT hint of 100 per iteration; session count unlikely to exceed thousands |
| Key prefix collisions | Low | Default prefix is `evokore`, configurable per deployment |

## Files Modified

- `src/stores/RedisSessionStore.ts` -- new implementation
- `src/index.ts` -- wiring for `redis` store type
- `package.json` -- `ioredis` as optional dependency
- `tests/integration/redis-session-store-validation.test.ts` -- comprehensive tests
