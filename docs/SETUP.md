# EVOKORE Setup Guide

This guide covers installation, environment setup, child-server configuration, client registration, and first-run validation.

## Prerequisites

### Required

- Node.js `>=18`
- npm
- a built checkout of this repository

### Required for current child/server options

- `npx` available on PATH for the configured `github` and `fs` child servers
- `uv` / `uvx` available on PATH if you want to use the optional `elevenlabs` child server or register VoiceMode separately

### Optional credentials

- `GITHUB_PERSONAL_ACCESS_TOKEN` for GitHub operations
- `ELEVENLABS_API_KEY` for ElevenLabs proxy tools and VoiceSidecar
- `SUPABASE_ACCESS_TOKEN` for Supabase proxy tools
- `OPENAI_API_KEY` if you want to use VoiceMode

## Install and build

```bash
npm ci
npm run build
```

The MCP runtime entrypoint is:

```text
dist/index.js
```

## Recommended operator preflight

If you are resuming ongoing repo work rather than doing a first install, run:

```bash
npm run repo:audit
```

This surfaces:

- current branch divergence from `main`
- active worktrees
- stale local/remote branch candidates
- open PR heads
- drift in `CLAUDE.md`, `next-session.md`, and the root planning files

## Environment and config files

### `.env`

Start from `.env.example`.

Key values:

```bash
GITHUB_PERSONAL_ACCESS_TOKEN=your_github_pat_here
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
SUPABASE_ACCESS_TOKEN=your_supabase_access_token_here

# Optional
EVOKORE_TOOL_DISCOVERY_MODE=legacy
```

### v3.0 environment variables

| Variable | Default | Description |
|---|---|---|
| `EVOKORE_ROLE` | (unset = flat permissions) | RBAC role: `admin`, `developer`, or `readonly`. When unset, flat per-tool rules in `permissions.yml` apply. |
| `EVOKORE_SKILL_WATCHER` | `false` | Set to `true` to enable filesystem watcher for automatic skill index hot-reload. |
| `EVOKORE_REPO_AUDIT_HOOK` | `false` | Set to `true` to enable the pre-session repo audit hook (warns about branch drift, stale worktrees). |
| `EVOKORE_CHILD_SERVER_BOOT_TIMEOUT_MS` | `30000` | Timeout in milliseconds for child server boot during async proxy bootstrap. |
| `EVOKORE_TOOL_DISCOVERY_MODE` | `legacy` | Tool discovery mode: `legacy` or `dynamic`. |
| `EVOKORE_MCP_CONFIG_PATH` | `mcp.config.json` (project root) | Override path to the child server config file. |
| `EVOKORE_HTTP_MODE` | `false` | Set to `true` to start in HTTP server mode instead of stdio. |
| `EVOKORE_HTTP_PORT` | `3100` | Port to listen on when running in HTTP mode. |
| `EVOKORE_HTTP_HOST` | `127.0.0.1` | Host/interface to bind when running in HTTP mode. |
| `EVOKORE_AUTH_REQUIRED` | `false` | Set to `true` to require Bearer token authentication on HTTP transport endpoints. |
| `EVOKORE_AUTH_TOKEN` | (unset) | Static bearer token for HTTP transport authentication. Required when `EVOKORE_AUTH_REQUIRED=true`. |

Important behavior:

- unresolved `${VAR}` placeholders referenced by child-server env config fail fast for that child server
- other child servers continue booting
- discovery mode defaults to `legacy` when unset

### `permissions.yml`

`permissions.yml` controls proxied tool policy:

- `allow`
- `require_approval`
- `deny`

Current examples include:

- `fs_read_file: allow`
- `fs_write_file: require_approval`
- `github_create_issue: require_approval`

### `mcp.config.json`

EVOKORE reads child-server definitions from `mcp.config.json`.

Current repo configuration:

```json
{
  "skillRegistries": [],
  "servers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}"
      }
    },
    "fs": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "./"]
    },
    "elevenlabs": {
      "command": "uvx",
      "args": ["elevenlabs-mcp"],
      "env": {
        "ELEVENLABS_API_KEY": "${ELEVENLABS_API_KEY}",
        "ELEVENLABS_MCP_OUTPUT_MODE": "both"
      }
    },
    "supabase": {
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase", "--read-only"],
      "env": {
        "SUPABASE_ACCESS_TOKEN": "${SUPABASE_ACCESS_TOKEN}"
      }
    }
  }
}
```

