# Phase 4D Implementation Plan — DX & Performance
**Date:** 2026-04-03  
**Source:** `docs/research/repo-review-2026-04-03.md` (8-panel expert review)  
**Branch:** `fix/phase-4d-dx-performance` from `main` (after Phase 4C merge)

---

## Items In Scope

| ID | Severity | File(s) | Summary |
|----|----------|---------|---------|
| BUG-06 | HIGH | `src/index.ts:805-849` | Signal handlers accumulate on every run() call |
| BUG-07 | HIGH | `src/ProxyManager.ts:91,154-157,672-730` | toolCooldowns Map never pruned |
| BUG-08 | HIGH | `src/HttpServer.ts:534-549` | Double transports.set on reattachment + zombie on failure |
| BUG-10 | HIGH | `src/SkillManager.ts:1562` + `src/RegistryManager.ts:241` | httpGet duplicated with drift |
| BUG-11 | HIGH | `src/SkillManager.ts:173-174` | refreshSkills clears cache before scan completes |
| BUG-12 | HIGH | `src/PluginManager.ts:167-169` | Hot-reload misses transitive require() deps |
| BUG-13 | HIGH | `src/TelemetryManager.ts:318-368` | Synchronous writeFileSync/readFileSync on event loop |
| BUG-14 | HIGH | `src/TelemetryManager.ts:348-351` | Latency accumulator precision loss across restarts |
| BUG-31 | MED | `src/HttpServer.ts:114-126` | Cleanup deletes transport before close() resolves |
| BUG-32 | MED | `src/stores/FileSessionStore.ts:85-111` | writeChains Map not pruned on delete |
| BUG-33 | MED | `src/auth/OAuthProvider.ts:139-167` | JWKS cache is module-level singleton |
| IMP-02 | HIGH | `src/SkillManager.ts:276-324` | Sequential skill I/O on startup |
| IMP-06 | HIGH | `src/SkillManager.ts:154-159` | getStats() JSON.stringify(fuseIndex) blocking |
| IMP-08 | MED | `src/SessionIsolation.ts:117-143` | O(n) LRU eviction scan |
| IMP-09 | MED | `src/TelemetryExporter.ts:264-337` | New TCP socket per export (no keep-alive) |

---

## Implementation Groups

### Group A — New Shared Module + SkillManager (BUG-10, BUG-11, IMP-02, IMP-06)

**New file:** `src/httpUtils.ts`
```typescript
export interface HttpGetOptions {
  userAgent?: string;     // default "EVOKORE-MCP"
  maxSize?: number;       // default 1MB
  maxRedirects?: number;  // default 5
  timeoutMs?: number;     // default 30000
}
export function httpGet(url: string, options?: HttpGetOptions): Promise<string>;
```
Extract from RegistryManager.ts (has URL validation). Replace in both SkillManager and RegistryManager.

**SkillManager BUG-11 (atomic swap):**
- In `loadSkills()` (line 173): do NOT call `skillsCache.clear()` upfront
- Build into temporary `newCache = new Map<string, SkillMetadata>()`
- Pass `newCache` (or equivalent) to `walkDirectory` as target
- After scan succeeds: `this.skillsCache = newCache; this.fuseIndex = newFuse;`
- On failure: old cache remains intact

**SkillManager IMP-02 (parallel I/O):**
- In `walkDirectory`: batch all `fs.lstat()` calls with `Promise.all`
- Batch all `fs.readFile()` calls for `.md` files with `Promise.all`
- Recurse into subdirectories with `Promise.all`
- Use concurrency of 16 max (avoid fd exhaustion)

**SkillManager IMP-06 (cache index size):**
- Remove `JSON.stringify(this.fuseIndex)` from `getStats()` (lines 154-159)
- Add private `_fuseIndexSizeKb: number = 0` field
- After building Fuse index in `loadSkills()`, compute size from skill count × estimated metadata:
  `this._fuseIndexSizeKb = Math.round((this.skillsCache.size * 2) * 100) / 100;`
  (rough estimate: ~2KB per skill on average)
- `getStats()` returns `this._fuseIndexSizeKb`

---

### Group B — HttpServer (BUG-08, BUG-31)

**BUG-08 (remove double transports.set):**
- File: `src/HttpServer.ts`
- Remove `this.transports.set(sessionId, reattachedTransport)` at line 549 (the explicit set after `connect()`)
- Keep only the registration in `onsessioninitialized` callback (line 534-535)
- Wrap `await mcpServer.connect(reattachedTransport)` in try/catch:
  - On failure: `this.transports.delete(sessionId); await reattachedTransport.close().catch(() => {});`

**BUG-31 (cleanup order — delete after close):**
- File: `src/HttpServer.ts` cleanup interval (lines 114-126)
- Change order: call `transport.close().then(() => { this.transports.delete(sessionId); })` instead of delete-then-close
- Use `.catch(err => { console.error(...); this.transports.delete(sessionId); })` to still clean up on close error

---

### Group C — Independent File Fixes (7 items)

**BUG-06 (index.ts signal handlers):**
- File: `src/index.ts` lines 805-806, 848-849
- Change `process.on("SIGTERM", shutdown)` to `process.once("SIGTERM", shutdown)` in both `run()` and `runHttp()`
- Same for `process.once("SIGINT", shutdown)`
- This prevents listener accumulation on repeated calls

**BUG-07 (ProxyManager cooldown pruning):**
- File: `src/ProxyManager.ts`
- Add `private cooldownSweepInterval: NodeJS.Timeout | null = null;` field
- In constructor or `loadServers()`: start `setInterval(() => this.sweepCooldowns(), 60_000).unref()`
- `sweepCooldowns()` method: iterate toolCooldowns, delete entries where `Date.now() >= expiry`
- In `loadServers()` cleanup at top: `clearInterval(this.cooldownSweepInterval)` before resetting state

