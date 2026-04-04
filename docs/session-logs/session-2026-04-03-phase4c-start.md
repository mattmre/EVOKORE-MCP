# Session Log: Phase 4C Start — CI & Observability
**Date:** 2026-04-03  
**Branch:** `fix/phase-4c-ci-observability` (to be created from main @ `4f0ddec`)  
**Scope:** Phase 4C — 12 items from `docs/research/repo-review-2026-04-03.md`  
**Session Purpose:** Implement Phase 4C CI & Observability fixes, create PR, review, merge

---

## Crash-Recovery Anchor

If this session crashes, resume from:
1. Check `git status` — if branch `fix/phase-4c-ci-observability` exists with uncommitted work, pick up from last completed task group.
2. Task tracker: Session tasks #1–#7 in the session task list.
3. Commit any partial work, then proceed with the next unfinished group below.

---

## Phase 4C: Items In Scope

| ID | File | Issue | Effort | Group |
|----|------|-------|--------|-------|
| BUG-15 | `.github/workflows/security-scan.yml` | Trivy cache key = run_id (always miss) | LOW | CI-workflows |
| BUG-16 | `.github/workflows/release.yml` | actions/checkout@v3 EOL + contents:write too broad | LOW | CI-workflows |
| BUG-17 | `tests/global-setup.ts` + `ci.yml` | Parallel tsc race across CI shards | MED | CI-workflows |
| BUG-18 | `scripts/hooks/session-replay.js` | Never logs tool_response outputs | LOW | Hook-observability |
| BUG-19 | `scripts/hooks/evidence-capture.js` | Never records test pass/fail | LOW | Hook-observability |
| IMP-01 | hooks + AuditLog + Telemetry | No invocation correlation ID | MED | Hook-observability |
| BUG-20 | `damage-control-rules.yaml` + hook | DC-26 gap, DC-01 too narrow, no rule_id in logs | LOW | Damage-control |
| BUG-21 | `scripts/hooks/damage-control.js` | Scope boundary alert storm | MED | Damage-control |
| IMP-15 | `vitest.config.ts` | Zero coverage configuration | LOW | Tooling |
| IMP-18 | `scripts/hooks/purpose-gate.js` | Any short string = valid purpose | LOW | Tooling |
| IMP-19 | `scripts/hooks/repo-audit-hook-runtime.js` | Errors silently swallowed | LOW | Tooling |
| BUG-09 | `src/SkillManager.ts:683-699` | extractCodeBlocks regex ReDoS | MED | Tooling |

---

## Implementation Groups (sequential within branch)

### Group 1 — CI Workflows (BUG-15, BUG-16, BUG-17)
- BUG-15: `security-scan.yml` — change Trivy cache key from `trivy-db-${{ github.run_id }}` to `trivy-db-${{ steps.date.outputs.week }}` (add `date +%Y-%V` step). Apply to all 4 jobs.
- BUG-16: `release.yml` — `actions/checkout@v3` → `@v4`. Move `contents: write` permission from job level to only the "Create GitHub Release" step.
- BUG-17: `ci.yml` — add `build` job that runs `npx tsc`, uploads `dist/` as artifact. `test` matrix jobs download artifact before running. Remove `execSync('npx tsc')` from `tests/global-setup.ts`.

### Group 2 — Hook Observability (BUG-18, BUG-19, IMP-01)
- BUG-18: `session-replay.js` — in PostToolUse handler, add `outcome` (`error`/`ok`) and `output` (first 300 chars of `payload.tool_response?.content?.[0]?.text`) to each entry.
- BUG-19: `evidence-capture.js` — add `exit_code: payload.tool_response?.metadata?.exit_code ?? null` and `passed: payload.tool_response?.is_error !== true` to evidence entries.
- IMP-01: In `damage-control.js` PreToolUse handler, generate `invocation_id = crypto.randomBytes(6).toString('hex')`. Inject into `env.EVOKORE_INVOCATION_ID`. In `AuditLog.ts`, read `process.env.EVOKORE_INVOCATION_ID` and include in every log entry.

### Group 3 — Damage Control (BUG-20, BUG-21)
- BUG-20: `damage-control-rules.yaml` — add tombstone for DC-26. Widen DC-01 pattern to match `rm -f <filename>` without directory separator. In `damage-control.js`, emit `rule_id` in every `logViolation` call.
- BUG-21: `damage-control.js` scope boundary — apply only cross-project-root paths, min 5-char keywords, ≥2 match threshold, per-session rate limit of 3 asks.

### Group 4 — Tooling (IMP-15, IMP-18, IMP-19, BUG-09)
- IMP-15: `vitest.config.ts` — add `coverage` config block with thresholds (branches:70, functions:70, lines:75, statements:75).
- IMP-18: `purpose-gate.js` — validate purpose length ≥10 chars, show warning if too short.
- IMP-19: `repo-audit-hook-runtime.js` — wrap main execution in try/catch, log structured error to stderr on failure.
- BUG-09: `src/SkillManager.ts:683-699` — replace `` /```(\w*)\n([\s\S]*?)```/g `` with stateful line-by-line fence parser.

---

## PRs
- Phase 4C: single PR `fix/phase-4c-ci-observability` → `main`

## Guardrails
- `.commit-msg.txt` + `git commit -F` approach
- New EVOKORE_* env vars → `.env.example` in same PR
- `npx vitest run` before push
- Merge sequentially
- No heredocs in git commit