Walkthrough:

- `github`, `fs`, and `supabase` are booted through `npx`
- `elevenlabs` is optional and booted through `uvx`
- `supabase` is optional and requires `SUPABASE_ACCESS_TOKEN`
- child env values can interpolate shell environment variables via `${VAR}` syntax
- `skillRegistries` configures remote skill registries for `list_registry` using `{ name, baseUrl, index }` objects

### HTTP transport for child servers

Child servers that expose an HTTP endpoint instead of stdio can be configured with:

```json
{
  "servers": {
    "my-http-server": {
      "transport": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

EVOKORE uses `StreamableHTTPClientTransport` from the MCP SDK for HTTP-based child servers. All other child server features (prefixing, permissions, rate limiting) work identically.

### Rate limiting

Add a `rateLimit` block to any server definition:

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

- **Algorithm**: token bucket
- **`maxTokens`**: burst capacity (max calls before throttling)
- **`refillRate`**: tokens restored per interval
- **`refillIntervalMs`**: refill period in milliseconds
- Rate limiting is separate from error-triggered cooldown

### HTTP transport authentication

When exposing EVOKORE-MCP over HTTP (instead of stdio), you can enable Bearer token authentication to protect the `/mcp` endpoint.

1. Set the environment variables in your `.env`:

   ```bash
   EVOKORE_AUTH_REQUIRED=true
   EVOKORE_AUTH_TOKEN=your-secret-token-here
   ```

2. All requests to `/mcp` must include the token:

   ```bash
   curl -X POST http://localhost:3000/mcp \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer your-secret-token-here" \
     -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
   ```

3. The `/health` endpoint is always unauthenticated (for load balancer probes):

   ```bash
   curl http://localhost:3000/health
   ```

Behavior notes:

- When `EVOKORE_AUTH_REQUIRED` is unset or `false`, no authentication is enforced (default).
- When `EVOKORE_AUTH_REQUIRED=true` but `EVOKORE_AUTH_TOKEN` is unset, all requests to protected endpoints are rejected and a warning is logged on startup.
- Unauthorized requests receive a 401 response with a JSON-RPC error body and `WWW-Authenticate: Bearer` header.
- Token comparison uses timing-safe equality to prevent timing attacks.

### RBAC setup

1. Set `EVOKORE_ROLE` in your `.env`:

   ```bash
   EVOKORE_ROLE=developer
   ```

2. Role definitions live in `permissions.yml` under `roles:`:

   - **`admin`**: `default_permission: allow` (full access)
   - **`developer`**: `default_permission: require_approval` with per-tool overrides for read operations
   - **`readonly`**: `default_permission: deny` with per-tool overrides for safe read operations

3. When `EVOKORE_ROLE` is unset, flat per-tool rules under `rules:` apply (original v2 behavior).

### Async proxy boot

Child servers boot asynchronously in the background so the MCP handshake completes immediately. This means:

- Your client connects and receives the native tool list without waiting for child servers
- Proxied tools become available as each child server finishes booting
- Boot progress is emitted to stderr: `"Proxy bootstrap complete"` or `"Background proxy bootstrap failed"`
- Configure the boot timeout via `EVOKORE_CHILD_SERVER_BOOT_TIMEOUT_MS` (default: 30000ms)

If you need to point EVOKORE at another config file, set:

```bash
EVOKORE_MCP_CONFIG_PATH=/absolute/path/to/another-mcp.config.json
```

## HTTP server mode

EVOKORE can also run as an HTTP server using the MCP StreamableHTTP transport. This enables remote access, multi-client connections, and load-balancer health checks.

### Starting in HTTP mode

```bash
# Via environment variable
EVOKORE_HTTP_MODE=true node dist/index.js

# Via CLI flag
node dist/index.js --http

# With custom port and host
EVOKORE_HTTP_MODE=true EVOKORE_HTTP_PORT=8080 EVOKORE_HTTP_HOST=0.0.0.0 node dist/index.js
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check probe. Returns `{"status":"ok","transport":"streamable-http"}` |
| POST | `/mcp` | MCP JSON-RPC messages (creates session on first request) |
| GET | `/mcp` | SSE stream for server notifications (requires `mcp-session-id` header) |
| DELETE | `/mcp` | Terminates an existing session |

