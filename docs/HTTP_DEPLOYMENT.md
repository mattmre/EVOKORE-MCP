# HTTP Deployment Guide

This guide covers deploying EVOKORE-MCP in HTTP mode using the MCP StreamableHTTP transport. It is intended for operators who need remote access, multi-client connections, or integration into existing HTTP infrastructure.

For basic setup and stdio mode, see [SETUP.md](./SETUP.md). For architecture details, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Overview

EVOKORE-MCP supports two mutually exclusive transport modes:

| Transport | Use case | Protocol |
|-----------|----------|----------|
| **stdio** (default) | Local AI client integration (Claude Code, Gemini CLI). The client spawns the server as a subprocess and communicates over stdin/stdout. | JSON-RPC over stdio |
| **HTTP** | Remote access, multi-client, server-to-server, and load-balanced deployments. The server listens on a configurable TCP port and clients connect over HTTP. | MCP StreamableHTTP (JSON-RPC over HTTP + SSE) |

**When to use HTTP mode:**

- Multiple clients need to connect to the same EVOKORE instance concurrently.
- The server runs on a remote host, container, or cloud VM.
- You need health check endpoints for load balancer integration.
- You want to front the server with a reverse proxy for TLS termination.
- Server-to-server integrations where stdio is impractical.

**When to stay on stdio:**

- Single-user local development with Claude Code or another AI client.
- The client manages the server lifecycle (spawn/kill).
- You do not need network-accessible endpoints.

All MCP features -- tools, resources, prompts, HITL approval, RBAC, rate limiting, webhooks, and plugins -- work identically across both transports.

## Quick Start

### Prerequisites

- Node.js >= 18
- The project is built (`npm run build`)
- `.env` is configured (see [SETUP.md](./SETUP.md))

### Start in HTTP mode

```bash
# Using the --http CLI flag
node dist/index.js --http

# Using an environment variable
EVOKORE_HTTP_MODE=true node dist/index.js
```

The server logs its listen address to stderr:

```
[EVOKORE-HTTP] Listening on http://127.0.0.1:3100
[EVOKORE] v3.0.0 Enterprise Router running on HTTP at http://127.0.0.1:3100 (tool discovery mode: legacy)
```

### Verify with a health check

```bash
curl http://127.0.0.1:3100/health
# {"status":"ok","transport":"streamable-http"}
```

### Connect an MCP client

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const transport = new StreamableHTTPClientTransport(
  new URL("http://127.0.0.1:3100/mcp")
);
const client = new Client({ name: "my-client", version: "1.0" });
await client.connect(transport);

const { tools } = await client.listTools();
console.log(`Connected. ${tools.length} tools available.`);
```

## Configuration

All HTTP-related settings are controlled via environment variables (set in `.env` or the shell):

| Variable | Default | Description |
|----------|---------|-------------|
| `EVOKORE_HTTP_MODE` | `false` | Set to `true` to start in HTTP mode. Alternatively, pass `--http` on the command line. |
| `EVOKORE_HTTP_PORT` | `3100` | TCP port to listen on. |
| `EVOKORE_HTTP_HOST` | `127.0.0.1` | Network interface to bind. Use `0.0.0.0` to accept connections from all interfaces. |
| `EVOKORE_SESSION_TTL_MS` | `3600000` (1 hour) | Session time-to-live in milliseconds. Idle sessions are expired after this duration. |
| `EVOKORE_AUTH_REQUIRED` | `false` | Set to `true` to enforce Bearer token authentication on `/mcp`. |
| `EVOKORE_AUTH_MODE` | `static` | Authentication mode: `static` for a shared token, `jwt` for JWKS-based JWT validation. |
| `EVOKORE_AUTH_TOKEN` | (unset) | Static bearer token (used when `EVOKORE_AUTH_MODE=static`). |
| `EVOKORE_OAUTH_ISSUER` | (unset) | Expected JWT `iss` claim (used when `EVOKORE_AUTH_MODE=jwt`). |
| `EVOKORE_OAUTH_AUDIENCE` | (unset) | Expected JWT `aud` claim (used when `EVOKORE_AUTH_MODE=jwt`). |
| `EVOKORE_OAUTH_JWKS_URI` | (unset) | URL of the JWKS endpoint for key fetching (used when `EVOKORE_AUTH_MODE=jwt`). |

### Example `.env` for HTTP mode

```bash
# Transport
EVOKORE_HTTP_MODE=true
EVOKORE_HTTP_PORT=3100
EVOKORE_HTTP_HOST=127.0.0.1

