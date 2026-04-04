# Next Session Priorities

Last Updated (UTC): 2026-04-04

## Current Handoff State
- **Active branch:** `main` (clean — all PRs merged)
- **HEAD:** `7e11960`
- **Open PRs:** None
- **Worktrees:** Root checkout only (all stale worktrees cleaned)

## THIS SESSION: Phase 4A Remainder + Phase 4B Complete (2026-04-04)

### PRs Merged This Session
- PR #220 (Panel of Experts v2, 27 panels/119+ experts) — 6 Gemini findings + test fix, merged `c0af360`
- PR #219 (ECC cascade feedback) — steering modes >=3 → >=5, merged `0b0b203`
- PR #222 (Phase 4A security remainder, BUG-23,24,25,29,34,35,36,41,42), merged `68c6e91`
- PR #223 (Phase 4B runtime reliability, BUG-05,30,38,40), merged `7e11960`

### Key Decisions This Session
- BUG-34: default-deny via `EVOKORE_SECURITY_DEFAULT_DENY=true` opt-in (cascade broke proxy tests)
- BUG-35: SSRF block adds IPv4-mapped IPv6 (`::ffff:`) after reviewer found bypass
- BUG-36: AuditLog enabled-by-default (opt-out `EVOKORE_AUDIT_LOG=false`)
- BUG-05: Redis SessionIsolation init moved to `loadSubsystems()` (awaited, pre-request)
- BUG-30: `loadServers()` atomic swap (builds new registry in temp vars before swap)
- BUG-38: `reconnectServer()` per-server with `reconnecting` Set guard

---

## PHASE 4 — Remaining Roadmap

### Phase 4A — COMPLETE (PR #221 + PR #222)
### Phase 4B — COMPLETE (PR #223)
Deferred Phase 4B remainder (14 LOW/MED bugs): BUG-06,07,08,09,10,11,12,13,14,31,32,33,37,39

### Phase 4C — CI & Observability (NEXT RECOMMENDED)
Fresh branch `fix/phase-4c-ci-observability` from main.

| ID | File | Issue | Effort |
|----|------|-------|--------|
| BUG-15 | `.github/workflows/security-scan.yml` | Trivy cache key — fixes persistent CVE Scan failure | LOW |
| BUG-16 | `.github/workflows/release.yml` | actions/checkout@v3 EOL + overly broad contents: write | LOW |
| BUG-17 | `tests/global-setup.ts` | Parallel TS compilation race across CI shards | MED |
| BUG-18 | `scripts/hooks/session-replay.js` | Never logs tool_response — no outcomes | LOW |
| BUG-19 | `scripts/hooks/evidence-capture.js` | Never records test pass/fail from tool_response | LOW |
| BUG-20 | `damage-control-rules.yaml` | DC-01 path regex too narrow, no rule ID in violations | LOW |
| BUG-21 | `scripts/hooks/damage-control.js` | Scope boundary fires alert storm on every in-repo access | MED |
| IMP-01 | hooks + AuditLog + Telemetry | No invocation correlation ID across layers | MED |
| IMP-15 | `vitest.config.ts` | Zero coverage configuration | LOW |
| IMP-18 | `scripts/hooks/purpose-gate.js` | Any short string becomes permanent session purpose | LOW |
| IMP-19 | `scripts/hooks/repo-audit-hook-runtime.js` | Errors silently swallowed | LOW |
| BUG-09 | `src/SkillManager.ts:683-699` | extractCodeBlocks regex ReDoS-vulnerable | MED |

### Phase 4D — DX & Performance (after 4C)
### Phase 4E — MCP Spec Alignment
See `docs/research/repo-review-2026-04-03.md` for full lists.

---

## How to Start Phase 4C

> "Start Phase 4C of the EVOKORE-MCP improvement cycle. Load `docs/research/repo-review-2026-04-03.md` and implement Phase 4C CI/observability fixes on fresh branch `fix/phase-4c-ci-observability` from `main`."

---

## Guardrails (carry forward)
- CVE Scan failure in CI = BUG-15 (Trivy cache miss) — Phase 4C priority #1
- `.commit-msg.txt` + `git commit -F` (not heredocs)
- New `EVOKORE_*` env vars → `.env.example` in same PR
- `npx vitest run` locally before pushing
- Merge PRs sequentially (not batch)
- Research → `docs/research/` per stage

## New env vars (added this session, documented in .env.example)
- `EVOKORE_SECURITY_DEFAULT_DENY=true` — opt-in deny-by-default for unknown tools
- `EVOKORE_WEBHOOKS_ALLOW_PRIVATE=true` — allow private/loopback webhook targets (dev only)
- `EVOKORE_AUDIT_LOG=false` — disable audit logging (now ENABLED by default)
