# Task Plan — Phase 4 Improvement Cycle (Session 6 Complete)

## Session 6 Result (2026-04-04)
All 4 stages complete. main @ `7e11960`. No open PRs.

---

## Completed This Session

| Stage | PR | Merged | Notes |
|-------|-----|--------|-------|
| PR #220 review fixes | #220 | c0af360 | 6 Gemini findings + pre-existing test fix |
| PR #219 review fix | #219 | 0b0b203 | Phase 0 steering modes >=5 |
| Phase 4A security remainder | #222 | 68c6e91 | BUG-23,24,25,29,34,35,36,41,42 |
| Phase 4B runtime reliability | #223 | 7e11960 | BUG-05,30,38,40 |

---

## Next Work: Phase 4C CI & Observability

Branch: `fix/phase-4c-ci-observability` (fresh from main)

| ID | File | Issue | Effort |
|----|------|-------|--------|
| BUG-15 | `.github/workflows/security-scan.yml` | Trivy cache key (fixes CVE Scan CI failure) | LOW |
| BUG-16 | `.github/workflows/release.yml` | actions/checkout@v3 EOL | LOW |
| BUG-17 | `tests/global-setup.ts` | Parallel TS compilation race in CI shards | MED |
| BUG-18 | `scripts/hooks/session-replay.js` | Never logs tool_response | LOW |
| BUG-19 | `scripts/hooks/evidence-capture.js` | Never records test pass/fail | LOW |
| BUG-20 | `damage-control-rules.yaml` | DC-01 path regex narrow, no rule ID in violations | LOW |
| BUG-21 | `scripts/hooks/damage-control.js` | Scope boundary alert storm | MED |
| IMP-01 | hooks + AuditLog + Telemetry | No invocation correlation ID | MED |
| IMP-15 | `vitest.config.ts` | Zero coverage config | LOW |
| IMP-18 | `scripts/hooks/purpose-gate.js` | Any short string = valid purpose | LOW |
| IMP-19 | `scripts/hooks/repo-audit-hook-runtime.js` | Errors silently swallowed | LOW |
| BUG-09 | `src/SkillManager.ts:683-699` | extractCodeBlocks regex ReDoS | MED |

---

## Standard Phase Loop
1. Research → save to `docs/research/`
2. Implement on fresh branch
3. `npx vitest run` targeted tests + `npm run build`
4. PR → review → fix → CI green → merge
5. Update next-session.md + progress.md

## Guardrails
- `.commit-msg.txt` + `git commit -F` (not heredocs or inline -m)
- New `EVOKORE_*` env vars → `.env.example` in same PR
- Merge sequentially, not batched
- CVE Scan failure = BUG-15 (not blocking merge, but fix in Phase 4C)

## Session History
- Session 2: M0-M3 roadmap full execution (PRs #191-#206)
- Session 3: S3.1-S3.6 follow-up slices (PRs #207-#211)
- Session 4: S3.7a/b, S3.8, S3.9a/b (PRs #213-#218)
- Session 5: Phase 4A BUG-01..04 + Panel of Experts v2 + ECC feedback (PRs #219-#221)
- Session 6: PRs #219+#220 closed + Phase 4A remainder + Phase 4B (PRs #222-#223)
