# BUG-28 Slice Audit — skill-registry runtime cleanup (2026-04-17)

## Why this slice
- `tests/integration/skill-registry.test.ts` still consisted mostly of source-scraping assertions against `src/SkillManager.ts`
- The real runtime registry path is already covered in `tests/integration/skill-registry-runtime.test.ts`
- That makes `skill-registry.test.ts` a good low-risk cleanup slice: preserve only the public tool metadata and default empty-state behavior

## Coverage ownership after cleanup
- `tests/integration/skill-registry.test.ts`
  - `getTools()` metadata for `list_registry`
  - default `mcp.config.json` empty-registry shape
  - empty-state runtime messages for no configured registries / unknown registry name
  - trimmed and case-insensitive registry-name filtering smoke coverage
- `tests/integration/skill-registry-runtime.test.ts`
  - config override loading via `EVOKORE_MCP_CONFIG_PATH`
  - network fetches against local registry fixtures
  - URL normalization
  - partial failure reporting
  - query filtering
  - cache reuse
  - base-URL prefix handling

## Scope guardrails
- Do not duplicate the network-heavy registry fixture coverage already present in `skill-registry-runtime.test.ts`
- Do not expand this slice into `RegistryManager` internals; that surface remains covered elsewhere
- Keep the write surface to:
  - `tests/integration/skill-registry.test.ts`
  - this research note
  - task-plan tracking only
