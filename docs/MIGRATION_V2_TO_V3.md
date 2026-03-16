# Migrating EVOKORE-MCP from v2 to v3

This guide walks you through upgrading an existing EVOKORE-MCP v2 installation to v3.0. v3 is backwards-compatible for basic stdio usage, but introduces significant new capabilities and a few breaking changes.

## Breaking Changes

### Node.js Minimum Version

v3 requires **Node.js v20 or later**. v2 supported Node.js v18+. If you are on Node.js 18, upgrade before proceeding.

```bash
node --version
# Must be v20.x or later
```

### Test Runner Migration

The test runner changed from chained `node test-*.js` scripts to **vitest**.

| v2 | v3 |
|----|-----|
| `node test-foo.js && node test-bar.js` | `npx vitest run` |
| Individual test scripts with `node` | `npx vitest run test-name` |
| `npm test` ran chained scripts | `npm test` runs `vitest run` |

If you have CI pipelines that invoke individual test files with `node test-*.js`, update them to use `npx vitest run test-*.js`.

### Build Output Location

Compiled artifacts are no longer tracked in `src/`. Only the `dist/` directory contains build output, and it is gitignored. If your tooling referenced compiled `.js` files under `src/`, update those paths to `dist/`.

### MCP SDK Version

v3 depends on `@modelcontextprotocol/sdk ^1.27.1` (up from earlier versions in v2). The SDK API is backwards-compatible, but check your lock file for any resolution conflicts if you pin the SDK elsewhere.

### Async Proxy Boot

Child servers now boot asynchronously in the background. The MCP handshake completes immediately without waiting for child servers to connect. This is transparent for normal usage, but if you have integration tests that call proxied tools immediately after connecting, they must wait for the boot sentinel (`"Proxy bootstrap complete"` on stderr) before asserting on proxied tool results. See `tests/helpers/wait-for-proxy-boot.js` for the recommended helper.

## New Features in v3

### HTTP Transport (StreamableHTTP)

EVOKORE can now serve MCP over HTTP with SSE streaming, enabling remote access, multi-client connections, and reverse proxy setups.

```bash
# Start in HTTP mode
node dist/index.js --http
# or
EVOKORE_HTTP_MODE=true node dist/index.js
```

The server listens on `127.0.0.1:3100` by default (`EVOKORE_HTTP_PORT`, `EVOKORE_HTTP_HOST`). Detailed guide: [docs/HTTP_DEPLOYMENT.md](./HTTP_DEPLOYMENT.md).

### OAuth/JWT Authentication

HTTP transport endpoints can be protected with Bearer token authentication. Two modes are available:

- **Static**: a shared secret for internal/dev deployments (`EVOKORE_AUTH_MODE=static`)
- **JWT**: validation against a remote JWKS endpoint for production use with identity providers (`EVOKORE_AUTH_MODE=jwt`)

Enable with `EVOKORE_AUTH_REQUIRED=true`. Detailed guide: [docs/OAUTH_SETUP.md](./OAUTH_SETUP.md).

### Multi-Tenant Session Isolation

In HTTP mode, each client connection receives a fully isolated session with its own tool activation state, rate limit counters, RBAC role, and metadata. Sessions are managed with a configurable TTL (`EVOKORE_SESSION_TTL_MS`, default 1 hour) and an LRU eviction policy caps the pool at 100 concurrent sessions.

### RBAC (Role-Based Access Control)

Three predefined roles are available in `permissions.yml`:

| Role | Default Permission | Description |
|------|-------------------|-------------|
| `admin` | `allow` | Full access to all tools |
| `developer` | `require_approval` | Standard access with read ops allowed, destructive ops gated or denied |
| `readonly` | `deny` | Read-only access to a curated set of tools |

Activate via `EVOKORE_ROLE=developer` in `.env`. When unset, the original flat permission rules from `permissions.yml` apply (full backwards compatibility).

### Rate Limiting

Configurable per-server and per-tool rate limits using a token bucket algorithm. Define limits in `mcp.config.json`:

