# Next Session Priorities

Last Updated (UTC): 2026-03-27

## Current Handoff State
- **Main branch:** `2a84de2` — full M0-M3 roadmap execution complete, plus S3.1/S3.2 stabilization merged
- **Open PRs:** none at session-wrap start
- **Worktrees:** a dedicated session-wrap/control-plane branch is being prepared for publication; canonical repo baseline is `origin/main`
- **Local branches:** `main` on the root checkout; this wrap is being prepared on a dedicated `chore/session-wrap-*` branch
- **Validation:** 135 test files, 2462 tests passing, 24 skipped
- **Release:** GitHub release/tag `v3.1.0` exists; npm package is still unpublished and `NPM_TOKEN` is missing or unconfirmed
- **Session logs:** `docs/session-logs/session-2026-03-26-post-roadmap-stabilization-wrap.md`
- **Research docs:** `docs/research/release-closure-status-2026-03-26.md`
- **Roadmap source of truth:** `docs/research/revised-roadmap-2026-03-26.md`

## Completed This Session (Session 3)
- **S3.1 Post-M2 F1 closure:** PR `#207` wired `redactForAudit()` into the shared runtime audit write path
- **S3.2 Local baseline stabilization:** PR `#208` restored `test-worktree-cleanup-validation.js` to use `node --check`
- **Review / merge workflow:** both PRs were reviewed sequentially, locally validated, waited on green CI, and squash-merged
- **Release-state research:** clean `release:preflight` is healthy except for the existing `v3.1.0` tag and missing `NPM_TOKEN`
- **Current local baseline:** `npm test` passes with 135 files / 2462 tests / 24 skipped; `npm run build` passes

## Immediate Next Actions

### Priority 0: NPM_TOKEN + Full Release
- `NPM_TOKEN` is still missing or unconfirmed in GitHub repo settings
- Rerun `npm run release:preflight` after operator secret verification
- Choose the publish path for the existing `v3.1.0` tag / GitHub release
- Verify npm publication externally after operator action

### Priority 1: Land The Control-Plane Wrap PR
- Merge the control-plane/session-wrap PR that updates `next-session.md`, `CLAUDE.md`, roadmap status, and session logs
- Keep the dirty root workspace off stale `main` history until the control-plane wrap is preserved

### Priority 2: M4 Continuous Improvement
- Run a post-M3 ARCH-AEP review to assess cross-milestone coherence
- Record that post-M2 F1 is now resolved via PR `#207`
- Turn the recurring M4 loop into the next concrete review artifact instead of leaving it implicit

### Priority 3: Future Expansion Candidates
- Prometheus `/metrics` pull endpoint (M3.2 follow-up)
- Dashboard approve action via WebSocket (currently deny-only)
- Audit event export (separate from telemetry metrics export)
- `seccomp` profiles for container sandbox
- Container image pre-pull and per-language resource limits

## Guardrails
- Use `docs/research/revised-roadmap-2026-03-26.md` as the architecture truth source, but note that this wrap updates its stale status/baseline sections
- GitHub Actions CI uses 3 test shards
- Always add new `EVOKORE_*` env vars to `.env.example` in the same PR
- Run `npx vitest run` locally before pushing PRs
- Run full `npm test` and `npm run build` before closing a merge wave
- Use `.commit-msg.txt` with `git commit -F` instead of heredocs
- All session-adjacent features must use the canonical session contract
- Run ARCH-AEP review after each implementation phase
