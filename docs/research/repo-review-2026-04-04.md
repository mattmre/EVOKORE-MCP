# EVOKORE-MCP Expert Review — 2026-04-04
**Branch:** main @ 51b96cb (post-session-8)
**Scope:** src/*.ts (focus: Phase 4A–4E + Session 8 changes)
**Panel:** 8 experts
**Previous review:** docs/research/repo-review-2026-04-03.md (68 findings)

---

## Executive Summary

- **Phase 4 sprint resolved 25+ of 33 BUGs from the April 3 review** — security-critical items (timing attacks, symlink traversal, container escape, credential logging) are all fixed.
- **SEC-01 HIGH**: SecurityManager exposes full approval tokens (`tokenFull`) via `getPendingApprovals()` and `approval_requested` WS broadcasts to all connected clients — token exfiltration vector.
- **SEC-03 HIGH**: `httpUtils.ts` has no SSRF protection — `fetch_skill` and `RegistryManager` can fetch private/loopback addresses including cloud metadata endpoints.
- **SEC-04 MED**: TelemetryExporter has no SSRF protection on its export URL.
- **BUG-28 fully resolved** in Session 8 — all 5 sections of `websocket-hitl-validation.test.ts` are now behavioral.

---

## Resolved Issues from April 3 Review

Confirmed resolved in Phase 4A-4E + Session 8:
BUG-01, BUG-02, BUG-04, BUG-05, BUG-06, BUG-07, BUG-08, BUG-09, BUG-10, BUG-11, BUG-12, BUG-23, BUG-24, BUG-25, BUG-26, BUG-27, BUG-28 (fully resolved Session 8), BUG-29, BUG-30, BUG-32, BUG-33.
Partially resolved: BUG-03 (audit added, no access gate), BUG-22 (annotation intentionally `false`).

---

## Panel 1: Security (Dr. Sarah Chen)

| ID | Severity | Type | File | Line | Summary |
|---|---|---|---|---|---|
| SEC-01 | HIGH | BUG | src/SecurityManager.ts | ~227-294 | Full approval token in WS broadcasts via `tokenFull` |
| SEC-02 | MED | IMP | src/SecurityManager.ts | ~133-153 | setActiveRole lacks access control gate (BUG-03 partial) |
| SEC-03 | HIGH | BUG | src/httpUtils.ts | ~22-88 | No SSRF protection on shared HTTP client |
| SEC-04 | MED | BUG | src/TelemetryExporter.ts | ~192-199 | No SSRF protection on telemetry export URL |
| SEC-05 | LOW | IMP | src/HttpServer.ts | ~373-374 | Approve uses 8-char prefix (collision risk at scale) |
| SEC-06 | LOW | IMP | src/PluginManager.ts | ~206 | require() of untrusted plugins unsandboxed |

**SEC-01:** `generateToken()` emits `tokenFull: token` in `approval_requested` event. `getPendingApprovals()` also returns `tokenFull`. Both broadcast to all WS clients. A developer-level WS connection receives every pending full token — enough to auto-approve anything. **Fix:** Remove `tokenFull` from broadcast; accept deny by 16-char prefix or via authenticated HTTP.

**SEC-03:** `httpUtils.ts` `httpGet()` validates HTTP/HTTPS protocol only. Does not block private/loopback addresses. Used by `fetch_skill` (user-supplied URLs) and `RegistryManager`. Cloud metadata endpoint (`169.254.169.254`) is reachable. `WebhookManager.isValidWebhookConfig()` already has comprehensive SSRF protection — extract to shared utility and apply in `httpGet()` at initial URL and each redirect hop.

**SEC-04:** `TelemetryExporter.isValidUrl()` checks HTTP/HTTPS only, no private-address blocking. Lower risk (operator-configured) but should match WebhookManager's posture.

---

## Panel 2: Reliability (Marcus Thompson)

| ID | Severity | Type | File | Line | Summary |
|---|---|---|---|---|---|
| REL-01 | MED | BUG | src/HttpServer.ts | ~114-127 | Transport close races with map deletion in cleanup interval |
| REL-02 | LOW | IMP | src/HttpServer.ts | ~150-161 | start() rejects on error but intervals still running |
| REL-03 | MED | IMP | src/ProxyManager.ts | ~709-711 | Synchronous reconnect blocks MCP caller |
| REL-04 | LOW | IMP | src/index.ts | ~793-803 | Fixed 500ms shutdown grace period |
| REL-05 | LOW | IMP | src/WebhookManager.ts | ~393-425 | No socket cleanup on delivery timeout |
| REL-06 | LOW | IMP | src/TelemetryExporter.ts | ~69-70 | HTTP agents persist if shutdown() never called |

**REL-01:** Cleanup interval calls `transport.close()` (async) and deletes in `.then()`. During the async gap, a new request can be routed to the closing transport. Pre-existing race (BUG-31 April 3), improved but not fully resolved.

**REL-03:** `callProxiedTool()` awaits `reconnectServer(serverId)` synchronously. Blocks MCP request for full reconnect duration (up to 15s). **Fix:** Return 503 immediately and reconnect in background.

---

## Panel 3: API Design (Dr. Priya Patel)

| ID | Severity | Type | File | Line | Summary |
|---|---|---|---|---|---|
| API-01 | LOW | IMP | src/HttpServer.ts | ~504-512 | No trailing slash on /mcp |
| API-02 | LOW | IMP | src/HttpServer.ts | ~577-579 | Session not found returns plain JSON, not JSON-RPC error |
| API-03 | MED | DOC | src/SkillManager.ts | ~912-929 | discover_tools annotation conflict documented but confusing |
| API-04 | LOW | IMP | src/WebhookManager.ts | ~279-284 | subscribe() accepts untyped event strings |
| API-05 | LOW | IMP | src/index.ts | ~504-507 | MCP prompts list is hardcoded |

**API-02:** `/mcp` session-not-found response should be JSON-RPC: `{"jsonrpc":"2.0","error":{"code":-32001,"message":"Session not found"},"id":null}`.

**API-04:** `subscribe()` should accept `WebhookEventType` not `string`; validate against `WEBHOOK_EVENT_TYPES` at subscription time.

---

## Panel 4: Test Quality (Jordan Williams)

| ID | Severity | Type | File | Line | Summary |
|---|---|---|---|---|---|
| TST-02 | MED | IMP | websocket-hitl-validation.test.ts | ~213-251 | Heartbeat test tautological (never waits for ping cycle) |
| TST-04 | MED | IMP | — | — | No SSRF tests for httpUtils (zero coverage for private addrs) |
| TST-03 | LOW | IMP | websocket-hitl-validation.test.ts | ~1-10 | Tests use require() for compiled JS |
| TST-05 | LOW | IMP | websocket-hitl-validation.test.ts | ~319-366 | Env isolation could be deeper |

**TST-02:** "heartbeat interval" test sets 5000ms, connects, gets snapshot, closes. Never waits for a heartbeat cycle. Prove the interval is applied by waiting >heartbeatMs and observing a ping frame.

**TST-04:** `httpUtils.ts` extracted in Phase 4E, zero SSRF tests. When SEC-03 is fixed, add tests: block `127.0.0.1`, `10.0.0.1`, `169.254.169.254`, `::1`, redirect-chain SSRF.

**Overall:** BUG-28 conversion fully resolved in Session 8. All 5 sections behavioral. Section 4 HTTP approach (spawn dashboard, GET /approvals, verify interpolated env vars) is well-designed.

---

## Panel 5: TypeScript (Dr. Erik Sorensen)

| ID | Severity | Type | File | Line | Summary |
|---|---|---|---|---|---|
| TS-01 | LOW | IMP | src/HttpServer.ts | ~347-348 | `(ws as any)._role` unsafe metadata attachment |
| TS-02 | LOW | IMP | src/SecurityManager.ts | ~32 | pendingTokens value should use a named interface |
| TS-03 | LOW | IMP | src/SkillManager.ts | ~1032-1398 | handleToolCall 370-line monolith |
| TS-04 | MED | IMP | src/index.ts | ~605 | Wide `any` return type on CallToolRequest handler |
| TS-05 | LOW | IMP | src/WebhookManager.ts | ~84 | Subscribers map mixes typed/untyped event keys |

**TS-01:** Use `WeakMap<WebSocket, { role: string; isAlive: boolean }>` instead of `(ws as any)._role` and `(ws as any)._isAlive`.

---

## Panel 6: Performance (Amara Diallo)

| ID | Severity | Type | File | Line | Summary |
|---|---|---|---|---|---|
| PERF-01 | LOW | IMP | src/SecurityManager.ts | ~208-215 | Token purge on every generate/validate |
| PERF-02 | LOW | IMP | src/SkillManager.ts | ~641-713 | Multiple Fuse searches at high limits |
| PERF-03 | MED | IMP | src/AuditLog.ts | ~145-294 | getEntries reads full JSONL into memory |
| PERF-04 | LOW | IMP | src/ProxyManager.ts | ~461-463 | JSON roundtrip deep clone |
| PERF-05 | LOW | IMP | src/PluginManager.ts | ~341-349 | Linear plugin tool scan |

**PERF-03:** Every `getEntries()`, `getSummary()`, `getEntryCount()` reads entire JSONL file (up to ~25k entries at 5MB). Dashboard polling amplifies I/O. **Fix:** Maintain in-memory counters for `getEntryCount()`/`getSummary()`; consider tail-first reads for `getEntries()` with offset.

---

## Panel 7: DX/Documentation (Dr. Lily Chen)

| ID | Severity | Type | File | Line | Summary |
|---|---|---|---|---|---|
| DX-01 | LOW | DOC | src/httpUtils.ts | ~22 | httpGet lacks SSRF warning JSDoc |
| DX-02 | LOW | DOC | src/HttpServer.ts | ~56-60 | WS fields lack JSDoc |
| DX-03 | LOW | IMP | src/index.ts | ~855-863 | No --help flag |
| DX-04 | LOW | DOC | src/TelemetryExporter.ts | ~55-58 | Privacy statement could reference audit policy |
| DX-05 | MED | DOC | src/SecurityManager.ts | ~275-294 | getPendingApprovals JSDoc says "truncated" but returns full token |

**DX-05:** JSDoc says "truncated for display" then documents `tokenFull` as "available." This misleads future reviewers. Resolving SEC-01 also resolves DX-05.

---

## Panel 8: Ops/Deployment (Roberto Vasquez)

| ID | Severity | Type | File | Line | Summary |
|---|---|---|---|---|---|
| OPS-01 | MED | IMP | src/HttpServer.ts | ~92-161 | start() error path leaks cleanup+persist intervals |
| OPS-02 | LOW | IMP | src/index.ts | ~803, 846 | process.exit prevents pending I/O completion |
| OPS-03 | LOW | IMP | src/TelemetryExporter.ts | ~69-70 | keepAlive agents persist if shutdown() never called |
| OPS-04 | LOW | DOC | src/HttpServer.ts | ~19-20 | Default port 3100 not in .env.example |
| OPS-05 | LOW | IMP | src/index.ts | ~92-93 | parseInt NaN risk on interval env vars |

**OPS-01:** `cleanupInterval` and `persistInterval` created at lines 104 and 138 before listen callback. Port-bind failure causes `reject(err)` but intervals run forever. **Fix:** Move interval setup into listen success callback.

**OPS-05:** `parseInt(process.env.EVOKORE_TELEMETRY_EXPORT_INTERVAL_MS || "60000", 10)` — if set to `"fast"`, returns `NaN`. Apply `|| defaultValue` after parseInt.

---

## Consolidated Issue List

| ID | Severity | Type | File | Summary |
|---|---|---|---|---|
| SEC-01 | **HIGH** | BUG | src/SecurityManager.ts | Full approval token in WS broadcasts |
| SEC-03 | **HIGH** | BUG | src/httpUtils.ts | No SSRF protection on HTTP client |
| SEC-02 | MED | IMP | src/SecurityManager.ts | setActiveRole lacks access gate |
| SEC-04 | MED | BUG | src/TelemetryExporter.ts | No SSRF protection on telemetry URL |
| REL-01 | MED | BUG | src/HttpServer.ts | Transport close race |
| REL-03 | MED | IMP | src/ProxyManager.ts | Synchronous reconnect blocks caller |
| API-03 | MED | DOC | src/SkillManager.ts | discover_tools annotation conflict |
| TST-02 | MED | IMP | websocket-hitl-test | Heartbeat test tautological |
| TST-04 | MED | IMP | — | No SSRF tests for httpUtils |
| PERF-03 | MED | IMP | src/AuditLog.ts | getEntries reads full file |
| OPS-01 | MED | IMP | src/HttpServer.ts | start() leaks intervals on error |
| DX-05 | MED | DOC | src/SecurityManager.ts | JSDoc contradicts tokenFull security |
| TS-04 | MED | IMP | src/index.ts | Wide any on tool handler |
| SEC-05 | LOW | IMP | src/HttpServer.ts | 8-char prefix collision risk |
| SEC-06 | LOW | IMP | src/PluginManager.ts | Unsandboxed require() |
| REL-02 | LOW | IMP | src/HttpServer.ts | start() error no interval cleanup |
| REL-04 | LOW | IMP | src/index.ts | Fixed 500ms grace period |
| REL-05 | LOW | IMP | src/WebhookManager.ts | No socket cleanup on timeout |
| REL-06 | LOW | IMP | src/TelemetryExporter.ts | HTTP agents persist |
| API-01 | LOW | IMP | src/HttpServer.ts | No trailing slash on /mcp |
| API-02 | LOW | IMP | src/HttpServer.ts | Session not found plain JSON |
| API-04 | LOW | IMP | src/WebhookManager.ts | subscribe() untyped event string |
| API-05 | LOW | IMP | src/index.ts | Prompts list hardcoded |
| TS-01 | LOW | IMP | src/HttpServer.ts | (ws as any)._role unsafe |
| TS-02 | LOW | IMP | src/SecurityManager.ts | pendingTokens inline type |
| TS-03 | LOW | IMP | src/SkillManager.ts | 370-line handleToolCall |
| TS-05 | LOW | IMP | src/WebhookManager.ts | Untyped subscribers map |
| PERF-01 | LOW | IMP | src/SecurityManager.ts | Token purge on every op |
| PERF-02 | LOW | IMP | src/SkillManager.ts | Multiple Fuse searches |
| PERF-04 | LOW | IMP | src/ProxyManager.ts | JSON roundtrip deep clone |
| PERF-05 | LOW | IMP | src/PluginManager.ts | Linear plugin scan |
| DX-01 | LOW | DOC | src/httpUtils.ts | Missing SSRF JSDoc |
| DX-02 | LOW | DOC | src/HttpServer.ts | WS fields missing JSDoc |
| DX-03 | LOW | IMP | src/index.ts | No --help flag |
| DX-04 | LOW | DOC | src/TelemetryExporter.ts | Privacy could ref audit policy |
| OPS-02 | LOW | IMP | src/index.ts | process.exit prevents I/O |
| OPS-03 | LOW | IMP | src/TelemetryExporter.ts | keepAlive agents persist |
| OPS-04 | LOW | DOC | src/HttpServer.ts | Default port missing from .env.example |
| OPS-05 | LOW | IMP | src/index.ts | parseInt NaN risk |
| TST-03 | LOW | IMP | websocket-hitl-test | require() vs TS imports |
| TST-05 | LOW | IMP | websocket-hitl-test | Env isolation could be deeper |

**Totals: 40 findings — CRITICAL: 0, HIGH: 2, MED: 10 (incl. TS-04), LOW: 28**

---

## Recommended Next Actions (Priority Order)

### Phase 5A — Security Fixes (HIGH priority)
1. **SEC-03**: Add SSRF protection to `httpUtils.ts` — extract `isPrivateAddress()` from `WebhookManager`, apply in `httpGet()` at initial URL + each redirect hop. Add TST-04 tests in same PR.
2. **SEC-01**: Remove `tokenFull` from WS broadcasts and `getPendingApprovals()`. Accept deny by 16-char prefix. Also resolves DX-05.
3. **SEC-04**: Apply SSRF check to `TelemetryExporter.isValidUrl()`.
4. **OPS-01**: Move interval setup into listen success callback in `HttpServer.ts`.

### Phase 5B — Test + DX Fixes (MED priority)
5. **TST-02**: Fix heartbeat test to actually wait for a ping cycle.
6. **API-02 + API-04 + OPS-04 + OPS-05**: Low-effort batch fixes.

### Phase 5C — ECC Cascade Tier 0 (independent of above)
Items from `docs/research/ecc-cascade-feasibility-panel-2026-03-30.md` Tier 0:
- [13] Add Read to damage-control (security fix, independent)
- [19] Fix CLAUDE.md staleness (editorial)
- [11] Correct EVOKORE native tool count in ECC docs
- [10] Measure hook latency benchmark