# Session management
EVOKORE_SESSION_TTL_MS=3600000

# Authentication (static token)
EVOKORE_AUTH_REQUIRED=true
EVOKORE_AUTH_TOKEN=my-secret-bearer-token

# Authentication (JWT -- alternative to static token)
# EVOKORE_AUTH_MODE=jwt
# EVOKORE_OAUTH_ISSUER=https://auth.example.com/
# EVOKORE_OAUTH_AUDIENCE=evokore-mcp
# EVOKORE_OAUTH_JWKS_URI=https://auth.example.com/.well-known/jwks.json
```

## Routes

The HTTP server exposes two path prefixes:

### `GET /health`

Health check endpoint for load balancers and monitoring. Always bypasses authentication.

**Response:**

```json
{"status": "ok", "transport": "streamable-http"}
```

Returns HTTP 200 when the server is accepting connections.

### `POST /mcp` -- Initialize a session or send a JSON-RPC message

All MCP communication flows through this endpoint.

**Without `mcp-session-id` header:** Creates a new session. The response includes an `mcp-session-id` header that the client must include in all subsequent requests. Only `POST` is accepted for session initialization.

**With `mcp-session-id` header:** Routes the JSON-RPC message to the existing session's transport.

**Example -- listing tools:**

```bash
# Initialize a session (the SDK handles this automatically)
curl -X POST http://127.0.0.1:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}},"id":1}'
```

The response headers will include `mcp-session-id: <uuid>`. Use that UUID in subsequent requests:

```bash
curl -X POST http://127.0.0.1:3100/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: <uuid-from-above>" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":2}'
```

### `GET /mcp` -- SSE notification stream

Used by the MCP SDK for server-initiated notifications (e.g., `tools/list_changed`). Requires a valid `mcp-session-id` header.

### `DELETE /mcp` -- Terminate a session

Closes the transport and destroys session state. Requires a valid `mcp-session-id` header.

### Unknown paths

Any request to a path other than `/health` or `/mcp` receives a 404 JSON response:

```json
{"error": "Not found"}
```

### Unknown session IDs

If a request includes an `mcp-session-id` header that does not match an active session (e.g., after expiry or server restart), the server returns HTTP 404:

```json
{"error": "Session not found"}
```

The client should re-initialize by sending a `POST /mcp` without the session header.

## Session Lifecycle

Each client connection gets an isolated session with its own state. Sessions are identified by a UUID assigned during initialization.

### Creation

A session is created when a client sends its first `POST /mcp` request without an `mcp-session-id` header. The server:

1. Creates a new `StreamableHTTPServerTransport` with a generated UUID.
2. Connects the transport to the MCP server instance.
3. Creates an isolated `SessionState` via `SessionIsolation`, which includes:
   - Activated tools set (for dynamic discovery mode)
   - RBAC role (inherited from the auth token's `role` claim, or from `EVOKORE_ROLE`)
   - Per-tool rate limit counters
   - Arbitrary metadata map
4. Returns the session UUID in the `mcp-session-id` response header.

### Access and activity tracking

Every time a session is accessed (via `getSession()`), its `lastAccessedAt` timestamp is updated. This sliding window determines expiry.

### Expiry

Sessions that have not been accessed within the TTL window are considered expired. Expired sessions are cleaned up:

- **On access:** If a client sends a request with an expired session ID, the session is removed and a 404 is returned.
- **Periodic cleanup:** A background interval (every 60 seconds) runs `cleanExpired()` to remove stale sessions and close their associated transports. This interval uses `unref()` so it does not prevent Node.js process exit.
- **On capacity pressure:** When the session pool reaches `maxSessions` (default: 100), expired sessions are cleaned first, then the least-recently-accessed session is evicted (LRU).

### Orphaned transport pruning

When `cleanExpired()` removes sessions, the HTTP server also prunes any transports that no longer have a corresponding session. This prevents unbounded accumulation of open SSE connections and stale rate limit counters for sessions that expired without an explicit close.

### Destruction

Sessions are destroyed when:

- The client sends a `DELETE /mcp` request with the session ID.
- The transport fires its `onclose` callback.
- The server shuts down (all sessions are destroyed during graceful shutdown).
- Expiry or LRU eviction removes them.

### Session state contents

Each session holds:

| Field | Type | Description |
|-------|------|-------------|
| `sessionId` | `string` | UUID identifying the session. |
| `createdAt` | `number` | Epoch timestamp of creation. |
| `lastAccessedAt` | `number` | Epoch timestamp of last access (sliding TTL). |
| `activatedTools` | `Set<string>` | Tool names activated for this session in dynamic discovery mode. |
| `role` | `string \| null` | RBAC role for permission checks, or null for flat permissions. |
| `rateLimitCounters` | `Map` | Per-tool token bucket state for rate limiting. |
| `metadata` | `Map` | Arbitrary key-value metadata for integrations. |

## Authentication

EVOKORE supports two authentication modes for HTTP transport. Both protect the `/mcp` endpoint while leaving `/health` unauthenticated.

### Static token mode (default)

Simple shared-secret authentication suitable for internal deployments:

```bash
EVOKORE_AUTH_REQUIRED=true
EVOKORE_AUTH_TOKEN=your-secret-token
```

Clients include the token in every request:

```
Authorization: Bearer your-secret-token
```

The token is compared using `crypto.timingSafeEqual` to prevent timing attacks.

### JWT mode with JWKS

For production deployments with an identity provider (Auth0, Keycloak, Okta, etc.):

```bash
EVOKORE_AUTH_REQUIRED=true
EVOKORE_AUTH_MODE=jwt
EVOKORE_OAUTH_ISSUER=https://auth.example.com/
EVOKORE_OAUTH_AUDIENCE=evokore-mcp
EVOKORE_OAUTH_JWKS_URI=https://auth.example.com/.well-known/jwks.json
```

The server validates incoming JWTs against the remote JWKS endpoint, checking:

- Signature validity (using keys from the JWKS endpoint)
- `iss` (issuer) claim matches `EVOKORE_OAUTH_ISSUER`
- `aud` (audience) claim matches `EVOKORE_OAUTH_AUDIENCE`
- Token expiry (`exp` claim)

**Role passthrough:** If the JWT payload includes a `role` claim, it is passed through to the session's RBAC role. This allows per-client permission scoping based on the identity provider's role assignments.

### Unauthorized responses

When authentication fails, the server returns HTTP 401 with a JSON-RPC error body:

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32001,
    "message": "Unauthorized",
    "data": {"detail": "Missing or invalid Authorization header. Expected: Bearer <token>"}
  },
  "id": null
}
```