### Health check

```bash
curl http://127.0.0.1:3100/health
```

### Client connection example

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const transport = new StreamableHTTPClientTransport(
  new URL("http://127.0.0.1:3100/mcp")
);
const client = new Client({ name: "my-client", version: "1.0" });
await client.connect(transport);
const { tools } = await client.listTools();
```

### Notes

- HTTP and stdio modes are mutually exclusive. A single process uses one transport.
- Default bind is `127.0.0.1` (loopback only). For remote access, set `EVOKORE_HTTP_HOST=0.0.0.0` and place behind a reverse proxy with TLS.
- The server handles graceful shutdown on SIGTERM and SIGINT.
- All MCP features (tools, resources, prompts, HITL, RBAC) work identically over HTTP.

## Client registration

### Manual registration

### Claude Desktop

Add this to your Claude Desktop MCP config:

```json
{
  "mcpServers": {
    "evokore-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/EVOKORE-MCP/dist/index.js"]
    }
  }
}
```

### Gemini CLI

```bash
gemini mcp add evokore-mcp node /absolute/path/to/EVOKORE-MCP/dist/index.js --scope user
```

### Cursor

Register the same command:

```text
node /absolute/path/to/EVOKORE-MCP/dist/index.js
```

## Config sync helper

EVOKORE ships with a cross-CLI registration helper:

```bash
npm run sync:dry
npm run sync
```

Behavior summary:

- dry-run is the default safety mode
- `npm run sync` passes `--apply`
- existing `evokore-mcp` entries are preserved by default
- use `--force` only when you intentionally want to overwrite the current EVOKORE entry

Examples:

```bash
node scripts/sync-configs.js --apply
node scripts/sync-configs.js --apply --force
node scripts/sync-configs.js --apply claude-code cursor
```

## Legacy vs dynamic discovery mode setup

### Legacy mode

Best when:

- your client expects a full tool list
- you want the simplest compatibility posture
- you do not care about tool-list size

```bash
EVOKORE_TOOL_DISCOVERY_MODE=legacy
```

### Dynamic mode

Best when:

- you want a smaller initial tool list
- you want session-scoped activation of proxied tools
- your workflow already uses `discover_tools`

```bash
EVOKORE_TOOL_DISCOVERY_MODE=dynamic
```

Dynamic mode notes:

1. Native EVOKORE tools remain visible.
2. Matching proxied tools become visible after `discover_tools`.
3. EVOKORE sends `tools/list_changed` best-effort.
4. Hidden proxied tools still remain callable by exact prefixed name.

## Windows runtime notes

- EVOKORE remaps only `npx` to `npx.cmd` on Windows.
- EVOKORE does **not** rewrite `uv` or `uvx`.
- Verify `uv --version` and `uvx --version` in the same shell that launches your MCP host.

## Voice-related setup choices

Use the right setup path for your goal:

| Goal | Setup path |
|---|---|
| Use ElevenLabs as proxied MCP tools | configure optional `elevenlabs` child server in `mcp.config.json` |
| Add direct voice conversations in Claude Code | register VoiceMode separately and set `OPENAI_API_KEY` |
| Auto-speak Claude responses through a hook | run `npm run voice`, configure `scripts/voice-hook.js`, and optionally set `VOICE_SIDECAR_PERSONA` for non-default personas |

See [VOICE_AND_HOOKS.md](./VOICE_AND_HOOKS.md) for the full split between those systems.

## First-run validation

Recommended validation order:

1. Build the project:

   ```bash
   npm run build
   ```

2. Confirm registration points to `dist/index.js`.
3. Start your MCP client and verify the server connects.
4. Use a safe tool like `search_skills` or `discover_tools`.
5. If using dynamic mode, run `discover_tools` and then refresh `tools/list`.
6. If using ElevenLabs, ensure `ELEVENLABS_API_KEY` is set before launch.

Useful targeted validations:

```bash
npx vitest run test-version-contract-consistency.js
npx vitest run test-tool-discovery-validation.js
npm run docs:check
npx vitest run test-windows-exec-validation.js
npm run repo:audit -- --json
```

For voice and hook paths:

```bash
npx vitest run test-voice-sidecar-smoke-validation.js
npx vitest run test-voice-sidecar-hotreload-validation.js
npx vitest run hook-e2e-validation.js
```

## Environment Variables Reference

> See `.env.example` for the authoritative list of variables and their defaults.

This section provides a grouped reference for every `EVOKORE_*` environment variable.
Some variables also appear in the [v3.0 environment variables](#v30-environment-variables) table above; they are included here for completeness within each logical group.

### Core / Runtime

| Variable | Default | Description |
|----------|---------|-------------|
| `EVOKORE_MCP_CONFIG_PATH` | `./mcp.config.json` | Override path to the child server config file. |
| `EVOKORE_TOOL_DISCOVERY_MODE` | `legacy` | Tool discovery mode. Options: `legacy`, `dynamic`, `hybrid`. |
| `EVOKORE_CHILD_SERVER_BOOT_TIMEOUT_MS` | `15000` | Timeout in milliseconds for child server boot during async proxy bootstrap. |
| `EVOKORE_PROXY_REQUEST_TIMEOUT_MS` | `60000` | Timeout in milliseconds for proxied tool call requests. |
| `EVOKORE_AUTO_MEMORY_SYNC` | `true` | Auto-sync Claude memory files when session stops. Set to `false` to disable. |

### Session Storage

| Variable | Default | Description |
|----------|---------|-------------|
| `EVOKORE_SESSION_STORE` | `file` | Session store backend for HTTP mode. Options: `file`, `memory`, `redis`. |
| `EVOKORE_SESSION_TTL_MS` | `3600000` | Session TTL in milliseconds for multi-tenant HTTP sessions (1 hour). |
| `EVOKORE_REDIS_URL` | `redis://127.0.0.1:6379` | Redis connection URL. Only used when `EVOKORE_SESSION_STORE=redis`. |
| `EVOKORE_REDIS_KEY_PREFIX` | `evokore` | Redis key namespace prefix for session keys. |

