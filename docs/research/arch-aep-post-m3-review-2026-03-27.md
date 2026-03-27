# ARCH-AEP Post-M3 Review: Scale and Real-Time Runtime

## Review Date
2026-03-27

## 1. Executive Summary

Milestone M3 delivered all four roadmap slices within the scope boundaries set by
the revised roadmap:

- M3.1 Redis `SessionStore`
- M3.2 external telemetry export
- M3.3 WebSocket HITL real-time approvals
- M3.4 worktree cleanup automation

The milestone stayed inside the intended dependency spine. Redis builds on the
canonical session contract from M1, telemetry export extends the internal
telemetry model from M2 without exporting audit data, WebSocket HITL builds on
the existing approval governance and dashboard auth surface, and worktree
cleanup stays operational rather than altering runtime contracts.

No blocking contract, privacy, or governance regressions were found in the
merged implementation. The remaining items are explicit follow-up candidates
already queued in `next-session.md`, not hidden scope drift inside M3.

## 2. Per-Deliverable Conformance Assessment

### M3.1: Redis SessionStore Adapter (PR #205)

**Roadmap scope:** Redis session-store contract compatibility with the canonical
session model.

**Conformance: PASS**

| Exit Criterion | Status | Evidence |
|---|---|---|
| Session persistence can move beyond local file-backed storage | MET | `src/stores/RedisSessionStore.ts` implements the existing `SessionStore` contract and is wired from `src/index.ts` when `EVOKORE_SESSION_STORE=redis` |
| Canonical session contract preserved | MET | Store methods keep the same `PersistedSessionState` shape used by M1 reattachment |
| Operator configuration is documented | MET | `.env.example` documents `EVOKORE_SESSION_STORE=redis`, `EVOKORE_REDIS_URL`, `EVOKORE_REDIS_KEY_PREFIX` |
| Runtime remains safe when Redis is absent | MET | Dynamic import + optional dependency model surfaces a clear runtime error only when the redis path is selected |
| Validation coverage exists | MET | `tests/integration/redis-session-store-validation.test.ts` adds 61 tests; PR `#205` merged with 2378 passing tests and 24 skipped |

### M3.2: External Telemetry Export (PR #204)

**Roadmap scope:** External telemetry schema based on already-shipped internal
telemetry.

**Conformance: PASS**

| Exit Criterion | Status | Evidence |
|---|---|---|
| Telemetry can be exported safely and intentionally | MET | `src/TelemetryExporter.ts` is gated behind `EVOKORE_TELEMETRY=true` and `EVOKORE_TELEMETRY_EXPORT=true` |
| Export stays metrics-only | MET | Research and implementation scope only aggregate `TelemetryMetrics`; no session IDs, audit entries, tool args, or tool names are exported |
| Delivery is authenticated | MET | HMAC-SHA256 signing via `X-EVOKORE-Signature` |
| Export path is operationally bounded | MET | 10s timeout, in-flight backpressure guard, 3 retries with exponential backoff |
| Validation coverage exists | MET | `tests/integration/telemetry-export-validation.test.ts` adds 43 tests; PR `#204` merged with 2366 passing tests and 18 skipped |

### M3.3: WebSocket HITL Real-Time Approvals (PR #206)

**Roadmap scope:** WebSocket approval transport built on the existing approval
model and dashboard auth.

**Conformance: PASS**

| Exit Criterion | Status | Evidence |
|---|---|---|
| Approval flows can operate in near real time | MET | `src/HttpServer.ts` exposes `/ws/approvals`; `scripts/dashboard.js` consumes live approval events with reconnect + polling fallback |
| Existing governance model is preserved | MET | `src/SecurityManager.ts` emits typed approval lifecycle callbacks on generate / consume / deny without replacing the underlying approval-token model |
| Dashboard auth/RBAC boundary remains in force | MET | WebSocket path is authenticated and bounded by the existing dashboard auth surface |
| Backward compatibility is preserved | MET | File-based approval IPC remains intact; dashboard falls back to polling when WebSocket is unavailable |
| Validation coverage exists | MET | `tests/integration/websocket-hitl-validation.test.ts` adds 39 tests; existing HITL UI and dashboard hardening suites remain green |

### M3.4: Worktree Cleanup Automation (PR #203)

**Roadmap scope:** Operational follow-through that reduces cleanup overhead
without harming active work.

**Conformance: PASS**

| Exit Criterion | Status | Evidence |
|---|---|---|
| Repo hygiene automation reduces operator cleanup overhead | MET | `scripts/worktree-cleanup.js` classifies stale worktrees and supports machine-readable output |
| Destructive behavior is safety-gated | MET | Dry-run is the default; `--apply` is required for removal |
| Active / risky worktrees are protected | MET | Safety checks cover uncommitted changes, unpushed commits, active sessions, open PRs, and lock files |
| Existing parsing logic is reused | MET | Script reuses `parseWorktreePorcelain` from `scripts/repo-state-audit.js` instead of duplicating parser logic |
| Validation coverage exists | MET | `test-worktree-cleanup-validation.js` plus `test-repo-state-audit-validation.js`; post-merge stabilization in PR `#208` restored the correct `node --check` validation model |

