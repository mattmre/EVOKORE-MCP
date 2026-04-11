# ECC Phase 2 Hooks Research

**Date:** 2026-04-11
**Session:** Task-06 — feat/ecc-phase-2
**Status:** Research complete → implementation ready

---

## Summary

Three new hooks: after-edit (PostToolUse), subagent-tracker (PostToolUse), pre-compact (PreCompact/Stop). All use the two-file pattern (scripts/hooks/<name>.js + scripts/<name>.js) via requireHookSafely.

---

## settings.json current structure

PostToolUse already has group `{ matcher: "", hooks: [...] }`. Add new hooks to that array.
PreCompact needs a new top-level key added to the `hooks` object.

All hooks always process.exit(0). No stdout output for PostToolUse/PreCompact hooks.

---

## Hook A: after-edit

**Event:** PostToolUse, matcher "" (filter Edit+Write in runtime)
**Files:** `scripts/after-edit.js` + `scripts/hooks/after-edit.js`

Behavior:
1. Parse stdin JSON `{ session_id, tool_name, tool_input, tool_response }`
2. Early-exit unless tool_name is Edit, Write, or MultiEdit
3. Extract `tool_input.file_path`
4. Sanitize session_id via `sanitizeId` from `./hook-observability`
5. Get paths via `getSessionPaths(sessionId)`
6. Count existing evidence lines → format sequential ID `E-NNN`
7. Append `{ evidence_id, type: 'edit-trace', ts, tool, file, is_error }` to evidenceLogPath
8. `writeSessionState(sessionId, { lastEditedFile: filePath, lastEditAt: ts, lastActivityAt: ts })`
9. `writeHookEvent({ hook: 'after-edit', event: 'edit_traced', session_id, file: filePath })`
10. `pruneOldSessions(SESSIONS_DIR)` (inside try/catch)
11. Always `process.exit(0)`

Use `edit-trace` evidence type (NOT `file-change` — evidence-capture already owns that).

---

## Hook B: subagent-tracker

**Event:** PostToolUse, matcher "" (filter Task tool in runtime)
**Files:** `scripts/subagent-tracker.js` + `scripts/hooks/subagent-tracker.js`

Behavior:
1. Parse stdin JSON
2. Early-exit unless `tool_name === 'Task'`
3. Extract: `tool_input.description`, `tool_input.prompt` (truncate 300), `tool_input.subagent_type`
4. `outcome = tool_response.is_error ? 'error' : 'ok'`
5. Read manifest via `readSessionState(sessionId)`
6. Build entry: `{ id: 'SA-NNN', ts, type, description, purpose, worktree: null, outcome }`
7. `writeSessionState(sessionId, { subagents: [...existing, entry], activeSubagentCount: newCount, lastSubagentAt: ts, lastActivityAt: ts })`
8. `writeHookEvent({ hook: 'subagent-tracker', event: 'subagent_traced', ... })`
9. `pruneOldSessions(SESSIONS_DIR)` (inside try/catch)
10. Always `process.exit(0)`

Also update `scripts/status-runtime.js`: add `renderSubagentsSegment(sessionState, useAnsi)` that returns `agents:N` (dim ANSI) when count > 0. Push into line3Parts after existing segments. No new file reads — manifest already loaded.

---

## Hook C: pre-compact

**Event:** PreCompact (new top-level key in settings.json hooks)
**Fallback:** Add to Stop hooks array if PreCompact is not recognized
**Files:** `scripts/pre-compact.js` + `scripts/hooks/pre-compact.js`

settings.json addition:
```json
"PreCompact": [
  { "matcher": "", "hooks": [{ "type": "command", "command": "node scripts/hooks/pre-compact.js", "timeout": 10000 }] }
]
```

Behavior:
1. Parse stdin JSON `{ session_id, trigger? }`
2. Read manifest via `readSessionState(sessionId)`
3. Read tasksPath to get open tasks (parse JSON, filter `!t.done` or `status !== 'completed'`)
4. Read tail of replayLogPath (last 20 lines) for recent tool names
5. Read tail of evidenceLogPath (last 10 lines) for recent evidence IDs
6. Build `preCompactSnapshot = { ts, purpose, trigger, incompleteTasks, recentFiles, recentEvidenceIds, lastToolName, subagentCount, lastActivityAt }`
7. `writeSessionState(sessionId, { preCompactSnapshot, preCompactAt: ts })`
8. Write sidecar: `fs.writeFileSync(sessionsDir + '/' + sessionId + '-pre-compact.json', JSON.stringify(snapshot, null, 2))`
9. `writeHookEvent({ hook: 'pre-compact', event: 'state_preserved', session_id })`
10. Always `process.exit(0)`

---

## Key file paths

- `.claude/settings.json` — add hooks wiring
- `scripts/after-edit.js` + `scripts/hooks/after-edit.js` — new
- `scripts/subagent-tracker.js` + `scripts/hooks/subagent-tracker.js` — new
- `scripts/pre-compact.js` + `scripts/hooks/pre-compact.js` — new
- `scripts/status-runtime.js` — add renderSubagentsSegment

## Imports needed in new scripts

```js
const { sanitizeId, writeHookEvent } = require('./hook-observability');
const { readSessionState, writeSessionState, getSessionPaths, SESSIONS_DIR, resolveCanonicalRepoRoot } = require('./session-continuity');
const { rotateIfNeeded, pruneOldSessions } = require('./log-rotation');
const path = require('path');
const fs = require('fs');
const os = require('os');
```

## Critical constraints

1. All hooks always process.exit(0) — never block, never throw
2. Only add to evidence JSONL, never overwrite
3. Use sanitizeId for session IDs in file paths
4. edit-trace type for after-edit (not file-change)
5. PreCompact wiring is a NEW top-level key in hooks object
6. status-runtime.js subagent segment: only when count > 0, short format
