# OAuth Bearer Token Authentication for HTTP Transport

**Date:** 2026-03-14
**Status:** Implemented (T27)
**Scope:** `src/auth/OAuthProvider.ts`, HTTP transport authentication layer

## Architecture Overview

EVOKORE-MCP v3.0 added HTTP server transport support via `StreamableHTTPServerTransport` from the MCP SDK. While stdio transport is inherently secured by process-level isolation (only the parent process communicates over stdin/stdout), HTTP endpoints are network-accessible and require authentication.

### Authentication Flow

```
Client                         EVOKORE HTTP Server
  |                                   |
  |--- POST /mcp ------------------>  |
  |    Authorization: Bearer <token>  |
  |                                   |
  |    [Auth Middleware]              |
  |    1. Check EVOKORE_AUTH_REQUIRED |
  |    2. If false -> pass through    |
  |    3. If true:                    |
  |       a. Check path (/health?)   |
  |       b. Extract Bearer token    |
  |       c. Validate token          |
  |       d. Reject or proceed       |
  |                                   |
  |<-- 200 JSON-RPC response ------  |  (authorized)
  |<-- 401 JSON-RPC error ---------  |  (unauthorized)
```

### Configuration

Authentication is controlled by two environment variables:

| Variable | Default | Description |
|---|---|---|
| `EVOKORE_AUTH_REQUIRED` | `false` | Set to `true` to require Bearer token auth on HTTP endpoints |
| `EVOKORE_AUTH_TOKEN` | (unset) | The static bearer token that clients must present |

When `EVOKORE_AUTH_REQUIRED=false` (the default), no authentication is enforced. This maintains backwards compatibility and simplifies local development.

### Endpoint Access Policy

| Endpoint | Auth Required | Purpose |
|---|---|---|
| `/mcp` | Yes (when enabled) | MCP JSON-RPC endpoint |
| `/health` | Never | Load balancer health checks |

## Implementation Details

### Module: `src/auth/OAuthProvider.ts`

The module exports pure functions rather than a class, following the functional composition pattern:

- **`loadAuthConfig()`** - Reads env vars and returns an `AuthConfig` object
- **`extractBearerToken(header)`** - Parses the `Authorization` header per RFC 6750
- **`validateToken(token, config)`** - Timing-safe comparison against the static token
- **`isPublicPath(pathname)`** - Determines if a path bypasses auth
- **`authenticateRequest(req, config)`** - Full auth check returning an `AuthResult`
- **`sendUnauthorizedResponse(res, error)`** - Writes a JSON-RPC-formatted 401 response

### Security Considerations

1. **Timing-safe comparison**: Token validation uses `crypto.timingSafeEqual()` to prevent timing attacks that could leak token characters.

2. **No token logging**: Bearer tokens are never logged. Only auth status (enabled/disabled) is emitted to stderr.

3. **JSON-RPC error format**: Unauthorized responses use JSON-RPC error format with code `-32001`, maintaining protocol consistency for MCP clients.

4. **WWW-Authenticate header**: 401 responses include `WWW-Authenticate: Bearer realm="evokore-mcp"` per RFC 6750.

5. **Health endpoint bypass**: The `/health` endpoint is always public. This is required for infrastructure health checks (load balancers, Kubernetes probes) that should not need credentials.

6. **Fail-closed when misconfigured**: If `EVOKORE_AUTH_REQUIRED=true` but `EVOKORE_AUTH_TOKEN` is unset, all requests to protected endpoints are rejected. A warning is emitted on startup.

### No New Dependencies

The implementation uses only Node.js built-in modules (`http`, `crypto`). No additional npm packages are needed.

## Future: OAuth 2.0 PKCE Flow

The current implementation uses static bearer tokens, which are suitable for:
- Development environments
- Single-operator deployments
- Service-to-service communication with rotated secrets

For multi-tenant or browser-based deployments, a full OAuth 2.0 Authorization Code flow with PKCE would be appropriate. The MCP SDK provides infrastructure for this:

- `OAuthServerProvider` interface in `@modelcontextprotocol/sdk/server/auth/provider`
- `requireBearerAuth` middleware in `@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth`
- `AuthInfo` type for carrying validated token metadata
- `OAuthRegisteredClientsStore` for client registration

A PKCE upgrade path would:

1. Implement `OAuthServerProvider` with a backing store (e.g., Supabase)
2. Register the provider with the HTTP transport
3. Use the SDK's `requireBearerAuth` middleware instead of the custom validation
4. Support token refresh and revocation
5. Enable scoped access (e.g., `read-only` vs `full-access` token scopes mapped to RBAC roles)

The current `AuthConfig` and `authenticateRequest` API surface is designed to be replaced by the SDK's built-in auth when a full OAuth flow is needed, without changing the HTTP server's request handling pattern.

## Test Coverage

Tests are in `tests/integration/oauth-authentication.test.ts` and cover:

- Source structural validation
- Auth disabled by default (all requests pass)
- Auth enabled: rejection for missing/invalid/wrong tokens
- Auth enabled: acceptance for valid tokens
- `/health` endpoint bypass
- Error response format (401, JSON-RPC, WWW-Authenticate header)
- `extractBearerToken` edge cases
- `validateToken` edge cases
- `isPublicPath` behavior
- Misconfiguration (required=true, no token set)
