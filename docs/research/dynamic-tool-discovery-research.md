# Dynamic Tool Discovery MVP — Research Report

- **Date:** 2026-02-26
- **Researcher:** Agent 1 (Codebase Deep Dive)
- **Status:** Complete

## Implemented MVP Contract (PR2)

- `EVOKORE_TOOL_DISCOVERY_MODE` defaults to `legacy` and optionally accepts `dynamic`.
- `discover_tools` is always exposed as a native tool.
- `tools/list` remains fully backward-compatible in `legacy` mode.
- `tools/list` in `dynamic` mode returns always-visible native tools plus session-activated proxied tools.
- Session activation state is owned at the server/controller layer and keyed by `extra.sessionId ?? "__stdio_default_session__"`.
- Hidden/unlisted proxied tools remain callable by exact name.
- `sendToolListChanged()` is emitted best-effort after activation changes in dynamic mode.

## Current State Analysis

### Tool Registration Lifecycle

The system has two tool populations:

**A. Native Tools (6 tools, SkillManager)**
- `docs_architect`, `skill_creator`, `resolve_workflow`, `search_skills`, `get_skill_help`, `discover_tools`
- Always present in every `ListToolsRequest`

**B. Proxied Tools (~62 tools, ProxyManager)**
- `github_*` (26 tools), `fs_*` (14 tools), `elevenlabs_*` (24 tools when available)
- Fetched at startup from child servers via `mcp.config.json`
- Prefixed with `${serverId}_` for namespace isolation
- First-registration-wins for duplicate prefixed names

### Current Context Cost
- Every `ListToolsRequest` returns ALL 62+ tools with full JSON schemas
- Estimated 12,000-31,000 tokens per listing (~200-500 tokens per tool)
- No filtering, pagination, or gating

### Existing Infrastructure
- Fuse.js already a dependency (used for skill search)
- MCP SDK has `sendToolListChanged()` notification built in
- `ToolAnnotations` interface provides `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`
- `_meta` field on Tool allows arbitrary metadata passthrough

## Identified Gaps

1. **Context Window Bloat** — All tools sent regardless of relevance
2. **No Relevance Filtering** — No mechanism for task-relevant tool subsets
3. **Skill-Tool Disconnect** — Skills and tools indexed separately, no cross-references
4. **No Lazy Loading** — All servers boot at startup regardless of usage
5. **No Metadata Enrichment** — No tags, categories, semantic groupings
6. **No Selection Observability** — No metrics on which tools are actually used

## Proposed Architecture

### Metadata Index Schema (ToolMetadataEntry)
- **Identity:** id, originalName, serverId
- **Display:** displayName, description
- **Schema:** inputSchema (stored but deferred), outputSchema
- **Classification:** category, tags[], semanticGroup
- **Behavioral:** annotations (readOnly, destructive, idempotent, openWorld), securityLevel
- **Retrieval:** searchableText (pre-concatenated), optional embedding
- **Analytics:** callCount, lastCalledAt, avgLatencyMs
- **Lifecycle:** registeredAt, serverHealthy, lazyLoadable

### Retrieval Strategy: Two-Phase Listing (Recommended)

**Phase 1 — Slim listing:** Return 5 native tools + `discover_tools` meta-tool
**Phase 2 — Dynamic injection:** `discover_tools` searches metadata index, activates tools, fires `sendToolListChanged()`

### Benchmark Harness Metrics
- Tool count exposed
- Context token estimate
- Listing/discovery/invocation latency
- Cold start time
- Retrieval precision and recall
- Memory usage

### Benchmark Scenarios
1. Baseline (no gating)
2. GitHub-focused session
3. Documentation session
4. Voice session
5. Multi-domain session
6. Cold cache vs warm cache

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Client doesn't support ToolListChanged | High | Fall back to full listing |
| Discovery misses critical tools | High | "Show all tools" escape hatch |
| Fuse.js quality insufficient | Medium | Enrich searchableText aggressively |
| Breaking existing integrations | High | Keep backward-compatible mode |
| Increased lifecycle complexity | Medium | Clear ownership boundaries |

## Implementation Plan

### Phase 1: MVP
1. Create `src/ToolMetadataIndex.ts` with Fuse.js index
2. Add `discover_tools` meta-tool to SkillManager
3. Add session-scoped activation tracking (`Set<string>`)
4. Modify `ListToolsRequest` handler for gated listing
5. Wire `sendToolListChanged()` after discovery
6. Create benchmark harness
7. Add `test-tool-discovery-validation.js`

### Phase 2: Enrichment (Follow-up)
- Lazy server boot
- Skill-tool cross-references
- Usage analytics persistence
- Semantic embeddings

### Phase 3: Intelligence (Future)
- Auto-discovery from conversation context
- Predictive pre-activation
- Multi-session usage profiles
