# OAuth and Authentication Setup

EVOKORE-MCP supports Bearer token authentication for its HTTP transport mode. This guide covers the three authentication modes, how JWT role claims integrate with the RBAC permission system, and how to connect external identity providers.

Authentication only applies to **HTTP transport mode** (`--http` flag or `EVOKORE_HTTP_MODE=true`). The default stdio transport does not use HTTP and therefore does not use Bearer token auth.

---

## Table of Contents

1. [Overview](#overview)
2. [Static Token Mode](#static-token-mode)
3. [JWT Mode](#jwt-mode)
4. [JWKS Mode (Key Rotation)](#jwks-mode-key-rotation)
5. [Role Claim Passthrough](#role-claim-passthrough)
6. [Configuration Reference](#configuration-reference)
7. [Integration with Identity Providers](#integration-with-identity-providers)
8. [Public Paths](#public-paths)
9. [Troubleshooting](#troubleshooting)

---

## Overview

EVOKORE-MCP HTTP endpoints can operate in three authentication modes:

| Mode | Use Case | How It Works |
|------|----------|--------------|
| **None** (default) | Local development | All requests are allowed. No `Authorization` header required. |
| **Static Token** | Simple deployments, CI/CD | A shared secret is compared using timing-safe comparison. |
| **JWT / JWKS** | Production, multi-tenant | Tokens are validated against a remote JWKS endpoint with issuer/audience checks. |

Authentication is enforced by the `OAuthProvider` middleware (`src/auth/OAuthProvider.ts`), which runs inside `HttpServer.handleRequest()` before any MCP routing occurs. When a request fails authentication, EVOKORE returns a JSON-RPC-style 401 response with a `WWW-Authenticate: Bearer realm="evokore-mcp"` header.

### Request Flow

```
Client Request
  |
  v
HttpServer.handleRequest()
  |
  +-- /health --> always passes (public path)
  |
  +-- /mcp --> authenticateRequest(req, authConfig)
        |
        +-- Auth disabled? --> pass through
        |
        +-- Static mode? --> timing-safe token comparison
        |
        +-- JWT mode? --> validate against JWKS endpoint
        |
        +-- Extract role claim --> pass to SessionIsolation
              |
              v
        SessionIsolation.createSession(sessionId, role)
              |
              v
        SecurityManager.checkPermission(toolName, role)
```

---

## Static Token Mode

Static token mode is the simplest way to protect your EVOKORE-MCP HTTP endpoints. A single shared secret is configured via environment variable and every request must present it as a Bearer token.

### Setup

Add these variables to your `.env` file:

```bash
# Enable authentication
EVOKORE_AUTH_REQUIRED=true

# Use static token mode (this is the default when no mode is specified)
EVOKORE_AUTH_MODE=static

# Your shared secret token
EVOKORE_AUTH_TOKEN=your-secret-token-here
```

### Making Requests

Include the token in the `Authorization` header:

```bash
curl -X POST http://127.0.0.1:3100/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-token-here" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{...},"id":1}'
```

### Security Properties

- **Timing-safe comparison**: The token is compared using `crypto.timingSafeEqual()`, which prevents timing side-channel attacks. An attacker cannot determine how many characters of their guess were correct by measuring response time.
- **Length check**: If the provided token and expected token differ in length, the request is rejected immediately (before the constant-time comparison) since the length difference already leaks through `Buffer.from()` allocation time in any case.

### Warnings

If `EVOKORE_AUTH_REQUIRED=true` is set but `EVOKORE_AUTH_TOKEN` is not configured, EVOKORE logs a warning at startup and rejects all authenticated requests:

```
[EVOKORE-AUTH] Warning: EVOKORE_AUTH_REQUIRED=true but no EVOKORE_AUTH_TOKEN set.
All authenticated requests will be rejected.
```

---

## JWT Mode

JWT mode validates Bearer tokens as signed JSON Web Tokens. Tokens are verified against a remote JWKS (JSON Web Key Set) endpoint, with optional issuer and audience claim validation. This is the recommended mode for production deployments.

### Setup

```bash
# Enable authentication
EVOKORE_AUTH_REQUIRED=true

# Switch to JWT mode
EVOKORE_AUTH_MODE=jwt

# JWKS endpoint for key fetching (required for JWT mode)
EVOKORE_OAUTH_JWKS_URI=https://your-idp.example.com/.well-known/jwks.json

# Expected issuer claim (optional but recommended)
EVOKORE_OAUTH_ISSUER=https://your-idp.example.com/

# Expected audience claim (optional but recommended)
EVOKORE_OAUTH_AUDIENCE=evokore-mcp
```

### How Validation Works

When a request arrives with a Bearer token in JWT mode, EVOKORE:

1. **Extracts** the token from the `Authorization: Bearer <token>` header (case-insensitive scheme matching per RFC 6750).
2. **Fetches signing keys** from the configured JWKS URI (cached after first fetch; see [JWKS Mode](#jwks-mode-key-rotation) for caching details).
3. **Verifies the signature** using the `jose` library's `jwtVerify()` function, which automatically selects the correct key from the JWKS by matching the token's `kid` (Key ID) header.
4. **Validates claims**:
   - `exp` (expiration) -- the token must not be expired.
   - `iss` (issuer) -- must match `EVOKORE_OAUTH_ISSUER` if configured.
   - `aud` (audience) -- must match `EVOKORE_OAUTH_AUDIENCE` if configured.
5. **Extracts the payload** and passes decoded claims downstream for role passthrough.

### Making Requests

```bash
# Obtain a JWT from your identity provider first, then:
curl -X POST http://127.0.0.1:3100/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6..." \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{...},"id":1}'
```

### JWT Claims Interface

EVOKORE expects standard JWT claims. The `role` claim is the only custom claim consumed by the system:

```typescript
interface JWTClaims {
  sub?: string;        // Subject (user ID)
  iss?: string;        // Issuer
  aud?: string | string[];  // Audience
  exp?: number;        // Expiration (Unix timestamp)
  iat?: number;        // Issued at (Unix timestamp)
  role?: string;       // EVOKORE RBAC role (custom claim)
  [key: string]: unknown;  // Additional claims are preserved but not used
}
```

---

## JWKS Mode (Key Rotation)

JWKS (JSON Web Key Set) support is built into JWT mode. EVOKORE uses the `jose` library's `createRemoteJWKSet()` to fetch and cache signing keys from a remote endpoint.

### How JWKS Caching Works

- **First request**: EVOKORE fetches the JWKS from the configured `EVOKORE_OAUTH_JWKS_URI` and caches the key set in memory.
- **Subsequent requests**: The cached key set is reused. The `jose` library handles key rotation internally -- when it encounters a token signed with an unknown `kid`, it automatically re-fetches the JWKS to look for the new key.
- **URI change detection**: If `EVOKORE_OAUTH_JWKS_URI` changes (e.g., via a config reload), EVOKORE discards the cached JWKS and creates a fresh remote key set client.

### Key Rotation Without Downtime

Because `jose`'s `createRemoteJWKSet()` transparently re-fetches keys when an unknown `kid` is encountered, your identity provider can rotate signing keys without any EVOKORE restart or configuration change:

1. IdP adds a new signing key to its JWKS endpoint.
2. IdP starts signing new tokens with the new key's `kid`.
3. EVOKORE encounters a token with the unknown `kid`, re-fetches JWKS, and validates successfully.
4. IdP removes the old key from JWKS at its leisure.

### Cache Clearing

For testing or emergency key rotation scenarios, EVOKORE exports a `clearJwksCache()` function that forces the next validation to re-fetch keys. This is primarily used in test suites.

---

## Role Claim Passthrough

When JWT mode is active, EVOKORE extracts the `role` claim from validated JWT payloads and threads it through the entire request lifecycle into the RBAC permission system.

### Data Flow

```
JWT payload: { "sub": "user-123", "role": "developer", ... }
                                          |
                                          v
HttpServer.handleRequest()
  authResult.claims.role = "developer"
                  |
                  v
HttpServer.handleMcpRequest(req, res, roleOverride="developer")
                  |
                  v
SessionIsolation.createSession(sessionId, role="developer")
  --> session.role = "developer"
                  |
                  v
(on tool call)
index.ts: session.role --> proxyManager.callProxiedTool(toolName, args, "developer")
                  |
                  v
SecurityManager.checkPermission(toolName, "developer")
  --> checks role overrides -> flat rules -> role default_permission
```

### Role Resolution Priority

When determining the effective role for a session, EVOKORE uses this priority order:

1. **JWT `role` claim** (highest priority) -- extracted from validated token claims.
2. **`EVOKORE_ROLE` environment variable** -- fallback when no JWT role is present.
3. **`active_role` in `permissions.yml`** -- fallback when neither of the above is set.
4. **No role (flat permissions)** -- when none of the above provides a role, the original flat per-tool rules apply.

### Permission Resolution Order

When a role is active, `SecurityManager.checkPermission()` resolves permissions in this order:

1. **Role-specific overrides** for the tool (from `permissions.yml` under `roles.<role>.overrides`).
2. **Flat per-tool rules** (from `permissions.yml` under `rules`), which act as additional overrides layered on top of the role.
3. **Role `default_permission`** as the final fallback.

### Available Roles

EVOKORE ships with three predefined roles in `permissions.yml`:

| Role | Default Permission | Description |
|------|-------------------|-------------|
| `admin` | `allow` | Full access to all tools. |
| `developer` | `require_approval` | Standard development access. Read operations allowed, destructive operations denied or gated. |
| `readonly` | `deny` | Read-only access. Only explicitly allowed read operations permitted. |

### Example JWT with Role

```json
{
  "sub": "user-456",
  "iss": "https://auth.example.com/",
  "aud": "evokore-mcp",
  "exp": 1742169600,
  "iat": 1742166000,
  "role": "developer"
}
```

This token would create a session where all tool calls are checked against the `developer` role definition: read operations like `fs_read_file` and `github_list_commits` are allowed, most operations require human approval, and destructive operations like `supabase_create_project` are denied.

---

## Configuration Reference

All authentication-related environment variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `EVOKORE_AUTH_REQUIRED` | No | `"false"` | Set to `"true"` to enforce Bearer token authentication on all non-public HTTP endpoints. |
| `EVOKORE_AUTH_MODE` | No | `"static"` | Authentication mode: `"static"` for shared secret, `"jwt"` for JWKS-based JWT validation. |
| `EVOKORE_AUTH_TOKEN` | When mode=static | -- | The shared secret token for static mode. |
| `EVOKORE_OAUTH_JWKS_URI` | When mode=jwt | -- | URL of the JWKS endpoint for fetching signing keys (e.g., `https://idp.example.com/.well-known/jwks.json`). |
| `EVOKORE_OAUTH_ISSUER` | No | -- | Expected `iss` claim in JWTs. Tokens with a different issuer are rejected. |
| `EVOKORE_OAUTH_AUDIENCE` | No | -- | Expected `aud` claim in JWTs. Tokens without this audience are rejected. |
| `EVOKORE_ROLE` | No | -- | Default RBAC role for sessions when no JWT role claim is present. One of: `admin`, `developer`, `readonly`. |
| `EVOKORE_HTTP_PORT` | No | `3100` | Port for the HTTP server. |
| `EVOKORE_HTTP_HOST` | No | `127.0.0.1` | Host/interface for the HTTP server. |
| `EVOKORE_SESSION_TTL_MS` | No | `3600000` | Session time-to-live in milliseconds (default: 1 hour). Expired sessions are cleaned up periodically. |

### Minimal `.env` Examples

**No auth (local development):**

```bash
# No auth variables needed -- this is the default
EVOKORE_HTTP_PORT=3100
```

**Static token:**

```bash
EVOKORE_AUTH_REQUIRED=true
EVOKORE_AUTH_TOKEN=my-secret-token-abc123
```

**JWT with Auth0:**

```bash
EVOKORE_AUTH_REQUIRED=true
EVOKORE_AUTH_MODE=jwt
EVOKORE_OAUTH_JWKS_URI=https://your-tenant.auth0.com/.well-known/jwks.json
EVOKORE_OAUTH_ISSUER=https://your-tenant.auth0.com/
EVOKORE_OAUTH_AUDIENCE=evokore-mcp
```

---

## Integration with Identity Providers

### Auth0

1. **Create an API** in the Auth0 Dashboard under Applications > APIs.
   - Set the **Identifier** (audience) to `evokore-mcp` (or your preferred value).
   - Choose **RS256** as the signing algorithm.

2. **Add a custom `role` claim** using an Auth0 Action or Rule:

   ```javascript
   // Auth0 Action: Login / Post Login
   exports.onExecutePostLogin = async (event, api) => {
     const roles = event.authorization?.roles || [];
     // Map Auth0 roles to EVOKORE roles
     let evokoreRole = "readonly";
     if (roles.includes("admin")) evokoreRole = "admin";
     else if (roles.includes("developer")) evokoreRole = "developer";

     // Use a namespaced claim to avoid Auth0 claim filtering
     api.accessToken.setCustomClaim("role", evokoreRole);
   };
   ```

3. **Configure EVOKORE `.env`:**

   ```bash
   EVOKORE_AUTH_REQUIRED=true
   EVOKORE_AUTH_MODE=jwt
   EVOKORE_OAUTH_JWKS_URI=https://your-tenant.auth0.com/.well-known/jwks.json
   EVOKORE_OAUTH_ISSUER=https://your-tenant.auth0.com/
   EVOKORE_OAUTH_AUDIENCE=evokore-mcp
   ```

4. **Obtain a token** using the Client Credentials flow (machine-to-machine) or Authorization Code flow (interactive):

   ```bash
   # Machine-to-machine token
   curl -X POST https://your-tenant.auth0.com/oauth/token \
     -H "Content-Type: application/json" \
     -d '{
       "client_id": "YOUR_CLIENT_ID",
       "client_secret": "YOUR_CLIENT_SECRET",
       "audience": "evokore-mcp",
       "grant_type": "client_credentials"
     }'
   ```

### Keycloak

1. **Create a Client** in your Keycloak realm:
   - Set **Access Type** to `confidential`.
   - Enable **Service Accounts** if using client credentials flow.

2. **Add a `role` claim mapper** to the client:
   - Go to the client's **Mappers** tab (or **Client Scopes** > **Dedicated Scope** > **Mappers** in newer versions).
   - Create a new mapper:
     - **Mapper Type**: User Realm Role (or User Client Role)
     - **Token Claim Name**: `role`
     - **Claim JSON Type**: String
     - **Add to access token**: ON

   Alternatively, if you want to map a single role string rather than an array, use a **Hardcoded claim** or a **Script** mapper that selects the highest-privilege role.

3. **Configure EVOKORE `.env`:**

   ```bash
   EVOKORE_AUTH_REQUIRED=true
   EVOKORE_AUTH_MODE=jwt
   EVOKORE_OAUTH_JWKS_URI=https://keycloak.example.com/realms/your-realm/protocol/openid-connect/certs
   EVOKORE_OAUTH_ISSUER=https://keycloak.example.com/realms/your-realm
   EVOKORE_OAUTH_AUDIENCE=evokore-mcp
   ```

4. **Obtain a token:**

   ```bash
   curl -X POST https://keycloak.example.com/realms/your-realm/protocol/openid-connect/token \
     -d "client_id=evokore-mcp" \
     -d "client_secret=YOUR_CLIENT_SECRET" \
     -d "grant_type=client_credentials"
   ```

### Other Providers

Any OIDC-compliant identity provider that exposes a JWKS endpoint will work. The key requirements are:

- The provider must serve a JWKS at a stable URL (usually `/.well-known/jwks.json` or `/protocol/openid-connect/certs`).
- Tokens must be signed with an algorithm supported by the `jose` library (RS256, RS384, RS512, ES256, ES384, ES512, PS256, PS384, PS512, EdDSA).
- If you want RBAC integration, include a `role` claim with one of the values `admin`, `developer`, or `readonly` in the access token payload.

---

## Public Paths

The following paths always bypass authentication, even when `EVOKORE_AUTH_REQUIRED=true`:

| Path | Method | Purpose |
|------|--------|---------|
| `/health` | GET | Health check endpoint for load balancers and monitoring. Returns `{"status":"ok","transport":"streamable-http"}`. |
| `/health/` | GET | Same as above (trailing slash variant). |

All other paths, including `/mcp`, require a valid Bearer token when authentication is enabled.

---

## Troubleshooting

### "Missing or invalid Authorization header"

**HTTP 401** with this message means:

- The `Authorization` header is missing from the request.
- The header value does not start with `Bearer ` (case-insensitive).
- The token portion after `Bearer ` is empty.

**Fix**: Ensure your request includes `-H "Authorization: Bearer <your-token>"`.

### "Invalid bearer token"

**HTTP 401** in static mode. The provided token does not match `EVOKORE_AUTH_TOKEN`.

**Fix**: Verify the `EVOKORE_AUTH_TOKEN` value in your `.env` matches the token you are sending. Check for trailing whitespace or newlines in either value.

### "Invalid JWT" or specific JWT errors

**HTTP 401** in JWT mode. Common causes:

| Error Message | Cause | Fix |
|---------------|-------|-----|
| `"No JWKS URI configured"` | `EVOKORE_OAUTH_JWKS_URI` is not set. | Add the JWKS URI to your `.env`. |
| `"jwt expired"` | The token's `exp` claim is in the past. | Obtain a fresh token from your IdP. |
| `"unexpected \"iss\" claim value"` | The token's `iss` does not match `EVOKORE_OAUTH_ISSUER`. | Verify the issuer URL matches exactly (including trailing slashes). |
| `"unexpected \"aud\" claim value"` | The token's `aud` does not match `EVOKORE_OAUTH_AUDIENCE`. | Verify the audience string matches the API identifier in your IdP. |
| `"no applicable key found in the JSON Web Key Set"` | The JWKS endpoint does not contain a key matching the token's `kid`. | Verify the JWKS URI is correct. The IdP may have rotated keys and your token was signed with an old key. |
| Network/fetch errors | The JWKS endpoint is unreachable. | Check network connectivity, DNS resolution, and firewall rules for the JWKS URI. |

### "All authenticated requests will be rejected"

This startup warning appears when `EVOKORE_AUTH_REQUIRED=true` and `EVOKORE_AUTH_MODE=static` (or unset), but `EVOKORE_AUTH_TOKEN` is not configured. Every request to protected endpoints will receive a 401.

**Fix**: Set `EVOKORE_AUTH_TOKEN` in your `.env` file.

### "JWT validation will fail for all requests"

This startup warning appears when `EVOKORE_AUTH_MODE=jwt` but `EVOKORE_OAUTH_JWKS_URI` is not set. Without a JWKS endpoint, EVOKORE cannot fetch signing keys to validate tokens.

**Fix**: Set `EVOKORE_OAUTH_JWKS_URI` to your identity provider's JWKS endpoint URL.

### Role not being applied

If your JWT contains a `role` claim but the session is not using the expected RBAC permissions:

1. **Decode your JWT** at [jwt.io](https://jwt.io) and verify the `role` claim is present in the payload (not nested inside another object).
2. **Check the claim name**: EVOKORE looks for a top-level `role` claim. If your IdP uses a namespaced claim (e.g., `https://example.com/role`), you will need to configure the IdP to emit a plain `role` claim instead, or customize the claim extraction.
3. **Verify the role value**: The role must match one of the role names defined in `permissions.yml` (default: `admin`, `developer`, `readonly`). Unrecognized role names fall back to flat permissions with a warning.
4. **Check EVOKORE_ROLE**: If `EVOKORE_ROLE` is set in `.env`, it acts as a fallback but is overridden by JWT role claims. Remove it if you want JWT roles to be the sole source.

### 401 response format

When authentication fails, EVOKORE returns a JSON-RPC-compatible error body:

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32001,
    "message": "Unauthorized",
    "data": {
      "detail": "Missing or invalid Authorization header. Expected: Bearer <token>"
    }
  },
  "id": null
}
```

The response includes a `WWW-Authenticate: Bearer realm="evokore-mcp"` header per RFC 6750.