The response includes a `WWW-Authenticate: Bearer realm="evokore-mcp"` header per RFC 6750.

For detailed authentication setup instructions, see [SETUP.md](./SETUP.md#http-transport-authentication).

## TLS Termination

EVOKORE-MCP serves plain HTTP. For production deployments, place it behind a reverse proxy that handles TLS termination.

### Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name mcp.example.com;

    ssl_certificate     /etc/ssl/certs/mcp.example.com.pem;
    ssl_certificate_key /etc/ssl/private/mcp.example.com.key;

    # Required for SSE streaming
    proxy_buffering off;
    proxy_cache off;

    # Timeouts for long-lived SSE connections
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Required for SSE
        proxy_set_header Connection '';
        chunked_transfer_encoding on;
    }
}
```

Key points for nginx:

- `proxy_buffering off` is required so SSE events are forwarded immediately.
- `proxy_read_timeout` should be at least as long as the session TTL (default 1 hour).
- `proxy_http_version 1.1` is required for chunked transfer encoding.

### Caddy

```
mcp.example.com {
    reverse_proxy 127.0.0.1:3100 {
        # Disable buffering for SSE
        flush_interval -1
    }
}
```

Caddy handles TLS certificates automatically via Let's Encrypt. The `flush_interval -1` setting ensures SSE events are forwarded without buffering.

### Important notes

- Always bind EVOKORE to loopback (`127.0.0.1`, the default) when running behind a reverse proxy. Only the proxy should be publicly accessible.
- If you set `EVOKORE_HTTP_HOST=0.0.0.0` without a reverse proxy, the MCP endpoint is exposed on all network interfaces without TLS. This is only acceptable in fully trusted networks.

## Multi-Client Usage

HTTP mode is designed for concurrent multi-client access. Each client gets a fully isolated session.

### Isolation guarantees

- **Tool activation:** In dynamic discovery mode, each session has its own set of activated tools. One client's `discover_tools` calls do not affect another client's tool list.
- **Rate limiting:** Per-tool rate limit counters are stored per-session. One client cannot exhaust another client's rate limit quota.
- **RBAC roles:** Each session can have a different role. With JWT auth, the role is derived from the token's `role` claim, so different clients can have different permission levels.
- **Metadata:** Each session has an independent metadata map for custom integrations.

### Capacity limits

The session pool defaults to a maximum of 100 concurrent sessions. When this limit is reached:

1. Expired sessions are cleaned up first.
2. If still at capacity, the least-recently-accessed session is evicted (LRU eviction).

There is currently no configurable override for the max session count beyond changing the source default.

### Example: multiple clients

```bash
# Client A connects
curl -X POST http://127.0.0.1:3100/mcp \
  -H "Authorization: Bearer token-a" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{...},"id":1}'
