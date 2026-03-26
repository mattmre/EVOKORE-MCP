# Next Session Priorities

Last Updated (UTC): 2026-03-26

## Current Handoff State
- **Main branch:** `3fae08a` — v3.1.0 tagged and released; PR review/merge wave landed
- **Open PRs:** `#191` docs-only roadmap/session-wrap refresh
- **Worktrees:** root only (`D:/GITHUB/EVOKORE-MCP`)
- **Local branches:** `main` only
- **Validation:** 121 test files on main, 2053 tests passing, 3 skipped
- **Release:** v3.1.0 GitHub Release published 2026-03-26T11:12:49Z (npm publish skipped — no NPM_TOKEN secret)
- **Session logs:** `docs/session-logs/session-2026-03-26-v31-roadmap-implementation.md`, `docs/session-logs/session-2026-03-26-pr-review-merge-wrap.md`
- **Latest planning log:** `docs/session-logs/session-2026-03-26-roadmap-reframe.md`
- **Roadmap source of truth:** `docs/research/revised-roadmap-2026-03-26.md`

## Completed This Session
- **Release:** Tagged and published `v3.1.0` on GitHub (npm still pending `NPM_TOKEN`)
- **Validation PR wave:** Reviewed, fixed, and squash-merged `#186`-`#190`
- **Research docs added:** `docs/research/tts-local-production-validation-2026-03-26.md`, `docs/research/stt-whisper-production-validation-2026-03-26.md`
- **Tests landed on main:** OpenAI-compatible TTS validation, VoiceSidecar playback queue validation, STT Whisper validation, FileSessionStore restart persistence validation
- **Final integrated verification:** `npm test` and `npm run build` passed on merged `main`
- **Infrastructure recovery:** Reconstructed corrupted `.git/config`, cleaned stale agent worktrees, pruned the PR queue to zero
- **Roadmap reframe:** Architecture shifted from flat feature backlog to milestone-based execution with explicit ARCH-AEP and code-review loops

## Immediate Next Actions

### Priority 0: Land PR `#191`
- Merge the docs-only roadmap/session-wrap refresh first so the handoff files match the new plan

### Priority 1: Milestone M0 — Release Closure
- `NPM_TOKEN` secret is not set in GitHub repo settings
- Add or run the release preflight path
- Set `NPM_TOKEN`, then either retag or use workflow_dispatch with `chain_complete=true`

### Priority 2: Milestone M1 — Runtime Continuity Platform
- Start with the canonical session contract and HTTP session reattachment
- Wire `SessionIsolation.loadSession()` into `HttpServer` so existing `mcp-session-id` values survive process restart
- Keep Auto-Memory and dashboard session filtering behind that contract instead of evolving them independently
- Insert an ARCH-AEP checkpoint before Phase 6 implementation begins so names, non-goals, and exit criteria are normalized

### Priority 3: Milestone M2 — Secure Operator Platform
- Dashboard auth/authz validation and hardening
- Internal telemetry and auditability
- Supabase live validation
- Container-based skill sandbox isolation

### Priority 4: Milestone M3 — Scale and Real-Time Runtime
- Redis SessionStore adapter (multi-node HA)
- External telemetry reporting / hardening (opt-in, privacy-preserving)
- Real-time WebSocket streaming for HITL approvals
- Stale worktree cleanup automation

## Standard Phase Loop

Each milestone/phase should follow:

1. Align / architecture question
2. Research / dependency check
3. Architecture / PR slicing
4. Implementation
5. Prove / validation
6. ARCH-AEP review and analysis
7. Code review / hardening
8. Sequential merge + stabilization

## Guardrails
- Use `docs/research/revised-roadmap-2026-03-26.md` as the architecture truth source and keep `next-session.md` concise
- GitHub Actions CI uses 3 test shards (shard 3 runs `test-env-sync-validation.js`)
- Always add new `EVOKORE_*` env vars to the env example file in the same PR
- Run `npm run repo:audit` before new multi-slice work
- Run `npx vitest run` locally before pushing PRs
- Run full `npm test` and `npm run build` before closing a merge wave on `main`
- Do NOT use `git add .env.example` directly — damage-control blocks it; use `git add -A`
- Use `gh pr create --body-file` or `gh pr edit --body-file` when PR body text includes `.env` references
- If PR metadata CI stays red after fixing the PR body, push a fresh sync commit; reruns can keep using the stale `pull_request` event payload
- Merge sequential PR waves one by one and wait for fresh CI after each merge, even when the PRs are test-only or docs-only
- If repo state looks impossible after a crash, inspect `.git/config` for null-byte corruption before doing broader git surgery
- When adding tests for a renamed function (e.g., `execFileSync` -> `execFileAsync`), merge the rename PR first, then rebase test-update PRs
- Use `.commit-msg.txt` with `git commit -F` instead of heredocs (damage-control can misfire on complex strings)
- Do not let Auto-Memory, dashboard filtering, Redis, and telemetry invent separate session identities; they must all inherit the canonical session contract first
- Run an ARCH-AEP review loop after each implementation phase and before final merge
- Run a code-analysis/review hardening loop after ARCH-AEP review, not only at end-of-milestone
