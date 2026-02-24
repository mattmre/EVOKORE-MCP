# V2 Multi-Agent Workflows: Advanced Integrations

With EVOKORE-MCP v2.0 fully operational, we can now leverage 40+ proxied GitHub and Filesystem tools seamlessly within complex multi-agent workflows. The core architectural advancements include:

## 1. Dynamic Tool Prefixing & Indexing
Instead of loading 40+ tools into an LLM's context window statically (which causes massive bloat), EVOKORE's `ProxyManager` boots child servers (like `@modelcontextprotocol/server-github` and `@modelcontextprotocol/server-filesystem`) and dynamically prefixes their tools (`github_create_issue`, `fs_write_file`). This prevents namespace collisions while keeping the tools accessible to native skills.

## 2. Human-in-the-Loop (HITL) Security Interceptor
Automated multi-agent workflows involving sensitive endpoints (like GitHub write access or file deletion) are governed by EVOKORE's stateless `_evokore_approval_token` architecture. 
- When an agent attempts a restricted action, the tool call is intercepted and blocked.
- The server returns an error explicitly commanding the agent to prompt the human for approval.
- Upon approval, the agent retries the exact tool call with the injected token, securely fulfilling the workflow without severing the conversational context.

## 3. Active Skill Orchestration (Native Harnessing)
Unlike v1.0 where skills merely returned static markdown prompts, v2.0 introduces **Active Skill Orchestration**. Built-in skills (like `docs_architect` and `skill_creator`) are now integrated directly into the `SkillManager`. 
- **Direct Access**: The `SkillManager` receives a reference to the `ProxyManager`, enabling it to actively harness proxied child server tools natively from within Node.js.
- **Pre-Fetching Data**: When an agent calls `docs_architect(target_dir)`, EVOKORE uses the proxied `fs_read_file` to read the directory's `package.json` before generating the prompt. The resulting text dynamically injects the file contents, saving the agent from making unnecessary round-trips.
- **Workflow Automation**: When creating a new skill via `skill_creator`, EVOKORE automatically creates the directories and scaffolds the `SKILL.md` using the proxied filesystem tools, completing the boilerplate in milliseconds before returning control to the agent.

## Example: The "Docs Architect" Workflow
1. The human instructs the AI to document the repo using the Docs Architect skill.
2. The AI uses `search_skills` to find `docs_architect`, then invokes it.
3. EVOKORE natively orchestrates a filesystem read using its proxied `fs` server.
4. EVOKORE returns a contextualized generation prompt to the AI, containing the `package.json` data and explicit instructions to generate the Mermaid.js flowcharts.
5. The AI invokes `fs_write_file` to write the finalized documentation to `/docs/README.md`.
6. If the file is protected, the HITL interceptor gracefully pauses the workflow, awaits human approval, and seamlessly resumes.