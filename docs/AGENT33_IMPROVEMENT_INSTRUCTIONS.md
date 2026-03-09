# Agent33 Improvement Instructions — Learnings from EVOKORE-MCP

> **Purpose**: Feed this file into Claude Code CLI when working on the Agent33 repo. It contains patterns, architectures, and capabilities proven in EVOKORE-MCP that Agent33 should adopt.

---

## 1. Multi-Server MCP Aggregation Pattern

**What Agent33 lacks**: Agent33's MCP server (Phase 43) is a single-endpoint bridge. It doesn't aggregate multiple child MCP servers behind a unified namespace.

**What to build**: A proxy layer that spawns and manages multiple child MCP servers from a single config file, presenting them as one unified tool surface.

### Implementation spec:

```
mcp.config.json
{
  "servers": {
    "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"], "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" } },
    "fs": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "./"] },
    "elevenlabs": { "command": "uvx", "args": ["elevenlabs-mcp"], "env": { "ELEVENLABS_API_KEY": "${ELEVENLABS_API_KEY}" } }
  }
}
```

**Key patterns from EVOKORE**:
- **Tool name prefixing**: Every proxied tool gets renamed `{serverId}_{originalName}` to prevent namespace collisions (e.g., `github_create_issue`, `fs_read_file`). First-registration-wins for duplicates.
- **Environment interpolation**: `${VAR}` syntax in `env` blocks resolved from `process.env` / `.env` at startup time. This keeps secrets out of config files.
- **Server state tracking**: Each child server has a state object: `{ status: 'booting' | 'connected' | 'error', errorCount: number, lastPing: Date }`. Log transitions.
- **Cooldown protection**: After an error response (< 15 chars or exception), impose a 10-second cooldown on that tool to prevent infinite retry loops from AI agents.
- **Windows compatibility**: `npx` requires `.cmd` suffix on Windows when using `child_process.spawn`. `uvx`/`uv` install as native `.exe` and resolve via PATH without `.cmd`. Don't blindly add `.cmd` to all commands — use `cross-spawn` or detect platform.

### Where to integrate in Agent33:
Extend `engine/src/agent33/mcp_server/` to support a `ProxyManager` that reads `mcp.config.json`, spawns child servers via stdio, and merges their tool listings into the existing tool registry with prefixed names.

---

## 2. Cryptographic Human-in-the-Loop (HITL) Approval

**What Agent33 lacks**: Agent33's `tool_approvals` route uses simple REST-based approval. It doesn't handle the stateless challenge of stdio-based MCP where the server can't prompt the user directly.

**What to build**: A token-based approval flow for restricted tools that works over stateless JSON-RPC.

### Implementation spec:

```
Flow:
1. AI calls restricted tool (e.g., fs_write_file)
2. Server checks permissions.yml → finds "require_approval"
3. Server generates 16-byte crypto token (hex), stores with metadata:
   - toolName: string
   - argsHash: SHA256(normalizedArgs)
   - expiresAt: Date.now() + 300_000 (5 minutes)
   - consumed: false
4. Server returns error: "This tool requires approval. Ask the user for permission, then retry with _evokore_approval_token: <token>"
5. AI asks user → user says OK → AI retries with token in args
6. Server validates: token exists, not expired, not consumed, toolName matches, argsHash matches
7. Token consumed (one-time use), tool executes normally
```

**Critical details**:
- **Argument normalization**: Deep-sort all object keys recursively before hashing. This ensures `{a:1, b:2}` and `{b:2, a:1}` produce the same hash. Exclude the `_evokore_approval_token` field itself from the hash.
- **Schema injection**: Automatically add `_evokore_approval_token` as an optional string property to every proxied tool's `inputSchema` so the AI knows the field exists.
- **Permission levels**: Three states in `permissions.yml`:
  - `allow` — execute immediately
  - `require_approval` — token flow
  - `deny` — always reject

### Where to integrate in Agent33:
Add to `engine/src/agent33/security/` as a `HitlTokenManager`. Wire into the tool execution pipeline in `engine/src/agent33/tools/governance.py` before tool dispatch.

---

## 3. Dynamic Tool Discovery with Session-Scoped Activation

**What Agent33 lacks**: Agent33 exposes all registered tools to every agent at all times. This creates context bloat when the tool count is high (64+ tools).

**What to build**: A discovery mode where only core tools are visible by default, and agents activate additional tools on-demand via a `discover_tools` meta-tool.

### Implementation spec:

