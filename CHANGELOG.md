# Changelog

## v3.0.0 (2026-03-13)

### New Features
- **Test Runner Migration** -- Migrated 60+ tests from chained scripts to vitest with parallel execution, watch mode, and structured output (#108)
- **MCP SDK Feature Adoption** -- Added tool annotations (readOnlyHint, destructiveHint, etc.), server instructions, and HTTP client transport support (#110)
- **MCP Resources & Prompts** -- Implemented resources/list and prompts/list with real content including server status, config, and skill-backed prompts (#111)
- **Skill Hot-Reload** -- Added `refresh_skills` tool and optional filesystem watcher for live skill index updates (#112)
- **Rate Limiting** -- Configurable per-server and per-tool rate limits using token bucket algorithm (#113)
- **Session Dashboard** -- Zero-dependency local web dashboard for session replay and evidence timeline viewing (#114)
- **HITL Approval UI** -- Interactive web interface for viewing and managing pending HITL approval tokens (#115)
- **Repo Audit Hook** -- Optional pre-session hook that warns about branch drift and stale worktrees (#116)
- **Skill Versioning** -- Optional version, requires, and conflicts fields in skill frontmatter with dependency validation (#117)
- **Remote Skill Registry** -- `fetch_skill` tool for installing skills from remote URLs and registry support (#118)
- **Skill Execution Sandbox** -- `execute_skill` tool for running code blocks from skills with output capture and timeout (#119)
- **Supabase Integration** -- Supabase MCP server as a proxied child with tiered permissions (#120)
- **RBAC Permissions** -- Role-based permission model with admin, developer, and readonly roles (#121)

### Infrastructure
- **Build Hygiene** -- Removed 16 tracked compiled artifacts from src/, updated .gitignore (#109)
- **CI Updates** -- Windows runtime tests now run through vitest (#108)

### Breaking Changes
- `npm test` now runs `vitest run` instead of chained `node` commands. CI workflows using the old command pattern need updating.
- Test files now use vitest globals (`test()`, `describe()`). Running them directly with `node` no longer works.

### Migration Guide
- Update any CI scripts that run individual test files with `node test-*.js` to use `npx vitest run test-*.js`
- Set `EVOKORE_ROLE` env var to activate RBAC (optional, flat permissions still work)
- Set `EVOKORE_SKILL_WATCHER=true` to enable auto-refresh (optional)
- Set `EVOKORE_REPO_AUDIT_HOOK=true` to enable pre-session repo audit (optional)
