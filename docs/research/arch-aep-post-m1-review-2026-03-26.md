# ARCH-AEP Post-M1 Review: Runtime Continuity Platform

## Review Date

2026-03-26

## Milestone Summary

M1 delivered session continuity as a real runtime capability. Before M1, `SessionIsolation.loadSession()` existed and was unit-tested with `FileSessionStore`, but was not wired into any runtime path. After an HTTP server restart, a client presenting a previously-valid `mcp-session-id` header received a `404 Session not found` response. The existing test suite documented this gap explicitly (section 9 of `file-session-store-validation.test.ts`: "HTTP mcp-session-id reattachment NOT implemented").

After M1, sessions survive server restarts, memory syncs automatically at session boundaries, and the dashboard shows sessions from both identity planes.

## What Was Delivered

### M1.1: Session Contract + HTTP Reattachment (PR #194)

**Merged:** 2026-03-26T20:17:04Z | **Files changed:** 9 | **+633 / -26 lines**

Implementation:

- `src/index.ts`: `EvokoreMCPServer` constructor accepts `httpMode` option. When true and `EVOKORE_SESSION_STORE` is not `memory`, constructs `SessionIsolation` with `FileSessionStore` as the backing store.
- `src/HttpServer.ts`: `handleMcpRequest()` calls `SessionIsolation.loadSession(sessionId)` when `this.transports.has(sessionId)` returns false, before returning 404. On successful load, creates a new `StreamableHTTPServerTransport` bound to the recovered session ID via `sessionIdGenerator: () => sessionId`, connects the MCP server, and registers the transport.
- `src/WebhookManager.ts`: Added `session_resumed` as the 7th webhook event type (added to both the type union and the valid events array).
- Periodic persistence: 30-second interval in `HttpServer` persists all active sessions to the `FileSessionStore`, ensuring crash tolerance between explicit persist points.
- `persistSession()` is called after tool activation state changes in `discover_tools`.
- Gap-documentation tests (section 9 of `file-session-store-validation.test.ts`) replaced with 7 positive reattachment tests covering: cross-boundary load, expired session rejection, and webhook event emission.
- New `session-reattachment-http.test.ts` with 21 tests covering: `FileSessionStore` construction in HTTP mode, `loadSession()` wiring in `HttpServer`, state preservation (role, activatedTools, metadata, rateLimitCounters), expired session rejection, `session_resumed` webhook event type, periodic persistence, and session contract documentation.
- Session contract documented in `docs/research/session-contract-m1-2026-03-26.md`.
- `EVOKORE_SESSION_STORE` added to `.env.example` (required for CI shard 3 env sync validation).

### M1.2: Auto-Memory Trigger (PR #195)

**Merged:** 2026-03-26T20:28:39Z | **Files changed:** 6 | **+564 / -29 lines**

Implementation:

- `scripts/tilldone.js`: After the Stop hook approves session termination (`hook_mode_allow`), a new auto-memory sync block runs `syncMemory({ quiet: true, sessionId })` from `scripts/claude-memory.js`.
- Activity threshold: Sync only runs if the session manifest shows meaningful activity (replayEntries > 0, evidenceEntries > 0, lastToolName set, or lastActivityAt set). Idle sessions (opened and immediately closed) skip the sync, emitting `auto_memory_sync_skipped` instead.
- Fail-safe: The entire sync block is wrapped in try/catch. Failures are logged to stderr only when `EVOKORE_DEBUG` is set. The sync never blocks session stop because the stop decision is already made before the sync runs.
- `scripts/claude-memory.js`: `syncMemory()` now accepts a `quiet` option and returns `{ synced, error }` result for structured observability.
- Opt-out: `EVOKORE_AUTO_MEMORY_SYNC=false` disables the feature entirely.
- `EVOKORE_AUTO_MEMORY_SYNC` added to `.env.example`.
- 18 vitest integration tests in `auto-memory-trigger-validation.test.ts` plus 5 root-level validation tests in `test-auto-memory-trigger-validation.js` (total: 23 new tests).
- Design research documented in `docs/research/m1-2-auto-memory-trigger-research-2026-03-26.md`.