```
Two modes (configurable via env var):

TOOL_DISCOVERY_MODE=legacy   → All tools visible (current Agent33 behavior)
TOOL_DISCOVERY_MODE=dynamic  → Only core tools visible; others hidden but callable by exact name

Dynamic mode flow:
1. Agent sees only core tools in tools/list response
2. Agent calls discover_tools(query="github issues")
3. Server searches unified catalog (Fuse.js fuzzy match):
   - Exact name match (weight: 0.45)
   - Description match (weight: 0.30)
   - Keyword match (weight: 0.25)
   - Threshold: 0.35
4. Matching tools added to session's activation set
5. Server sends tools/list_changed notification
6. Next tools/list includes newly activated tools
```

**Key pattern**: Session-scoped activation uses `Map<sessionId, Set<toolName>>`. Each session has its own activated tool set. Hidden tools remain callable by exact name even when not activated — they just don't appear in listings.

### Where to integrate in Agent33:
Add to `engine/src/agent33/tools/registry.py`. The existing `ToolRegistry` should gain an `activated_tools` dict keyed by session/tenant ID, and `list_tools()` should filter based on activation state when dynamic mode is on.

---

## 4. Semantic Skill Resolution & Fuzzy Search

**What Agent33 lacks**: Agent33's `SkillRegistry` does basic filesystem discovery and text search. It doesn't have weighted fuzzy matching or semantic resolution.

**What to build**: A Fuse.js-equivalent fuzzy search over skill metadata that returns the best-matching skills for a natural language objective.

### Implementation spec:

**Skill indexing**:
- Scan `SKILLS/` directory recursively (2 levels: `SKILLS/CATEGORY/skill-name/SKILL.md`)
- Parse YAML frontmatter between `---` delimiters: extract `name`, `description`, `category`
- Build search index over: name, description, category, full content

**Search weights** (proven effective at 189+ skills):
- Name: 0.3
- Description: 0.3
- Category: 0.1
- Content: 0.3
- Threshold: 0.4

**Resolution tool** (`resolve_workflow`):
- Input: natural language objective (e.g., "I need to create a new MCP server")
- Process: Fuzzy search → rank → return top 1-3 matches
- Output: Full skill content injected into response wrapped in XML tags:
  ```xml
  <activated_skill name="mcp-builder" category="developer-tools">
  [full SKILL.md content here]
  </activated_skill>
  ```

**Python equivalent**: Use `thefuzz` (fuzzywuzzy) or `rapidfuzz` library for fuzzy matching. Build a weighted scorer across metadata fields.

### Where to integrate in Agent33:
Enhance `engine/src/agent33/skills/registry.py` with fuzzy search. Add a `resolve_workflow` tool to the agent runtime that injects matched skill content into the agent's context.

---

## 5. Claude Code Hooks System

**What Agent33 lacks**: Agent33 has a hook/middleware system for its own runtime, but no integration with Claude Code's native hook lifecycle (PreToolUse, PostToolUse, UserPromptSubmit, Stop).

**What to build**: A set of Node.js hook scripts that wire into Claude Code's `.claude/settings.json` for security, observability, and session management.

### Hook 1: Damage Control (PreToolUse)

Security auditor that blocks dangerous commands before execution.

```yaml
# damage-control-rules.yaml
dangerous_commands:
  - pattern: "rm\\s+(-[rfRF]+\\s+)?/"
    description: "Recursive forced deletion from root"
    ask: false  # hard block, no override
  - pattern: "git\\s+push\\s+--force"
    description: "Force push"
    ask: true   # ask user before allowing
  - pattern: "DROP\\s+(TABLE|DATABASE)"
    description: "SQL destructive operation"
    ask: false

zero_access_paths:
  - ".env"
  - ".ssh/"
  - "credentials.json"
  - "secrets/"

read_only_paths:
  - "node_modules/"
  - "dist/"
  - ".git/"
  - "*.lock"

no_delete_paths:
  - "package.json"
  - "CLAUDE.md"
  - "permissions.yml"
```

**Implementation**: Script reads stdin (JSON with `tool_name`, `tool_input`), checks Bash commands against `dangerous_commands` regex patterns, checks file paths against access rules, outputs JSON `{ "decision": "block", "reason": "..." }` or exits silently to allow.

**Critical rule**: Script MUST exit 0 even on errors (file missing, parse failure, etc.). A crashing hook breaks the entire Claude Code session.

### Hook 2: Purpose Gate (UserPromptSubmit)

Captures session intent on first prompt, reminds on subsequent prompts.

```
Flow:
1. First prompt → initialize session state file (~/.agent33/sessions/{id}.json)
2. Second prompt → save user's stated purpose (truncate to 500 chars)
3. Subsequent → inject purpose reminder via additionalContext:
   Output: { "additionalContext": ["Session purpose: {purpose}"] }
```

