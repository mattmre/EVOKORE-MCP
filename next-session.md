# Next Session Priorities

Last Updated (UTC): 2026-03-15

## Current Handoff State
- **Main branch:** `5f35ae6` — PRs #157-#171 merged (13 total in v3.1 sprint)
- **Open PRs:** none
- **Version:** 3.0.0 (npm publish pending)
- **Test suite:** 114 files, 1624 tests via vitest
- **Session log:** `docs/session-logs/session-2026-03-15-v31-sprint.md`

## Completed This Session (v3.1 Sprint)
- PR #157: Webhook HMAC replay protection (timestamp + nonce)
- PR #158: execute_skill sandbox hardening (env filtering, private temp dirs, memory limits)
- PR #159: Untrack node_modules, fix engine constraints (>=20)
- PR #160: Damage-control false positive mitigation (command-position regex)
- PR #161: CI test sharding (3x parallel) + HTTP pipeline benchmarks
- PR #162: Migration guide v2→v3 + contributing guide
- PR #164: OAuth JWKS real-provider integration tests (18 tests)
- PR #165: Dashboard auth + session filtering + HITL approval improvements
- PR #166: Skill versioning enforcement + watcher stability tests (56 tests)
- PR #167: STT voice input (Whisper API + local provider)
- PR #168: Pluggable session store abstraction (Memory + File backends) + Supabase integration test
- PR #170: Plugin authoring examples (3 plugins) + TypeDoc API reference setup
- PR #171: Plugin registry manager + privacy-first local telemetry

## Next Actions

### Priority 1: npm Publish v3.0.0
- All implementation phases complete
- To publish: `git tag v3.0.0 && git push origin v3.0.0`
- Release workflow creates GitHub Release with auto-generated notes
- Verify NPM_TOKEN is configured in repo secrets first

### Priority 2: v3.1.0 Tag Planning
- Consider tagging v3.1.0 after confirming all new features work in production
- New features to highlight: STT voice, session store, registry, telemetry, dashboard auth

### Priority 3: Production Validation
- Deploy and test STT voice input with real Whisper API key
- Test FileSessionStore persistence across restarts
- Test RegistryManager with a real skill registry URL
- Test dashboard auth with credentials configured
- Live Supabase integration test (requires credentials)

### Priority 4: Future Roadmap
- Redis SessionStore adapter for multi-node HA deployment
- Container-based skill sandbox isolation (Docker/Podman)
- External telemetry reporting (opt-in, privacy-preserving)
- Real-time WebSocket streaming for HITL approvals
- T19 auto-memory system completion

## Guardrails
- GitHub Actions CI uses 3 test shards now (from PR #161)
- Run `npx vitest run` locally before pushing PRs
- Run `npm run repo:audit` before new work
- Node.js minimum is now v20 (from PR #159)
- `npm run bench` available for performance regression checking
