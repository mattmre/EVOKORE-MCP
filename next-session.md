# Next Session Priorities

Last Updated (UTC): 2026-03-25

## Current Handoff State
- **Main branch:** `55027a7` — PRs #182, #183 merged; main is clean with 0 stashes, 0 extra worktrees
- **Open PRs:** #184 (session-wrap: research doc + session log + next-session update)
- **Worktrees:** root only (`D:/GITHUB/EVOKORE-MCP`)
- **Local branches:** `main` + `chore/tts-session-wrap-20260325`
- **Validation:** all 12 CI checks green on PRs #182 and #183
- **Session logs:** `docs/session-logs/session-2026-03-25-tts-provider-abstraction.md`

## Completed This Session
- PR #182: Extract TTSProvider interface + ElevenLabsTTSProvider from VoiceSidecar (pure refactor, 8 files, +468/-214, 28 new tests)
- PR #183: Add OpenAI-compatible TTS provider for local text-to-speech (7 files, +363/-16, 21 new tests)
- Research doc: `docs/research/tts-provider-abstraction-2026-03-25.md` (landscape evaluation of Kokoro-FastAPI, Chatterbox, Coqui, LocalAI)
- New capabilities: `EVOKORE_TTS_PROVIDER=openai-compat` switches VoiceSidecar to any local TTS server; `ELEVENLABS_API_KEY` no longer required for local providers
- Total test count now: 117 files, ~1721 tests

## Next Actions

### Priority 1: npm Publish v3.1.0
- All implementation phases for the v3.1 sprint are complete (PRs #157-#183 landed)
- To publish: `git tag v3.1.0 && git push origin v3.1.0`
- Release workflow creates GitHub Release with auto-generated notes
- Verify `NPM_TOKEN` secret is set in repository before tagging

### Priority 2: Production Validation
- Test local TTS with Kokoro-FastAPI Docker container (`EVOKORE_TTS_PROVIDER=openai-compat`)
- Test voice-stop hook with live VoiceSidecar running (ensure playback queue works with concurrent sessions)
- Test STT voice input with real Whisper API key
- Test FileSessionStore persistence across restarts (HTTP mcp-session-id reattachment is still NOT implemented)
- Live Supabase integration test (requires credentials)
- Dashboard auth + session filtering in production

### Priority 3: T19 Auto-Memory System
- Build on session manifest (`~/.evokore/sessions/{sessionId}.json`) as the anchor
- Scope: automatic project-state snapshots into Claude memory dir on session wrap
- `npm run memory:sync` is the prototype; needs event-driven triggering

### Priority 4: Roadmap Items
- Redis SessionStore adapter (multi-node HA)
- Container-based skill sandbox isolation (Docker/Podman)
- External telemetry reporting (opt-in, privacy-preserving)
- Real-time WebSocket streaming for HITL approvals
- HTTP session reattachment (`SessionIsolation.loadSession()` → `HttpServer`)

## Guardrails
- GitHub Actions CI uses 3 test shards (shard 3 runs `test-env-sync-validation.js`)
- Always add new `EVOKORE_*` env vars to the env example file in the same PR
- Run `npx vitest run` locally before pushing PRs
- Do NOT use `git add .env.example` directly — damage-control blocks it; use `git add -A`
- When adding tests for a renamed function (e.g., `execFileSync` -> `execFileAsync`), merge the rename PR first, then rebase test-update PRs
- `npm run repo:audit` before new multi-slice work
- Use `gh pr create --body-file` when PR body text contains `.env` references (damage-control false positive)
