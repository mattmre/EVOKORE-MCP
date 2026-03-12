# Session Log: 2026-03-11 T20 Voice Sidecar Follow-Through

## Objective

Close the remaining voice-sidecar follow-through gap after the aggregation, continuity, memory, and status slices landed.

## What Changed

- Kept the existing standalone VoiceSidecar runtime intact
- Made `scripts/voice-hook.js` persona-aware
- Added explicit hook-side operator controls:
  - `VOICE_SIDECAR_PERSONA`
  - `VOICE_SIDECAR_HOST`
- Allowed payload-carried persona metadata fallback
- Updated voice setup, usage, walkthrough, troubleshooting, and hook docs
- Added research note `docs/research/voice-sidecar-followthrough-2026-03-11.md`
- Hardened `test-status-line-validation.js` so its fallback case no longer depends on ambient repo session state

## Key Decision

Treat `T20` as hook-transport follow-through, not a sidecar rewrite. The sidecar already had the required hardening/runtime behaviors; the real mismatch was that the default Claude hook path could not actually select personas even though the docs and `voices.json` supported them.

## Validation

- `node test-voice-e2e-validation.js`
- `node test-voice-refinement-validation.js`
- `node test-voice-sidecar-hardening-validation.js`
- `node test-voice-contract-validation.js`
- `node test-ops-docs-validation.js`
- `node test-status-line-validation.js`
- `npm test`
- `npm audit --json`

## Issues Found

- `test-status-line-validation.js` still assumed the old `roadmap/t21-status-line` branch and a repo-local fallback workspace.
  - Fix: derive the active branch dynamically and isolate the memory-fallback leg to a temp workspace.

## PR Outcome

- PR `#103`
- Merge commit: `db22242`

## Next Restart Point

- The roadmap execution chain is complete through `T21` and `T20`
- Remaining work is final `T22` session-wrap / handoff synchronization only
