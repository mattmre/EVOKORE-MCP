# Phase 4E Implementation Plan — MCP Spec Alignment
**Date:** 2026-04-03  
**Source:** `docs/research/repo-review-2026-04-03.md` (8-panel expert review)  
**Branch:** `fix/phase-4e-mcp-spec` from `main` (after Phase 4D merge)

---

## Items In Scope

| ID | Severity | File(s) | Summary |
|----|----------|---------|---------|
| BUG-22 | HIGH | `src/SkillManager.ts` + `src/index.ts` | discover_tools readOnlyHint misleading annotation |
| BUG-26 | MED | `src/WebhookManager.ts` | verifySignature `\|\|` vs `??` + no guard on large maxAgeMs |
| BUG-27 | MED | `src/TelemetryExporter.ts` | getMetrics() called twice in buildPayload |
| BUG-28 | MED | Integration test files | Source-text scraping — scope to worst offender |
| IMP-03 | — | `src/SkillManager.ts` | search_skills query parameter missing description |
| IMP-04 | — | `src/SkillManager.ts` | fetch_skill generic error messages |
| IMP-05 | HIGH | `docs/SETUP.md` | 8+ env variable sections undocumented |
| IMP-07 | MED | `scripts/log-rotation.js` | Log rotation errors silently swallowed |

---

## Group 1 — Code Fixes (BUG-22, BUG-26, BUG-27, IMP-03, IMP-04, IMP-07)

### BUG-22: discover_tools readOnlyHint
**File:** `src/SkillManager.ts` — discover_tools tool definition (around line 923)

Current: `readOnlyHint: false` — misleads clients in legacy mode where tool is purely observational.  
**Fix:** Keep `readOnlyHint: false` (conservative for dynamic mode). Update the tool `description` field to explicitly document dual behavior:
```
"Lists available tools. In 'legacy' mode (default), this is read-only — no state is modified. In 'dynamic' mode (EVOKORE_TOOL_DISCOVERY_MODE=dynamic), calling this tool activates listed tools for the current session. Set readOnlyHint: false conservatively to prevent unintended auto-approval in dynamic mode."
```
Also ensure `destructiveHint: false` is present.

### BUG-26: WebhookManager verifySignature || vs ??
**File:** `src/WebhookManager.ts`, `verifySignature` method (around line 205-226)

**Fix 1:** Replace `||` with `??` on the maxAgeMs fallback:
```typescript
// OLD:
const windowSeconds = (maxAgeMs || WebhookManager.REPLAY_WINDOW_MS) / 1000;
// NEW:
const windowSeconds = (maxAgeMs ?? WebhookManager.REPLAY_WINDOW_MS) / 1000;
```

**Fix 2:** Add an upper-bound guard (cap at 1 hour = 3,600,000 ms) with a warning:
```typescript
const effectiveMaxAge = maxAgeMs ?? WebhookManager.REPLAY_WINDOW_MS;
if (effectiveMaxAge > 3_600_000) {
  console.warn(`[WebhookManager] verifySignature maxAgeMs=${effectiveMaxAge} exceeds 1 hour — clamped to 3600000ms`);
}
const windowSeconds = Math.min(effectiveMaxAge, 3_600_000) / 1000;
```

**Fix 3:** Add JSDoc to `verifySignature` documenting that `timestamp` is Unix epoch in seconds and `maxAgeMs` is in milliseconds.

### BUG-27: TelemetryExporter double getMetrics()
**File:** `src/TelemetryExporter.ts`, `buildPayload()` method (around line 162-170)

**Fix:** Call `getMetrics()` once:
```typescript
buildPayload(): TelemetryExportPayload {
  const metrics = this.telemetryManager.getMetrics();
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    event: "telemetry_export",
    version: metrics.telemetryVersion,
    metrics,
    instanceId: this.instanceId,
  };
}
```

### IMP-03: search_skills query description
**File:** `src/SkillManager.ts`, search_skills tool inputSchema (around line 878)

**Fix:** Add description to query property:
```typescript
query: {
  type: "string",
  description: "Keywords or natural-language query to search skill names, descriptions, tags, and categories. Returns up to 15 results by relevance."
}
```

Also add description to `skill_name` in `get_skill_help` inputSchema if missing.

### IMP-04: fetch_skill error categorization
**File:** `src/SkillManager.ts`, `fetch_skill` catch block (around line 1230)

**Fix:** Categorize errors with actionable hints:
```typescript
} catch (error: any) {
  const msg = error.message || String(error);
  let hint = "";
  if (msg.includes("HTTP 404")) {
    hint = " Hint: for GitHub files, use the raw.githubusercontent.com URL.";
  } else if (msg.includes("HTTP 403") || msg.includes("HTTP 401")) {
    hint = " Hint: the resource may be private or require authentication.";
  } else if (msg.includes("timed out")) {
    hint = " Hint: the server did not respond — check the URL and your network.";
  } else if (msg.toLowerCase().includes("invalid") && msg.toLowerCase().includes("format")) {
    hint = " Hint: the file must be Markdown with YAML frontmatter (---).";
  }
  return {
    content: [{ type: "text", text: "Failed to fetch skill: " + msg + hint }],
    isError: true
  };
}
```