**BUG-12 (PluginManager transitive hot-reload):**
- File: `src/PluginManager.ts` lines 166-171
- Before `delete require.cache[resolvedPath]`, recursively collect all transitive deps within `this.pluginsDir`:
```js
const toInvalidate = new Set<string>();
const collect = (mod: NodeModule) => {
  if (toInvalidate.has(mod.id)) return;
  if (!mod.id.startsWith(this.pluginsDir)) return;
  toInvalidate.add(mod.id);
  mod.children.forEach(collect);
};
const cached = require.cache[resolvedPath];
if (cached) collect(cached);
for (const p of toInvalidate) delete require.cache[p];
```
- Add `isReloading` boolean guard to serialize concurrent `loadPlugins()` calls

**BUG-13 + BUG-14 (TelemetryManager async I/O + latency precision):**
- File: `src/TelemetryManager.ts`
- Convert `flushToDisk()` to `async flushToDiskAsync(): Promise<void>` using `fs.promises.mkdir`, `fs.promises.writeFile`
- Convert `loadFromDisk()` to `async loadFromDiskAsync(): Promise<void>` using `fs.promises.access`, `fs.promises.readFile`
- Add `latencyTotalMs` and `latencyCount` fields to persisted JSON (BUG-14)
- On load: use `latencyTotalMs` + `latencyCount` directly if present; fall back to old reconstruction otherwise
- Update all callers of `flushToDisk()` and `loadFromDisk()` to await the async versions

**BUG-32 (FileSessionStore writeChains cleanup):**
- File: `src/stores/FileSessionStore.ts` `delete()` method (line 101-111)
- Add `this.writeChains.delete(filePath)` before or after the `fs.unlink()` call
- Also consider: await any pending write chain before unlinking to prevent race where write recreates the file

**BUG-33 (OAuthProvider JWKS cache Map):**
- File: `src/auth/OAuthProvider.ts`
- Replace module-level `let cachedJWKS | null` and `let cachedJWKSUri | null` with:
  `const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();`
- In `validateJwt`: `if (!jwksCache.has(config.jwksUri)) { jwksCache.set(config.jwksUri, createRemoteJWKSet(new URL(config.jwksUri))); }`
- Update `clearJwksCache()` (exported test hook) to call `jwksCache.clear()`

**IMP-08 (SessionIsolation O(1) LRU via Map insertion order):**
- File: `src/SessionIsolation.ts`
- In `getSession()` or `touchSession()`: after updating `lastAccessedAt`, delete and re-insert the entry to move it to Map tail:
  `const state = this.sessions.get(id)!; this.sessions.delete(id); this.sessions.set(id, state);`
- In `evictIfAtCapacity()`: replace the O(n) LRU scan with O(1) first-entry lookup:
  `const oldestId = this.sessions.keys().next().value;`
- The first entry in a JS Map is the least-recently-used (since we re-insert on access)

**IMP-09 (TelemetryExporter keep-alive agent):**
- File: `src/TelemetryExporter.ts`
- Add private fields: `private httpAgent: http.Agent | null = null;` and `private httpsAgent: https.Agent | null = null;`
- Initialize in constructor or first use: `new http.Agent({ keepAlive: true })` / `new https.Agent({ keepAlive: true })`
- Pass agent to request options in `deliver()`
- Destroy agents in `shutdown()`: `this.httpAgent?.destroy(); this.httpsAgent?.destroy();`

---

## Implementation Order

```
Parallel batch 1 (no inter-dependencies):
  Agent A: BUG-10 (httpUtils.ts creation) + SkillManager.ts all changes (BUG-11, IMP-02, IMP-06)
  Agent B: HttpServer.ts changes (BUG-08, BUG-31)
  Agent C: Independent files (BUG-06, BUG-07, BUG-12, BUG-13+14, BUG-32, BUG-33, IMP-08, IMP-09)
    Note: Agent C also updates RegistryManager.ts (BUG-10 consumer) after httpUtils.ts is created by Agent A
    → Split: Agent C1 handles non-SkillManager independent files; Agent C2 handles RegistryManager after httpUtils exists

Simplest safe ordering (sequential within each agent):
  Agent A: Create httpUtils.ts → update SkillManager.ts (remove httpGet, atomic refresh, parallel I/O, cached stats)
  Agent B: Update HttpServer.ts (BUG-08 + BUG-31)
  After Agent A: Update RegistryManager.ts (import from httpUtils)
  Agent C: BUG-06, BUG-07, BUG-12, BUG-13+14, BUG-32, BUG-33, IMP-08, IMP-09 (all independent)
```

**Conflict avoidance:** SkillManager.ts is touched by BUG-10, BUG-11, IMP-02, IMP-06 — all must be in ONE agent. HttpServer.ts is touched by BUG-08 and BUG-31 — both must be in ONE agent. All other files are independent.

---

## New Env Vars for .env.example

None required for Phase 4D.

---

## Risks & Edge Cases

| Risk | Mitigation |
|------|-----------|
| SkillManager atomic swap: walkDirectory writes directly to skillsCache | Refactor walkDirectory to accept target map param |
| TelemetryManager callers of flushToDisk need await | Search all callers; update each |
| PluginManager recursive require.cache walk: cycles | Use visited Set guard |
| SessionIsolation re-insert on access: overhead at high session counts | Negligible for <1000 sessions; document threshold |
| BUG-14 backward compat: old metrics files lack latencyTotalMs | Fall back to avgLatencyMs * count reconstruction |
| httpUtils redirect recursion: not instance method anymore | Use closure-based or module-level recursive function |
