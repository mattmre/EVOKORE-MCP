# EVOKORE CLI Integration

This document explains how EVOKORE integrates with supported AI CLIs beyond the raw MCP registration step.

## What EVOKORE adds to CLIs

EVOKORE supports three operator-facing CLI integration patterns:

1. MCP server registration through `dist/index.js`
2. optional continuity-backed status line rendering through `scripts/status.js`
3. cross-CLI registration sync through `scripts/sync-configs.js`

## Status line integration

The EVOKORE status line is continuity-first. It summarizes:

- branch and worktree pressure
- session purpose
- task pressure
- continuity health
- context usage when the client exposes it

Data comes from:

- `~/.evokore/sessions/{sessionId}.json`
- current git state
- managed Claude memory fallback when no repo-scoped live manifest exists

## Claude Code

Claude Code supports a `statusLine` command block in `~/.claude/settings.json`.

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /absolute/path/to/EVOKORE-MCP/scripts/status.js"
  }
}
```

Notes:

- this repo treats the Claude Code status line as an active supported path
- `scripts/status.js` is backed by `scripts/status-runtime.js`
- if you also use hook-based voice forwarding, that remains separate from the status-line command

## Gemini CLI

Gemini CLI can invoke the EVOKORE status line through its hook system.

```json
{
  "enableHooks": true,
  "hooks": {
    "AfterModel": [
      {
        "type": "command",
        "command": "node /absolute/path/to/EVOKORE-MCP/scripts/status.js"
      }
    ]
  }
}
```

## Cursor

Cursor primarily uses the MCP registration path rather than a dedicated EVOKORE status-line integration. Use the normal MCP registration flow described in [SETUP.md](./SETUP.md).

## Copilot CLI / Codex CLI

These CLIs now support automated MCP registration through `scripts/sync-configs.js`. They still do not have a native EVOKORE JSON status-line integration in this repo, so if you want a post-command status line, wrap the CLI call in your own shell function or alias.

PowerShell example:

```powershell
function codex-evokore {
    codex $args
    node "D:\absolute\path\to\EVOKORE-MCP\scripts\status.js"
}
```

## Cross-CLI config sync

The sync helper registers the `evokore-mcp` MCP entry across supported CLIs:

```bash
npm run sync:dry
npm run sync
```

Supported automated targets:

- `claude-code`
- `claude-desktop`
- `cursor`
- `copilot`
- `codex`

`gemini` remains a manual command because its CLI manages MCP config through its own command surface.

Key behavior:

- dry run is the default safety mode
- only the `evokore-mcp` entry is added or updated
- Claude Code prefers the native user MCP config at `~/.claude.json` when present and falls back to `~/.claude/settings.json` for older setups
- the script resolves the canonical repo root so disposable worktrees do not leak temp `dist/index.js` paths into user config files
- use `--force` only when you intentionally want to overwrite an existing EVOKORE entry

If you need to override the detected repo root:

```bash
EVOKORE_SYNC_PROJECT_ROOT=/absolute/path/to/EVOKORE-MCP node scripts/sync-configs.js --apply
```

## Recommended operator flow

1. `npm run build`
2. `npm run sync:dry`
3. `npm run sync`
4. configure the optional status line for the CLI you use
5. run `npm run repo:audit` before starting a new multi-slice repo session

## Related docs

- [SETUP.md](./SETUP.md)
- [USAGE.md](./USAGE.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [TESTING_AND_VALIDATION.md](./TESTING_AND_VALIDATION.md)