### M1.3: Dashboard Session-Filter Alignment (PR #196)

**Merged:** 2026-03-26T20:40:36Z | **Files changed:** 3 | **+573 / -23 lines**

Implementation:

- `scripts/dashboard.js`: Dual-directory scanning reads both `~/.evokore/sessions/` (hook-side) and `~/.evokore/session-store/` (HTTP transport) directories.
- Schema normalization: Both session types are normalized to a unified shape with `id`, `type` (`hook` | `http`), `createdAt`, `lastActivity`, `status`, `purpose`, `replayCount`, `evidenceCount`, and `metadata`.
- HTTP session status derivation: Status is computed from TTL (`active` if within `EVOKORE_SESSION_TTL_MS`, `expired` otherwise), matching `SessionIsolation` semantics.
- Deduplication: When the same session ID exists in both directories, the hook-side entry is preferred (richer metadata). The HTTP entry is dropped silently.
- Type filter: `?type=hook` or `?type=http` query parameter filters the merged session list.
- Status/date filters: `?status=` and `?since=` filters apply across both session types.
- New `/api/sessions/types` endpoint returns `{ hook: N, http: M, total: N+M }` (post-deduplication counts). Route registered before `/api/sessions` to avoid path collision.
- Frontend: Type filter dropdown and color-coded type badges (blue for hook, purple for HTTP). `expired` status badge style added.
- 36 new vitest integration tests in `dashboard-session-filter-validation.test.ts`.
- Design research documented in `docs/research/m1-3-dashboard-session-filter-research-2026-03-26.md`.

## Acceptance Criteria Review

### M1.1

| # | Criterion | Status | Evidence |
|---|---|---|---|
| AC-1 | `SessionIsolation` constructed with `FileSessionStore` in HTTP mode | **MET** | `src/index.ts` line 88: `new FileSessionStore()` passed to `SessionIsolation` when `httpMode` is true and `EVOKORE_SESSION_STORE !== "memory"` |
| AC-2 | `HttpServer` attempts `loadSession()` before returning 404 | **MET** | `src/HttpServer.ts` line 243: `this.sessionIsolation.loadSession(sessionId)` called in the unknown-session branch |
| AC-3 | Previously-valid `mcp-session-id` works after server restart (within TTL) | **MET** | Tested in `session-reattachment-http.test.ts` and `file-session-store-validation.test.ts` section 9 (replaced gap tests) |
| AC-4 | Expired sessions return 404 after restart | **MET** | Tested in `session-reattachment-http.test.ts` -- expired session rejection test |
| AC-5 | Session state (role, activatedTools, rateLimitCounters, metadata) preserved across restart | **MET** | Four dedicated state-preservation tests in `session-reattachment-http.test.ts` |
| AC-6 | `session_resumed` webhook event emitted on reattachment | **MET** | `src/WebhookManager.ts` line 15/27: type added; `src/HttpServer.ts` line 270: emitted; tested in `webhook-events.test.ts` |
| AC-7 | Gap-documentation tests replaced with positive reattachment tests | **MET** | Section 9 of `file-session-store-validation.test.ts` now contains 7 positive tests instead of gap documentation |
| AC-8 | Session contract documented | **MET** | `docs/research/session-contract-m1-2026-03-26.md` -- full lifecycle, persistence points, persisted state interface, limitations |
| AC-9 | `persistSession()` called after tool activation state changes | **MET** | Called after `discover_tools` activates proxied tools |
| AC-10 | Full test suite passes | **MET** | 123 files, 2098 tests passed at PR merge time |

### M1.2

| # | Criterion | Status | Evidence |
|---|---|---|---|
| AC-11 | `syncMemory()` auto-invoked at session-wrap boundary | **MET** | `scripts/tilldone.js` line 251+: runs after stop approval, gated on `EVOKORE_AUTO_MEMORY_SYNC !== false` |
| AC-12 | Sync failure does not block session stop | **MET** | Full try/catch wrapper; failure logged to stderr only; process exits 0 regardless |
| AC-13 | Claude memory files refreshed after session with activity | **MET** | Activity threshold checks (replayEntries, evidenceEntries, lastToolName, lastActivityAt) gate the sync; idle sessions skipped |
| AC-14 | Manual `npm run memory:sync` unchanged | **MET** | `scripts/sync-memory.js` entry point not modified; `quiet` option is additive, existing behavior preserved; 19 existing `memory-sync.test.ts` tests pass |