### Webhooks

| Variable | Default | Description |
|----------|---------|-------------|
| `EVOKORE_WEBHOOKS_ENABLED` | `false` | Enable webhook event notifications to external systems. Configure URLs in `mcp.config.json` under the `webhooks` key. |
| `EVOKORE_WEBHOOKS_ALLOW_PRIVATE` | `false` | Allow webhooks to private/loopback addresses. For local development only; never enable in production. |

### Plugins

| Variable | Default | Description |
|----------|---------|-------------|
| `EVOKORE_PLUGINS_DIR` | `./plugins` | Custom plugins directory, relative to project root. Plugins are loaded at startup and support hot-reload via `reload_plugins`. |

### Telemetry

| Variable | Default | Description |
|----------|---------|-------------|
| `EVOKORE_TELEMETRY` | `false` | Enable local-only usage telemetry. Collects aggregate metrics (tool call counts, error rates, session counts, latency). No PII. Stored at `~/.evokore/telemetry/metrics.json`. When HTTP mode is active, `GET /metrics` exposes Prometheus-format counters. |
| `EVOKORE_TELEMETRY_EXPORT` | `false` | Enable external telemetry export. Requires `EVOKORE_TELEMETRY=true`. |
| `EVOKORE_TELEMETRY_EXPORT_URL` | -- | HTTP(S) URL to POST telemetry metrics to. Required when export is enabled. |
| `EVOKORE_TELEMETRY_EXPORT_INTERVAL_MS` | `60000` | Export interval in milliseconds. Minimum: `10000`. |
| `EVOKORE_TELEMETRY_EXPORT_SECRET` | -- | HMAC-SHA256 signing secret for telemetry export payloads. Optional. |

### Audit

| Variable | Default | Description |
|----------|---------|-------------|
| `EVOKORE_AUDIT_LOG` | `true` | Structured audit logging to `~/.evokore/audit/`. Records security and operational events as JSONL. Set to `false` to disable. |
| `EVOKORE_AUDIT_EXPORT` | `false` | Enable external audit event export. Requires audit logging to be enabled (the default). |
| `EVOKORE_AUDIT_EXPORT_URL` | -- | HTTP(S) URL to POST audit events to. Required when export is enabled. |
| `EVOKORE_AUDIT_EXPORT_INTERVAL_MS` | `60000` | Export interval in milliseconds. Minimum: `10000`. |
| `EVOKORE_AUDIT_EXPORT_BATCH_SIZE` | `100` | Maximum number of audit entries per export batch. |
| `EVOKORE_AUDIT_EXPORT_SECRET` | -- | HMAC-SHA256 signing secret for audit export payloads. Optional. |

