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
- `skillRegistries` array configures remote skill registry URLs for `list_registry`

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
node test-version-contract-consistency.js
node test-tool-discovery-validation.js
node test-docs-canonical-links.js
node test-windows-exec-validation.js
npm run repo:audit -- --json
```

For voice and hook paths:

```bash
node test-voice-sidecar-smoke-validation.js
node test-voice-sidecar-hotreload-validation.js
node hook-e2e-validation.js
```

## If setup fails

Go to:

- [USAGE.md](./USAGE.md)
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- [TESTING_AND_VALIDATION.md](./TESTING_AND_VALIDATION.md)
