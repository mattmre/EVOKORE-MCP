# ARCH-AEP Post-M2 Review: Secure Operator Platform

## Review Date
2026-03-26

## 1. Executive Summary

Milestone M2 delivered all four sub-milestones (dashboard auth/authz, internal telemetry/audit, Supabase live validation, container sandbox isolation) within the defined scope boundaries established in the revised roadmap. No M3 scope (Redis, WebSocket HITL, external telemetry export) leaked into the implementation. The 168 new tests across 4 test files provide strong validation coverage. One actionable security finding was identified: the `redactForAudit()` function is exported and tested but is not wired into any actual audit log write path, creating a gap between the documented redaction guarantee and runtime behavior.

## 2. Per-Deliverable Conformance Assessment

### M2.1: Dashboard Authentication and Authorization (PR #198)

**Roadmap scope:** Dashboard auth/authz contract and validation boundary normalization.

**Conformance: PASS**

| Exit Criterion | Status | Evidence |
|---|---|---|
| Dashboard access is authenticated | MET | Bearer token auth via `EVOKORE_DASHBOARD_TOKEN`; `crypto.timingSafeEqual` for timing-safe comparison |
| Dashboard access is scoped | MET | RBAC with `admin > developer > readonly` hierarchy; route-level authorization table with 10 route entries |
| Backward compatibility preserved | MET | When no token is set, all routes open with admin role, matching pre-M2 behavior |
| Rate limiting on auth failures | MET | 5 failures per 60s window triggers 5-minute lockout per IP |
| Security headers | MET | `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`, `Cache-Control: no-store` |
| Test coverage | MET | 47 tests in `dashboard-auth-validation.test.ts` |

### M2.2: Internal Telemetry and Auditability (PR #199)

**Roadmap scope:** Internal telemetry for session/auth/approval events.

**Conformance: PASS with WARN (F1)**

| Exit Criterion | Status | Evidence |
|---|---|---|
| Operator-relevant events are observable | MET | `AuditLog.ts` writes JSONL entries for 7 event types |
| Opt-in gating | MET | `EVOKORE_AUDIT_LOG=true` required; disabled by default |
| Sensitive data redaction | PARTIAL | `redactForAudit()` exported and tested but not wired into write sites |
| Session/auth metrics in TelemetryManager | MET | v2 schema with session and auth lifecycle counters |
| Dashboard audit endpoints | MET | `/api/audit` and `/api/audit/summary` (admin-only) |
| Test coverage | MET | 21 tests in `internal-telemetry-validation.test.ts` |

### M2.3: Supabase Live Validation (PR #200)

**Roadmap scope:** External integrations validated under opt-in credential flow.

**Conformance: PASS**

| Exit Criterion | Status | Evidence |
|---|---|---|
| External integrations validated | MET | 36 tests covering config, credential-gated live integration, degradation |
| Opt-in credential flow | MET | `describe.skipIf(!hasCredentials)` pattern |
| Permission tiers validated | MET | All 19 tools across 3 tiers tested |
| RBAC integration | MET | `developer` and `readonly` role overrides verified |

### M2.4: Container Sandbox Isolation (PR #201)

**Roadmap scope:** Sandbox execution has materially stronger isolation than temp-dir subprocess.

**Conformance: PASS**

| Exit Criterion | Status | Evidence |
|---|---|---|
| Materially stronger isolation | MET | 7 security controls: `--network=none`, `--read-only`, `--memory=256m`, `--cpus=1`, `--pids-limit=100`, `--security-opt=no-new-privileges`, `--user=1000:1000` |
| Graceful fallback | MET | `ProcessSandbox` implements same interface; auto-detection and fallback |
| SkillManager integration | MET | `executeCodeBlock()` delegates to `createSandbox()`; response shows sandbox type |
| Test coverage | MET | 64 tests in `container-sandbox-validation.test.ts` |

## 3. Cross-Cutting Concerns

### 3.1 Contract Drift Check

