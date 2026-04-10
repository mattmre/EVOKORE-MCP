# ECC Claims Verification — 2026-04-10

**Scope:** ECC Tier 1 item [12] — spot-check ~10 highest-impact claims against current EVOKORE-MCP source code.
**Methodology:** Read source files directly; note file path and line number for each verification.
**Assessors:** Claude Code (automated) + researcher panel pass.

---

## Summary

| Status | Count |
|---|---|
| Verified | 8 |
| Stale | 1 |
| Missing from docs | 8 |
| Soft (needs re-measurement) | 1 |

---

## Verified Claims

### V-01: Hook count is 7
**Claim:** "Seven hooks are wired in `.claude/settings.json`" (CLAUDE.md, Claude Code Hooks section).
**Evidence:** `.claude/settings.json` defines exactly 7 hook entries: PreToolUse (damage-control.js), UserPromptSubmit (purpose-gate.js, repo-audit-hook.js), PostToolUse (session-replay.js, evidence-capture.js), Stop (tilldone.js, voice-stop.js).
**Status:** VERIFIED

### V-02: Read is in damage-control matcher
**Claim:** "ECC Tier 0 [13]: Read was already in damage-control matcher (pre-existing)" (next-session.md line 26).
**Evidence:** `.claude/settings.json` line 9 — `"matcher": "Bash|Edit|Write|Read"`.
**Status:** VERIFIED

### V-03: 10 webhook event types
**Claim:** "10 event types (tool_call, tool_error, session_start, session_end, session_resumed, approval_requested, approval_granted, plugin_loaded, plugin_unloaded, plugin_load_error)" (CLAUDE.md).
**Evidence:** `src/WebhookManager.ts:10-33` defines exactly these 10 types in `WebhookEventType` union and `WEBHOOK_EVENT_TYPES` array.
**Status:** VERIFIED

### V-04: Recursive skill indexing
**Claim:** "`SkillManager.loadSkills()` is recursive now" (CLAUDE.md).
**Evidence:** `src/SkillManager.ts:278-355` — `walkDirectory()` recurses into subdirectories with `MAX_DEPTH = 5` (line 31) and calls itself at line 352.
**Status:** VERIFIED

### V-05: RBAC roles (admin, developer, readonly)
**Claim:** "Role-based permission model with `admin`, `developer`, `readonly` roles. Activated via `EVOKORE_ROLE` env var." (CLAUDE.md).
**Evidence:** `permissions.yml:15-46` defines exactly these 3 roles. `src/SecurityManager.ts:56` reads `process.env.EVOKORE_ROLE`. Flat-permission fallback at `src/SecurityManager.ts:108-118`.
**Status:** VERIFIED

### V-06: Per-session state isolation
**Claim:** "Each connection gets independent tool activation state and session context. Configurable TTL via `EVOKORE_SESSION_TTL_MS`." (CLAUDE.md).
**Evidence:** `src/SessionIsolation.ts:25-46` — `SessionState` has `activatedTools`, `role`, `rateLimitCounters`, `metadata`. TTL env var read at line 68-70. Default 1h (`DEFAULT_SESSION_TTL_MS = 3_600_000`). LRU eviction at `DEFAULT_MAX_SESSIONS = 100` (line 72).
**Status:** VERIFIED with documentation gap: the 100-session LRU cap and LRU eviction are not mentioned in CLAUDE.md's session isolation bullet.

### V-07: HTTP/SSE transport on EVOKORE_HTTP_PORT (default 3100) and 127.0.0.1
**Claim:** "`src/HttpServer.ts` serves MCP over HTTP with SSE streaming. Listens on `EVOKORE_HTTP_PORT` (default 3100) and `EVOKORE_HTTP_HOST` (default 127.0.0.1)." (CLAUDE.md).
**Evidence:** `src/HttpServer.ts:5` imports `StreamableHTTPServerTransport`. `src/HttpServer.ts:63` reads `EVOKORE_HTTP_PORT`.
**Status:** VERIFIED

