# T21 Research: Live Status Line Display

Date: 2026-03-11

## Problem

EVOKORE already shipped `scripts/status.js`, but the implementation was the pre-roadmap version:

- network-driven location/weather surface
- no awareness of the canonical session manifest from `T18`
- no awareness of the managed Claude memory set from `T19`
- no actual `.claude/settings.json` `statusLine` wiring in the repo
- prompt-side `EVOKORE_STATUS_HOOK` status injection used a separate cache-only summary, so terminal and prompt context could drift

That shape no longer matched the saved critical-path requirement for `T21`: keep the status line compact and operator-facing, with branch, purpose, task pressure, and continuity health as the primary signals.

## Decision

Treat `T21` as a runtime-contract consolidation slice, not a cosmetic refresh.

Implementation choices:

1. Add a shared `scripts/status-runtime.js` summarizer.
2. Make `scripts/status.js` a thin terminal renderer over that shared runtime.
3. Reuse the same shared summary in `scripts/purpose-gate.js` when `EVOKORE_STATUS_HOOK=true`.
4. Wire `.claude/settings.json` with a real `statusLine` block pointing at `node scripts/status.js`.
5. Use the continuity manifest as the primary state source and managed Claude memory as fallback only.

## Data Sources

Primary:

- `~/.evokore/sessions/{sessionId}.json`
- current git worktree state
- client payload context-window fields

Fallback:

- Claude memory `project-state.md` from the repo-managed memory directory

Explicit non-goal:

- do not keep live network location/weather requests in the critical operator path

## Resulting Output Shape

The new status line is one compact line, responsive to width, and biased toward operator control:

- branch + worktree pressure
- purpose
- task pressure
- continuity health plus replay/evidence counts
- context percentage when available

## Validation Plan

- add `test-status-line-validation.js`
- extend hook/settings validation so `.claude/settings.json` must carry the `statusLine` command
- update hook-suite expectations from cache/location output to continuity/task output
- run targeted hook/status tests plus full `npm test`