**Verdict: No drift detected.**

- `AuditLog.AuditEntry.sessionId` accepts the same string IDs from `SessionIsolation`
- `TelemetryManager` lifecycle counters align with `HttpServer` and audit log call sites
- Dashboard auth (`EVOKORE_DASHBOARD_TOKEN`) is separate from MCP session identity
- Two-directory architecture (`~/.evokore/sessions/` + `~/.evokore/session-store/`) intact
- `ContainerSandbox` operates at tool execution layer, not session layer

### 3.2 Dependency Readiness for M3

| M3 Deliverable | Dependency | Status |
|---|---|---|
| M3.1: Redis SessionStore | Canonical session contract (M1) | Satisfied |
| M3.3: WebSocket HITL | Dashboard auth (M2.1) | Satisfied |
| M3.2: External Telemetry | Internal telemetry clarity (M2.2) | Satisfied |

### 3.3 Security Review Summary

| Control | Status |
|---|---|
| Bearer token timing-safe comparison | PASS |
| Rate limiting on auth failures | PASS |
| Container sandbox network isolation | PASS |
| Container sandbox resource limits | PASS |
| Container sandbox privilege escalation prevention | PASS |
| ProcessSandbox env var isolation | PASS |
| Dashboard security headers | PASS |
| Input sanitization | PASS |

### 3.4 Scope Creep Check

**Verdict: Clean — no scope creep detected.**

- No Redis, WebSocket, or external telemetry export code in any M2 file
- No TODO/FIXME markers representing deferred M3 scope
- No M1 contracts modified by any M2 PR

## 4. Findings Table

| # | Issue | Severity | Recommendation |
|---|---|---|---|
| F1 | `redactForAudit()` not wired into audit write sites | Medium | Wire into metadata-accepting `auditLog.log()` calls or document current sites as known-safe |
| F2 | `TelemetryManager` recording methods lack optional `sessionId` | Low | Add optional param for future per-session telemetry |
| F3 | `redactSensitiveArgs()` and `redactForAudit()` use overlapping but non-identical key lists | Low | Consolidate into shared utility in future cleanup |
| F4 | Container `/tmp/sandbox/` bind mount is read-only (by design) | Info | No action needed |
| F5 | `ProcessSandbox` carries `NODE_ENV` in env allowlist | Info | Consider removing for fully neutral sandbox environment |
| F6 | Supabase research doc header says "4 require_approval" but implementation has 6 | Low | Fix doc inconsistency |
| F7 | `unsafe-inline` in dashboard CSP | Low/Accepted | Required by zero-dependency constraint; acceptable for local operator tool |

## 5. Test Coverage Summary

| Test File | Tests | Deliverable |
|---|---|---|
| `dashboard-auth-validation.test.ts` | 47 | M2.1 |
| `internal-telemetry-validation.test.ts` | 21 | M2.2 |
| `supabase-live-validation.test.ts` | 36 | M2.3 |
| `container-sandbox-validation.test.ts` | 64 | M2.4 |
| **Total M2 tests** | **168** | |

## 6. M3 Readiness Assessment

M3 can proceed. All M2 exit criteria are met and M3 dependencies are satisfied:

1. **Redis SessionStore (M3.1):** `PersistedSessionState` interface and `SessionStore` API (`get`, `set`, `delete`, `has`) are stable
2. **External Telemetry (M3.2):** `TelemetryMetrics` v2 and `AuditEntry` provide clear internal models to export
3. **WebSocket HITL (M3.3):** Bearer token auth, RBAC, and approval governance model provide the foundation
4. **Worktree Cleanup (M3.4):** No M2 dependencies

## 7. Final Verdict

**CONDITIONAL PASS**

M2 is architecturally sound, scope-clean, and well-tested. The condition for full pass: F1 must be addressed before M3 merge — wire `redactForAudit()` into audit log call sites or explicitly document current sites as known-safe.

All other findings (F2-F7) are informational or low-severity and can be addressed opportunistically.
