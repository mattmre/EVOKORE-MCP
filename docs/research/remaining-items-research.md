# Remaining Priority Items — Research Report

- **Date:** 2026-02-26
- **Researcher:** Agent 3 (Items 8-15 Assessment)
- **Status:** Complete

## Item 8: .env Drift Audit
- **State:** `.env` is gitignored (line 1 of `.gitignore`). `.gitignore` has UTF-16 BOM encoding issue.
- **Variable drift:** `.env` uses `GITHUB_PERSONAL_ACCESS_TOKEN`, `.env.example` uses `GITHUB_PAT`
- **Stale vars:** `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` in `.env.example` not consumed anywhere
- **Missing:** `.env` missing `ELEVENLABS_API_KEY` referenced by `mcp.config.json`
- **Effort:** Small
- **Action:** Reconcile variable names, fix .gitignore encoding, enhance env sync test

## Item 10: Implementation Integrity Gate Skill
- **State:** Directory exists but is EMPTY. Zero references in codebase.
- **Effort:** Medium (define purpose, write SKILL.md) or Small (delete empty dir)
- **Action:** Create skill based on naming pattern (pre-merge gate requiring requirement traceability + functional proof) or remove empty directory

## Item 11: dist/utils/ and src/utils/ Status
- **State:** ALREADY COMMITTED TO MAIN after sync (commit `8ee61d7`)
- **Effort:** None — resolved
- **Action:** No action needed

## Item 12: Hook Observability Production Hardening
- **State:** `hook-observability.js` functional with JSONL telemetry. No log rotation.
- **Gaps:** Unbounded log growth, no retention policy, no viewer for hooks.jsonl
- **Effort:** Medium
- **Action:** Add log rotation (5MB max, 3 rotations), optional viewer script

## Item 13: Voice Sidecar Live-Provider Integration Test
- **State:** Smoke test uses fake API key (validates startup/shutdown only)
- **Gap:** No live ElevenLabs API validation
- **Cost concern:** Each test consumes API credits (free tier: 10K chars/month)
- **Effort:** Medium
- **Action:** Create opt-in test gated by `ELEVENLABS_API_KEY` presence, separate `npm run test:voice:live` script

## Item 14: Cross-CLI Sync End-to-End Validation
- **State:** Good isolated tests for mode/preserve behavior. Missing edge cases.
- **Gaps:** No Cursor fallback test, no Gemini output validation, no idempotency test, docs gap
- **Effort:** Medium
- **Action:** Add edge case tests, update CLI_INTEGRATION.md to document sync workflow

## Item 15: Orchestration Tracker/Docs Maintenance
- **State:** Tracker at 250 lines with 7 execution logs. All 15 priorities done.
- **Gaps:** Needs archival, next-session content is stale (references merged PR chains)
- **Effort:** Small-Medium
- **Action:** Archive old logs, update next-session.md, transition matrix to monitoring posture

## Recommended Execution Order
1. Item 8 (security-critical)
2. Item 15 (keeps docs healthy)
3. Item 14 (closes test gaps)
4. Item 12 (production hardening)
5. Item 13 (nice-to-have)
6. Item 10 (decide keep-or-delete)
