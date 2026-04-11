# RBAC Session Gaps Research

**Date:** 2026-04-11
**Session:** Task-01 — fix/rbac-session-gaps
**Status:** Research complete → implementation in progress

---

## Summary

Three RBAC gaps exist where the permission enforcement was completed for the proxied-tool HTTP initial session path but never extended to native tools, session role updates, or JWT-driven role refresh on reattach/existing sessions.

Root cause shared by all three: RBAC plumbing completed for proxied tool path on initial HTTP session create, but never extended to (a) native tools, (b) session role updates after creation, (c) JWT-driven role refresh on reattach/existing sessions.

---

## G-01: Native tool dispatch bypasses SecurityManager.checkPermission()

**Severity:** HIGH  
**File:** `src/index.ts` lines 642–681

### Current state

The CallToolRequestSchema handler dispatches via a `source` ladder at lines 642–681. The native-tool branch (lines 664–672) builds a `SkillExecutionContext` and calls `skillManager.handleToolCall(toolName, args, skillContext)`. `SkillManager.handleToolCall` (`src/SkillManager.ts:1032`) **never calls `securityManager.checkPermission`**.

The same gap applies to every other native branch:
- `index.ts:648` — `discover_tools` direct call
- `index.ts:650` — `refresh_skills`
- `index.ts:652` — `fetch_skill`
- `index.ts:654` — `reload_plugins`
- `index.ts:656–657` — `telemetryManager.handleToolCall` (`get_telemetry`, `reset_telemetry`)
- `index.ts:658–659` — `navAnchorManager.handleToolCall` (`nav_get_map`, `nav_read_anchor`)
- `index.ts:660–661` — `sessionAnalyticsManager.handleToolCall`
- `index.ts:662–663` — `pluginManager.handleToolCall`

### Working analogue

`ProxyManager.ts:657` — `const permission = this.security.checkPermission(toolName, role);` — full HITL + deny logic follows.

The dispatcher already resolves session role for the proxied branch at `index.ts:673–678`. The role lookup pattern is correct — the gate just isn't wired into native branches.

### Fix

Add a single permission gate at the top of the `try` block (before the source dispatch ladder, after `source` is determined), **excluding `source === "proxied"` and `source === "unknown"`**.

```typescript
// Before the dispatch ladder:
const sessionId = this.getSessionId(extra);
const session = this.sessionIsolation.getSession(sessionId);
const sessionRole = session?.role ?? undefined;

if (source !== "proxied" && source !== "unknown") {
  const permission = this.securityManager.checkPermission(toolName, sessionRole);
  if (permission === "deny") {
    throw new McpError(ErrorCode.InvalidRequest,
      `Execution of '${toolName}' is strictly denied by EVOKORE-MCP security policies.`);
  }
  if (permission === "require_approval") {
    const providedToken = (args as Record<string, unknown>)?._evokore_approval_token as string | undefined;
    const strippedArgs = { ...(args as Record<string, unknown>) };
    delete strippedArgs._evokore_approval_token;
    if (!providedToken || !this.securityManager.validateToken(toolName, providedToken, strippedArgs)) {
      const newToken = this.securityManager.generateToken(toolName, strippedArgs);
      this.webhookManager?.emit("approval_requested", { tool: toolName, source, tokenPrefix: newToken.slice(0, 8) });
      return {
        content: [{ type: "text", text: `[EVOKORE-MCP SECURITY INTERCEPTOR] Tool '${toolName}' requires human approval.\nApproval token: ${newToken}\nRetry with _evokore_approval_token: "${newToken}" in args.` }],
        isError: true
      };
    }
    // Strip token before dispatch, mark for consumption after success
    (args as Record<string, unknown>)._evokore_approval_token = undefined;
    delete (args as Record<string, unknown>)._evokore_approval_token;
  }
}
```

### Risks / edge cases

1. **Token argument leak** — must strip `_evokore_approval_token` from args before native handlers receive them
2. **`unknown` source** — already throws `MethodNotFound`; do not run permission checks for unknown tools
3. **Plugin tools** — dynamic tool names may not be in `permissions.yml`; current default-allow behavior is preserved
4. **Double-consume risk** — `source === "proxied"` excluded from new gate; ProxyManager handles its own
5. **Stdio default session** — `DEFAULT_SESSION_ID` created with no role at `index.ts:798`; preserves current stdio behavior (flat permissions)

---

## G-02: SessionIsolation has no setSessionRole() API

**Severity:** MED  
**File:** `src/SessionIsolation.ts`

### Current state

`SessionState` (lines 25–46) already has `role: string | null` field. `createSession(sessionId, role?)` at line 87 accepts initial role. **No method exists to update role after creation.** `getSession()` returns state read-only (callers cannot persist mutations).

Existing methods: `createSession`, `getSession`, `hasSession`, `destroySession`, `listSessions`, `cleanExpired`, `persistSession`, `loadSession`. No `setSessionRole`.