**Why this matters**: Prevents session drift. The AI gets a persistent reminder of the original goal with every prompt.

### Hook 3: Session Replay (PostToolUse)

Logs every tool call as JSONL for debugging and auditing.

```jsonl
{"ts":"2026-03-09T10:15:00Z","tool":"Bash","summary":"git status"}
{"ts":"2026-03-09T10:15:05Z","tool":"Read","summary":"src/main.py"}
{"ts":"2026-03-09T10:15:10Z","tool":"Edit","summary":"src/main.py:42"}
```

**Viewer**: Companion script reads JSONL and renders colored timeline with tool icons.

### Hook 4: TillDone (Stop)

Blocks session termination if incomplete tasks remain.

```
Hook mode:
- Reads tasks from ~/.agent33/sessions/{id}-tasks.json
- If any tasks incomplete → output block message with task list
- If all complete → exit silently (allow stop)

CLI mode:
  node tilldone.js --add "implement auth" --session auto
  node tilldone.js --done 1 --session auto
  node tilldone.js --list --session auto
```

**Why this matters**: Prevents the AI from declaring "done" when tasks are still open. The stop hook acts as a completion gate.

### Where to integrate in Agent33:
Create `scripts/hooks/` directory with these 4 scripts. Wire in `.claude/settings.json`:
```json
{
  "hooks": {
    "PreToolUse": [{ "command": "node scripts/hooks/damage-control.js" }],
    "UserPromptSubmit": [{ "command": "node scripts/hooks/purpose-gate.js" }],
    "PostToolUse": [{ "command": "node scripts/hooks/session-replay.js" }],
    "Stop": [{ "command": "node scripts/hooks/tilldone.js" }]
  }
}
```

---

## 6. Cross-CLI Configuration Sync

**What Agent33 lacks**: Agent33 only works with its own FastAPI runtime. It doesn't register itself as an MCP server across multiple AI CLIs.

**What to build**: A sync script that detects installed AI CLIs and registers Agent33 as an MCP server in each.

### Implementation spec:

```
Detected CLIs and their config paths:
- Claude Code:    ~/.claude/settings.json → mcpServers
- Claude Desktop: %APPDATA%/Claude/claude_desktop_config.json (Win)
                  ~/Library/Application Support/Claude/ (macOS)
                  ~/.config/Claude/ (Linux)
- Cursor:         ~/.cursor/mcp.json
- Gemini CLI:     Manual (output command to run)

Sync behavior:
- --dry-run: Show what would change without writing
- --apply: Write changes
- Never overwrite existing server entries (preserve user customizations)
- --force: Override existing entries

Entry format:
{
  "agent33": {
    "command": "python",
    "args": ["-m", "agent33.mcp_server"],
    "env": { "DATABASE_URL": "..." }
  }
}
```

### Where to integrate in Agent33:
Create `scripts/sync-configs.js` (Node.js for cross-platform path handling) or `scripts/sync_configs.py`. Add as `npm run sync` / `python -m agent33.sync` command.

---

## 7. Live Status Line Display

**What Agent33 lacks**: No live context display showing project state, git status, and system info during sessions.

**What to build**: A status line hook that renders a compact, color-coded summary on each prompt.

### Implementation spec:

```
Output format (responsive to terminal width):

Normal (80+ cols):
🏠 agent33 main ✓ | 📍 City, Country | 🌤 72°F | 🔧 32 tools | 📚 15 skills | ██████░░ 75%

Mini (55-80 cols):
agent33 main ✓ | 72°F | 32 tools | 75%

Micro (35-55 cols):
main ✓ | 32t | 75%
```

**Data sources** (fetched in parallel):
- Git: branch, modified/staged/untracked counts, stash count
- Location: IP geolocation API (cache 1 hour)
- Weather: Open-Meteo API (cache 15 minutes)
- Tools: Count from tool registry
- Skills: Count from skill directory scan
- Context: Estimated context window usage percentage

