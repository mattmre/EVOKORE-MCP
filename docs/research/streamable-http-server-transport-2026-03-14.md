# StreamableHTTP Server Transport - Architecture Decision

**Date:** 2026-03-14
**Status:** Implemented
**Task:** T26

## Context

EVOKORE-MCP v3.0 runs exclusively as a stdio MCP server. While stdio is the default transport for local MCP servers integrated with Claude Code, Claude Desktop, and similar clients, it has limitations:

- **Single client:** Only one client can connect at a time via stdio.
- **No remote access:** Stdio requires the server process to be on the same machine as the client.
- **No load balancing:** Cannot be placed behind a reverse proxy or load balancer.
- **No health checks:** Orchestration tools (Docker, Kubernetes, systemd) cannot probe server readiness.

EVOKORE already supports HTTP *client* transport for connecting to child servers via `StreamableHTTPClientTransport`. This change adds the symmetric capability: exposing EVOKORE itself as an HTTP server.

## Decision

Add a `StreamableHTTPServerTransport` mode to EVOKORE-MCP, selectable via environment variable (`EVOKORE_HTTP_MODE=true`) or CLI flag (`--http`). When active, EVOKORE listens on a configurable HTTP endpoint instead of stdio.

### Key Design Choices

1. **Mutually exclusive modes.** A single EVOKORE process runs either stdio or HTTP, not both. This avoids complexity around dual-transport session management and keeps the `Server` instance single-connected in the stdio path.

2. **Node.js built-in `http` module.** No new dependencies (no express, no hono). The SDK's `StreamableHTTPServerTransport` wraps `IncomingMessage`/`ServerResponse` directly.

3. **Per-session transport instances.** Each MCP session gets its own `StreamableHTTPServerTransport`, enabling multiple concurrent clients. The `MCP-Session-Id` header is used for routing.

4. **Stateful sessions.** Session IDs are generated via `crypto.randomUUID()`. The server tracks active transports and cleans them up on close.

5. **Health endpoint.** `GET /health` returns `{"status":"ok","transport":"streamable-http"}` for load-balancer probes. This is outside the MCP protocol surface.

6. **Configurable binding.** `EVOKORE_HTTP_PORT` (default 3100) and `EVOKORE_HTTP_HOST` (default `127.0.0.1`) control where the server listens. The default binds to loopback only for security.

## API Surface

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check. Returns `200 OK` with JSON body. |
| POST | `/mcp` | MCP JSON-RPC messages. Creates new session if no `MCP-Session-Id` header. |
| GET | `/mcp` | SSE stream for server-initiated notifications (requires existing session). |
| DELETE | `/mcp` | Terminates an existing session. |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `EVOKORE_HTTP_MODE` | `false` | Set to `true` to start in HTTP mode instead of stdio. |
| `EVOKORE_HTTP_PORT` | `3100` | Port to listen on in HTTP mode. |
| `EVOKORE_HTTP_HOST` | `127.0.0.1` | Host/interface to bind in HTTP mode. |

### CLI Flag

```bash
node dist/index.js --http
```

Equivalent to `EVOKORE_HTTP_MODE=true`.

## Example Usage

### Start in HTTP mode

```bash
EVOKORE_HTTP_MODE=true EVOKORE_HTTP_PORT=3100 node dist/index.js
```

### Health check

```bash
curl http://127.0.0.1:3100/health
# {"status":"ok","transport":"streamable-http"}
```

### Initialize an MCP session

```bash
curl -X POST http://127.0.0.1:3100/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": {"name": "curl-test", "version": "1.0"}
    }
  }'
```

The response includes an `mcp-session-id` header for subsequent requests.

### List tools (using session ID from initialize response)

```bash
curl -X POST http://127.0.0.1:3100/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: <session-id-from-init>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }'
```

### Client connection with MCP SDK

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const transport = new StreamableHTTPClientTransport(
  new URL("http://127.0.0.1:3100/mcp")
);
const client = new Client({ name: "my-client", version: "1.0" });
await client.connect(transport);

const { tools } = await client.listTools();
console.log(tools.map(t => t.name));
```

## Architecture Diagram

```
                    stdio mode (default)
                    +-----------------+
Claude Code ------->| StdioTransport  |---+
                    +-----------------+   |
                                          v
                    http mode             +------------------+
                    +-----------------+   |                  |
HTTP Client 1 ----->|                 |   | EvokoreMCPServer |
HTTP Client 2 ----->| HttpServer      |-->|   (Server)       |
HTTP Client N ----->|   per-session   |   |                  |
                    |   transports    |   +------------------+
                    +-----------------+          |
                                                 v
                                          +------------------+
                                          | ProxyManager     |
                                          | SkillManager     |
                                          | SecurityManager  |
                                          +------------------+
```

## Files Modified/Created

- `src/HttpServer.ts` - New: HTTP server module
- `src/index.ts` - Modified: HTTP mode support, `runHttp()` method
- `tests/integration/http-server-transport.test.ts` - New: Integration tests
- `docs/research/streamable-http-server-transport-2026-03-14.md` - This document
- `docs/SETUP.md` - Updated: HTTP server mode documentation

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Multiple clients competing for shared state | Session-level tool activation isolates per-session state. Proxy tools and skills are shared (read-only after boot). |
| Port conflicts | Default port 3100 is unusual. Configurable via env var. |
| Security exposure | Default bind to `127.0.0.1` (loopback only). Production deployments should add TLS via reverse proxy. |
| MCP Server multi-connect | The SDK `Server` supports `connect()` being called multiple times with different transports for HTTP mode. |