### Fix

Add async `setSessionRole(sessionId, role)` method:

```typescript
async setSessionRole(sessionId: string, role: string | null): Promise<boolean> {
  const state = this.sessions.get(sessionId);
  if (!state || this.isExpired(state)) return false;
  const previousRole = state.role;
  if (previousRole === role) return true; // no-op, skip audit
  state.role = role;
  state.lastAccessedAt = Date.now();
  // Re-insert to keep LRU ordering coherent
  this.sessions.delete(sessionId);
  this.sessions.set(sessionId, state);
  try {
    await this.store.set(sessionId, state);
  } catch { /* persistence best-effort */ }
  AuditLog.getInstance().log("config_change", "success", {
    sessionId,
    metadata: { action: "set_session_role", previousRole, newRole: role },
  });
  return true;
}
```

### Risks / edge cases

1. **LRU ordering** — bump `lastAccessedAt` to treat as access (deliberate choice)
2. **Persistence** — await store.set (unlike fire-and-forget createSession) to avoid role escalation loss on crash
3. **Caller authorization** — no additional gate beyond caller having a `SessionIsolation` reference (per-design for HttpServer internal use)
4. **Audit spam** — skip audit when `previousRole === role` (per-request JWT refresh would otherwise spam audit log)
5. **No `setSessionMetadata` either** — noted but out of scope

---

## G-03: OAuthProvider JWT claims never mapped to session role on reattach/existing sessions

**Severity:** MED  
**File:** `src/HttpServer.ts` (consumer); `src/auth/OAuthProvider.ts` (provider — no changes needed)

### Current state

`OAuthProvider.ts:JWTClaims` (lines 38–46) already declares `role?: string`. `validateJwt` returns full payload including role claim. `authenticateRequest` returns `AuthResult.claims` which includes `role`.

In `HttpServer.ts`, `authClaims?.role` is already mapped to `roleOverride` at line 509, and `createSession(newSessionId, role)` at line 607 uses it correctly for **new sessions only**.

**Gap:** Two paths bypass role refresh:
1. **Existing session** (`transports.has(sessionId)` at line 523) — routes directly to transport with no role refresh
2. **Reattachment** (`loadSession` at line 534) — rehydrates persisted role but never applies fresh JWT claim

### Fix (depends on G-02)

```typescript
// In handleMcpRequest, existing session path (around line 523-527):
if (sessionId && this.transports.has(sessionId)) {
  if (roleOverride !== undefined) {
    await this.sessionIsolation?.setSessionRole(sessionId, roleOverride);
  }
  await transport.handleRequest(req, res);
  return;
}

// In reattachment path, after loadSession (around line 534-572):
if (loaded) {
  if (roleOverride !== undefined) {
    await this.sessionIsolation.setSessionRole(sessionId, roleOverride);
  }
  // ...existing reattach logic...
}
```

### Risks / edge cases

1. **Custom claim names** — `claims.role` is standard; Auth0/Keycloak may use different names. Document `EVOKORE_OAUTH_ROLE_CLAIM` as future env override. Minimal fix handles string only.
2. **Missing claim semantics** — if `roleOverride === undefined` (JWT has no role claim), leave session role unchanged (do NOT clear it). Guard: `if (roleOverride !== undefined)`.
3. **Security** — downgrade case: if token is revoked and role removed from claim, next request's JWT will carry no role claim → session role unchanged (potential security gap, acceptable for minimal fix; document).
4. **Audit per-request spam** — `setSessionRole` skips audit when role unchanged, so per-request JWT refresh is cheap.
5. **WS path** — `HttpServer.ts:326` has its own copy of role-extraction logic; leave alone for this fix.
6. **OAuthProvider.ts** — no changes needed.

---

## Key file paths

| File | Lines | Notes |
|---|---|---|
| `src/index.ts` | 614–710 | CallToolRequestSchema handler; native branches 642–681 |
| `src/SkillManager.ts` | 1032 | `handleToolCall` — no permission check |
| `src/ProxyManager.ts` | 642–686 | `callProxiedTool` — working analogue |
| `src/SecurityManager.ts` | 85, 141, 36 | `checkPermission`, `setActiveRole`, `loadPermissions` |
| `src/SessionIsolation.ts` | 25–46, 87, 150, 246, 258 | State shape, create, get, persist, load |
| `src/auth/OAuthProvider.ts` | 38–46, 152, 190 | JWTClaims, validateJwt, authenticateRequest — no changes needed |
| `src/HttpServer.ts` | 326, 509, 523–527, 534, 606–607 | Role extraction points, session create, existing/reattach paths |

## Confirmed: no changes needed to OAuthProvider.ts

The `role?: string` field is already in `JWTClaims` (line 44) and `validateJwt` already returns the full payload. The fix is entirely on the consumption side.