### Security

| Variable | Default | Description |
|----------|---------|-------------|
| `EVOKORE_SECURITY_DEFAULT_DENY` | `false` | Deny unknown tools by default (secure posture). Enable for production hardening. When unset or `false`, unknown tools default to `allow` (backward compatible). |
| `EVOKORE_ROLE` | (unset) | RBAC role: `admin`, `developer`, or `readonly`. When unset, flat per-tool rules in `permissions.yml` apply. |

### OAuth / Auth

| Variable | Default | Description |
|----------|---------|-------------|
| `EVOKORE_AUTH_REQUIRED` | `false` | Set to `true` to require Bearer token authentication on HTTP transport endpoints. |
| `EVOKORE_AUTH_TOKEN` | -- | Static bearer token for HTTP transport. Required when `EVOKORE_AUTH_REQUIRED=true` and `EVOKORE_AUTH_MODE=static`. |
| `EVOKORE_AUTH_MODE` | `static` | Authentication mode. Options: `static` (bearer token) or `jwt` (JWKS-based validation). |
| `EVOKORE_OAUTH_ISSUER` | -- | Expected JWT `iss` claim. Used when `EVOKORE_AUTH_MODE=jwt`. |
| `EVOKORE_OAUTH_AUDIENCE` | -- | Expected JWT `aud` claim. Used when `EVOKORE_AUTH_MODE=jwt`. |
| `EVOKORE_OAUTH_JWKS_URI` | -- | JWKS endpoint URL for fetching public keys. Used when `EVOKORE_AUTH_MODE=jwt`. |

### HTTP Transport

| Variable | Default | Description |
|----------|---------|-------------|
| `EVOKORE_HTTP_MODE` | `false` | Set to `true` to start in HTTP server mode instead of stdio. Also available as `--http` CLI flag. |
| `EVOKORE_HTTP_PORT` | `3100` | Port to listen on when running in HTTP mode. |
| `EVOKORE_HTTP_HOST` | `127.0.0.1` | Host/interface to bind when running in HTTP mode. Set to `0.0.0.0` for remote access (place behind a reverse proxy with TLS). |

### Sandbox

| Variable | Default | Description |
|----------|---------|-------------|
| `EVOKORE_SANDBOX_MODE` | `auto` | Skill execution sandbox mode. Options: `container` (always Docker/Podman), `process` (subprocess only), `auto` (try container, then fallback to process). |
| `EVOKORE_SANDBOX_MEMORY_MB` | `256` | Container sandbox memory limit in MB. |
| `EVOKORE_SANDBOX_CPU_LIMIT` | `1` | Container sandbox CPU limit. |
| `EVOKORE_SANDBOX_PREPULL` | `false` | Warm missing container sandbox images at startup to reduce first-run latency. |
| `EVOKORE_SANDBOX_SECCOMP_PROFILE` | -- | Custom seccomp profile JSON file for container sandbox executions. When unset, Docker/Podman runtime defaults apply. |
| `EVOKORE_SANDBOX_BASH_MEMORY_MB` | (global) | Per-language memory override for bash sandbox executions. Falls back to `EVOKORE_SANDBOX_MEMORY_MB`. |
| `EVOKORE_SANDBOX_JAVASCRIPT_MEMORY_MB` | (global) | Per-language memory override for JavaScript sandbox executions. |
| `EVOKORE_SANDBOX_TYPESCRIPT_MEMORY_MB` | (global) | Per-language memory override for TypeScript sandbox executions. |
| `EVOKORE_SANDBOX_PYTHON_MEMORY_MB` | (global) | Per-language memory override for Python sandbox executions. |
| `EVOKORE_SANDBOX_BASH_CPU_LIMIT` | (global) | Per-language CPU override for bash sandbox executions. Falls back to `EVOKORE_SANDBOX_CPU_LIMIT`. |
| `EVOKORE_SANDBOX_JAVASCRIPT_CPU_LIMIT` | (global) | Per-language CPU override for JavaScript sandbox executions. |
| `EVOKORE_SANDBOX_TYPESCRIPT_CPU_LIMIT` | (global) | Per-language CPU override for TypeScript sandbox executions. |
| `EVOKORE_SANDBOX_PYTHON_CPU_LIMIT` | (global) | Per-language CPU override for Python sandbox executions. |

