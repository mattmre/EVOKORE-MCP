# M1.2 Auto-Memory Event Trigger Research

**Date:** 2026-03-26
**Milestone:** M1 - Session Continuity Hardening
**Status:** Implemented

## Current State of Memory Sync

The memory sync system (`scripts/claude-memory.js`) generates four managed files in the Claude project memory directory:

- `MEMORY.md` - Top-level memory index with current focus, runtime continuity references
- `project-state.md` - Branch, HEAD, dirty state, session manifest snapshot
- `patterns.md` - Stable repo conventions
- `workflow.md` - Sequential roadmap gate, session-wrap contract

Before M1.2, memory sync was only triggered manually via `npm run memory:sync` (which runs `node scripts/sync-memory.js` -> `scripts/claude-memory.js`). This meant that if an operator forgot to run the sync before ending a session, the Claude memory files would be stale for the next session.

## Design Decision: Trigger at Stop Hook vs PostToolUse

### Option A: PostToolUse Hook (Rejected)

Triggering on every tool use would keep memory maximally fresh, but:

- **Performance:** `syncMemory()` reads multiple files, resolves git state, and writes 4 files. Running this on every tool call (potentially hundreds per session) would add significant I/O overhead.
- **Churn:** Most tool calls do not change the state that memory files reflect (branch, HEAD, session purpose). Syncing after every `Read` or `Grep` call is wasteful.
- **Conflict risk:** If multiple hooks write to the same memory directory in rapid succession, race conditions are possible.

### Option B: Stop Hook at Session-Wrap Boundary (Chosen)

Triggering at the Stop hook when the session is approved to end:

- **Single invocation:** Runs exactly once per session, at the natural boundary where state should be captured.
- **Captures final state:** The memory snapshot includes the final branch, HEAD, session purpose, and task status.
- **Fail-safe:** If the sync fails, the session still stops (the stop decision is already made at this point).
- **Low overhead:** One additional file I/O operation per session is negligible.

## Fail-Safe Requirements

The auto-memory sync MUST be fail-safe:

1. **Never block session stop:** The sync runs after the `hook_mode_allow` event has been emitted. If it fails, the process still exits with code 0.
2. **Try/catch wrapper:** The entire sync block is wrapped in a try/catch. The catch block only logs to stderr if `EVOKORE_DEBUG` is set, and emits a hook event for observability.
3. **Opt-out:** `EVOKORE_AUTO_MEMORY_SYNC=false` disables the feature entirely.

## Activity Threshold Consideration

Not every session warrants a memory sync. A session that was opened and immediately closed (no tool calls, no evidence) should not trigger a sync. The implementation checks the session manifest for evidence of meaningful activity:

- `metrics.replayEntries > 0` (tool calls were logged)
- `metrics.evidenceEntries > 0` (evidence was captured)
- `lastToolName` is set (at least one tool was used)
- `lastActivityAt` is set (any activity timestamp exists)

If none of these conditions are met, the sync is skipped and an `auto_memory_sync_skipped` event is logged instead.

## Implementation Summary

### Files Modified

- `scripts/tilldone.js` - Added auto-memory sync block after stop approval
- `scripts/claude-memory.js` - Added `quiet` option, error handling with `synced` result field
- `.env.example` - Added `EVOKORE_AUTO_MEMORY_SYNC` documentation

### Files Created

- `tests/integration/auto-memory-trigger-validation.test.ts` - Vitest integration tests
- `test-auto-memory-trigger-validation.js` - Root-level validation test
- `docs/research/m1-2-auto-memory-trigger-research-2026-03-26.md` - This document

### Hook Event Types

- `auto_memory_sync` - Sync was attempted (includes `synced` and `error` fields)
- `auto_memory_sync_skipped` - Sync was skipped due to no meaningful activity
- `auto_memory_sync_error` - Sync threw an exception (fail-safe caught it)
