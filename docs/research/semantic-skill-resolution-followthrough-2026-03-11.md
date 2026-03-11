# Semantic Skill Resolution Follow-Through - 2026-03-11

## Goal

Close `T16` by improving the quality of natural-language skill resolution on top of the existing recursive Fuse.js index.

## Findings

The base Agent33 requirement was already implemented before this slice:

- recursive skill indexing
- weighted Fuse.js search
- `resolve_workflow`
- `search_skills`

The remaining gap was semantic quality, not missing infrastructure.

Two concrete failures reproduced on the merged `T15` baseline:

1. `search_skills("wrap up session handoff")` returned no skills, even though `session-wrap` and `handoff-protocol` clearly matched the intent.
2. `search_skills("create a new MCP server")` preferred deep reference leaf docs over the primary `mcp-builder` skill.

## Decision

Keep Fuse.js as the retrieval engine, but add a semantic reranking layer in `SkillManager`:

- preserve aliases derived from frontmatter metadata and path structure
- extract lightweight resolution hints from phrases like `Use when`, `Triggers:`, and `Perfect for`
- build a richer `searchableText` field for semantic objective matching
- expand only ambiguous or zero-hit natural-language queries into fallback token/bigram searches
- rerank matches toward actionable root skills and away from deep `reference/` leaves
- expose brief `Why matched:` explanations in `resolve_workflow`

## Validation

```bash
npm run build
node test-semantic-skill-resolution-validation.js
npm test
npm audit --json
```
