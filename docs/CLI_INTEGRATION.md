# EVOKORE-MCP CLI Integrations & Status Line

EVOKORE-MCP isn't just an MCP Server-‗it also ships with natively integrated UI hooks designed to make your AI CLI experience (like Gemini CLI or Claude Code) significantly more powerful and transparent.

## The Interactive Status Line

When you connect EVOKORE-MCP to your AI assistant, you can optionally enable the **EVOKORE Status Line**.

Every time the AI finishes a thought or a tool execution, this hook reads the runtime payload plus EVOKORE's local continuity state and renders a compact operator summary showing:
- **Branch and worktree pressure**: active branch plus whether this worktree is clean or carrying changes
- **Session purpose**: pulled from `~/.evokore/sessions/{sessionId}.json`, with Claude-memory fallback when no repo-scoped manifest is available
- **Task pressure**: incomplete vs total TillDone tasks
- **Continuity health**: whether the session manifest is healthy, stale, degraded, or still awaiting purpose
- **Context usage**: current context-window percentage when the client provides it

---

### 💜 Enabling in Gemini CLI
Gemini CLI features a robust native hook engine. You can configure it to execute the EVOKORE Status Line immediately after every model response (`AfterModel`).

**Step 1:** Locate your global settings file (`~/.gemini/settings.json`).
**Step 2:** Ensure hooks are enabled, and add the `AfterModel` event array to the root of the JSON object:
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
**Step 3:** Restart your Gemini CLI!

---

### 💜 Enabling in Claude Code
Claude Code features an undocumented internal hook architecture that natively supports this status line. 
*(Note: Because this feature is currently undocumented by Anthropic, Claude Code's `doctor` command will display "Found 1 settings issue". This is perfectly normal and the status line will still execute successfully)*.

**Step 1:** Locate your Claude settings file (`~/.claude/settings.json`).
**Step 2:** Add the `statusLine` block to the root of the JSON object:
```json
{
  "statusLine": {
    "type": "command",
    "command": "node /absolute/path/to/EVOKORE-MCP/scripts/status.js"
  }
}
```
**Step 3:** Restart Claude Code.

---

### ⚠️ A Note on GitHub Copilot and Codex
Microsoft's GitHub Copilot CLI and OpenAI's Codex CLI **do not natively support** these JSON hook configurations. 

If you want the EVOKORE Status Line to appear after commands in these tools, you must configure a native PowerShell/Bash alias wrapper around the CLI execution.

**Example (PowerShell Profile):**
```powershell
function copilot-evokore {
    gh copilot $args
    node "/absolute/path/to/EVOKORE-MCP/scripts/status.js"
}
```

---

## Data Sources

The status line is continuity-first rather than network-first.

Primary sources:

- `~/.evokore/sessions/{sessionId}.json` for purpose, task counters, replay/evidence counts, and lifecycle health
- current git worktree state for branch and dirty status
- Claude memory `project-state.md` as a fallback when no repo-scoped live session manifest is available
- client payload context-window fields when the AI CLI provides them

The status line does not depend on live location or weather requests anymore. That keeps it deterministic and aligned with the current operator workflow.

---

## Cross-CLI Config Sync

EVOKORE-MCP includes a config sync script (`scripts/sync-configs.js`) that automatically registers the `evokore-mcp` server entry in each supported CLI's configuration file. This eliminates manual JSON editing across multiple tools.

When the script runs from a disposable git worktree, it resolves the MCP entry from the canonical shared repo root instead of the worktree path. This keeps synced CLI configs pointed at the durable runtime entrypoint.

### Quick Start

```bash
# Preview what would change (default mode -- no files written)
npm run sync:dry

# Apply changes to all detected CLIs
npm run sync
```

### Supported Targets

| Target | Config File Location | Detection Method |
|---|---|---|
| `claude-code` | `~/.claude/settings.json` | `which claude` / `where claude` |
| `claude-desktop` | `%APPDATA%/Claude/claude_desktop_config.json` (Windows), `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS), `~/.config/claude/claude_desktop_config.json` (Linux) | Config directory exists |
| `cursor` | `~/.cursor/mcp.json` (user-level, preferred) or `<project>/.cursor/mcp.json` (fallback) | `which cursor` / `where cursor`, or `~/.cursor/` directory exists |
| `gemini` | Manual only (no file written) | `which gemini` / `where gemini` |

You can also target specific CLIs by passing them as positional arguments:

```bash
node scripts/sync-configs.js --apply claude-code cursor
```

If you need to override the detected canonical repo root, set `EVOKORE_SYNC_PROJECT_ROOT=/absolute/path/to/EVOKORE-MCP` before running the script.

### Entry Modes

The script supports two entry modes that control how existing `evokore-mcp` entries are handled:

- **`--preserve-existing`** (default): If an `evokore-mcp` entry already exists in the config file, it is left untouched. Other servers in the config are never modified. This is the safe default for users who have customized their entry.
- **`--force`**: Overwrites any existing `evokore-mcp` entry with the canonical entry pointing to the current project's `dist/index.js`. Useful after moving the project directory or resetting to defaults.

These flags are mutually exclusive; passing both will exit with an error.

### Gemini Manual-Only Mode

The Gemini CLI does not use a JSON config file for MCP server registration. Instead, the sync script detects whether `gemini` is available on PATH and, if so, prints the manual command to run:

```
gemini mcp add evokore-mcp node /path/to/dist/index.js --scope user
```

No file is written for the Gemini target, even when `--apply` is used. This is by design -- Gemini's `mcp add` command manages its own internal state.

### Cursor Fallback Path Logic

The Cursor target checks for a user-level config at `~/.cursor/mcp.json` first. If that file exists, it is used. Otherwise, the script falls back to the project-level path at `<project-root>/.cursor/mcp.json`. This means user-level configuration always takes priority over project-level when both could apply.
