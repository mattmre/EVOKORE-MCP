# Phase 4B Runtime Reliability — Pre-Implementation Research
**Date:** 2026-04-04  
**Source:** Panel code review (docs/research/repo-review-2026-04-03.md), researcher agent analysis  
**Branch:** fix/phase-4b-runtime-reliability (to be cut from main @ 68c6e91)

## Summary
4 runtime reliability bugs. BUG-38 and BUG-30 share ProxyManager state. BUG-05 and BUG-40 share SessionIsolation lifecycle.

---

## BUG-38: No reconnect/circuit-breaker for crashed child servers

**File:** `src/ProxyManager.ts:159-166`

Current `recordServerError()` increments errorCount and sets `status = 'error'` after 5 errors but:
- No reconnection logic — dead client stays in `this.clients`
- `callProxiedTool()` only checks `if (!client)`, not `if (serverState.status === 'error')`
- No health check ping loop

**Fix:**
1. Add `reconnectServer(serverId: string): Promise<void>` that closes old client/transport and re-runs `bootSingleServer()` for just that server.
2. In `callProxiedTool()` (around line 597-599), after `if (!client)` guard, check `if (serverState?.status === 'error')` and call `await this.reconnectServer(serverId)` before dispatching.
3. Guard with a `reconnecting` flag per server to prevent concurrent reconnect attempts.

**Test coverage:** `tests/integration/async-proxy-boot.test.ts` tests boot failure but not runtime reconnect. Add a reconnect test.

---

## BUG-05: TOCTOU race in Redis SessionIsolation swap

**File:** `src/index.ts:110-134`

Constructor creates initial `SessionIsolation` (MemoryStore), then fires async `import()`. When resolved, `this.sessionIsolation` is replaced wholesale — losing all sessions created during the boot window (can be several seconds).

**Fix:** Move Redis store initialization into `loadSubsystems()` (lines ~774 area), which is already async and runs before the transport starts accepting connections. Steps:
1. In the constructor, always start with `MemorySessionStore` (or no Redis check at all).
2. In `loadSubsystems()` (async), do the dynamic Redis import and construct final `SessionIsolation` with the resolved store before `setupHandlers()` / transport start.
3. This ensures exactly one `SessionIsolation` instance exists by the time any request is served.

**Test coverage:** `tests/integration/session-isolation.test.ts`, `tests/integration/redis-session-store-validation.test.ts`. Neither tests the swap race.

---

## BUG-40: RedisSessionStore `disconnect()` never called on shutdown

**Files:** `src/index.ts` (shutdown handlers), `src/SessionStore.ts` (interface), `src/stores/RedisSessionStore.ts`

`disconnect()` exists on `RedisSessionStore` but `SessionStore` interface doesn't declare it, and neither shutdown handler (stdio line ~790, HTTP line ~827) calls it. ioredis client keeps TCP connection + event listeners open.

**Fix:**
1. Add `disconnect?(): Promise<void>` to `SessionStore` interface in `src/SessionStore.ts`.
2. In both shutdown handlers in `index.ts`, add before the grace period/exit:
   ```typescript
   const store = this.sessionIsolation.getStore?.();
   if (store?.disconnect) await store.disconnect().catch(() => {});
   ```
3. Add `getStore()` to `SessionIsolation` if not already present (check `src/SessionIsolation.ts`).

**Test coverage:** `tests/integration/redis-session-store-validation.test.ts` tests `disconnect()` on the class but not in shutdown context.

---

## BUG-30: `loadServers` clears live registry during reload

**File:** `src/ProxyManager.ts:454-460`

`loadServers()` synchronously clears all 6 maps before booting. During the async boot window (up to 15s per server), `canHandle()` returns false, `getProxiedTools()` returns empty, and in-flight calls throw "not connected."

**Fix:** Atomic swap pattern:
1. Build new state into local vars (`newClients`, `newTransports`, `newToolRegistry`, `newCachedTools`, `newServerRegistry`, `newRateLimitBuckets`).
2. Pass these into `bootSingleServer()` or collect its return values.
3. After `Promise.allSettled` completes, do one atomic assignment of all 6 maps.
4. Then close/cleanup old clients/transports.

This way the live registry is never in an empty state during reload.

**Test coverage:** `tests/integration/async-proxy-boot.test.ts` tests `loadServers()` but not concurrent calls during reload.

---

## Cross-cutting
- BUG-38 (per-server reconnect) and BUG-30 (atomic reload) share the same 6 maps. The per-server reconnect must only touch that server's entries, not clear the full registry.
- BUG-05 (init race) and BUG-40 (shutdown disconnect) share the SessionIsolation lifecycle. Fixing BUG-05 first (single instance) simplifies BUG-40's shutdown call.

## Implementation order
1. BUG-40 (simplest — add disconnect to interface + call in shutdown)
2. BUG-05 (move Redis init to loadSubsystems)
3. BUG-30 (atomic swap in loadServers)
4. BUG-38 (per-server reconnect — most complex)
