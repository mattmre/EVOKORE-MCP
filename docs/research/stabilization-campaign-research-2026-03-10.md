# Stabilization Campaign Research — 2026-03-10

## Research Phase Summary

Five parallel research agents audited the remaining roadmap items. Findings below.

---

## 1. .env Drift Audit

**Critical:** `.gitignore` has UTF-16LE corruption starting at line 4. `mcp-research-tmp/` entry is garbled. Git likely cannot parse entries beyond the ASCII portion.

**Missing from `.env.example`:**
- `EVOKORE_MCP_CONFIG_PATH` (src/ProxyManager.ts:41)
- `VOICE_SIDECAR_PORT` (src/VoiceSidecar.ts:33)
- `VOICE_SIDECAR_DISABLE_PLAYBACK` (src/VoiceSidecar.ts:35)
- `VOICE_SIDECAR_ARTIFACT_DIR` (src/VoiceSidecar.ts:36)

**Stale:** `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` in `.env.example` are unused (acceptable as commented-out placeholders).

**Config inconsistency:** `ELEVENLABS_API_KEY` uses explicit `${VAR}` interpolation in `mcp.config.json` but `GITHUB_PERSONAL_ACCESS_TOKEN` relies on ambient `process.env` spread. Should add explicit env block.

**Test gap:** No reverse-drift test checks that `process.env.*` references in `src/` have corresponding `.env.example` entries.

---

## 2. Hook Log Rotation

**Protected:** `hooks.jsonl` has rotation at 5MB/3 copies in `hook-observability.js`.

**Unprotected (4 files):**
1. `damage-control.log` — uses non-standard `[timestamp] JSON` format
2. `{sessionId}-replay.jsonl` — highest-volume, per-session
3. `{sessionId}-evidence.jsonl` — per-session
4. `orchestration-tracker.jsonl` — single growing file

**Two problems:**
- `logs/` files grow without bound in single files
- `sessions/` files multiply per session, never cleaned

**Plan:** Extract shared `rotateFile()` from hook-observability.js, wire into all writers. Add `pruneOldSessions()` utility.

---

## 3. Cross-CLI Sync Gaps

**Well-covered:** mode flags, preserve/force semantics, idempotency, third-party server preservation.

**Testing gaps (high):**
1. No tests target `claude-code` at all
2. Cursor project-level fallback untested
3. Gemini output validation degrades to "not detected" in CI

**Testing gaps (medium):**
4. Malformed JSON recovery path
5. Missing `dist/index.js` error guard
6. `writeJsonSafe` directory creation
7. Force idempotency byte-identity

**Doc gaps:** No exit codes, no `npm run build` prerequisite note, no troubleshooting section.

---

## 4. Post-Merge Skill Validation

**Critical finding:** SkillManager traverses only 2 directory levels. Only ~47 skills are indexed, not ~290.

The 290 figure counts all markdown files including deeply nested orchestration framework content. Only parent SKILL.md files at `SKILLS/{category}/{skill}/SKILL.md` are indexed.

For orchestration: 12 top-level skills indexed out of 82+ files. Individual `orch-*` commands are invisible to `search_skills`.

**Decision needed:** Make `loadSkills()` recursive OR accept parent SKILL.md as proxy indexes for children.

**Test gaps:** No search quality tests, no `resolve_workflow` tests, no `get_skill_help` tests for orchestration skills.

---

## 5. Tracker Archival

- `ORCHESTRATION_TRACKER.md`: 403 lines, 370 archivable (12 historical execution logs)
- `PRIORITY_STATUS_MATRIX.md`: 90 lines, 7 historical evidence refresh sections archivable
- No `docs/archive/` directory exists yet

**Plan:** Create archive dir, move historical content, leave templates and current-state summaries.

---

## 6-8. Already Complete

- **Empty skill directory:** Already gone from `main` — no action needed
- **Voice sidecar live test:** Comprehensive and properly gated (PR #67)
- **PR #68:** Merged 2026-03-06
