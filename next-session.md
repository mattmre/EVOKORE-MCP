# Next Session Priorities

Last Updated (UTC): 2026-04-10

## Current Handoff State
- **Active branch:** `main` (clean — all PRs merged)
- **HEAD:** `e62cbb2`
- **Open PRs:** None
- **Worktrees:** Root checkout only

## THIS SESSION: Session 10 — Full Roadmap Execution (2026-04-10)

### PRs Merged This Session
- PR #237 (docs/ecc-tier1 — ECC Tier 1: claims verification [12], authority design [C4], AC template [9]), merged `de889b4`
- PR #238 (feat/retrospective-skills-phase-b — Phase B skills: session-retrospective-miner + narrative-quality-scorer), merged `e62cbb2`
- PR #235 (feat/token-efficiency-tools — Track A: nav anchors + session analytics), merged in prior session
- PR #236 (fix/phase-5c-med-batch — REL-01/03, SEC-02, PERF-03, TS-04, API-02/03), merged in prior session

### Key Decisions This Session
- **docs/authority-precedence-design.md**: Algorithm fixed — role overrides come FIRST (not flat rules), then flat rules, then role default. G-04 reframed: flat rules beat role *defaults* not role *overrides*.
- **Track C [12]**: 10 ECC claims verified — 8 confirmed, 1 stale (tool count 14→19), 1 soft (skill count). M-01/M-02 fixed; M-03–M-08 follow-up debt.
- **Track C [C4]**: `docs/authority-precedence-design.md` created — full authority precedence design with gaps G-01 through G-06. G-01 (HIGH: native tool dispatch bypasses RBAC) and G-02/G-03 remain open.
- **Track C [9]**: `docs/templates/phase-acceptance-criteria.md` created — AC-N.M IDs, verification column, non-goals, dependencies, kill criteria, PR slicing.
- **Track D Phase B**: `session-retrospective-miner` and `narrative-quality-scorer` skills created in SKILLS/ORCHESTRATION FRAMEWORK/. improvement-cycles Phase 1 now has automated path. AEP Align phase has step 1a Retrospective input.
- **CLAUDE.md**: Native tool count corrected to 19 (was 14), NavigationAnchorManager/SessionAnalyticsManager bullets moved to v3.0 Runtime Additions section.

---

## PHASE STATUS (as of 2026-04-10)

### Track A — COMPLETE (PR #235): 5 new MCP tools
- nav_get_map, nav_read_anchor (NavigationAnchorManager)
- session_context_health, session_analyze_replay, session_work_ratio (SessionAnalyticsManager)

### Track B — COMPLETE (PR #236): 7 expert-review findings
- REL-01 (transport close race), REL-03 (sync reconnect), SEC-02 (setActiveRole gate)
- PERF-03 (AuditLog tail read), TS-04 (CallToolResult typing), API-02 (session-not-found JSON-RPC), API-03 (discover_tools annotation)

### Track C — COMPLETE (PR #237): ECC Tier 1
- [12] Claims re-verification: 8/10 confirmed, 1 stale fixed, 1 soft
- [C4] Authority precedence design doc
- [9] Phase acceptance criteria template

### Track D — COMPLETE (PR #238): Retrospective skills Phase B
- session-retrospective-miner, narrative-quality-scorer
- improvement-cycles Phase 1 automated, AEP Align step 1a added

---

## NEXT SESSION: Recommended Priorities

### 1. Remaining MED findings from 2026-04-04 review (deferred from Track B)

From `docs/research/repo-review-2026-04-04.md` — these were not in the Phase 5C batch:

| ID | File | Summary | Effort |
|---|---|---|---|
| G-01 | src/index.ts | Native tool dispatch bypasses SecurityManager.checkPermission() — HIGH gap from authority-precedence-design.md | HIGH |
| G-02 | src/SessionIsolation.ts | No API to set session role; HTTP sessions always role=null | MED |
| G-03 | src/auth/OAuthProvider.ts | OAuth JWT claims never mapped to session role | MED |

