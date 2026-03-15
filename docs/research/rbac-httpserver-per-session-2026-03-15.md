# Per-Session RBAC for HttpServer

**Date:** 2026-03-15
**Status:** Implemented
**PR:** feat: wire per-session RBAC into HttpServer for multi-tenant role isolation

## Problem

Prior to this change, `SecurityManager.checkPermission(toolName)` used a single global `activeRole` field to determine RBAC permissions. This is correct for stdio mode (single client), but broken for multi-tenant HTTP mode where multiple sessions may have different roles.

`SessionState.role` already existed in `SessionIsolation` (added in T30) but was never read during permission checks. The role field was set to `null` on session creation and never threaded through the call chain.

## Architecture

### Effective Role Resolution Order

When `SecurityManager.checkPermission(toolName, role?)` is called:

1. If `role` parameter is explicitly provided (even as `null`), use it as the effective role.
2. If `role` parameter is `undefined` (omitted), fall back to `this.activeRole` (the global role from `EVOKORE_ROLE` env var or `permissions.yml`).
3. The effective role is then used for the standard RBAC resolution: role overrides > flat rules > role `default_permission`.

This means:
- **Explicit `null`** = "no role for this session, use flat permissions" (session-level opt-out of RBAC).
- **Explicit role string** = "use this role regardless of global setting" (session-level role override).
- **`undefined` (omitted)** = "use the global role" (backward compatible, existing behavior).

### Call Chain Threading

```
CallToolRequestSchema handler (index.ts)
  -> looks up session via SessionIsolation.getSession(sessionId)
  -> extracts session.role (string | null)
  -> converts null to undefined only when session is missing
  -> passes to ProxyManager.callProxiedTool(toolName, args, sessionRole)
    -> forwards to SecurityManager.checkPermission(toolName, role)
      -> resolves effectiveRole = (role !== undefined ? role : this.activeRole)
```

### Session Role Initialization

In `HttpServer.ts`, when a new transport session is initialized via `onsessioninitialized`:

```typescript
this.sessionIsolation?.createSession(newSessionId, process.env.EVOKORE_ROLE || null);
```

This seeds new HTTP sessions with the global default role from the environment. Future JWT claim integration can override this per-session by calling `session.role = extractedRole` after authentication.

## Backward Compatibility

### stdio Mode

- `callProxiedTool(toolName, args)` continues to work with no third argument.
- `checkPermission(toolName)` continues to work with no second argument.
- Both fall back to `this.activeRole`, preserving the original global behavior.

### SkillManager Internal Calls

- `SkillManager` calls `ProxyManager` methods internally but does not pass a role parameter.
- These calls continue using the global `activeRole` fallback, which is correct since SkillManager operations are not session-scoped.

### No Role Defined

- When `EVOKORE_ROLE` is unset and no role is passed, `effectiveRole` resolves to `null`.
- `null` is falsy, so the RBAC branch is skipped entirely, falling through to flat permission rules.
- This is identical to the pre-change behavior.

## Future: JWT Claim Integration

When OAuth bearer token authentication is enhanced to extract role claims from JWTs, the integration point is:

1. In `HttpServer.handleMcpRequest()`, after `authenticateRequest()` succeeds, extract the role claim from the token payload.
2. Pass it to `createSession(newSessionId, jwtRole)` instead of `process.env.EVOKORE_ROLE`.
3. Alternatively, update the session role after creation: `session.role = jwtRole`.

This requires no further changes to `SecurityManager` or `ProxyManager` -- the per-session role threading is already in place.

## Files Changed

| File | Change |
|------|--------|
| `src/SecurityManager.ts` | Added optional `role` parameter to `checkPermission()`, using `effectiveRole` resolution |
| `src/ProxyManager.ts` | Added optional `role` parameter to `callProxiedTool()`, forwarding to `checkPermission()` |
| `src/index.ts` | Thread session role from `SessionIsolation` through to `callProxiedTool()` in proxied tool handler |
| `src/HttpServer.ts` | Pass `EVOKORE_ROLE` default to `createSession()` in `onsessioninitialized` callback |