## 3. Cross-Cutting Concerns

### 3.1 Contract Drift Check

**Verdict: No blocking drift detected.**

- **Session continuity contract:** M3.1 extends persistence through the existing
  `SessionStore` boundary rather than redefining session identity or state.
- **Telemetry contract:** M3.2 exports aggregate counters from
  `TelemetryManager` and does not create a second audit/event contract.
- **Approval contract:** M3.3 adds transport for approval lifecycle updates but
  preserves the existing approval-token model and dashboard auth controls.
- **Operational boundary:** M3.4 operates on git worktree state only and does
  not alter runtime session or approval semantics.

### 3.2 Dependency Readiness for the Next Queue

| Follow-Up Slice | Dependency From M3 | Status |
|---|---|---|
| S3.6 Prometheus `/metrics` pull endpoint | Exported telemetry model | Ready |
| S3.7 Dashboard approve-over-WebSocket | Existing WebSocket approval event channel + dashboard auth | Ready |
| S3.8 Audit event export | Internal audit + telemetry models remain separate and clear | Ready |
| S3.9 Sandbox seccomp/resource hardening | Container sandbox base implementation from M2.4 | Ready |

### 3.3 Security / Reliability Summary

| Concern | Status |
|---|---|
| Redis store keeps canonical session payload shape | PASS |
| External telemetry remains metrics-only and HMAC-signed | PASS |
| WebSocket approvals stay auth-gated and preserve fallback | PASS |
| Worktree cleanup defaults to non-destructive mode | PASS |

### 3.4 Scope Creep Check

**Verdict: Clean.**

The following items were explicitly **not** folded into M3 and remain queued as
follow-up work:

- Prometheus `/metrics` pull endpoint
- Dashboard approve action over WebSocket
- Audit event export
- `seccomp` profiles, image pre-pull, and per-language sandbox limits

That matches the roadmap and the current `next-session.md` queue, so the follow-up
work remains visible instead of being hidden as half-landed behavior.

### 3.5 Post-Merge Stabilization Status

Post-merge stabilization is complete for the M3 wave:

- post-M2 finding F1 was fixed in PR `#207`
- the remaining local baseline blocker in `test-worktree-cleanup-validation.js`
  was fixed in PR `#208`
- control-plane sync landed in PR `#209`
- clean merged-main validation after PR `#209` passed:
  - `npm test`: 135 files, 2462 passed, 24 skipped
  - `npm run build`
  - `npm run repo:audit` with 0 open PRs and no control-plane drift

## 4. Findings Table

No blocking findings were identified in the landed M3 implementation. The
remaining items are explicit follow-up queue entries:

| # | Issue | Severity | Recommendation |
|---|---|---|---|
| F1 | Telemetry is export-push only; no Prometheus `/metrics` pull surface yet | Low | Handle as S3.6 with a dedicated pull-endpoint PR |
| F2 | WebSocket HITL adds live event transport, but dashboard action submission is still asymmetric | Low | Handle as S3.7 by adding approve-over-WebSocket deliberately rather than changing the current contract implicitly |
| F3 | Audit event export remains separate from aggregate telemetry export | Info | Keep the separation explicit and implement only as a dedicated S3.8 slice |
| F4 | Sandbox hardening queue (`seccomp`, image pre-pull, per-language limits) remains open outside M3 | Info | Keep it as S3.9 rather than backfilling it into the closed M3 milestone |

## 5. Test Coverage Summary

| Test File | Tests | Deliverable |
|---|---|---|
| `tests/integration/redis-session-store-validation.test.ts` | 61 | M3.1 |
| `tests/integration/telemetry-export-validation.test.ts` | 43 | M3.2 |
| `tests/integration/websocket-hitl-validation.test.ts` | 39 | M3.3 |
| `test-worktree-cleanup-validation.js` | 1 file-level validation suite | M3.4 |
| `tests/integration/hitl-approval-ui.test.ts` | existing suite remains green | M3.3 regression coverage |
| `tests/integration/dashboard-hardening.test.ts` | existing suite remains green | M3.3 regression coverage |

Current merged validation baseline after PR `#209`:

- **Test files:** 135 passed
- **Tests:** 2462 passed, 24 skipped
- **Build:** clean

## 6. M4 / Next-Slice Readiness Assessment

This review artifact closes the missing M4 review loop for the M3 milestone.
The next queue should move from review closure into the explicit follow-up
slices, while release publication remains operator-gated on `NPM_TOKEN`.

Recommended next execution order after this review lands:

1. operator verifies or sets `NPM_TOKEN`, then completes npm publication flow
2. S3.6 Prometheus `/metrics` pull endpoint
3. S3.7 dashboard approve-over-WebSocket
4. S3.8 audit event export
5. S3.9 sandbox hardening

## 7. Final Verdict

**PASS with follow-up queue**

M3 is architecturally sound, scope-clean, and fully stabilized on merged
`main`. The remaining work is visible, intentionally separate, and ready to be
handled as fresh sequential slices rather than as latent defects inside the M3
milestone.
