# OAuthProvider-HttpServer Middleware Integration

**Date:** 2026-03-15
**Status:** Implemented
**Depends on:** T27 (OAuth Bearer Token Authentication), T26 (StreamableHTTP Server Transport), T30 (Multi-Tenant Session Isolation)

## Problem Statement

EVOKORE-MCP's OAuthProvider (`src/auth/OAuthProvider.ts`) was implemented as a
standalone module with authentication primitives -- `loadAuthConfig()`,
`authenticateRequest()`, `sendUnauthorizedResponse()`, `isPublicPath()` -- but
was never wired into the HttpServer request pipeline. Any HTTP client could reach
the `/mcp` endpoint without presenting credentials, even when
`EVOKORE_AUTH_REQUIRED=true`.

## Middleware Integration Pattern

Rather than introducing Express or another HTTP framework, the auth check is
injected directly into `HttpServer.handleRequest()` as a guard clause. This
follows the same raw `http.createServer` pattern already used by HttpServer and
avoids adding framework dependencies for a single middleware concern.

The guard placement is deliberate:

```
handleRequest(req, res)
  1. /health GET -> always respond 200 (public, no auth)
  2. Auth middleware guard (if authConfig.required && !isPublicPath)
     -> reject 401 with sendUnauthorizedResponse()
  3. /mcp -> handleMcpRequest()
  4. 404
```

The health check runs before auth because `/health` is always public. Load
balancers and monitoring probes must reach it without credentials. The
`isPublicPath()` check in the guard is a safety net for any future public
endpoints.

## Why /health Is Always Public

The `/health` endpoint exists for infrastructure tooling -- load balancers,
Kubernetes liveness probes, and monitoring systems. These tools typically
cannot supply Bearer tokens. Making `/health` require auth would break standard
deployment patterns. The endpoint returns only `{ status, transport }` with no
sensitive data.

The health check is matched by exact URL comparison (`url === "/health"`) before
the auth guard runs, so it never reaches the `authenticateRequest()` call. The
`isPublicPath()` function in OAuthProvider provides a second layer of defense
within `authenticateRequest()` itself.

## Auth Config Threading

Auth configuration flows through a straightforward path:

1. `index.ts` `runHttp()` calls `loadAuthConfig()` which reads `EVOKORE_AUTH_REQUIRED`
   and `EVOKORE_AUTH_TOKEN` from `process.env`.
2. The resulting `AuthConfig` is passed to `HttpServer` via the `authConfig` option.
3. `HttpServer` stores it as `this.authConfig` and checks it on every request.

When `authConfig` is null or `authConfig.required` is false, no auth check runs.
This preserves full backwards compatibility -- existing deployments without
`EVOKORE_AUTH_REQUIRED=true` see zero behavioral change.

## Session-Role Bridge

For static token authentication, the auth layer validates the token but does not
carry role claims (unlike JWT). The session role comes from the `EVOKORE_ROLE`
environment variable via the existing RBAC system in `SecurityManager`.

When SessionIsolation creates a session in `onsessioninitialized`, it does not
receive role information from the auth layer directly. Instead, the RBAC role is
resolved independently by `SecurityManager.loadPermissions()` using
`process.env.EVOKORE_ROLE`. This means all authenticated sessions share the
same role in static-token mode, which is appropriate for single-operator
deployments.

Future JWT-based auth can embed role claims in the token payload and pass them
to `sessionIsolation.createSession(id, { role })`.

## Future JWT Extension Path

The current implementation uses static token comparison via
`crypto.timingSafeEqual`. To support JWT:

1. Add `EVOKORE_AUTH_MODE=jwt` env var (current default: `static`).
2. Add JWT validation in `authenticateRequest()` using `jsonwebtoken` or
   `jose` library with JWKS support.
3. Extract claims (role, tenant) from the JWT payload.
4. Pass claims to `SessionIsolation.createSession()` to create role-scoped sessions.
5. The middleware guard in `handleRequest()` needs no changes -- it only
   checks `authResult.authorized`.

The `AuthResult` interface already has room for extension (add `claims?: object`).

## Modified Files

- `src/HttpServer.ts` -- Imports auth functions, adds `authConfig` option and field, auth guard in `handleRequest()`
- `src/index.ts` -- Imports `loadAuthConfig`, passes result to HttpServer in `runHttp()`
- `tests/integration/oauth-httpserver-middleware.test.ts` -- Integration tests
- `docs/research/oauth-httpserver-middleware-2026-03-15.md` -- This document
