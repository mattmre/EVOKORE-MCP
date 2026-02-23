# EVOKORE-MCP CLI Integrations & Status Line

EVOKORE-MCP isn't just an MCP Server-‗it also ships with natively integrated UI hooks designed to make your AI CLI experience (like Gemini CLI or Claude Code) significantly more powerful and transparent.

## 🍨 The Interactive Status Line

When you connect EVOKORE-MCP to your AI Assistant, you can optionally enable the **EVOKORE Status Line**. 

Every time the AI finishes a thought or a tool execution, this hook intercepts the internal JSON payload and renders a beautiful, color-coded ASCII status bar at the bottom of your terminal showing:
- **Location**: Your current working directory.
- **Model Identity**: The exact LLM model currently loaded.
- **Skill Count**: A live count of the MCP Agent Skills currently indexed in your library.
- **Context Window Health**: A dynamic, color-coded progress bar showing exactly how many tokens you have consumed.

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