```json
{
  "servers": {
    "github": {
      "rateLimit": {
        "maxTokens": 10,
        "refillRate": 2,
        "refillIntervalMs": 1000
      }
    }
  }
}
```

This is independent of the error-triggered cooldown mechanism that temporarily disables failing child servers.

### Webhook Events

EVOKORE emits HMAC-SHA256 signed events to configured HTTP endpoints. Six event types: `tool_call`, `tool_error`, `session_start`, `session_end`, `approval_requested`, `approval_granted`. Fire-and-forget delivery with 3 retries and exponential backoff. Enable with `EVOKORE_WEBHOOKS_ENABLED=true`. Detailed guide: [docs/WEBHOOK_GUIDE.md](./WEBHOOK_GUIDE.md).

### Plugin System

Custom tool providers can be loaded from the `plugins/` directory (configurable via `EVOKORE_PLUGINS_DIR`). Plugins are loaded at startup and can be hot-reloaded at runtime via the `reload_plugins` tool. Detailed guide: [docs/PLUGIN_AUTHORING.md](./PLUGIN_AUTHORING.md).

### MCP Resources and Prompts

`resources/list` now returns skill URIs (`skill://...`) plus server-level resources:
- `evokore://server/status`
- `evokore://server/config`
- `evokore://skills/categories`

`prompts/list` returns three prompts: `resolve-workflow`, `skill-help`, `server-overview`.

### Tool Annotations

All native tools carry MCP annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) and `title` fields for better client-side display.

### Skill Ecosystem

- **Hot-reload**: call `refresh_skills` or enable `EVOKORE_SKILL_WATCHER=true` for auto-refresh
- **Versioning**: optional `version`, `requires`, `conflicts` fields in skill frontmatter
- **Remote registries**: configure `skillRegistries` in `mcp.config.json`, browse with `list_registry`
- **Remote fetch**: download skills from URLs with `fetch_skill`
- **Execution sandbox**: run code blocks from skills via `execute_skill` (30s timeout, 1 MB output limit)

### Session Dashboard

A zero-dependency web dashboard at `127.0.0.1:8899`:

```bash
npm run dashboard
```

Provides session replay, evidence timeline viewing, and an HITL approval UI at `/approvals`.

### HITL Approval UI

The dashboard `/approvals` page shows pending approval tokens with deny buttons, allowing operators to review and reject HITL approval requests from a browser.

## Migration Steps

### Step 1: Update Node.js

Ensure you are running Node.js v20 or later:

```bash
node --version
# v20.x.x or v22.x.x
```

### Step 2: Pull and Install

```bash
git pull origin main
npm ci
npm run build
```

### Step 3: Review Configuration

Your existing `mcp.config.json` and `.env` files are fully compatible with v3. No changes are required for basic stdio usage.

If you want to adopt new features, add optional configuration as described below.

### Step 4: Update CI Pipelines

Replace any `node test-*.js` commands with vitest equivalents:

```bash
# Before (v2)
node test-proxy-integration.js && node test-security-validation.js

# After (v3)
npx vitest run
```

### Step 5: Test Your Setup

```bash
# Build
npm run build

# Run all tests
npm test

# Verify MCP tools load correctly
# (connect with your AI client and call discover_tools or proxy_server_status)
```

### Step 6: Opt In to New Features (Optional)

Each new feature is opt-in. Add environment variables to `.env` as needed:

```bash
# RBAC
EVOKORE_ROLE=developer

# Skill hot-reload watcher
EVOKORE_SKILL_WATCHER=true

# HTTP transport mode
EVOKORE_HTTP_MODE=true
EVOKORE_HTTP_PORT=3100

# Authentication (HTTP mode only)
EVOKORE_AUTH_REQUIRED=true
EVOKORE_AUTH_MODE=static
EVOKORE_AUTH_SECRET=your-shared-secret

# Session TTL for multi-tenant HTTP
EVOKORE_SESSION_TTL_MS=3600000

# Webhook events
EVOKORE_WEBHOOKS_ENABLED=true

# Custom plugins directory
EVOKORE_PLUGINS_DIR=./plugins
```

