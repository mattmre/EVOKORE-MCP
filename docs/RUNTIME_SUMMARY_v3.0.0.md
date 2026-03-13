# EVOKORE Runtime Summary - v3.0.0

This summary captures the current shipped runtime and operator surface for EVOKORE-MCP at package/runtime version `3.0.0`.

## Core runtime

- stdio MCP router and multi-server aggregator
- native tools:
  - `docs_architect`
  - `skill_creator`
  - `resolve_workflow`
  - `search_skills`
  - `get_skill_help`
  - `discover_tools`
  - `proxy_server_status`
  - `refresh_skills`
  - `fetch_skill`
  - `execute_skill`
- MCP resources: `evokore://server/status`, `evokore://server/config`, `evokore://skills/categories`
- MCP prompts: `resolve-workflow`, `skill-help`, `server-overview`
- proxied child-server model through `mcp.config.json`
- namespaced proxied tools using `${serverId}_${tool.name}`

## Major operator capabilities

- dynamic tool discovery with session-scoped activation
- recursive skill indexing with metadata-aware search
- semantic workflow resolution with reranking and `Why matched:` output
- HITL approval enforcement through `_evokore_approval_token`
- canonical hook entrypoints and shared fail-safe bootstrap
- standalone VoiceSidecar with persona-aware hook forwarding
- MCP SDK tool annotations (readOnlyHint, destructiveHint, etc.)
- HTTP client transport support for child servers
- skill hot-reload via `refresh_skills` and optional filesystem watcher
- configurable per-server and per-tool rate limiting (token bucket)
- session dashboard for replay and evidence timeline viewing
- interactive HITL approval web UI
- optional pre-session repo audit hook
- skill versioning with dependency validation
- remote skill registry and `fetch_skill` tool
- skill execution sandbox with `execute_skill` tool
- Supabase MCP server as a proxied child with tiered permissions
- RBAC permissions model with admin, developer, and readonly roles

## Continuity and repo-operations layer

- canonical session manifest under `~/.evokore/sessions/{sessionId}.json`
- managed Claude memory sync via `npm run memory:sync`
- manifest-backed status line through `scripts/status.js`
- repo-state preflight via:

```bash
npm run repo:audit
npm run repo:audit -- --json
```

## Testing

- 72 test files, 179 tests via vitest
- parallel execution with watch mode support
- structured output with `vitest run`

## Validation baseline

Primary commands:

```bash
npm run build
npm test
npm run repo:audit
```

Targeted operator checks:

- `node test-session-continuity-validation.js`
- `node test-auto-memory-validation.js`
- `node test-status-line-validation.js`
- `node test-damage-control-validation.js`
- `node test-repo-state-audit-validation.js`
- `node test-version-contract-consistency.js`

## Recommended doc path

1. [../README.md](../README.md)
2. [SETUP.md](./SETUP.md)
3. [USAGE.md](./USAGE.md)
4. [ARCHITECTURE.md](./ARCHITECTURE.md)
5. [TESTING_AND_VALIDATION.md](./TESTING_AND_VALIDATION.md)
6. [CHANGELOG.md](../CHANGELOG.md)
