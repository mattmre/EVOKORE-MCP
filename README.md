# EVOKORE-MCP (Model Context Protocol Server)

A unified Model Context Protocol (MCP) server that aggregates, indexes, and dynamically serves over 200+ specialized Agent Skills, Prompts, and Coding Workflows to AI assistants like Claude, Cursor, Copilot, and Gemini.

## 🚀 Features

- **Dynamic Skill Loading**: Automatically scans the `SKILLS/` directory on startup and registers `.md` instructions as MCP Prompts, Resources, and Tools.
- **Progressive Disclosure**: Keeps context windows lean by serving prompts only when requested by the LLM.
- **Massive Built-in Library**: Includes 146 specialized developer plugins (Wshobson), the Hive Framework, the Manus `planning-with-files` protocol, and extensive custom orchestration workflows (e.g., `arch-aep-runner`, `session-wrap`).

## 🛠️ Setup

To use this server with your AI client (like Claude Desktop or Cursor), add the following to your MCP configuration file:

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

## 📂 Repository Structure

- `src/index.ts`: The core MCP Server implementation.
- `SKILLS/`: The library of 200+ organized Markdown skills.
- `scripts/`: Maintenance scripts (like `clean_skills.js`) to normalize YAML frontmatter across the library.

## 🤝 Contributing

This repository uses a strict **Pull Request (PR) only workflow**. Direct commits to the `main` branch are restricted (except by the owner).
1. Fork or branch from `main`.
2. Add or update a skill in the `SKILLS/` directory. Ensure it has valid YAML frontmatter.
3. Submit a Pull Request.