### IMP-07: Log rotation error observability
**File:** `scripts/log-rotation.js`

Find all bare `catch {}` blocks in `rotateIfNeeded()` and `pruneOldSessions()`. Replace with structured logging (without breaking fail-safe contract):
```js
} catch (err) {
  try {
    process.stderr.write('[EVOKORE] Log rotation error for ' + filePath + ': ' + (err && err.message || String(err)) + '\n');
  } catch { /* final safety net — never throw from rotation path */ }
}
```
Apply to all 4 catch sites (2 in rotateIfNeeded, 2 in pruneOldSessions).

---

## Group 2 — Docs: SETUP.md (IMP-05)

**File:** `docs/SETUP.md`

Add a comprehensive "Environment Variables Reference" section. Group into subsections:

1. **Core** (already documented: PORT, LOG_LEVEL, etc.)
2. **Session Storage** — EVOKORE_SESSION_STORE, EVOKORE_SESSION_TTL_MS, EVOKORE_REDIS_URL, EVOKORE_REDIS_KEY_PREFIX
3. **Webhooks** — EVOKORE_WEBHOOKS_ENABLED, EVOKORE_WEBHOOKS_ALLOW_PRIVATE
4. **Plugins** — EVOKORE_PLUGINS_DIR
5. **Telemetry** — EVOKORE_TELEMETRY, EVOKORE_TELEMETRY_EXPORT, _URL, _INTERVAL_MS, _SECRET
6. **Audit** — EVOKORE_AUDIT_LOG, EVOKORE_AUDIT_EXPORT, _URL, _INTERVAL_MS, _SECRET, _BATCH_SIZE
7. **Security** — EVOKORE_SECURITY_DEFAULT_DENY, EVOKORE_ROLE
8. **OAuth/Auth** — EVOKORE_AUTH_MODE, EVOKORE_OAUTH_ISSUER, _AUDIENCE, _JWKS_URI
9. **HTTP Transport** — EVOKORE_HTTP_PORT, EVOKORE_HTTP_HOST, EVOKORE_SESSION_TTL_MS
10. **Sandbox** — EVOKORE_SANDBOX_MODE, _MEMORY_MB, _CPU_LIMIT, _PREPULL, _SECCOMP_PROFILE
11. **Dashboard/WebSocket** — EVOKORE_DASHBOARD_TOKEN, EVOKORE_WS_APPROVALS_ENABLED, etc.
12. **Hooks** — EVOKORE_REPO_AUDIT_HOOK, EVOKORE_SKILL_WATCHER

Use a table format: `| Variable | Default | Description |` — reference `.env.example` as the source of truth.

---

## Group 3 — Test Conversion: BUG-28 (scope: websocket-hitl-validation.test.ts)

**Scope:** Convert `tests/integration/websocket-hitl-validation.test.ts` only. This is 100% source-scraping (0 behavioral tests) and is the worst offender.

**Strategy:**
- Source-structure assertions that check for function existence → convert to `import { fn } from 'dist/HttpServer'` + `expect(typeof fn).toBe('function')`
- Assertions checking for specific strings → add `// TODO BUG-28: convert to behavioral test` comment and keep the assertion (reducing scope)
- For the WebSocket connection tests: convert 3-5 key tests to use actual WebSocket connections

**Conservative approach for Phase 4E:**
- Add `// BUG-28: source-scraping test — TODO convert to behavioral` to the describe block
- Convert only the tests that check for method existence (easiest: use dist imports)
- Keep remaining source-scraping tests marked but working (do not break CI)

---

## Implementation Order

```
Parallel (no conflicts):
  Agent A: BUG-27 + IMP-03 + IMP-07 + IMP-04 (all quick/medium, different areas)
  Agent B: BUG-22 + BUG-26 (SkillManager annotation + WebhookManager)
  
Sequential (after agents):
  IMP-05: SETUP.md env var docs (docs-only, no conflicts)
  BUG-28: websocket-hitl-validation.test.ts conversion (scoped)
```

---

## New Env Vars for .env.example
None required for Phase 4E.

---

## Risks
| Risk | Mitigation |
|------|-----------|
| BUG-26: `??` change breaks callers passing `0` deliberately | `0` is a new valid value (reject all timestamps); safer behavior |
| BUG-26: clamping at 1 hour changes behavior for large values | Large maxAgeMs was already a security problem; warn+clamp is correct |
| BUG-28: converting source-scraping tests may break CI if dist not built | Use `src/` path for import checks, not `dist/` |
| IMP-05: SETUP.md docs must match current behavior | Cross-check against .env.example before writing |
