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

## Environment and config files

### `.env`

Start from `.env.example`.

Key values:

```bash
GITHUB_PERSONAL_ACCESS_TOKEN=your_github_pat_here
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here

# Optional
EVOKORE_TOOL_DISCOVERY_MODE=legacy
# or
EVOKORE_TOOL_DISCOVERY_MODE=dynamic
```

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
  "servers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"]
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
    }
  }
}
```

Walkthrough:

- `github` and `fs` are booted through `npx`
- `elevenlabs` is optional and booted through `uvx`
- child env values can interpolate shell environment variables
- `ELEVENLABS_MCP_OUTPUT_MODE` is currently set to `both`

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
| Auto-speak Claude responses through a hook | run `npm run voice` and configure `scripts/voice-hook.js` |

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
