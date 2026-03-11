# Fail-Safe Design Principles Research

## Date
- 2026-03-11

## Objective
- Close `T11` by making the active hook lifecycle resilient to load-time failures, not just runtime failures inside the hook bodies.

## Current-State Gap
- EVOKORE's hook bodies already handled most runtime exceptions with internal `try/catch` blocks and exit-0 fail-safe behavior.
- The remaining weakness was bootstrap-time:
  - canonical hook entrypoints in `scripts/hooks/*.js` used direct `require(...)`
  - `evidence-capture.js` was still wired directly from `.claude/settings.json`
  - if a dependency failed at module load time, Claude Code could still receive a non-zero hook failure before the hook's internal safeguards ran

## Decision
- Add a shared bootstrap loader for active hook entrypoints:
  - `scripts/hooks/fail-safe-loader.js`
- Route all active hook paths through that loader:
  - `damage-control`
  - `purpose-gate`
  - `session-replay`
  - `evidence-capture`
  - `tilldone`
- Keep the underlying stable implementations unchanged in this slice.

## Why This Design
- It closes the most important remaining crash vector with minimal behavior risk.
- It preserves the existing hook implementations and their intentional exit codes.
- It gives `T12` and later phases a stable, explicitly fail-safe lifecycle boundary to build on.

## Validation Strategy
- Keep existing hook suite and hook E2E coverage.
- Add a dedicated bootstrap regression test that forces a missing-module load path and verifies the loader exits `0` while emitting a fail-safe hooks log entry.