# Returns mcp-session-id: aaa-111

# Client B connects (independently)
curl -X POST http://127.0.0.1:3100/mcp \
  -H "Authorization: Bearer token-b" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{...},"id":1}'
# Returns mcp-session-id: bbb-222

# Both sessions are fully independent
```

## Monitoring

### Health endpoint

The `GET /health` endpoint is always available (no authentication required) and returns:

```json
{"status": "ok", "transport": "streamable-http"}
```

This is suitable for:

- Load balancer health probes (AWS ALB, nginx upstream checks, Kubernetes liveness probes)
- Uptime monitoring (Pingdom, UptimeRobot, etc.)
- Smoke tests in CI/CD pipelines

### Server status resource

Connected MCP clients can read the `evokore://server/status` resource for detailed runtime information:

```json
{
  "version": "3.0.0",
  "discoveryMode": "legacy",
  "toolCount": 45,
  "skillCount": 336,
  "childServers": [
    {
      "id": "github",
      "status": "connected",
      "connectionType": "stdio",
      "registeredToolCount": 15,
      "errorCount": 0
    }
  ]
}
```

### Webhook events

If webhooks are configured (`EVOKORE_WEBHOOKS_ENABLED=true`), the server emits `session_start` and `session_end` events that include the transport type (`"http"`). These can be forwarded to monitoring dashboards or alerting systems.

### Stderr logging

The HTTP server logs lifecycle events to stderr with the `[EVOKORE-HTTP]` prefix:

```
[EVOKORE-HTTP] Listening on http://127.0.0.1:3100
[EVOKORE-HTTP] Session initialized: 550e8400-e29b-41d4-a716-446655440000
[EVOKORE-HTTP] Session closed: 550e8400-e29b-41d4-a716-446655440000
[EVOKORE-HTTP] Error closing orphaned transport for expired session ...: ...
[EVOKORE-HTTP] Server stopped.
```

Redirect stderr to a log file or log aggregator for persistent monitoring:

```bash
node dist/index.js --http 2>> /var/log/evokore-mcp.log
```

## Production Checklist

Before deploying EVOKORE-MCP in HTTP mode to production:

### Security