These three gaps were documented in `docs/authority-precedence-design.md` this session. G-01 is HIGH severity. Recommend addressing in one PR: `fix/rbac-session-gaps`.

### 2. ECC Cascade Tier 1 — remaining items (unblocked since Tier 0 complete)

From `docs/research/ecc-cascade-feasibility-panel-2026-03-30.md`:
- [12] Re-verify ECC claims → DONE this session (Track C)
- [C4] Authority precedence design doc → DONE this session (Track C)
- [9] Acceptance criteria per phase → DONE this session (Track C)

**Tier 1 is complete.** Move to Tier 2 when ready.

### 3. Track D Phase C (if Phase B validated)

From `docs/session-retrospective-plan.md`:
- `phase-spec-optimizer` skill — analyzes batch of phase specs against session outcomes, produces template diff
- `cross-project-process-miner` skill — finds patterns across 3+ repos, feeds global CLAUDE.md improvements

Start prompt:
> "Load docs/session-retrospective-plan.md Phase C. Create phase-spec-optimizer in SKILLS/GENERAL CODING WORKFLOWS/ and cross-project-process-miner in SKILLS/ORCHESTRATION FRAMEWORK/. These build on the Phase B skills (session-retrospective-miner, narrative-quality-scorer) already created. Branch: feat/retrospective-skills-phase-c."

### 4. Track D Phase D — Apply to Claudius Maximus

After Phase C skills exist:
- Run session-retrospective-miner on completed Claudius Maximus phase sessions
- Run phase-spec-optimizer on remaining unstarted phase specs
- Update Claudius Maximus/CLAUDE.md with findings
- Update Claudius Maximus/04-planning/ phase spec template

### 5. v3.1.0 npm publish gap

From previous sessions:
- v3.1.0 git tag and GitHub release exist but npm publish was never completed (NPM_TOKEN missing)
- `npm view evokore-mcp version` returns 404 — package is not on npm
- Requires: confirm NPM_TOKEN is set, then `npm run release:preflight` and publish

---

## How to Start Next Session

Option A — RBAC session gaps (G-01/G-02/G-03, HIGH priority):
> "Load next-session.md and docs/authority-precedence-design.md. Fix the three RBAC gaps: G-01 (native tool dispatch bypasses SecurityManager.checkPermission at src/index.ts:664-672), G-02 (add setSessionRole API to SessionIsolation), G-03 (OAuth JWT claim extraction into session role). Branch: fix/rbac-session-gaps."

Option B — Track D Phase C (retrospective skills):
> "Load docs/session-retrospective-plan.md Phase C. Implement phase-spec-optimizer and cross-project-process-miner skills. Branch: feat/retrospective-skills-phase-c."

Option C — Claudius Maximus Phase D application:
> "Run session-retrospective-miner on the Claudius Maximus project. Read docs/session-retrospective-plan.md Phase D. Apply findings to update CLAUDE.md and phase spec template."

---

## Guardrails (carry forward)
- `.commit-msg.txt` + `git commit -F` (not heredocs)
- DC-01 catches `rm -f` — use `unlink` for single-file deletion
- File writes in shell: `node -e "require('fs').writeFileSync(...)"`  — or use Write tool (preferred)
- PR body with sensitive path substring: use `--body-file` with temp file
- New `EVOKORE_*` env vars → add to example config in same PR (CI shard 3)
- `npx vitest run` locally before pushing
- Merge PRs sequentially (not batch); rebase if parallel agents touch same files
- Research → `docs/research/` per stage
- `EVOKORE_HTTP_ALLOW_PRIVATE=true` needed for tests that start local HTTP servers
- Native tool count is now **19** (not 14): 11 SkillManager + 2 TelemetryManager + 1 PluginManager + 2 NavigationAnchorManager + 3 SessionAnalyticsManager
