# EVOKORE-MCP CLI Integrations & Status Line

EVOKORE-MCP isn't just an MCP Server—it also ships with natively integrated UI hooks designed to make your AI CLI experience (like Gemini CLI or Claude Code) significantly more powerful and transparent.

## ?? The Interactive Status Line

When you connect EVOKORE-MCP to your AI Assistant, you can optionally enable the **EVOKORE Status Line**. 

Every time the AI finishes a thought or a tool execution, this hook intercepts the internal JSON payload and renders a beautiful, color-coded ASCII status bar at the bottom of your terminal showing:
- **Location**: Your current working directory.
- **Model Identity**: The exact LLM model currently loaded (e.g., gemini-3.1-pro-preview).
- **Skill Count**: A live count of the MCP Agent Skills currently indexed in your library.
- **Context Window Health**: A dynamic, color-coded progress bar showing exactly how many tokens you have consumed relative to your total context window limit (Green -> Yellow -> Red).

### ?? How to Enable It (Gemini CLI & Claude Code)

Because Gemini CLI and Claude Code share an architectural lineage that supports arbitrary shell commands on completion (statusLine), enabling this is as simple as adding one block to your JSON settings file.

**Step 1:** Locate your global settings file.
- **Gemini CLI**: ~/.gemini/settings.json
- **Claude Code**: ~/.claude/settings.json

**Step 2:** Add the statusLine configuration block at the root level of the JSON object. Ensure you use the absolute path to your scripts/status.js file.

`json
{
  "statusLine": {
    "type": "command",
    "command": "node /absolute/path/to/EVOKORE-MCP/scripts/status.js"
  }
}
`

*Example (Windows):*
`json
"command": "node C:/Users/YourName/Documents/GitHub/EVOKORE-MCP/scripts/status.js"
`

**Step 3:** Restart your CLI. The status line will immediately begin appearing under your prompt!

---

### ?? Customization & Extensibility

The Status Line is written in 100% pure Node.js (scripts/status.js) to guarantee absolute cross-platform compatibility across Windows, macOS, and Linux (unlike legacy bash-script alternatives).

You can easily customize the visual aesthetics by editing scripts/status.js:

#### Changing the Colors
The script includes a colors object mapping to standard ANSI terminal codes. You can tweak these to match your terminal theme:
`javascript
const colors = {
  blue: '\x1b[38;5;39m',
  green: '\x1b[38;5;40m',
  purple: '\x1b[38;5;135m',
  // ... add your own HEX/ANSI codes here!
};
`

#### Modifying the Layout
The script includes responsive layout logic. If your terminal window is narrow (e.g., split panes), it intelligently truncates the display to only show the critical Context Window metrics.

You can modify the width breakpoints or output strings at the bottom of the file:
`javascript
if (width < 60) {
    output = \\ | \\;
} else {
    output = \\ :: \ :: \ :: \ :: \\;
}
`

### ?? A Note on Copilot CLI and Codex
Microsoft's GitHub Copilot CLI and OpenAI's Codex CLI do not natively expose a JSON hook schema identical to the statusLine feature found in Anthropic/Gemini architectures. 

To achieve a similar effect in those tools, you would need to write a wrapper script (e.g., a custom PowerShell/Bash alias) that executes the CLI command and then explicitly runs 
ode scripts/status.js immediately after the process exits.