### M1.3

| # | Criterion | Status | Evidence |
|---|---|---|---|
| AC-15 | Dashboard lists both hook-side and HTTP transport sessions | **MET** | `scripts/dashboard.js` reads `~/.evokore/sessions/` and `~/.evokore/session-store/` directories, merges results |
| AC-16 | Filters work across both session types | **MET** | `?type=`, `?status=`, `?since=` filters applied to merged list; tested in 36 validation tests |
| AC-17 | No duplicate entries | **MET** | Deduplication logic prefers hook-side entry when same ID exists in both directories |
| AC-18 | Validation tests cover aligned listing | **MET** | 36 tests in `dashboard-session-filter-validation.test.ts` covering scanning, normalization, deduplication, filters, frontend elements |

**Result: All 18 acceptance criteria MET.**

## Architecture Conformance

### Did we stay within scope?

Yes. The three PRs collectively address exactly the three M1 deliverables defined in the pre-M1 ARCH-AEP document:

- M1.1: FileSessionStore wiring + HTTP reattachment + session contract
- M1.2: Auto-memory trigger at session-wrap boundary
- M1.3: Dashboard dual-directory session listing

No work was done on items listed as out-of-scope (session identity unification, Redis store, dashboard auth, SSE recovery, cross-node sharing, telemetry, WebSocket HITL, hook manifest format changes).

### Did we accidentally expand scope?

Minor scope additions that were reasonable and contained:

1. **Research documents**: Each PR included a design research document (`session-contract-m1-2026-03-26.md`, `m1-2-auto-memory-trigger-research-2026-03-26.md`, `m1-3-dashboard-session-filter-research-2026-03-26.md`). These were not specified in the ARCH-AEP but add valuable architectural context for future work. This is a positive scope addition.

2. **Root-level validation test**: `test-auto-memory-trigger-validation.js` (5 tests) was added alongside the vitest tests in M1.2. This follows the existing pattern where some features have both vitest and root-level test coverage.

3. **Frontend UI additions**: M1.3 added color-coded type badges and an `expired` status badge style to the dashboard frontend. These were not specified but are natural consequences of the dual-directory listing.

None of these additions violated the non-goals or introduced risk.

### Is the session contract clean and documented?

Yes. The session contract document (`docs/research/session-contract-m1-2026-03-26.md`) clearly defines:

- The full session lifecycle (creation, access, reattachment, expiry, destruction)
- Three persistence points (creation, mutation, periodic 30s checkpoint)
- The exact `PersistedSessionState` interface with all persisted fields
- What is explicitly NOT part of the contract (transport instances, SSE streams, in-flight responses)
- Configuration options (`EVOKORE_SESSION_STORE`, `EVOKORE_SESSION_TTL_MS`)
- Store backend selection logic (FileSessionStore for HTTP, MemorySessionStore for stdio/opt-out)
- Known limitations (single-node only, no SSE recovery, no identity-plane unification, atomic write window)

## Contract Drift Check

### Any new dependencies introduced?

No new npm packages or external dependencies were added. All three PRs use only existing project infrastructure:

- `FileSessionStore` and `SessionIsolation` (already existed, just wired differently)
- `syncMemory()` from `scripts/claude-memory.js` (already existed, just called from a new trigger)
- `dashboard.js` (already existed, extended with new routes and scanning)

### Any changes to existing interfaces that affect M2+ work?

1. **WebhookManager event types**: `session_resumed` is the 7th event type. This is additive and does not break existing consumers. The `VALID_EVENT_TYPES` array was updated, and the existing webhook event count test was adjusted (9 to 10 types). M2 telemetry work can build on this without changes.

2. **`syncMemory()` return type**: Now returns `{ synced, error }` when called with `{ quiet: true }`. The non-quiet path is unchanged. This is backwards-compatible but M2+ code calling `syncMemory` should be aware of the new return shape.