**Color scheme** (ANSI 24-bit RGB):
- Green (#4ADE80): Healthy/complete
- Yellow: Warning
- Orange (#FB9232): Elevated
- Red: Critical
- Slate (#94A3B8): Dimmed/secondary info

### Where to integrate in Agent33:
Add as a Notification hook in `.claude/settings.json` or as a custom prompt decorator in the CLI.

---

## 8. Voice Integration via Sidecar

**What Agent33 lacks**: Agent33 references a "voice daemon" in Phase 35 docs but has no implementation.

**What to build**: A standalone WebSocket server that streams text-to-speech via ElevenLabs with persona support.

### Implementation spec:

```
Architecture:
- Standalone process (NOT imported by main server)
- WebSocket on ws://localhost:8888
- Receives text messages, streams audio back
- Reads voices.json for persona configuration

voices.json:
{
  "default": {
    "voice_id": "21m00Tcm4TlvDq8ikWAM",
    "model_id": "eleven_turbo_v2_5",
    "stability": 0.5,
    "similarity_boost": 0.75,
    "speed": 1.0
  },
  "personas": {
    "narrator": { "voice_id": "...", "stability": 0.8 },
    "assistant": { "voice_id": "...", "speed": 1.2 }
  }
}

Features:
- Hot-reload: Re-reads voices.json per new WebSocket connection
- Speed control: ffmpeg atempo filtering (chains passes for >2.0x)
- Platform playback: powershell (Win), afplay (macOS), mpv/aplay (Linux)
- Artifact saving: Optional directory for audio file persistence
- Graceful shutdown: SIGINT/SIGTERM handlers for cleanup
```

**ElevenLabs proxy**: Register as a child MCP server with 24 tools (`elevenlabs_*` prefix). Use `uvx elevenlabs-mcp` for zero-install.

### Where to integrate in Agent33:
Create `engine/src/agent33/voice/sidecar.py` as a standalone asyncio WebSocket server. Add `voices.json` config. Wire ElevenLabs as a proxied MCP child server.

---

## 9. Comprehensive Skills Library Architecture

**What Agent33 lacks**: Agent33 has 4 skill definitions and 11 commands. EVOKORE-MCP has 189+ skills across 10 categories with a rich taxonomy.

**What to adopt**: The skill organization pattern and key unique skills.

### Skills to port from EVOKORE-MCP to Agent33:

**High-priority (unique and high-value)**:

1. **HIVE Framework** (8 skills) — Complete agent development lifecycle:
   - `hive-create`: Build agents from scratch (goals, nodes, edges, CLI)
   - `hive-test`: Iterative testing with checkpoints and session recovery
   - `hive-concepts`: Agent architecture fundamentals
   - `hive-patterns`: Design optimization (fan-out/fan-in, judges, feedback loops)
   - `hive-credentials`: Credential detection and setup
   - `hive-debugger`: Runtime debugging with L1/L2/L3 log analysis
   - `hive` (meta-router): Routes to appropriate sub-skill

2. **repo-ingestor** — 40-agent swarm for external repository ingestion, benchmarking, and feature absorption. Nothing like this exists in Agent33.

3. **mcp-builder** — 4-phase guide for building MCP servers (research → implement → review → evaluate). Agent33 has an MCP server but no guide for building new ones.

4. **planning-with-files** — Persistent markdown-based planning that survives `/clear` commands:
   - `task_plan.md`: Ordered task list with status
   - `findings.md`: Research and discoveries
   - `progress.md`: Implementation log
   - "2-action rule": Read plan before acting, update after acting

5. **docs-architect** — Gold Standard documentation overhaul with Mermaid diagrams, semantic flows, cross-link normalization, doc index mapping

6. **pr-manager** — Multi-agent PR orchestration (agent swarms for testing, linting, feature verification, technical debt tracking)

7. **webapp-testing** — Playwright automation with `with_server.py` helper for lifecycle management

**Medium-priority (domain-specific)**:

8. **Document skills** (docx, pdf, pptx, xlsx) — Office document generation/manipulation
9. **changelog-generator** — Automated release notes from git history
10. **skill-creator** — Meta-skill for creating and packaging new skills

**Lower-priority (automation/productivity)**:
11-17. brand-guidelines, file-organizer, image-enhancer, invoice-organizer, slack-gif-creator, tailored-resume-generator, theme-factory

**WSHOBSON Plugins** (85+ specialized skills): Consider importing the full collection as an extended skill library. Categories include: backend development, frontend, cloud infrastructure, CI/CD, security, data engineering, blockchain, Kubernetes, LLM apps, observability, game dev, and more.

### Skill format standard:

```markdown
---
name: skill-name
description: One-line description
category: Category Name
metadata:
  version: "1.0"
  author: "author"
  tags: ["tag1", "tag2"]
---

# Skill Name

## Overview
What this skill does and when to use it.

## Instructions
Step-by-step procedural instructions for the AI to follow.

## References
Links to supporting files, scripts, or documentation.
```

### Where to integrate in Agent33:
Create `core/workflows/skills/` subdirectories matching the EVOKORE structure. Enhance `engine/src/agent33/skills/registry.py` to support the YAML frontmatter format and hierarchical directory scanning.

---

## 10. Fail-Safe Design Principles

**What Agent33 can learn**: EVOKORE-MCP's hooks and scripts follow strict fail-safe conventions that prevent cascading failures.

### Rules to adopt:

1. **Every hook script MUST exit 0 on unexpected errors.** Wrap entire script in try/catch. A non-zero exit from a hook crashes Claude Code's session.

2. **Quiet validation**: When loading config files (.env, YAML rules), use `quiet: true` or equivalent to suppress parse warnings. Missing config = default behavior, not crash.

3. **State isolation**: All session state lives in `~/.agent33/sessions/` with sanitized session IDs. Never write state to the project directory (avoids git conflicts when running multiple agents).

4. **Log rotation awareness**: Hook logs should include file size checks and rotation. JSONL replay logs can grow large over multi-hour sessions.

5. **Cooldown on failure**: When a tool call fails, impose a short cooldown (10s) before allowing retry. This prevents infinite error loops where the AI keeps retrying a broken tool.

6. **`$?` exit codes don't propagate reliably through Git Bash pipes on Windows.** Use `execSync` or direct process inspection for testing. Don't rely on pipe chains for critical validation.

7. **YAML package**: Use the `yaml` npm package (or PyYAML) for parsing rules files. Don't use regex for YAML — except for frontmatter extraction where the `---` delimiter pattern is simple enough.

---

## 11. Session Continuity Architecture

**What Agent33 lacks**: No structured system for maintaining context across sessions.

### EVOKORE's proven pattern:

```
State locations:
~/.agent33/sessions/{sessionId}.json        — Purpose, metadata
~/.agent33/sessions/{sessionId}-replay.jsonl — Tool usage log
~/.agent33/sessions/{sessionId}-tasks.json   — Task tracker
~/.agent33/logs/damage-control.log           — Security audit trail
~/.agent33/logs/hook-{timestamp}.log         — Hook event log
~/.agent33/cache/location.json               — Geolocation (1hr TTL)
~/.agent33/cache/weather.json                — Weather (15min TTL)
```

**Session wrap workflow** (from EVOKORE's session-wrap skill):
1. Commit all changes + create PR
2. Write session log to `docs/session-logs/session-YYYY-MM-DD[-N].md`
3. Update `next-session.md` with priorities for next session
4. Update `CLAUDE.md` with new learnings
5. Confirm completion

### Where to integrate in Agent33:
Add session state management to `engine/src/agent33/` as a `SessionManager` service. Wire into the existing observability system for correlation.

---

## 12. Auto-Memory System

**What Agent33 lacks**: No persistent memory across CLI sessions.

### EVOKORE's pattern:

Claude Code has a persistent auto-memory directory at `~/.claude/projects/{project-hash}/memory/`. EVOKORE uses this with:

- **MEMORY.md**: Always loaded into context (keep under 200 lines). Contains:
  - Project structure quick reference
  - Key patterns and conventions
  - Current state and active branches
  - Workflow references

- **Topic files**: `debugging.md`, `patterns.md`, etc. for detailed notes linked from MEMORY.md

**Rules**:
- Organize by topic, not chronology
- Update or remove memories that prove wrong
- Don't duplicate CLAUDE.md content
- Save stable patterns confirmed across multiple sessions
- When user corrects a memory, update immediately

### Where to integrate in Agent33:
Document this pattern in Agent33's CLAUDE.md and create initial `memory/MEMORY.md` with project-specific quick reference.

---

## Summary: Priority Implementation Order

| Priority | Feature | Effort | Impact |
|---|---|---|---|
| P0 | Hooks system (damage-control, purpose-gate, replay, tilldone) | Medium | High — immediate session safety and observability |
| P0 | Fail-safe design principles | Low | High — prevents cascading failures |
| P1 | HITL approval tokens | Medium | High — enables safe tool execution over MCP |
| P1 | Dynamic tool discovery | Medium | High — reduces context bloat |
| P1 | Skills library import (HIVE + key skills) | Medium | High — massive capability expansion |
| P2 | Multi-server MCP aggregation | High | High — unified tool surface |
| P2 | Semantic skill resolution | Medium | Medium — better skill discovery |
| P2 | Cross-CLI sync | Low | Medium — broader deployment |
| P3 | Voice sidecar | Medium | Medium — new interaction modality |
| P3 | Status line display | Low | Low — nice-to-have UX |
| P3 | Session continuity architecture | Medium | Medium — better handoff |