### Dashboard / WebSocket

| Variable | Default | Description |
|----------|---------|-------------|
| `EVOKORE_DASHBOARD_TOKEN` | -- | Bearer token for dashboard authentication. When set, all dashboard API routes require `Authorization: Bearer <token>`. Omit for local-only mode. |
| `EVOKORE_DASHBOARD_ROLE` | `admin` (local) / `readonly` (token) | Dashboard RBAC role. Options: `admin`, `developer`, `readonly`. Defaults to `admin` for local-only mode and `readonly` when token authentication is active. |
| `EVOKORE_DASHBOARD_APPROVAL_WS_URL` | (auto-detected) | Explicit approvals WebSocket endpoint for the dashboard. Use when the dashboard runs on a different host/port than the EVOKORE HTTP server. When unset, loopback dashboards auto-target the current HTTP port. |
| `EVOKORE_DASHBOARD_APPROVAL_WS_TOKEN` | -- | Dedicated bearer token for the approvals WebSocket endpoint. Falls back to the dashboard session token when unset. |
| `EVOKORE_WS_APPROVALS_ENABLED` | `false` | Enable WebSocket real-time approval events on HttpServer. When enabled, the `/ws/approvals` endpoint streams approval lifecycle events. |
| `EVOKORE_WS_HEARTBEAT_MS` | `30000` | WebSocket heartbeat interval in milliseconds. |
| `EVOKORE_WS_MAX_CLIENTS` | `10` | Maximum concurrent WebSocket approval clients. |
| `EVOKORE_WS_ALLOW_QUERY_TOKEN` | `false` | **Deprecated.** Allow WS auth via `?token=` query string. Prefer `Authorization` header. |

### Hooks

| Variable | Default | Description |
|----------|---------|-------------|
| `EVOKORE_REPO_AUDIT_HOOK` | (enabled) | Pre-session repo audit hook. Warns about branch drift, stale worktrees, and control-plane drift. Runs once per session. Set to `false` to disable. |
| `EVOKORE_SKILL_WATCHER` | `false` | Enable filesystem watcher for automatic skill index hot-reload. |

### Speech-to-Text (STT)

| Variable | Default | Description |
|----------|---------|-------------|
| `EVOKORE_STT_ENABLED` | `false` | Enable speech-to-text in VoiceSidecar. |
| `EVOKORE_STT_PROVIDER` | `whisper-api` | STT provider. Options: `whisper-api`, `local-whisper`, `local`. |
| `EVOKORE_STT_MODEL` | `whisper-1` | Whisper API model name. |
| `EVOKORE_STT_LOCAL_MODEL` | `base` | Local whisper CLI model. Options: `tiny`, `base`, `small`, `medium`, `large`. |
| `EVOKORE_WHISPER_PATH` | `whisper` | Path to local whisper CLI binary. |

### Text-to-Speech (TTS)

| Variable | Default | Description |
|----------|---------|-------------|
| `EVOKORE_TTS_PROVIDER` | `elevenlabs` | TTS provider for VoiceSidecar. Options: `elevenlabs`, `openai-compat`. |
| `EVOKORE_TTS_BASE_URL` | `http://127.0.0.1:8880` | Base URL for OpenAI-compatible TTS endpoint. Used when `EVOKORE_TTS_PROVIDER=openai-compat` (e.g., Kokoro-FastAPI, Chatterbox TTS API). |
| `EVOKORE_TTS_API_KEY` | -- | API key for OpenAI-compatible TTS endpoint. Not required for local servers. |
| `EVOKORE_TTS_VOICE` | `nova` | Default voice name for OpenAI-compatible TTS. |
| `EVOKORE_TTS_MODEL` | `tts-1` | Default model for OpenAI-compatible TTS. |

## If setup fails

Go to:

- [USAGE.md](./USAGE.md)
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- [TESTING_AND_VALIDATION.md](./TESTING_AND_VALIDATION.md)