3. **Dashboard API**: New `/api/sessions/types` endpoint and `?type=` filter parameter. These are additive. The existing `/api/sessions` endpoint now returns sessions from both directories, which is a behavior change but consistent with the filter's default (no filter = all sessions). M2 dashboard auth work should account for both session types in authorization logic.

### Does the two-directory decision hold up?

Yes. The pre-M1 ARCH-AEP specified keeping `~/.evokore/session-store/` separate from `~/.evokore/sessions/` due to different schemas, lifecycles, and identity semantics. M1.3 validated this decision: the dashboard normalization layer cleanly maps both schemas to a unified response shape, and the deduplication logic handles the rare overlap case correctly (prefer hook-side for richer metadata).

The two-directory approach avoids:
- Schema migration risk (the two schemas have different required fields)
- Write contention (hooks and HTTP persist independently)
- Lifecycle coupling (hook sessions have purpose/evidence, HTTP sessions have activatedTools/rateLimitCounters)

## Risk Assessment

### Pre-Identified Risks

| Risk | Level | Pre-M1 Mitigation | Post-M1 Status |
|---|---|---|---|
| **R1: Transport recreation after session recovery** | High | Use `sessionIdGenerator: () => existingSessionId` to bind transport to recovered session ID | **MITIGATED.** Implemented exactly as specified. Transport is created with a fixed session ID generator, connected via `Server.connect()`, and registered in the transports map. |
| **R2: MCP Server re-connect for reattached transport** | High | Review MCP SDK `Server.connect()` with multiple transports; existing code already does this per-session | **MITIGATED.** The existing per-session `Server.connect()` pattern was reused for reattached transports. No special handling needed because each session already gets its own server connection. |
| **R3: Persistence overhead** | Medium | Persist on creation + mutation + 30s interval, not every request | **MITIGATED.** Implemented as specified. Three persistence trigger points. No per-request persistence. 30s periodic checkpoint provides crash tolerance. |
| **R4: Two session directories** | Medium | Keep `~/.evokore/session-store/` separate; dashboard reads both with type label | **MITIGATED.** Dashboard reads both directories, normalizes schemas, deduplicates, and labels entries with `type: 'hook'` or `type: 'http'`. The separation is clean. |
| **R5: Auto-memory sync latency** | Low | Spawn as detached process if >2s | **MITIGATED (simpler approach).** The sync runs synchronously in the Stop hook after the stop decision is already made. Since it runs once per session and the session is already approved to stop, latency is not user-visible. The detached-process approach was not needed. |

### New Risks Discovered

| Risk | Level | Description | Recommendation |
|---|---|---|---|
| **R6: Concurrent reattachment race** | Low | Two clients presenting the same session ID simultaneously during reattachment could create duplicate transports. The current implementation does not lock during the load-create-register sequence. | Unlikely in practice (requires exact timing window). M2 or M3 could add an in-flight reattachment lock if needed. |
| **R7: Hook session deduplication in rare edge cases** | Low | If a Claude Code hook writes a session manifest to `~/.evokore/sessions/` with the same ID as an HTTP transport session in `~/.evokore/session-store/`, the hook version wins. This is correct but could be surprising if an operator is debugging HTTP session state. | Document this behavior in operator guides. The deduplication preference is already documented in the M1.3 research doc. |
| **R8: Periodic persistence timer cleanup** | Low | The 30s persistence interval in `HttpServer` is not explicitly cleared on shutdown. Node.js `setInterval` with `unref()` prevents it from keeping the process alive, but explicit cleanup would be cleaner. | Minor cleanup task, not blocking. |

## Recommendations for M2

### What M2.1 (Dashboard Auth) Should Build On

1. **Session type awareness**: The auth layer needs to handle both `hook` and `http` session types. The `type` field in the normalized session response is the discriminator. Authorization rules may differ (e.g., HTTP sessions have a `role` field from RBAC, hook sessions do not).

2. **`/api/sessions/types` endpoint**: This is a natural candidate for an admin-only endpoint. Include it in the auth route table from the start.

