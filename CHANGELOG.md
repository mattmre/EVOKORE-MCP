# Changelog

## v3.0.1 (2026-03-15)

### New Features
- **Operator UX Hardening (T13-T19)** -- Purpose gate, session replay, evidence capture, tilldone, and damage control hooks (#128)
- **Voice & Continuity Follow-Through (T23-T25)** -- VoiceSidecar standalone process and session continuity manifest (#130)
- **StreamableHTTP Server Transport (T26)** -- HTTP server for MCP over HTTP with SSE streaming (#131)
- **OAuth Bearer Token Auth (T27)** -- OAuthProvider with Bearer token validation and JWKS key rotation for HTTP transport (#132)
- **Plugin System (T28)** -- PluginManager with hot-reload support for custom tool providers (#133)
- **Webhook Event System (T29)** -- HMAC-SHA256 signed events with fire-and-forget delivery and 9 security hardening fixes (#134)
- **Multi-Tenant Session Isolation (T30)** -- Per-session state isolation with configurable TTL (#135)
- **Skill Ecosystem Validation** -- Sandbox security audit and skill ecosystem validation suite (#129)

### Platform Wiring
- **SessionIsolation into HttpServer** -- Per-connection state with LRU eviction (#137)
- **OAuthProvider into HttpServer** -- Authentication middleware in request pipeline (#138)
- **WebhookManager into PluginManager** -- Plugin event hooks with source tagging (#139)
- **Per-Session RBAC into HttpServer** -- Per-session role resolution for multi-tenant role isolation (#140)
- **Per-Session Rate Limiting into HttpServer** -- Per-session token buckets for rate limiting (#141)

### Bug Fixes
- **Unblock MCP Startup** -- Made proxy boot async so MCP handshake completes immediately without waiting for child server boot (#124)

### Documentation
- Updated documentation for v3.0.0 features (#126)
- Updated CLAUDE.md with v3.0 sprint learnings (T33) (#136)

### Infrastructure
- **v3.0.0 Release** -- Initial release tag (#122)
- **Session Wrap** -- Session wrap for v3.0 implementation sprint (#123)
- **NPM Package Metadata** -- npm package metadata for v3.0.0 release (#125)

### Testing
- Integration tests for v3.0 features (#127)

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