### V-08: SkillManager native tool count = 11
**Claim:** "11 in SkillManager" (CLAUDE.md native tool count line).
**Evidence:** `src/SkillManager.ts:812` — `getTools()` returns exactly 11 tools: docs_architect, skill_creator, resolve_workflow, search_skills, get_skill_help, discover_tools, proxy_server_status, refresh_skills, fetch_skill, list_registry, execute_skill.
**Status:** VERIFIED

---

## Stale Claims

### S-01: Total native tool count is 14
**Claim:** "14 built-in tools" (CLAUDE.md line ~99, docs/ECC-INTEGRATION-PLAN.md lines 39 and 88).
**Reality:** Track A (Session 10, PR #235, merged 2026-04-10) added `NavigationAnchorManager` (+2 tools) and `SessionAnalyticsManager` (+3 tools). Actual count: 11 + 2 + 1 + 2 + 3 = **19**.
**Root cause:** ECC Tier 0 [11] corrected the count to 14 in Session 9, but the Session 10 sprint that added 5 new tools did not update the docs.
**Fix applied:** CLAUDE.md and ECC-INTEGRATION-PLAN.md updated in this commit (docs/ecc-tier1 branch).
**Status:** STALE -> FIXED in this PR

---

## Soft Claims (re-measurement needed)

### SOFT-01: "Roughly 336 skills"
**Claim:** "The merged index currently covers roughly 336 skills/files" (CLAUDE.md).
**Evidence:** Recursion is verified (V-04), but the count was not re-measured in this pass. CLAUDE.md uses "roughly" which is a soft qualifier.
**Action:** Run the EVOKORE server with `EVOKORE_TELEMETRY=false` and capture the startup log output `[EVOKORE] Skill stats: N skills` to get the exact current count. Update the "roughly 336" claim with a dated exact figure.
**Status:** UNVERIFIED (soft qualifier, not a blocking stale)

---

## Missing from Documentation

The following capabilities exist in `src/` but are absent from CLAUDE.md's runtime-additions section:

| ID | Capability | Source file | Gap |
|---|---|---|---|
| M-01 | NavigationAnchorManager (nav_get_map, nav_read_anchor) | `src/NavigationAnchorManager.ts` | Added Session 10; not in CLAUDE.md before this fix |
| M-02 | SessionAnalyticsManager (session_context_health, session_analyze_replay, session_work_ratio) | `src/SessionAnalyticsManager.ts` | Added Session 10; not in CLAUDE.md before this fix |
| M-03 | ToolCatalogIndex | `src/ToolCatalogIndex.ts` | Referenced in index.ts but undescribed |
| M-04 | AuditExporter | `src/AuditExporter.ts` | Part of telemetry export path; undescribed |
| M-05 | ContainerSandbox | `src/ContainerSandbox.ts` | Referenced by execute_skill; undescribed |
| M-06 | TTSProvider / STTProvider | `src/TTSProvider.ts`, `src/STTProvider.ts` | VoiceSidecar described; providers not |
| M-07 | TelemetryExporter | `src/TelemetryExporter.ts` | SEC-04 note mentions it; v3.0 additions paragraph does not |
| M-08 | WebSocket approval lifecycle events (approval_acknowledged, approval_denied) | `src/SecurityManager.ts:22-26` | Distinct from webhook events; dashboard paragraph should reference |

Items M-01 and M-02 are **fixed in this PR** (new CLAUDE.md bullets added). Items M-03 through M-08 are tracked as follow-up documentation debt.

---

## Notes on Security / Authority Model

See `docs/authority-precedence-design.md` for findings on the native-tool permission bypass and OAuth->session-role gap.

---

## Verification Date: 2026-04-10
## Verified by: Automated source read + researcher pass
## Next re-verification: After next major feature sprint
