# EVOKORE-MCP v2.0.1 (The Enterprise Router)

A unified Model Context Protocol (MCP) server that aggregates, indexes, and dynamically serves over 200+ specialized Agent Skills, while functioning as a **Multi-Server Aggregator**. EVOKORE-MCP v2.0 proxies traffic to child servers (e.g., GitHub, Filesystem), namespaces their tools dynamically, and governs execution with a Human-in-the-Loop (HITL) Security Interceptor.

## 🚀 Features

- **Multi-Server Aggregation (Proxy Layer)**: Bootstraps child MCP servers from `mcp.config.json` and routes JSON-RPC messages via stdio, acting as a single unified endpoint for AI clients.
- **Dynamic Tool Prefixing**: Automatically namespaces proxied tools (e.g., `fs_read_file`, `github_create_issue`) to prevent collisions and keep contexts organized.
- **Human-in-the-Loop (HITL) Security Interceptor**: A stateless security architecture that intercepts restricted tool calls and enforces explicit human approval via the `_evokore_approval_token`, protecting sensitive endpoints.
- **Active Skill Orchestration**: Built-in skills (like `docs_architect` and `skill_creator`) are directly integrated into the `SkillManager`, allowing EVOKORE to natively harness child server tools (like reading the filesystem) *before* returning contextualized prompts to the AI.
- **Dynamic Skill Loading**: Automatically scans the `SKILLS/` directory on startup. Keeps context windows lean by using lightweight semantic search (`fuse.js`) to serve prompts only when requested via the `resolve_workflow` tool.
- **Massive Built-in Library**: Includes 146 specialized developer plugins (Wshobson), the Hive Framework, the Manus `planning-with-files` protocol, and extensive custom orchestration workflows (e.g., `arch-aep-runner`, `session-wrap`).

## 🆕 v2.0.1 Hardening Highlights

- **PR Governance Metadata**: Standardized metadata is now required through `.github/pull_request_template.md`, with merge-boundary controls documented in `docs/PR_MERGE_RUNBOOK.md`.
- **Release Safety Gate**: Manual release runs require explicit dependency-chain confirmation (`chain_complete=true`) before workflow execution continues.
- **Windows Command Resolution Contract**: Runtime command resolution on Windows remaps `npx` to `npx.cmd` only; `uv`/`uvx` must resolve directly in shell PATH.
- **Hook Observability**: Hook scripts emit structured telemetry to `~/.evokore/logs/hooks.jsonl` for operator diagnostics without changing hook fail-safe behavior.
- **Submodule CI Guardrails**: CI now validates submodule cleanliness and catches uninitialized/mismatch/dirty states with deterministic checks.

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

## 📖 Documentation Index
- Canonical docs map: [docs/README.md](docs/README.md)
- Usage guide: [docs/USAGE.md](docs/USAGE.md)
- Troubleshooting guide: [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
- PR merge runbook: [docs/PR_MERGE_RUNBOOK.md](docs/PR_MERGE_RUNBOOK.md)
- PR template: [.github/pull_request_template.md](.github/pull_request_template.md)
- Submodule workflow: [docs/SUBMODULE_WORKFLOW.md](docs/SUBMODULE_WORKFLOW.md)
- Release flow: [docs/RELEASE_FLOW.md](docs/RELEASE_FLOW.md)
- Release notes (v2.0.1): [docs/RELEASE_NOTES_v2.0.1.md](docs/RELEASE_NOTES_v2.0.1.md)

## ✅ Validation Coverage
- Full regression: `npm test`
- Ops docs guardrails: `node test-ops-docs-validation.js`
- Release flow guardrails: `node test-npm-release-flow-validation.js`
- Windows command contract: `node test-windows-exec-validation.js`
- Hook observability: `node hook-test-suite.js` and `node hook-e2e-validation.js`
- Submodule safety guard: `node test-submodule-commit-order-guard-validation.js`

## 📂 Repository Structure

- `src/index.ts`: The core MCP Server implementation.
- `SKILLS/`: The library of 200+ organized Markdown skills.
- `scripts/`: Maintenance scripts (like `clean_skills.js`) to normalize YAML frontmatter across the library.

## 🤝 Contributing

This repository uses a strict **Pull Request (PR) only workflow**. Direct commits to the `main` branch are restricted (except by the owner).
1. Fork or branch from `main`.
2. Add or update a skill in the `SKILLS/` directory. Ensure it has valid YAML frontmatter.
3. For process/tooling/release-impacting changes, fill `.github/pull_request_template.md` and follow `docs/PR_MERGE_RUNBOOK.md`.
4. Submit a Pull Request.

