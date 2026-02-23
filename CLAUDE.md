# EVOKORE-MCP Developer Context & Learnings

## System Architecture
- EVOKORE-MCP v2.0 acts as a Multi-Server MCP Aggregator proxying to child servers (e.g., github, fs) defined in `mcp.config.json` with a JSON-RPC router.
- Tool-prefixing is active to prevent namespace collisions.

## Key Workflows & Learnings
- **Human-in-the-Loop (HITL):** Since JSON-RPC via stdio is stateless and the server cannot natively prompt the user in the AI client's terminal, EVOKORE uses an `_evokore_approval_token`. Restricted tools return an error directing the AI to ask the user and then retry with the token injected into the tool arguments.
- **Submodules:** The repository uses git submodules for SKILLS (`ANTHROPIC COOKBOOK`, `claude-skills-mcp`, `OFFICIAL MCP SERVERS`). 
- **Doc Generation Scripts:** Scripts like `scripts/generate_docs.js` add frontmatter and modify files within these submodules. Always commit changes inside the submodules first before updating the parent repo pointer to avoid `-dirty` submodule states.
- **Hook Scripts:** Native CLI UI hooks like `scripts/status.js` are available to integrate with Gemini CLI and Claude Code to provide live context, location, and skill count info.
- **Path Resolution:** Remember that compiled TypeScript files run out of the `dist/` directory! Relative paths from managers resolving to root files (e.g., `mcp.config.json`, `.env`, `SKILLS/`) must resolve to `../`, not `../../`.
- **Regex Parsing:** When using JavaScript's native RegExp for matching markdown frontmatter, avoid using string `new RegExp` constructor with multiple escapes (`\\\\r`), which evaluates to literal slashes. Prefer RegExp literals like `/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/`.
- **Documentation Overhauls:** When orchestrating documentation updates using `docs_architect` or multiple workflows concurrently, ensure that legacy or theoretical endpoint references (e.g., `/docs/architecture.md`) are explicitly mapped to their physical canonical equivalents (e.g., `docs/V2_MULTI_AGENT_WORKFLOWS.md`) in `docs/README.md` to prevent context rot.
- **Windows Executable Resolution:** `npx` requires `.cmd` suffix on Windows for `child_process.spawn`; `uvx`/`uv` install as native `.exe` and resolve via PATH through `cross-spawn` without needing `.cmd`. Don't blindly add `.cmd` to all commands.
- **Env Variable Interpolation:** `mcp.config.json` supports `${VAR}` syntax in `env` blocks. The ProxyManager resolves these from `process.env` (loaded via dotenv from `.env`) before passing to child server processes.
- **Voice Integration:** ElevenLabs MCP is proxied as a child server (24 tools with `elevenlabs_*` prefix). VoiceMode is user-scoped in Claude Code (needs direct mic/speaker access). See `docs/VOICE_CLI_RESEARCH.md` for full architecture research and `docs/USAGE.md` Section 4 for setup.
- **VoiceMode Windows Bug:** The `voice-mode-install` script crashes on Windows due to a Unicode encoding error (cp1252 codec). Skip the installer and use `claude mcp add` directly.