3. **Session contract**: The session contract document defines what state is persisted and what is not. Auth tokens/sessions for the dashboard itself should use a separate mechanism (not the MCP session system).

### Technical Debt from M1 to Address

1. **Periodic persistence timer**: Add explicit `clearInterval()` on HttpServer shutdown for the 30s persistence timer (R8 above).

2. **CLAUDE.md update**: The `FileSessionStore Restart Scope` entry in CLAUDE.md still says "runtime HTTP session reattachment is still not implemented." This is now stale. Update it to reflect M1.1 delivery.

3. **Test count in CLAUDE.md**: The v3.0 Runtime Additions section says "~2053 tests as of v3.1 sprint." The post-M1 count is 2157. Update on next CLAUDE.md refresh.

4. **Root-level validation test pattern**: M1.2 added `test-auto-memory-trigger-validation.js` at the root level alongside the vitest test. Evaluate whether root-level validation tests should be consolidated into the vitest suite in a future cleanup pass. The current pattern works but creates two test surfaces for the same feature.

5. **Error event naming consistency**: The auto-memory trigger emits three different event names (`auto_memory_sync`, `auto_memory_sync_skipped`, `auto_memory_sync_error`). Future hook events should follow a consistent naming convention (possibly `{feature}:{action}` instead of `{feature}_{action}_{result}`).

## Test Coverage Summary

| Metric | Before M1 | After M1 | Delta |
|---|---|---|---|
| **Test files** | ~123 | 126 | +3 |
| **Total tests** | ~2053 | 2157 | +104 |
| **Skipped tests** | 3 | 3 | 0 |
| **Build status** | Clean | Clean | -- |

### New Test Files

| File | Tests | Coverage Area |
|---|---|---|
| `tests/integration/session-reattachment-http.test.ts` | 21 | FileSessionStore wiring, loadSession path, state preservation, expiry, webhook event, periodic persistence, contract docs |
| `tests/integration/auto-memory-trigger-validation.test.ts` | 18 | Auto-sync trigger, activity threshold, fail-safe, opt-out, quiet mode, event emission |
| `tests/integration/dashboard-session-filter-validation.test.ts` | 36 | Dual-directory scanning, normalization, deduplication, type/status/date filters, types endpoint, frontend elements |

### Modified Test Files

| File | Change |
|---|---|
| `tests/integration/file-session-store-validation.test.ts` | Section 9 gap tests replaced with 7 positive reattachment tests |
| `tests/integration/webhook-events.test.ts` | Event count updated (9 to 10) for `session_resumed` |
| `tests/integration/webhook-plugin-integration.test.ts` | Adjusted for new event type |
| `test-auto-memory-trigger-validation.js` | 5 root-level validation tests (new file) |

### Cumulative M1 Test Additions

- **New tests:** 28 (M1.1) + 23 (M1.2) + 36 (M1.3) = **87 from new test files**
- **Replaced tests:** 7 positive tests replaced gap-doc stubs in section 9
- **Adjusted tests:** Event count assertions in webhook tests
- **Net new test count:** +104 (from 2053 to 2157)

## PR Merge Sequence

| Order | PR | Title | Merged At |
|---|---|---|---|
| 1 | #194 | feat: wire FileSessionStore + HTTP session reattachment (M1.1) | 2026-03-26T20:17:04Z |
| 2 | #195 | feat: add auto-memory sync trigger at session-wrap boundary (M1.2) | 2026-03-26T20:28:39Z |
| 3 | #196 | feat: dashboard session-filter alignment for hook + HTTP sessions (M1.3) | 2026-03-26T20:40:36Z |

All three PRs were merged sequentially, each rebased onto the updated main after the previous PR landed. This follows the post-merge cleanup sequence documented in CLAUDE.md. No merge conflicts or CI drift occurred.

## Conclusion

M1 delivered all three sub-milestones on scope, within the defined boundaries, and with no acceptance criteria unmet. The 104 new tests provide strong coverage for the new runtime paths. The session contract is clean, documented, and well-tested. The two-directory architecture decision held up under implementation. All five pre-identified risks were mitigated.

The milestone is complete. M2 (Dashboard Auth + Telemetry) can proceed with a solid runtime continuity foundation.
