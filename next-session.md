# Next Session Priorities

Last Updated (UTC): 2026-03-13

## Current Handoff State
- **Main branch:** v3.0.0 release merged — all 15 implementation items (T28-T42) complete
- **Open PRs:** none
- **Version:** 3.0.0
- **Test suite:** 72 files, 179 tests, all passing via vitest
- **Session log:** `docs/session-logs/session-2026-03-13-v3-implementation.md`

## Completed This Session (PRs #108-#122)
- T28: Test runner migration to vitest (#108)
- T29: Build pipeline & source hygiene (#109)
- T30: MCP SDK feature adoption — annotations, instructions, HTTP transport (#110)
- T31: MCP resources & prompts with real content (#111)
- T32: Skill hot-reload with refresh tool and filesystem watcher (#112)
- T33: Rate limiting per tool/server with token bucket (#113)
- T34: Replay/evidence session dashboard (#114)
- T35: Interactive HITL approval UI (#115)
- T36: Repo audit as optional pre-session hook (#116)
- T37: Skill versioning and dependency declarations (#117)
- T38: Remote skill registry and fetch (#118)
- T39: Skill execution sandbox (#119)
- T40: Supabase as proxied child server (#120)
- T41: Role-based permission model (#121)
- T42: v3.0.0 release cut (#122)

## Next Actions

### Priority 1: npm Publish
- Run `npm publish --dry-run` to verify package contents
- Publish v3.0.0 to npm if ready
- Create GitHub release with tag `v3.0.0` and changelog

### Priority 2: Documentation Refresh
- Update the main README with new v3.0 capabilities
- Update docs/USAGE.md with new tools (refresh_skills, fetch_skill, execute_skill)
- Update docs/SETUP.md with new env vars (EVOKORE_ROLE, EVOKORE_SKILL_WATCHER, EVOKORE_REPO_AUDIT_HOOK)
- Update docs/ARCHITECTURE.md with new runtime layers (RBAC, rate limiting, dashboard)

### Priority 3: Integration Testing
- Test the HTTP transport with a real remote MCP server
- Test Supabase integration with a live project
- Test skill fetching from a GitHub raw URL
- Test RBAC role switching in a live session

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
