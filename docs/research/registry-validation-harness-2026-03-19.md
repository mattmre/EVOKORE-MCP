# Registry Validation Harness Research — 2026-03-19

## Objective

Define the next credential-free sequential slice after the release-validation work: a local/mock registry validation path that exercises real non-empty registry behavior without depending on external registry URLs or secrets.

## Current Gaps

### 1. Coverage is mostly structural, not behavioral

The current registry tests largely verify:

- source structure
- tool schema
- empty-config behavior
- low-level parsing helpers

They do not prove that EVOKORE can read a non-empty `skillRegistries` config, fetch a live registry index over HTTP, normalize returned URLs, surface partial failures safely, and produce stable results through the public `list_registry` surfaces.

### 2. `SkillManager` has diverged registry code paths

Two different paths currently exist:

1. `handleToolCall("list_registry")`
   - uses `RegistryManager.fetchRegistry()`
   - benefits from cache TTL and canonical parsing for `entries`, `skills`, and flat arrays

2. `listRegistrySkills()`
   - bypasses `RegistryManager`
   - re-fetches directly
   - only accepts flat arrays or `{ skills: [...] }`
   - performs its own relative URL normalization

That divergence is already a correctness issue: canonical `{ entries: [...] }` registries work in one path and are silently dropped in the other.

### 3. Config-path handling is inconsistent

`ProxyManager` already honors `EVOKORE_MCP_CONFIG_PATH`, but `SkillManager` still reads a hard-coded repo-local `mcp.config.json` path.

That creates two problems:

- runtime inconsistency between managers
- poor testability for isolated temp-config integration tests

### 4. Docs drift from runtime schema

Active docs still show `skillRegistries` as a string array of URLs, while the runtime only accepts registry objects with:

- `name`
- `baseUrl`
- `index`

The registry slice should correct that drift while the implementation is being unified.

## Decision

Keep this PR tightly scoped to:

1. config-path alignment for `SkillManager`
2. one shared fetch/parse path for registry listing
3. local/mock registry integration tests with temp config + local HTTP server
4. docs updates for the object-based registry schema

Do not expand this slice into:

- live external registry validation
- credentialed production validation
- `fetch_skill` install-flow refactors unless they fall out trivially

## Proposed Implementation

### Runtime

- Add a `SkillManager` config-path helper mirroring `ProxyManager` behavior via `EVOKORE_MCP_CONFIG_PATH`.
- Rework `listRegistrySkills()` to use `RegistryManager.fetchRegistry()` so both listing paths share parsing and cache behavior.
- Keep URL normalization in `SkillManager` output shaping unless it becomes obviously reusable enough to move into `RegistryManager`.

### Tests

Add a mock-registry integration test that:

- writes a temp `mcp.config.json`
- sets `EVOKORE_MCP_CONFIG_PATH`
- starts a local HTTP server
- serves:
  - one canonical `{ entries: [...] }` registry
  - one `{ skills: [...] }` registry
  - one failing registry endpoint
- verifies:
  - `listRegistrySkills()` returns normalized results for non-empty registries
  - `handleToolCall("list_registry")` returns formatted content for real entries
  - one failing registry does not block the healthy registry
  - repeated fetches reuse cache instead of re-hitting the endpoint unnecessarily

### Docs

Update active docs to use:

```json
{
  "skillRegistries": [
    {
      "name": "example",
      "baseUrl": "https://example.com/skills",
      "index": "registry.json"
    }
  ]
}
```

## Validation Plan

- `npm run build`
- `npx vitest run tests/integration/registry-manager.test.ts tests/integration/skill-registry.test.ts tests/integration/skill-registry-runtime.test.ts`
- `npm run docs:check`

If shared helper changes broaden beyond the registry slice, run:

- `npm test`

## Risks

- The biggest risk is preserving formatting/output expectations while unifying the code paths.
- Cache-aware tests must avoid timing flakiness and should use request counters instead of real-time assumptions.
- The PR should not touch session trackers or handoff docs; those stay on the control plane only.