## Configuration Reference

### New Environment Variables in v3

| Variable | Default | Description |
|----------|---------|-------------|
| `EVOKORE_ROLE` | *(unset)* | RBAC role: `admin`, `developer`, or `readonly` |
| `EVOKORE_SKILL_WATCHER` | `false` | Enable filesystem watcher for skill hot-reload |
| `EVOKORE_HTTP_MODE` | `false` | Start in HTTP mode instead of stdio |
| `EVOKORE_HTTP_PORT` | `3100` | Port for HTTP server |
| `EVOKORE_HTTP_HOST` | `127.0.0.1` | Host/interface for HTTP server |
| `EVOKORE_SESSION_TTL_MS` | `3600000` | Session TTL for multi-tenant HTTP sessions |
| `EVOKORE_AUTH_REQUIRED` | `false` | Require Bearer token auth on HTTP endpoints |
| `EVOKORE_AUTH_MODE` | `static` | Auth mode: `static` or `jwt` |
| `EVOKORE_AUTH_SECRET` | *(unset)* | Shared secret for static auth mode |
| `EVOKORE_OAUTH_ISSUER` | *(unset)* | JWT issuer for jwt auth mode |
| `EVOKORE_OAUTH_AUDIENCE` | *(unset)* | JWT audience for jwt auth mode |
| `EVOKORE_OAUTH_JWKS_URI` | *(unset)* | JWKS endpoint for jwt auth mode |
| `EVOKORE_WEBHOOKS_ENABLED` | `false` | Enable webhook event delivery |
| `EVOKORE_PLUGINS_DIR` | `./plugins` | Directory for plugin discovery |
| `EVOKORE_CHILD_SERVER_BOOT_TIMEOUT_MS` | `30000` | Timeout for child server boot |
| `EVOKORE_REPO_AUDIT_HOOK` | `true` | Enable pre-session repo audit hook |

### New mcp.config.json Sections

**Rate limiting** (per server):

```json
{
  "servers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "rateLimit": {
        "maxTokens": 10,
        "refillRate": 2,
        "refillIntervalMs": 1000
      }
    }
  }
}
```

**HTTP child server transport**:

```json
{
  "servers": {
    "remote-server": {
      "transport": "http",
      "url": "http://localhost:4000/mcp"
    }
  }
}
```

**Webhook subscriptions**:

```json
{
  "webhooks": [
    {
      "url": "https://example.com/webhook",
      "secret": "your-hmac-secret",
      "events": ["tool_call", "tool_error"]
    }
  ]
}
```

**Skill registries**:

```json
{
  "skillRegistries": [
    "https://example.com/skills/registry.json"
  ]
}
```

## Compatibility Notes

- **stdio mode**: Fully backwards-compatible. No configuration changes needed.
- **Flat permissions**: When `EVOKORE_ROLE` is unset, the original flat permission rules from `permissions.yml` apply.
- **mcp.config.json**: The v2 format works unchanged. New sections (`rateLimit`, `webhooks`, `skillRegistries`, `transport`) are additive.
- **Tool names**: All tool names and prefixing behavior are unchanged.
- **HITL flow**: The `_evokore_approval_token` mechanism is unchanged.

## Further Reading

- [CHANGELOG.md](../CHANGELOG.md) -- full change log
- [docs/SETUP.md](./SETUP.md) -- installation and first-run setup
- [docs/USAGE.md](./USAGE.md) -- complete usage guide including v3 features
- [docs/ARCHITECTURE.md](./ARCHITECTURE.md) -- runtime architecture
- [docs/HTTP_DEPLOYMENT.md](./HTTP_DEPLOYMENT.md) -- HTTP transport deployment
- [docs/OAUTH_SETUP.md](./OAUTH_SETUP.md) -- authentication setup
- [docs/WEBHOOK_GUIDE.md](./WEBHOOK_GUIDE.md) -- webhook event system
- [docs/PLUGIN_AUTHORING.md](./PLUGIN_AUTHORING.md) -- writing plugins
