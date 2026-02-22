# EVOKORE-MCP CLI Integrations & Status Line

EVOKORE-MCP ships with natively integrated UI hooks designed to make your AI CLI experience significantly more powerful.

## ?? The Interactive Status Line

When enabled, this hook renders a beautiful, color-coded ASCII status bar at the bottom of your terminal showing:
- **Location**: Your current working directory.
- **Model Identity**: The exact LLM model currently loaded.
- **Skill Count**: A live count of the MCP Agent Skills currently indexed in your library.
- **Context Window Health**: A dynamic, color-coded progress bar showing exactly how many tokens you have consumed.

### ?? Enabling in Claude Code

Currently, `claude-code` features an undocumented internal hook architecture that natively supports this status line. 
*(Note: Because this feature is currently undocumented by Anthropic, Claude Code's `doctor` command will display "Found 1 settings issue". This is perfectly normal and the status line will still execute successfully).*

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

### ?? Enabling in Gemini CLI, GitHub Copilot, and Codex

**Important Architecture Note:** Microsoft's GitHub Copilot CLI, OpenAI's Codex CLI, and Gemini CLI **do not natively support** the `"statusLine"` JSON hook configuration. 

If you want the EVOKORE Status Line to appear after commands in these tools, you must configure a native PowerShell/Bash alias wrapper around the CLI execution.

**Example (PowerShell Profile):**
```powershell
function gemini-evokore {
    gemini $args
    node "D:\GITHUB\EVOKORE-MCP\scripts\status.js"
}
```
