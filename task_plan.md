---
name: v32-implementation-sprint-2026-03-25
description: Sequential task plan for v3.2 implementation sprint — PR review/merge, release, production validation, and new feature development.
---

# Task Plan: v3.2 Implementation Sprint

## Goal
Execute all remaining priority items sequentially through full development phases: research → plan → implement → test → PR → review → merge. Maintain this plan for crash recovery.

## Current Phase
Phase 0: PR #184 review, fix, and merge.

## Baseline State (2026-03-25)
- **Current branch:** `chore/tts-session-wrap-20260325`
- **HEAD:** `daa0b55`
- **Main HEAD:** `55027a7`
- **Open PRs:** #184 (session-wrap docs, all CI green)
- **Worktrees:** root only
- **Version:** 3.0.0 in package.json (all v3.1 feature work landed via PRs #157-#183)
- **Tests:** 117 files, ~1721 tests passing

## Sequential Plan

### Phase 0: Review + Fix + Merge PR #184
- [x] Full review of PR #184 (3 files, docs-only)
- [x] Post review comment on GitHub
- [x] Fix Issue 1: stale "Related PRs: TBD" → "#182, #183"
- [x] Fix Issue 2: status "Implementation approved" → "Implementation complete"
- [x] Fix Issue 3: openaiModel precision in voices.json description
- [ ] Commit and push fixes
- [ ] Verify CI passes (12 checks)
- [ ] Merge PR #184 to main
- [ ] Update local main

### Phase 1: Release v3.1.0
- [ ] Create branch `release/v3.1.0` from main
- [ ] Bump `package.json` version from `3.0.0` to `3.1.0`
- [ ] Open PR for version bump
- [ ] Merge version bump PR
- [ ] Verify `NPM_TOKEN` secret in GitHub repo settings (operator action)
- [ ] Tag `v3.1.0` on main and push
- [ ] Verify release workflow triggers and succeeds

### Phase 2: Production Validation Harnesses
- [ ] Research current validation gaps across all surfaces
- [ ] Create `tests/integration/production-validation.test.ts` with skip-if-no-credentials guards
- [ ] Sub-phase 2a: Local TTS validation (Kokoro-FastAPI Docker harness)
- [ ] Sub-phase 2b: Voice-stop hook playback queue validation (concurrent sessions)
- [ ] Sub-phase 2c: STT voice input validation (Whisper API)
- [ ] Sub-phase 2d: FileSessionStore persistence validation (process restart)
- [ ] Sub-phase 2e: Supabase integration validation
- [ ] Sub-phase 2f: Dashboard auth flow validation
- [ ] Document manual validation steps in docs/
- [ ] Open PR, verify CI, merge

### Phase 3: T19 Auto-Memory (Event-Driven Sync)
- [ ] Review existing research: `docs/research/auto-memory-architecture-2026-03-11.md`
- [ ] Review current implementation: `scripts/claude-memory.js`, `scripts/sync-memory.js`
- [ ] Design event-driven trigger (Stop hook integration)
- [ ] Save research to `docs/research/auto-memory-event-driven-2026-03-25.md`
- [ ] Implement: wire `syncMemory()` into tilldone.js Stop hook
- [ ] Add opt-out via `EVOKORE_AUTO_MEMORY_SYNC=false`
- [ ] Add tests
- [ ] Open PR, verify CI, merge

### Phase 4: HTTP Session Reattachment
- [ ] Review existing research: `docs/research/session-isolation-httpserver-wiring-2026-03-15.md`
- [ ] Review gap: `src/HttpServer.ts` line 212 (404 on unknown session ID)
- [ ] Review `SessionIsolation.loadSession()` at line 262
- [ ] Design reattachment flow (loadSession → create transport → connect)
- [ ] Save research to `docs/research/http-session-reattachment-2026-03-25.md`
- [ ] Implement reattachment in HttpServer.handleMcpRequest()
- [ ] Add integration tests (store → restart → reattach)
- [ ] Update docs
- [ ] Open PR, verify CI, merge

### Phase 5: Redis SessionStore Adapter
- [ ] Research Redis client options (ioredis vs redis npm package)
- [ ] Design RedisSessionStore implementing SessionStore interface
- [ ] Save research to `docs/research/redis-session-store-2026-03-25.md`
- [ ] Add `ioredis` as optional peer dependency
- [ ] Implement `src/stores/RedisSessionStore.ts`
- [ ] Add factory in SessionIsolation for store selection
- [ ] Add `EVOKORE_SESSION_STORE=redis` env var
- [ ] Add integration tests with mock Redis
- [ ] Add `.env.example` entries
- [ ] Update docs
- [ ] Open PR, verify CI, merge

### Phase 6: Container-Based Skill Sandbox
- [ ] Review existing research: `docs/research/skill-sandbox-security-audit-2026-03-14.md`
- [ ] Research Docker/Podman API for execution wrapping
- [ ] Design ContainerSandbox with child_process fallback
- [ ] Save research to `docs/research/container-sandbox-2026-03-25.md`
- [ ] Implement `src/ContainerSandbox.ts`
- [ ] Wire into SkillManager execute_skill
- [ ] Add `EVOKORE_SANDBOX_MODE=container|process` env var
- [ ] Add integration tests
- [ ] Add `.env.example` entries
- [ ] Update docs
- [ ] Open PR, verify CI, merge

### Phase 7: WebSocket HITL Streaming
- [ ] Research WebSocket integration for Node.js HTTP server (ws package)
- [ ] Design message protocol for approval push
- [ ] Save research to `docs/research/websocket-hitl-2026-03-25.md`
- [ ] Add `ws` as optional dependency
- [ ] Implement WebSocket upgrade in dashboard
- [ ] Implement real-time approval push (replace 5s polling)
- [ ] Add integration tests
- [ ] Update docs
- [ ] Open PR, verify CI, merge

### Phase 8: External Telemetry Reporting
- [ ] Research telemetry standards (OTLP, custom HTTP endpoints)
- [ ] Design privacy-preserving opt-in telemetry export
- [ ] Save research to `docs/research/external-telemetry-2026-03-25.md`
- [ ] Implement telemetry exporter
- [ ] Add `EVOKORE_TELEMETRY_ENABLED=true` and endpoint config
- [ ] Add privacy controls (data minimization, opt-in)
- [ ] Add integration tests
- [ ] Add `.env.example` entries
- [ ] Update docs
- [ ] Open PR, verify CI, merge

### Phase 9: Priority Status Matrix Update
- [ ] Refresh `docs/PRIORITY_STATUS_MATRIX.md` with v3.2 items
- [ ] Add evidence file references for each completed phase
- [ ] Open PR, verify CI, merge

## Merge Plan
- Sequential: each phase merges to main before the next begins
- Validate on main after each merge
- Keep shared trackers/session logs out of feature branches (update on main or session-wrap branch)

## Guardrails
- All items from CLAUDE.md apply (env sync, BOM, damage-control, etc.)
- `npx vitest run` before every PR push
- `npm run build` before every PR push
- Use `.commit-msg.txt` for complex commit messages
- Add new `EVOKORE_*` env vars to `.env.example` in the same PR