- [ ] **Enable authentication.** Set `EVOKORE_AUTH_REQUIRED=true` with either a static token or JWT/JWKS validation. Never expose `/mcp` without auth in a network-accessible deployment.
- [ ] **Use TLS.** Place the server behind a reverse proxy (nginx, Caddy, cloud load balancer) that terminates TLS. EVOKORE serves plain HTTP only.
- [ ] **Bind to loopback.** Keep `EVOKORE_HTTP_HOST=127.0.0.1` (the default) so only the reverse proxy can reach the server.
- [ ] **Rotate tokens.** For static token auth, rotate `EVOKORE_AUTH_TOKEN` periodically. For JWT auth, ensure your identity provider rotates signing keys via JWKS.
- [ ] **Review RBAC.** Set `EVOKORE_ROLE` or use JWT role claims to restrict tool access per client. See `permissions.yml` for role definitions.
- [ ] **Review HITL permissions.** Ensure `require_approval` tools in `permissions.yml` are appropriate for the deployment context.

### Resource limits

- [ ] **Session TTL.** Set `EVOKORE_SESSION_TTL_MS` to an appropriate value. The default (1 hour) is suitable for interactive use; reduce it for high-throughput automated clients.
- [ ] **Session capacity.** The default max of 100 concurrent sessions is suitable for most deployments. Monitor for LRU eviction if running at high concurrency.
- [ ] **Rate limiting.** Configure per-server and per-tool rate limits in `mcp.config.json` to protect child servers from abuse.
- [ ] **Child server boot timeout.** Set `EVOKORE_CHILD_SERVER_BOOT_TIMEOUT_MS` (default 30000) appropriately if child servers are slow to start.

### Reliability

- [ ] **Graceful shutdown.** The server handles `SIGTERM` and `SIGINT` by closing all sessions and transports before exiting. Ensure your process manager (systemd, Docker, Kubernetes) sends these signals.
- [ ] **Health checks.** Configure your load balancer to probe `GET /health`. The endpoint returns 200 when the server is accepting connections.
- [ ] **Proxy buffering.** Disable response buffering in your reverse proxy so SSE events are delivered immediately.
- [ ] **Connection timeouts.** Set reverse proxy read timeouts to at least the session TTL to avoid premature SSE disconnects.
- [ ] **Process supervision.** Run under a process manager (systemd, pm2, Docker restart policy) to automatically restart on crashes.

### Logging and observability

- [ ] **Capture stderr.** Route stderr to a persistent log destination. All lifecycle and error messages use the `[EVOKORE-HTTP]` prefix.
- [ ] **Webhook integration.** Enable `EVOKORE_WEBHOOKS_ENABLED=true` and configure webhook endpoints in `mcp.config.json` for event-driven monitoring.
- [ ] **Dashboard.** Use `npm run dashboard` on a management host to view session replays and evidence timelines.

### Deployment examples

**systemd unit file:**

```ini
[Unit]
Description=EVOKORE-MCP HTTP Server
After=network.target

[Service]
Type=simple
User=evokore
WorkingDirectory=/opt/evokore-mcp
ExecStart=/usr/bin/node dist/index.js --http
Environment=EVOKORE_HTTP_HOST=127.0.0.1
Environment=EVOKORE_HTTP_PORT=3100
Environment=EVOKORE_AUTH_REQUIRED=true
EnvironmentFile=/opt/evokore-mcp/.env
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

**Docker Compose:**

```yaml
services:
  evokore-mcp:
    build: .
    command: ["node", "dist/index.js", "--http"]
    ports:
      - "127.0.0.1:3100:3100"
    environment:
      - EVOKORE_HTTP_MODE=true
      - EVOKORE_HTTP_HOST=0.0.0.0
      - EVOKORE_HTTP_PORT=3100
      - EVOKORE_AUTH_REQUIRED=true
    env_file:
      - .env
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3100/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

Note: In the Docker Compose example, `EVOKORE_HTTP_HOST=0.0.0.0` is set because Docker networking requires the container to listen on all interfaces. The `ports` mapping restricts external access to loopback on the host.

## Related Documentation

- [SETUP.md](./SETUP.md) -- General setup, env vars, client registration
- [SETUP.md - HTTP server mode](./SETUP.md#http-server-mode) -- Quick-start HTTP section
- [SETUP.md - HTTP transport authentication](./SETUP.md#http-transport-authentication) -- Auth configuration
- [ARCHITECTURE.md](./ARCHITECTURE.md) -- Runtime architecture and module breakdown
- [TOOLS_AND_DISCOVERY.md](./TOOLS_AND_DISCOVERY.md) -- Tool discovery modes
