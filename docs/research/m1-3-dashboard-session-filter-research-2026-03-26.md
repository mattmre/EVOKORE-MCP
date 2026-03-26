# M1.3 Dashboard Session-Filter Alignment Research

**Date:** 2026-03-26
**Milestone:** M1 - Runtime Continuity
**Status:** Implemented

## Problem

The EVOKORE session dashboard (`scripts/dashboard.js`) only reads hook-side
sessions from `~/.evokore/sessions/`. HTTP transport sessions persisted by
`FileSessionStore` in `~/.evokore/session-store/` are invisible to operators.

## Session Sources

### Hook-Side Sessions (`~/.evokore/sessions/{id}.json`)

Written by `session-continuity.js` and updated by all five Claude Code hooks.
Schema includes:

- `purpose`, `status`, `created`, `createdAt`, `updatedAt`
- `lastActivityAt`, `lastPromptAt`, `lastReplayAt`, `lastEvidenceAt`
- `artifacts` (paths to replay/evidence/tasks files)
- `metrics` (replayEntries, evidenceEntries, totalTasks, incompleteTasks)
- Rich lifecycle state from hook interactions

### HTTP Transport Sessions (`~/.evokore/session-store/{id}.json`)

Written by `FileSessionStore` (via `SessionIsolation`). Schema reflects
`SerializedSessionState`:

- `sessionId`, `createdAt`, `lastAccessedAt`
- `activatedTools` (string array), `role` (string or null)
- `rateLimitCounters` (object), `metadata` (object)
- No purpose, no replay/evidence paths

## Design Decisions

### 1. Unified Normalized Schema

Both session types are normalized to a common shape:

```javascript
{
  id: string,
  type: 'hook' | 'http',
  createdAt: string | number | null,
  lastActivity: string | number | null,
  status: string | null,
  purpose: string | null,
  replayCount: number,
  evidenceCount: number,
  metadata: object  // type-specific extra fields
}
```

HTTP sessions have `purpose: null` and zero replay/evidence counts since those
concepts do not apply to HTTP transport sessions.

### 2. Deduplication Strategy

If the same session ID appears in both directories, the hook-side entry is
preferred because it contains richer metadata (purpose, replay, evidence,
lifecycle state). The HTTP entry is dropped silently.

### 3. HTTP Session Status Derivation

HTTP sessions do not have an explicit `status` field. Status is derived from
the session TTL: if `(now - lastAccessedAt) > TTL`, the session is `expired`;
otherwise it is `active`. The TTL respects `EVOKORE_SESSION_TTL_MS` (default
1 hour), matching `SessionIsolation`'s default.

### 4. Type Filter

A new `?type=hook` or `?type=http` query parameter allows filtering the
session list by source. This is applied after merging and deduplication.

### 5. `/api/sessions/types` Endpoint

Returns summary counts: `{ hook: N, http: M, total: N+M }`. Useful for
dashboards and monitoring. The counts reflect unique sessions after
deduplication.

### 6. Route Ordering

The `/api/sessions/types` route is registered before `/api/sessions` to prevent
the latter from matching the `/types` suffix as a session ID path.

## Files Modified

- `scripts/dashboard.js` - Core session listing, API routes, HTML frontend
- `tests/integration/dashboard-session-filter-validation.test.ts` - Validation tests

## Testing Approach

Source-code validation tests verify:
- Both directories are scanned
- Type field is set correctly per source
- Normalization produces consistent fields
- Deduplication prefers hook-side
- Filters (type, status, since) apply to merged list
- Frontend has type filter dropdown and badges
- Zero-dependency constraint preserved
