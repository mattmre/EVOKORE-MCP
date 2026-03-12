# EVOKORE Runtime Summary - v2.0.2

This summary captures the current shipped runtime and operator surface for EVOKORE-MCP at package/runtime version `2.0.2`.

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
- proxied child-server model through `mcp.config.json`
- namespaced proxied tools using `${serverId}_${tool.name}`

## Major operator capabilities

- dynamic tool discovery with session-scoped activation
- recursive skill indexing with metadata-aware search
- semantic workflow resolution with reranking and `Why matched:` output
- HITL approval enforcement through `_evokore_approval_token`
- canonical hook entrypoints and shared fail-safe bootstrap
- standalone VoiceSidecar with persona-aware hook forwarding

## Continuity and repo-operations layer

- canonical session manifest under `~/.evokore/sessions/{sessionId}.json`
- managed Claude memory sync via `npm run memory:sync`
- manifest-backed status line through `scripts/status.js`
- repo-state preflight via:

```bash
npm run repo:audit
npm run repo:audit -- --json
```

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

## Recommended doc path

1. [../README.md](../README.md)
2. [SETUP.md](./SETUP.md)
3. [USAGE.md](./USAGE.md)
4. [ARCHITECTURE.md](./ARCHITECTURE.md)
5. [TESTING_AND_VALIDATION.md](./TESTING_AND_VALIDATION.md)
6. [RECENT_ADDITIONS_2026-03-12.md](./RECENT_ADDITIONS_2026-03-12.md)
