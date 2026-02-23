# EVOKORE-MCP v2.0 (The Enterprise Router)

A unified Model Context Protocol (MCP) server that aggregates, indexes, and dynamically serves over 200+ specialized Agent Skills, while functioning as a **Multi-Server Aggregator**. EVOKORE-MCP v2.0 proxies traffic to child servers (e.g., GitHub, Filesystem), namespaces their tools dynamically, and governs execution with a Human-in-the-Loop (HITL) Security Interceptor.

## 🚀 Features

- **Multi-Server Aggregation (Proxy Layer)**: Bootstraps child MCP servers from `mcp.config.json` and routes JSON-RPC messages via stdio, acting as a single unified endpoint for AI clients.
- **Dynamic Tool Prefixing**: Automatically namespaces proxied tools (e.g., `fs_read_file`, `github_create_issue`) to prevent collisions and keep contexts organized.
- **Human-in-the-Loop (HITL) Security Interceptor**: A stateless security architecture that intercepts restricted tool calls and enforces explicit human approval via the `_evokore_approval_token`, protecting sensitive endpoints.
- **Active Skill Orchestration**: Built-in skills (like `docs_architect` and `skill_creator`) are directly integrated into the `SkillManager`, allowing EVOKORE to natively harness child server tools (like reading the filesystem) *before* returning contextualized prompts to the AI.
- **Dynamic Skill Loading**: Automatically scans the `SKILLS/` directory on startup. Keeps context windows lean by using lightweight semantic search (`fuse.js`) to serve prompts only when requested via the `resolve_workflow` tool.
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

## 🎓 Comprehensive Training
Dive into our extensive, deeply researched use cases and training guides for all 200+ skills: [**Training & Use Cases Documentation**](docs/TRAINING_AND_USE_CASES.md).

## 📂 Repository Structure

- `src/index.ts`: The core MCP Server implementation.
- `SKILLS/`: The library of 200+ organized Markdown skills.
- `scripts/`: Maintenance scripts (like `clean_skills.js`) to normalize YAML frontmatter across the library.

## 🤝 Contributing

This repository uses a strict **Pull Request (PR) only workflow**. Direct commits to the `main` branch are restricted (except by the owner).
1. Fork or branch from `main`.
2. Add or update a skill in the `SKILLS/` directory. Ensure it has valid YAML frontmatter.
3. Submit a Pull Request.

