# Tools and Discovery

This page explains how EVOKORE presents tools, how proxy names are built, and how `discover_tools` changes the visible tool surface.

## Two tool populations

### Native EVOKORE tools

These tools are defined by EVOKORE itself:

- `docs_architect`
- `skill_creator`
- `resolve_workflow`
- `search_skills`
- `get_skill_help`
- `discover_tools`
- `proxy_server_status`

Properties:

- always available
- always visible
- not subject to proxy prefixing
- includes an operator-facing registry inspection tool for aggregated child servers

### Proxied child-server tools

These come from child servers in `mcp.config.json`.

Current configured sources:

- `github`
- `fs`
- optional `elevenlabs`

Properties:

- fetched from child servers at startup
- renamed with server prefixes
- governed by `permissions.yml`
- routed through `ProxyManager`

## Prefixing and compatibility

EVOKORE rewrites proxied tool names to:

```text
${serverId}_${tool.name}
```

Why this exists:

- prevents tool-name collisions across child servers
- makes origin obvious during execution and review
- keeps exact-name routing deterministic

Examples:

| Upstream tool | EVOKORE-exposed tool |
|---|---|
| `read_file` from `fs` | `fs_read_file` |
| `create_issue` from `github` | `github_create_issue` |

### Duplicate-prefixed name policy

If two child registrations would create the same final prefixed name:

- the first registration wins
- later duplicates are skipped
- EVOKORE logs a warning and duplicate summary

## Discovery modes

| Mode | What `tools/list` returns | Best for |
|---|---|---|
| `legacy` | all native + proxied tools | maximum compatibility |
| `dynamic` | native tools + session-activated proxied tools | smaller initial tool payloads |

Environment toggle:

```bash
EVOKORE_TOOL_DISCOVERY_MODE=legacy
EVOKORE_TOOL_DISCOVERY_MODE=dynamic
```

## Dynamic discovery lifecycle

In `dynamic` mode, EVOKORE uses a session-scoped activation set.

Current lifecycle notes:

- stdio runtime traffic falls back to one default session key: `__stdio_default_session__`
- session-aware transports can provide real `sessionId` values and get isolated activation sets
- activation state is kept in memory only
- idle activation state is pruned opportunistically, and the in-memory session map stays bounded

Lifecycle:

1. session starts with only native tools visible
2. user/model calls `discover_tools`
3. `ToolCatalogIndex` searches the merged native + proxied catalog
4. matching proxied tools are activated for that session
5. EVOKORE emits `sendToolListChanged()` best-effort
6. client re-runs `tools/list` or auto-refreshes

```mermaid
flowchart TD
    A[Session starts in dynamic mode] --> B[tools/list shows native tools]
    B --> C[discover_tools query]
    C --> D[ToolCatalogIndex searches merged catalog]
    D --> E[Matching proxied tools added to session activation set]
    E --> F[sendToolListChanged best-effort]
    F --> G[Client refreshes tools/list]
    G --> H[Activated proxied tools now visible]
    D --> I[Exact-name proxied call still works even if hidden]
```

## Exact-name compatibility

Dynamic mode is intentionally not a hard execution gate.

Important rule:

- **hidden proxied tools remain callable by exact prefixed name**

That means discovery affects **listing visibility**, not whether EVOKORE fundamentally knows how to route the tool.

Why this matters:

- preserves older client flows
- avoids breaking direct exact-name prompts
- makes rollout safer while discovery remains an MVP

## How `discover_tools` matches

`ToolCatalogIndex` indexes:

- tool name
- description
- derived keywords
- proxy metadata like `serverId` and `originalName`

Discovery prioritizes:

- exact name matches
- exact original proxied name matches
- keyword matches
- fuzzy matches through `fuse.js`

## Benchmark artifact contract

EVOKORE includes a benchmark harness for the discovery/listing contract:

```bash
npm run benchmark:tool-discovery
```

Default behavior:

- writes deterministic JSON to stdout
- uses stable `generatedAt`
- omits machine-specific timing noise

Optional artifact writing:

```bash
node scripts/benchmark-tool-discovery.js --output artifacts/tool-discovery-benchmark.json
```

Optional live timing telemetry:

```bash
node scripts/benchmark-tool-discovery.js --live-timings
```

### What the benchmark reports

- `toolCounts`
- `payloadBytes`
- `tokens` (Sprint 1.4: real `js-tiktoken` `cl100k_base` counts; replaces the prior `estimatedTokens` char/4 estimate)
- `tokenizer` — descriptor with `kind` (`tiktoken` or `approximate`) and `encoding` (`cl100k_base` or fallback string)
- `benchmarkScenario`
- `topMatches`

Sprint 1.4 also adds two new modes:

- `--profile <name>` — measure a single named profile from `mcp.config.json`
- `--all` — measure every profile (built-in default + everything in config)

In profile mode the output shape is `{ tokenizer, syntheticCatalog, mandatoryInjectionSkills, profiles[] }` — see [`docs/TOOL_DISCOVERY_PROFILES.md`](TOOL_DISCOVERY_PROFILES.md) for measured budgets.

When `--live-timings` is enabled, it also includes:

- `listLegacy`
- `listDynamic`
- `discover`

### Current contract guarantees

- default stdout is deterministic across repeated runs
- `--output` writes the same JSON that stdout emitted
- `--live-timings` intentionally opts out of deterministic artifact guarantees

## Discovery-mode tradeoffs

| Topic | `legacy` | `dynamic` |
|---|---|---|
| Client compatibility | strongest | good, but depends on discovery-friendly workflow |
| Initial tool payload size | largest | smallest |
| Need to call `discover_tools` | no | usually yes |
| Exact-name direct calls | yes | yes |
| Best fit | broad/default installs | focused sessions and context reduction |

## Operator recommendations

Choose `legacy` when:

- you are onboarding a new client
- you want the most predictable listing behavior
- you do not want to depend on `tools/list_changed`

Choose `dynamic` when:

- tool-list size matters
- your operators know to use `discover_tools`
- your workflows are task-focused and can activate tools intentionally

### Session semantics caveat

For the current stdio runtime, dynamic discovery is effectively connection-scoped through the default session key.

That means:

- one long-lived stdio session accumulates its own discovery activations
- activation isolation becomes meaningfully multi-session only when the transport supplies distinct `sessionId` values

## Related docs

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [SETUP.md](./SETUP.md)
- [USAGE.md](./USAGE.md)
- [TESTING_AND_VALIDATION.md](./TESTING_AND_VALIDATION.md)
- [docs/research/dynamic-tool-discovery-research.md](./research/dynamic-tool-discovery-research.md)
