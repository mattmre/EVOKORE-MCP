# Recursive Skill Indexing Research

**Date:** 2026-03-10
**Status:** Implemented
**PR:** feature/recursive-skill-indexing

## Problem Statement

SkillManager's `loadSkills()` only traversed 2 directory levels under `SKILLS/`, indexing approximately 47 parent SKILL.md files out of 212+ total. Deeply nested skills (e.g., WSHOBSON PLUGINS at depth 3, ORCHESTRATION FRAMEWORK sub-commands at depth 3+) were invisible to `search_skills` and `resolve_workflow`.

## Key Findings

### Directory Structure Analysis
- **Total SKILL.md files on disk:** 212
- **Previously indexed (2-level):** ~47
- **After recursive indexing:** 339 (includes loose .md files with frontmatter)
- **Max nesting depth observed:** 4 levels (SKILLS/category/group/skill/SKILL.md)

### Category Distribution (Post-Recursive)
| Category | SKILL.md Count |
|---|---|
| WSHOBSON PLUGINS | 146 |
| ORCHESTRATION FRAMEWORK | 22 |
| DEVELOPER TOOLS | 12 |
| HIVE FRAMEWORK | 8 |
| GENERAL CODING WORKFLOWS | 8 |
| AUTOMATION AND PRODUCTIVITY | 7 |
| RESEARCH AND CONTENT | 5 |
| ANTHROPIC COOKBOOK | 4 |

### Performance Observations
- Current measured load time on the refreshed 2026-03-11 branch state: ~465ms for 336 indexed skills on local Windows checkout
- The earlier 37-39 second observation was not reproducible on the current repo state and should not be treated as the operating expectation for this implementation
- Fuse.js index building remains fast; the dominant work is still filesystem traversal, but the current recursive walker is comfortably below startup-risk thresholds in practice

### Design Decisions

1. **Recursive walker with depth cap (MAX_DEPTH=5):** Prevents runaway traversal into deeply nested submodule content while capturing all known skill locations.

2. **Composite cache keys (`category/name`):** Prevents name collisions when different categories have identically-named skills. The old bare-name approach would silently overwrite.

3. **Subcategory tracking:** The `subcategory` field captures the intermediate path segments between category and skill directory, enabling hierarchical display in search results.

4. **Directory exclusion set:** `node_modules`, `.git`, `__pycache__`, `__tests__`, `.claude`, `themes`, `assets`, `scripts` are skipped to avoid indexing non-skill content.

5. **Weighted Fuse.js keys:** `name` (0.3), `description` (0.3), `content` (0.3), `category` (0.05), `subcategory` (0.05) -- emphasizes content relevance over taxonomy.

6. **Bare name fallback in get_skill_help:** When a user passes just a skill name (not a composite key), the handler scans all cache values for a matching name before falling back to fuzzy search.

7. **Performance gate:** The validation gate is set to 10s, which leaves wide safety margin over the current ~465ms measurement while still catching real regressions.

## Files Changed
- `src/SkillManager.ts` -- recursive walker, subcategory, composite keys, weighted search
- `dist/SkillManager.js` -- compiled output
- `test-skill-indexing-validation.js` -- updated tests for recursive behavior

## Future Optimization Opportunities
- Parallel `Promise.all` for readdir/stat calls within each directory if startup time regresses materially
- Persistent disk cache (JSON) to skip re-scanning on startup when SKILLS/ hasn't changed
- Configurable depth limit via environment variable
