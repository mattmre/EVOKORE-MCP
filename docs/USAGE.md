# EVOKORE-MCP Usage Guide

This guide covers how to install, configure, and use EVOKORE-MCP with your favorite AI assistants.

## 1. Connecting to an AI Assistant

EVOKORE-MCP uses the standard Model Context Protocol via `stdio`. You must point your AI client to the compiled `index.js` file.

### For Gemini CLI
To register this server globally so it's available in any project:
```bash
gemini mcp add evokore-mcp node /absolute/path/to/EVOKORE-MCP/src/index.js --scope user
```
After running this, type `/mcp` in your interactive session to confirm it is `CONNECTED`.

### For Claude Desktop
Add the following to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "evokore-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/EVOKORE-MCP/src/index.js"]
    }
  }
}
```

### For Cursor IDE
1. Open Cursor Settings.
2. Go to **Features > MCP Servers**.
3. Add a new server. Name it `evokore-mcp`.
4. Command: `node /absolute/path/to/EVOKORE-MCP/src/index.js`.

## 2. Using the Built-In Tools

Once connected, your AI assistant will automatically have access to the following tools:

- **`search_skills`**: Ask the AI to find a specific workflow. (e.g., *"Search the MCP for React styling skills."*)
- **`get_skill_help`**: If you want to know what a specific skill does, ask the AI to explain it. (e.g., *"What does the 'arch-aep-runner' skill do? Show me some examples."*)

When `get_skill_help` is invoked, EVOKORE-MCP returns the raw Markdown instructions to the LLM, enabling the LLM to understand exactly what the skill is capable of and explain it to you in plain English.

## 3. Adopting a Workflow

Because EVOKORE-MCP exposes its library as **MCP Prompts**, you can instruct the AI to adopt a workflow completely.
*"Adopt the `session-wrap` workflow."* -> The AI will fetch the prompt from EVOKORE-MCP and immediately execute the PR generation, logging, and next-session handoff protocols defined in that skill.
