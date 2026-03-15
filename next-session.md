# Next Session Priorities

Last Updated (UTC): 2026-03-15

## Current Handoff State
- **Main branch:** `15bd495` — PRs #142-#156 merged (15 total across two sprint sessions)
- **Open PRs:** none
- **Version:** 3.0.0
- **Test suite:** 106 files, 1224 tests via vitest
- **Session log:** `docs/session-logs/session-2026-03-15-v3-hardening-sprint-2.md`

## Completed This Session
- PR #146: E2E wired pipeline test (reviewed, 6 fixes applied, merged)
- PR #147: Plugin authoring guide
- PR #148: Webhook configuration guide
- PR #149: OAuth setup guide
- PR #150: HTTP deployment guide
- PR #151: USAGE.md + README.md v3.0 update
- PR #152: Damage control regex coverage tests
- PR #153: SkillManager session context (RBAC bypass fix)
- PR #154: GH Actions quota monitoring script
- PR #155: Plugin webhook subscription API
- PR #156: Log rotation boundary tests + repo audit hook default enablement

## Next Actions

### Priority 1: npm Publish v3.0.0
- All implementation phases complete
- To publish: `git tag v3.0.0 && git push origin v3.0.0`
- Release workflow creates GitHub Release with auto-generated notes
- Verify NPM_TOKEN is configured in repo secrets first

### Priority 2: v3.1.0 Planning
- STT voice input implementation (research completed in PR #130)
- Live Supabase integration test
- Further operational hardening based on production feedback

### Priority 3: Consider
- Live Supabase integration test with real database
- Performance benchmarking for the full wired pipeline
- Plugin ecosystem documentation and registry

## Guardrails
- GitHub Actions CI may be quota-limited — check before expecting CI to run
- Run `npx vitest run` locally before pushing PRs
- Run `npm run repo:audit` before new work
- Agent worktrees need cleanup after sprint sessions
