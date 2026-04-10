# EVOKORE Authority Precedence Design

**Created:** 2026-04-10
**ECC Item:** Tier 1 [C4]
**Status:** Draft — documents current implementation + identifies gaps for future phases

---

## Overview

This document specifies the authority model governing who can call what in EVOKORE-MCP. It covers:
1. The permission resolution algorithm
2. The precedence of multiple authority sources
3. Current implementation gaps
4. The forward-looking ordering for planned features (steering modes, SOUL.md, RBAC enforcement on native tools)

---

## Current Authority Sources (implemented)

Three sources can assert authority for a given tool call, in precedence order:

### Source 1: Explicit caller-provided role (highest precedence)
**Where:** `SecurityManager.checkPermission(toolName, role?)` parameter.
**Scope:** Single call. Overrides all other sources for that call only.
**Used by:** `ProxyManager.callProxiedTool()` passes `sessionRole` here.
**Not used by:** Native tool dispatch (`src/index.ts:664-672`) — see Gap G-01.

### Source 2: Process-wide active role
**Where:** `SecurityManager.activeRole` — set from `process.env.EVOKORE_ROLE` at startup, or from `permissions.yml active_role`, or mutated at runtime by `setActiveRole()`.
**Scope:** Process-wide, all sessions.
**Fallback:** Used when no explicit role is passed to `checkPermission()`.

### Source 3: Flat permission rules (lowest precedence for unroled calls; can override role)
**Where:** `permissions.yml rules:` section. Key = tool name, value = `allow|require_approval|deny`.
**Important:** Flat rules in `rules:` take priority over role `overrides:` (see Algorithm below). This is counterintuitive and may be a design decision to revisit.
**Fallback:** `EVOKORE_SECURITY_DEFAULT_DENY=true` denies any tool not explicitly listed; else default-allow.

---

## Permission Resolution Algorithm

For any `checkPermission(toolName, role?)` call:

```
1. effectiveRole = role ?? this.activeRole

2. If effectiveRole is set AND role exists in this.roles:
   a. If rules[toolName] exists -> return rules[toolName]   <- flat rules WIN over role
   b. If roleDef.overrides[toolName] exists -> return it
   c. Return roleDef.default_permission

3. If no role active:
   a. If rules[toolName] exists -> return it
   b. If EVOKORE_SECURITY_DEFAULT_DENY -> return "deny"
   c. Return "allow"
```

**Source:** `src/SecurityManager.ts:85-119`

### Design note on step 2a
Flat `rules:` entries beat role `overrides:` entries. This means a `rules: { fs_write_file: allow }` in `permissions.yml` gives everyone (including `readonly`) write access via the proxied path. Operators should be aware that `rules:` is not "per-role" but "override-everything." A future refactor should consider inverting this so roles take priority and `rules:` are truly a baseline default.

---

## Role Definitions

Defined in `permissions.yml:15-46`:

| Role | Default permission | Notable overrides |
|---|---|---|
| `admin` | `allow` | None (everything allowed) |
| `developer` | `require_approval` | Read-heavy tools `allow`; destructive Supabase `deny` |
| `readonly` | `deny` | ~8 read-only tools `allow` |

---

## How Session Role Reaches SecurityManager

### Proxied tool path (RBAC enforced)
```
index.ts (line 673) ->
  session = sessionIsolation.getSession(sessionId)
  sessionRole = session?.role ?? undefined  ->
    ProxyManager.callProxiedTool(toolName, args, sessionRole, ...)  ->
      SecurityManager.checkPermission(toolName, sessionRole)
```

### Native/skill tool path (RBAC NOT enforced at dispatch)
```
index.ts (line 664) ->
  nativeSession = sessionIsolation.getSession(nativeSessionId)
  skillContext = { sessionId, role: nativeSession?.role ?? null, metadata }  ->
    SkillManager.handleToolCall(toolName, args, skillContext)
```

The `role` in `skillContext` is used ONLY to set `EVOKORE_SESSION_ROLE` env var in sandbox executions (`src/SkillManager.ts:788`). `SecurityManager.checkPermission()` is NOT called for native tool dispatch.

**Implication:** `execute_skill`, `refresh_skills`, `fetch_skill`, `nav_get_map`, `nav_read_anchor`, `session_context_health`, and all other native tools are accessible to ANY session role, including `readonly`.

---

## Role Mutation (setActiveRole)

`SecurityManager.setActiveRole(role, callerRole?)` at `src/SecurityManager.ts:141`:

- **If `callerRole` is supplied and is not `"admin"`:** denied, `config_change/denied` audit entry, return `false`.
- **If `callerRole === undefined` (no argument):** allowed (internal/bootstrap callers).
- **If `callerRole === null`:** allowed (explicit "no identity" — treated as system call).

Changes are process-wide, not per-session. Token TTL for approval tokens: 5 minutes (`src/SecurityManager.ts:33`).

---

## Session Role Initial Assignment Gap

`SessionIsolation.createSession(sessionId, role?)` accepts a role, but:
- `src/index.ts:798` calls `this.sessionIsolation.createSession(DEFAULT_SESSION_ID)` with no role.
- There is no `setSessionRole()` API on SessionIsolation.
- HTTP mode sessions are always created with `role: null`.

**Result:** Per-session RBAC in HTTP multi-tenant mode is currently unimplemented. All HTTP sessions run under the process-wide `activeRole`. This defeats multi-tenancy for role-differentiated workloads.

**Gap G-02 action:** Add `setSessionRole(sessionId, role)` to `SessionIsolation` and wire it into the HTTP session creation path.

---

## OAuth -> Session Role Gap

`src/auth/OAuthProvider.ts` validates Bearer tokens via JWKS. However, no code path maps JWT claims (sub, scope, role) to `SessionState.role`. The full authorization path is:

```
Client with Bearer token ->
  OAuthProvider validates JWT -> (session identified)
  HttpServer creates session -> (role always null)
  No claim extraction
```

**Gap G-03 action:** Implement a claim extractor: `OAuthProvider.extractRole(jwt): string | null` that reads a configurable claim field (`EVOKORE_OAUTH_ROLE_CLAIM`, defaulting to `role`), and pass the result into `SessionIsolation.createSession(sessionId, extractedRole)`.

---

## Implementation Gaps Summary

| ID | Description | Severity | Source |
|---|---|---|---|
| G-01 | Native tool dispatch bypasses SecurityManager.checkPermission() | HIGH | `src/index.ts:664-672` |
| G-02 | No API to set session role after creation; HTTP sessions always role=null | MED | `src/SessionIsolation.ts` |
| G-03 | OAuth JWT claims never mapped to session role | MED | `src/auth/OAuthProvider.ts` |
| G-04 | Flat rules: beat role overrides: in permissions.yml — unintuitive layering | LOW | `src/SecurityManager.ts:98` |
| G-05 | setActiveRole callerRole=null treated same as callerRole=undefined | LOW (style) | `src/SecurityManager.ts:160` |
| G-06 | No precedence defined for planned features (steering modes, SOUL.md) | PLANNING | Future phases |

---

## Forward-Looking Precedence Order (planned)

When steering modes and SOUL.md are implemented (ECC Phases 1-3), the intended authority evaluation order is:

```
1. Damage-control hard denies (always first — non-bypassable)
2. RBAC role check (admin / developer / readonly)
3. Damage-control soft rules (pattern-based gate)
4. Session isolation scope (what this session is allowed to do)
5. Steering mode context (e.g., READONLY_MODE blocks write tools)
6. SOUL.md defaults (operator-configured behavior layer)
7. Flat rules in permissions.yml (baseline)
8. Default-allow/deny (EVOKORE_SECURITY_DEFAULT_DENY)
```

Items 1-4 are partially implemented. Items 5-8 (steering modes, SOUL.md) are planned for ECC Phases 1-3.

This ordering must be codified in code BEFORE implementing steering modes to prevent ad-hoc precedence decisions that are hard to audit later.

---

## Design Decisions Required Before Next Phase

1. **G-01 resolution:** Should native tools (skill execution, nav anchors, session analytics) be subject to RBAC? If yes, route them through `checkPermission()` at `index.ts` dispatch. If no, document explicitly and add a `readOnlyHint`-equivalent warning.

2. **G-04 resolution:** Should flat `rules:` continue to beat role `overrides:`, or should role overrides take priority? This changes which value wins at step 2a/2b in the algorithm.

3. **Claim extraction from OAuth:** What JWT claim field carries the role? Default `role`? Custom claim? Configurable via `EVOKORE_OAUTH_ROLE_CLAIM`?

---

## Related Documents
- `docs/ECC-INTEGRATION-PLAN.md` — phases that depend on this design
- `src/SecurityManager.ts` — implementation (algorithm at lines 85-119)
- `src/SessionIsolation.ts` — session role storage
- `src/ProxyManager.ts` — proxied-tool RBAC enforcement (lines 642-657)
- `src/index.ts` — native-tool dispatch path (lines 664-672)
- `permissions.yml` — role definitions and flat rules
