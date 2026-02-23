# EVOKORE-MCP Developer Context & Learnings

## System Architecture
- EVOKORE-MCP v2.0 acts as a Multi-Server MCP Aggregator proxying to child servers (e.g., github, fs) defined in `mcp.config.json` with a JSON-RPC router.
- Tool-prefixing is active to prevent namespace collisions.

## Key Workflows & Learnings
- **Submodules:** The repository uses git submodules for SKILLS (`ANTHROPIC COOKBOOK`, `claude-skills-mcp`, `OFFICIAL MCP SERVERS`). 
- **Doc Generation Scripts:** Scripts like `scripts/generate_docs.js` add frontmatter and modify files within these submodules. Always commit changes inside the submodules first before updating the parent repo pointer to avoid `-dirty` submodule states.
- **Hook Scripts:** Native CLI UI hooks like `scripts/status.js` are available to integrate with Gemini CLI and Claude Code to provide live context, location, and skill count info.
