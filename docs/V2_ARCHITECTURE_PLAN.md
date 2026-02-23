# EVOKORE-MCP v2.0: The Enterprise Router Upgrade

This document outlines the architectural roadmap to upgrade EVOKORE-MCP from a static skill library into a dynamic, secure, multi-server MCP Aggregator.

## 1. Context Bloat Management (Dynamic Loading)
Loading 200+ skills as static MCP Prompts pollutes the LLM context window. 
**Implementation:**
- **Remove Static Prompts:** Stop exposing all 200 skills via ListPromptsRequestSchema.
- **Lightweight Semantic Search:** Integrate use.js (or a lightweight local embedding model) to index the SKILLS/ directory in-memory on startup.
- **Dynamic Injection Tool:** Expose a single tool: esolve_workflow(objective). When the AI receives a task, it calls this tool. The server performs a fuzzy/semantic search, finds the top 3 most relevant skills, and injects their Markdown content directly into the tool response.

## 2. Multi-Server Aggregation (The Proxy Layer)
EVOKORE-MCP must become the single endpoint for AI clients, proxying traffic to official execution tools (Git, Filesystem, Postgres).
**Implementation:**
- **Configuration Driven:** Create an mcp.config.json file where the user defines child servers.
- **Process Manager:** On startup, EVOKORE-MCP uses child_process.spawn to boot these servers.
- **Message Routing:** Implement a JSON-RPC router. When Cursor calls github_create_issue, EVOKORE-MCP intercepts the request, routes it via stdio to the GitHub child process, and pipes the response back to Cursor.
- **Namespace Collision Prevention:** Automatically prefix proxied tools (e.g., a tool named ead_file from the s server becomes s_read_file).

## 3. Credential & Security Management
AI agents must not have unchecked access to destructive tools or raw API keys.
**Implementation:**
- **.env.vault Integration:** Credentials (like GITHUB_PAT) are stored in a local .env file. The EVOKORE-MCP router injects these securely into the env of the child processes upon spawning. The AI never sees the keys.
- **Human-in-the-Loop (HITL) Interceptor:** Create a permissions.yml rule engine.
- **Execution Hook:** Before routing a tool call to a child server, EVOKORE checks the rule. If it requires approval, the MCP server returns a specialized Error/Response forcing the LLM to pause and ask the human before retrying.

## Phase 1 Execution Steps
1. Install use.js for lightweight semantic skill retrieval.
2. Refactor src/index.ts to implement the child_process spawner and JSON-RPC proxy routing logic.
3. Implement the tool-prefixing namespace logic.
4. Add the .env loader for secure credential injection.

## Phase 2 Execution Steps (Architecture Refinements)
1. Implement stateless Human-in-the-Loop (HITL) architecture via `_evokore_approval_token`.
2. Modify proxy tool schemas on-the-fly to allow the AI to inject user-approved tokens.
3. Establish `SecurityManager` state to generate, validate, and consume ephemeral tokens for restricted tools.

---

**Status: COMPLETE** (v2.0 Enterprise Router Deployed). See [V2 Multi-Agent Workflows: Advanced Integrations](V2_MULTI_AGENT_WORKFLOWS.md) for more details.
