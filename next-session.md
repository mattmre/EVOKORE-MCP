# Next Session Priorities

Last Updated (UTC): 2026-03-20

## Current Handoff State
- **Main branch:** `a3d05b0` — PR #175 merged; FileSessionStore restart smoke/evidence landed
- **Control-plane branch:** `chore/control-plane-wrap-20260320` — tracker/research/session-log preservation only
- **Open PRs:** `#176` (`feat: add Stitch MCP server and skill pack`) is open and mergeable, but `Test Suite (shard 2/3)` and `Test Suite (shard 3/3)` are failing
- **Version:** 3.0.0 (npm publish pending)
- **Validation:** post-merge `npm run build`, `npx vitest run tests/integration/session-store.test.ts`, and `npm run docs:check` all passed on `main`
- **Session logs:** `docs/session-logs/session-2026-03-19-release-validation-entrypoints.md`, `docs/session-logs/session-2026-03-19-registry-validation-harness.md`, `docs/session-logs/session-2026-03-20-file-session-store-restart-smoke.md`, `docs/session-logs/session-2026-03-20-repo-cleanup.md`

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
- PR #174: Registry validation harness + config-path alignment + runtime/docs coverage
- PR #175: FileSessionStore restart smoke + operator evidence note
- Local repo hygiene pass: retired stale root branch, removed duplicate raw Stitch drop from the control plane, pruned `16` confirmed already-landed local branches, and reduced the local branch set to `main`, `chore/control-plane-wrap-20260320`, and `feat/stitch-skills-and-mcp-20260320`

## Next Actions

### Priority 0: Stabilize PR #176
- Reproduce the failing GitHub cases behind `Test Suite (shard 2/3)` and `Test Suite (shard 3/3)`
- Apply fixes only on `feat/stitch-skills-and-mcp-20260320`
- Re-run the relevant local test shard/targeted validation before pushing
- Merge PR `#176` only after CI is green

### Priority 1: Land Control-Plane Preservation
- Publish the `chore/control-plane-wrap-20260320` branch as its own tracker/docs/session-log preservation PR
- Merge it separately from code-bearing feature work so shared handoff artifacts stay isolated

### Priority 2: npm Publish v3.0.0
- All implementation phases remain complete
- To publish: `git tag v3.0.0 && git push origin v3.0.0`
- Release workflow creates GitHub Release with auto-generated notes
- Current blocker: `gh secret list` returned no repository secrets in the current environment, so `NPM_TOKEN` is still unverified/unconfirmed
- Current blocker: `git tag --list v3.0.0` returned no tag yet

### Priority 3: Production Validation
- Deploy and test STT voice input with real Whisper API key
- Test FileSessionStore persistence across restarts
- RegistryManager local/mock validation is now complete via PR #174
- FileSessionStore store/isolation restart evidence is now complete via PR #175; HTTP `mcp-session-id` reattachment after restart is still not implemented
- Test dashboard auth with credentials configured
- Live Supabase integration test (requires credentials)

### Priority 4: v3.1.0 Tag Planning and Roadmap
- Consider tagging v3.1.0 after confirming all new features work in production
- New features to highlight: STT voice, session store, registry, telemetry, dashboard auth
- Redis SessionStore adapter for multi-node HA deployment
- Container-based skill sandbox isolation (Docker/Podman)
- External telemetry reporting (opt-in, privacy-preserving)
- Real-time WebSocket streaming for HITL approvals
- T19 auto-memory system completion

### Historical Review Coverage
- Audit artifact: `docs/research/arch-aep-pr-review-audit-2026-03-16.md`
- Decision recorded: treat the audit as sufficient historical coverage and do not backfill retroactive comments on the `88` already-merged/closed PRs by default

## Guardrails
- GitHub Actions CI uses 3 test shards now (from PR #161)
- Run `npx vitest run` locally before pushing PRs
- Run `npm run repo:audit` before new work
- Node.js minimum is now v20 (from PR #159)
- `npm run bench` available for performance regression checking
- Shared trackers and session logs should still stay out of feature-branch commits; update them on the control plane after merges
- Do not overstate PR #175 as runtime session recovery; it proves persisted store recovery across a fresh `FileSessionStore` + `SessionIsolation` boundary only
