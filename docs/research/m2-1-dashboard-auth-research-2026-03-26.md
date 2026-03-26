# M2.1: Dashboard Authentication and Authorization Research

## Date

2026-03-26

## Problem Statement

The EVOKORE session dashboard (`scripts/dashboard.js`) runs on `127.0.0.1:8899` and previously had only optional Basic Auth via `EVOKORE_DASHBOARD_USER` / `EVOKORE_DASHBOARD_PASS`. Any process or user on the local machine could access all session data, approval tokens, and replay logs without credentials. M2.1 adds trust boundaries through Bearer token authentication, role-based authorization, rate limiting, and security headers.

## Design Decisions

### 1. Bearer Token over Basic Auth

**Decision:** Replace Basic Auth with Bearer token authentication.

**Rationale:**
- Bearer tokens align with the existing `OAuthProvider` pattern in `src/auth/OAuthProvider.ts`, which also uses `Authorization: Bearer <token>`.
- Basic Auth requires the browser to cache credentials in its own prompt UI, which is opaque and hard to invalidate.
- Bearer tokens can be stored in `sessionStorage` (cleared on browser close), giving the dashboard explicit session lifecycle control.
- `crypto.timingSafeEqual` is used for timing-safe token comparison, matching the pattern from `OAuthProvider.validateToken()` and the existing `checkCredentials()` function.

### 2. Role-Based Access Control (RBAC)

**Decision:** Use a single `EVOKORE_DASHBOARD_ROLE` env var that sets the effective role for the dashboard instance.

**Route-level authorization table:**

| Route | Required Role | Rationale |
|---|---|---|
| GET `/` (dashboard HTML) | readonly | View-only session browsing |
| GET `/api/sessions` | readonly | List sessions |
| GET `/api/sessions/types` | readonly | Session type counts |
| GET `/api/sessions/:id/replay` | readonly | View replay data |
| GET `/api/sessions/:id/evidence` | readonly | View evidence data |
| GET `/approvals` (HTML) | developer | Approval management UI |
| GET `/api/approvals` | developer | List pending approvals |
| POST `/api/approvals/deny` | admin | Deny approval tokens (destructive) |
| GET `/login` | public | Login page (no auth) |
| GET `/api/auth/status` | public | Auth status check (no auth) |

**Role hierarchy:** `admin > developer > readonly`. A higher role implicitly includes all lower-role permissions.

**Default role selection:**
- Local-only mode (no token set): defaults to `admin` for backward compatibility.
- Token mode: defaults to `readonly` for principle of least privilege.
- Explicitly set `EVOKORE_DASHBOARD_ROLE` overrides the default in either mode.

### 3. Rate Limiting

**Decision:** In-memory rate limiter for auth failures only (not all requests).

**Parameters:**
- Window: 60 seconds
- Max failures: 5
- Lockout duration: 5 minutes

**Behavior:** After 5 failed Bearer token submissions from the same IP within 60 seconds, all requests from that IP return `429 Too Many Requests` for 5 minutes. This applies before token validation, so even valid tokens are blocked during lockout (prevents timing attacks where an attacker tries to detect lockout behavior).

**Why in-memory only:** The dashboard is single-process and ephemeral. A persistent rate limiter would add complexity without benefit for a local tool.

### 4. Security Headers

All responses include:
- `X-Content-Type-Options: nosniff` -- prevents MIME type sniffing
- `X-Frame-Options: DENY` -- prevents clickjacking via iframe embedding
- `Content-Security-Policy: default-src 'self' 'unsafe-inline'` -- restricts content sources. `unsafe-inline` is required because the dashboard uses inline `<style>` and `<script>` tags (zero-dependency design constraint).

API responses additionally include:
- `Cache-Control: no-store` -- prevents caching of sensitive session/approval data

### 5. Login Page

When `EVOKORE_DASHBOARD_TOKEN` is set:
- Browser requests to authenticated routes without a Bearer token are redirected to `/login` (via `302`).
- The login page accepts the token and stores it in `sessionStorage`.
- All subsequent `fetch()` calls use an `authFetch()` wrapper that injects the `Authorization: Bearer <token>` header.
- If a `401` is received (e.g., token changed), the stored token is cleared and the user is redirected to `/login`.

When no token is set:
- `/login` redirects to `/` (no login needed in local-only mode).

## Backward Compatibility

- When `EVOKORE_DASHBOARD_TOKEN` is not set, the dashboard behaves identically to pre-M2.1 (all routes open, admin role).
- The legacy `EVOKORE_DASHBOARD_USER` / `EVOKORE_DASHBOARD_PASS` Basic Auth variables are no longer consumed. This is a breaking change for operators who used them, but they were undocumented and the replacement (Bearer token) is strictly better.
- All existing API response shapes are unchanged.

## Implementation Files

| File | Change |
|---|---|
| `scripts/dashboard.js` | Replaced Basic Auth with Bearer token auth, added RBAC, rate limiting, security headers, login page, `/api/auth/status` endpoint |
| `.env.example` | Added `EVOKORE_DASHBOARD_TOKEN` and `EVOKORE_DASHBOARD_ROLE` |
| `tests/integration/dashboard-auth-validation.test.ts` | 42 new tests across 8 sections |
| `docs/research/m2-1-dashboard-auth-research-2026-03-26.md` | This document |

## Test Coverage

| Section | Tests | Coverage |
|---|---|---|
| 1. Local-only mode | 8 | Backward compatibility, security headers, default role |
| 2. Token mode | 11 | Auth enforcement, login page, 401/302 behavior |
| 3. RBAC role authorization | 12 | readonly/developer/admin permission boundaries |
| 4. Rate limiting | 3 | Failure counting, 429 lockout |
| 5. Security headers | 5 | Header presence on all response types |
| 6. Custom role config | 2 | Env var override |
| 7. Auth status endpoint | 5 | Public access, mode/auth/role fields |
| 8. Invalid role fallback | 1 | Bad role defaults to readonly |
| **Total** | **47** | |

## Risks and Limitations

| Risk | Level | Mitigation |
|---|---|---|
| Token in env var (not rotated) | Medium | Document rotation procedure. Future: support JWKS for JWT-based auth |
| `unsafe-inline` in CSP | Low | Required by zero-dependency constraint. Nonce-based CSP would require refactoring HTML generation |
| Rate limiter not persistent | Low | Acceptable for single-process local tool. Resets on restart. |
| No session deletion endpoint | Note | Not implemented in M2.1. Planned for future milestone. |

## References

- M2 recommendations in `docs/research/arch-aep-post-m1-review-2026-03-26.md`
- Existing OAuth pattern: `src/auth/OAuthProvider.ts`
- RBAC roles: `src/SessionIsolation.ts`
