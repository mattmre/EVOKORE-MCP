# Next Session Priorities

Last Updated (UTC): 2026-03-12

## Current Handoff State
- **Main branch:** `a606d98` — roadmap chain complete through `T27`, including merged PRs `#104` and `#105`
- **Open PRs:** `#106` (`docs: refresh canonical release documentation`) plus the pending session-wrap publication branch from this handoff
- **Current handoff branch:** `handoff/post-pr105-session` tracking `origin/main`
- **Active worktrees:** root handoff worktree only
- **Root control plane:** `task_plan.md`, `findings.md`, `progress.md`
- **Session logs:** `docs/session-logs/session-2026-03-10-stabilization-recovery.md`, `docs/session-logs/session-2026-03-11-roadmap-t10-t17-wrap.md`, `docs/session-logs/session-2026-03-11-t18-session-continuity.md`, `docs/session-logs/session-2026-03-11-t19-auto-memory.md`, `docs/session-logs/session-2026-03-11-t20-voice-followthrough.md`, `docs/session-logs/session-2026-03-11-t21-status-line.md`, `docs/session-logs/session-2026-03-11-t22-roadmap-closeout.md`, `docs/session-logs/session-2026-03-11-t23-repo-hygiene.md`, `docs/session-logs/session-2026-03-11-t24-t27-branch-followthrough.md`, `docs/session-logs/session-2026-03-12-pr104-pr105-cleanup.md`

## Completed This Session
- Reviewed, merged, and verified PR `#104` (`feat: reconcile damage-control expansion on current main`) as `0e1eabb`
- Refreshed PR `#105` onto the new `main`, resolved the `package.json` merge conflict, reran local validation, and merged it as `a606d98`
- Ran `npm run repo:audit` from merged `main` before and after cleanup
- Removed disposable PR verification worktrees and pruned explicitly-accounted local branches
- Deleted explicitly-accounted merged remote branches after ancestor verification and `git fetch --prune origin`
- Moved the root handoff worktree off stale `feature/damage-control-expansion` onto `handoff/post-pr105-session`
- Refreshed the canonical documentation suite to the current `2.0.2` runtime level and opened PR `#106`
- Verified there is no separate outstanding uncommitted source-code slice to publish; the remaining local drift is control-plane/session-wrap only

## Next Actions

### Priority 1: Review And Merge The Documentation Refresh
- Review PR `#106` (`docs: refresh canonical release documentation`)
- After merge, rerun the documentation guardrail set on fresh `main` if any follow-up edits are requested

### Priority 2: Publish The Session-Wrap/Handoff Sync
- Publish and review the session-wrap/control-plane branch from this handoff
- Merge it after PR `#106` so the trackers land on the freshest docs state

### Priority 3: Start New User-Directed Work
- There is no required implementation follow-through left from the roadmap or the `#104` / `#105` merge wave
- After the docs/session-wrap PRs land, use `handoff/post-pr105-session` or `main` as the starting point for the next implementation slice

### Priority 4: Optional Legacy Branch Review
- The repo audit reports no stale local or remote branch candidates
- If you want to go beyond stale-branch cleanup, explicitly account for the remaining non-stale historical remote branches before deleting them:
  - `origin/feature/damage-control-expansion`
  - `origin/feature/docs-architect-v2`
  - `origin/chore/sync-mode-safety-phase`
  - the active docs topic branches under `origin/docs/*`

## Guardrails
- Use `task_plan.md`, `findings.md`, and `progress.md` as the durable source of truth after any reset or crash
- Do not commit shared trackers (`next-session.md`, `docs/session-logs/*`, root planning files) on feature branches unless the slice explicitly owns final handoff
- `scripts/repo-state-audit.js` is now the canonical preflight for branch/worktree/handoff drift; run `npm run repo:audit` before cleanup or new multi-slice implementation work
- If a stale branch predates major runtime/config changes, replay the valid feature work onto fresh `main` in a disposable worktree instead of reviving the branch in place
- Refresh remote refs with `git fetch --prune origin` before attempting remote branch cleanup; GitHub may auto-delete merged PR branches for you
- `scripts/sync-configs.js` resolves the canonical git common root automatically; use `EVOKORE_SYNC_PROJECT_ROOT` only for deliberate overrides
- `npm run memory:sync` updates the live EVOKORE Claude memory directory at `C:\Users\mattm\.claude\projects\D--GITHUB-EVOKORE-MCP\memory`
- `scripts/status.js` remains continuity-first: read the canonical session manifest first and treat managed Claude memory as fallback only
- `scripts/voice-hook.js` forwards persona via `VOICE_SIDECAR_PERSONA` first, then falls back to payload persona metadata
- The `planning-with-files` helper install path on this machine is under `C:\Users\mattm\.codex\skills\...`, not `C:\Users\mattm\.claude\skills\...`
