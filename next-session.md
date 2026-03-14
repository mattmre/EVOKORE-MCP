# Next Session Priorities

Last Updated (UTC): 2026-03-14

## Current Handoff State
- **Main branch:** `bbb03a0` — PR #124 merged (MCP startup handshake fix)
- **Open PRs:** none
- **Version:** 3.0.0
- **Test suite:** 72 files, 180 tests, all passing via vitest
- **Session log:** `docs/session-logs/session-2026-03-14-pr124-startup-handshake.md`

## Completed This Session (PR #124)
- fix: unblock MCP startup from child server boot (#124)
  - ProxyManager.loadServers() now boots child servers asynchronously in background
  - MCP handshake completes immediately without waiting for proxy connections
  - Configurable boot timeout via EVOKORE_CHILD_SERVER_BOOT_TIMEOUT_MS
  - Created shared test helper `tests/helpers/wait-for-proxy-boot.js`
  - Updated 7 integration tests for async boot pattern
  - Removed tracked dist/ files, cleaned up unused imports
  - Test count: 179 -> 180

## Previously Completed (PRs #108-#122)
- T28-T42: v3.0.0 full implementation sprint (15 PRs)

## Next Actions

### Priority 1: npm Publish
- Run `npm publish --dry-run` to verify package contents
- Publish v3.0.0 to npm if ready
- Create GitHub release with tag `v3.0.0` and changelog

### Priority 2: Documentation Refresh
- Update the main README with new v3.0 capabilities
- Update docs/USAGE.md with new tools (refresh_skills, fetch_skill, execute_skill)
- Update docs/SETUP.md with new env vars (EVOKORE_ROLE, EVOKORE_SKILL_WATCHER, EVOKORE_REPO_AUDIT_HOOK, EVOKORE_CHILD_SERVER_BOOT_TIMEOUT_MS)
- Update docs/ARCHITECTURE.md with new runtime layers (RBAC, rate limiting, dashboard, async proxy boot)

### Priority 3: Integration Testing
- Test the HTTP transport with a real remote MCP server
- Test Supabase integration with a live project
- Test skill fetching from a GitHub raw URL
- Test RBAC role switching in a live session
- Test async proxy boot behavior under slow/failing child servers

### Priority 4: Future Roadmap Candidates
- StreamableHTTP server transport (expose EVOKORE over HTTP, not just stdio)
- OAuth authentication for HTTP transport
- Plugin system for custom tool providers
- Webhook/event system for external notifications
- Multi-tenant session isolation
- STT (speech-to-text) integration for voice input

## Guardrails
- Run `npm run repo:audit` before new work
- Use `npx vitest run` for testing (not the old chained scripts)
- The dashboard (`npm run dashboard`) is a separate process on port 8899
- RBAC is opt-in via `EVOKORE_ROLE` env var — flat permissions still work by default
- Skill watcher is opt-in via `EVOKORE_SKILL_WATCHER=true`
- Repo audit hook is opt-in via `EVOKORE_REPO_AUDIT_HOOK=true`
- Integration tests that call proxied tools must use `waitForProxyBoot()` after `client.connect()`
