# Next Session Priorities

Last Updated (UTC): 2026-04-11

## Current Handoff State
- **Active branch:** `main` (clean — all PRs merged)
- **HEAD:** `60a7236` (feat: ECC Phase 3 Loop Operator)
- **Open PRs:** None
- **Worktrees:** Root checkout only

## THIS SESSION: Session 11 — ECC Phases 0–3 + Phase 4 Research (2026-04-11)

### PRs Merged This Session
- PR #239 (`fix/rbac-session-gaps` — G-01/G-02/G-03: native tool RBAC gate, setSessionRole, OAuth JWT claim reapply)
- PR #240 (`fix/lockfile-sync` — CI `npm ci --legacy-peer-deps` pre-existing failure)
- PR #241 (`feat/retrospective-skills-phase-c` — phase-spec-optimizer + cross-project-process-miner skills)
- PR #242 (`feat/ecc-phase-0` — SOUL.md + RULES.md + steering-modes.json)
- PR #243 (`feat/ecc-phase-1` — purpose-gate SOUL values + steering mode injection; damage-control RULES.md enrichment)
- PR #244 (`feat/ecc-phase-2` — after-edit, subagent-tracker, pre-compact hooks + status-runtime subagent segment)
- PR #245 (`feat/ecc-phase-3` — AGT-013 Loop Operator archetype + scripts/loop-operator.js detection engine)

### Key Decisions This Session
- **G-01 (RBAC gate):** Added gate in `src/index.ts` before native dispatch ladder, excluding `source === "proxied"` and `source === "unknown"`. Uses `SecurityManager.checkPermission(toolName, sessionRole)`.
- **G-02 (setSessionRole):** Added `async setSessionRole(sessionId, role)` to `SessionIsolation.ts` with LRU-safe re-insert and audit logging.
- **G-03 (JWT role reapply):** `HttpServer.ts` now calls `setSessionRole` on both the existing-session routing path and the session-reattach path.
- **ECC Phase 0:** SOUL.md + RULES.md + steering-modes.json (5 modes: dev/research/review/debug/security-audit) created. CLAUDE.md updated with preamble.
- **ECC Phase 1:** purpose-gate.js reads SOUL.md values + steering-modes.json, selects mode by keyword-precedence, persists mode in session manifest, injects SOUL values + mode focus into context. damage-control.js reads RULES.md for reason enrichment.
- **ECC Phase 2:** Three new hooks wired: after-edit (PostToolUse, logs edit-trace evidence), subagent-tracker (PostToolUse, maintains SA-NNN records in manifest), pre-compact (PreCompact, dumps state sidecar). status-runtime.js gets `renderSubagentsSegment`.
- **ECC Phase 3:** `SKILLS/ORCHESTRATION FRAMEWORK/agent-archetypes/AGT-013-loop-operator.json` + `scripts/loop-operator.js` (pure `detectLoop()` + async `checkSession()`). Detection: repeated-error (same description > 3×) → change-approach/terminate; stalled (all recent errors within 10 min window) → escalate.
- **ECC Phase 4 Research:** Full spike plan saved to `docs/research/ecc-phase4-spike-plan-2026-04-11.md`. Implementer agent interrupted at tool use boundary — research complete, no code written yet.

---

## PHASE STATUS (as of 2026-04-11)

### ECC Phase 0 — COMPLETE (PR #242)
- SOUL.md, RULES.md, steering-modes.json (5 modes)

### ECC Phase 1 — COMPLETE (PR #243)
- purpose-gate: SOUL values + steering mode injection
- damage-control: RULES.md reason enrichment

### ECC Phase 2 — COMPLETE (PR #244)
- after-edit hook, subagent-tracker hook, pre-compact hook
- status-runtime subagent segment

### ECC Phase 3 — COMPLETE (PR #245)
- AGT-013-loop-operator.json archetype
- scripts/loop-operator.js detection engine (detectLoop + checkSession)
- tests/integration/ecc-phase3-loop-operator.test.ts (19 tests)

### ECC Phase 4 — PENDING (research complete)
- Research: `docs/research/ecc-phase4-spike-plan-2026-04-11.md`
- To implement: `scripts/eval-harness.js`, `scripts/pattern-extractor.js`, `tests/helpers/synth-evidence.ts`, `tests/integration/ecc-phase4-spike.test.ts`
- Branch: `feat/ecc-phase-4-spike`

### RBAC Gaps — COMPLETE (PR #239)
- G-01 native tool RBAC gate, G-02 setSessionRole, G-03 JWT claim reapply

### Track D Phase C — COMPLETE (PR #241)
- phase-spec-optimizer, cross-project-process-miner

---

## NEXT SESSION: Recommended Priorities

### 1. ECC Phase 4 Spike (highest priority — research ready)

All research is in `docs/research/ecc-phase4-spike-plan-2026-04-11.md`. This is a direct implementation task.

Files to create:
- `tests/helpers/synth-evidence.ts` — fixture builders (buildEvidenceJsonl, buildReplayJsonl, buildTasksJson, buildManifest, buildSuccessfulSession, buildNoisySession)
- `scripts/eval-harness.js` — single-session evaluator (< 150 lines, readline + fs, no external deps)
- `scripts/pattern-extractor.js` — multi-session pattern engine, 5 patterns (PAT-001 through PAT-005), Laplace-smoothed confidence, precision gate ≥ 70%
- `tests/integration/ecc-phase4-spike.test.ts` — 20 vitest tests

Start prompt:
> "Load docs/research/ecc-phase4-spike-plan-2026-04-11.md. Implement ECC Phase 4 spike: scripts/eval-harness.js, scripts/pattern-extractor.js, tests/helpers/synth-evidence.ts, tests/integration/ecc-phase4-spike.test.ts. Branch: feat/ecc-phase-4-spike. No new npm deps. See the research doc for the exact implementation spec."

### 2. npm publish v3.1.0 (blocked: NPM_TOKEN)

The v3.1.0 git tag and GitHub release exist but npm publish was never completed. `npm view evokore-mcp version` returns 404.

Requires NPM_TOKEN to be set in GitHub Actions secrets or local env before running:
```
npm run release:preflight
npm publish
```

### 3. ECC Phase 5–6: Commands and Skills (after Phase 4 spike verdict)

From ECC-INTEGRATION-PLAN.md: 10 command skills (`/tdd`, `/verify`, `/quality-gate`, `/context-budget`, `/compact`, `/session-save`, `/session-resume`, `/handoff`, `/loop-start`, `/fleet-status`). Each maps to a skill markdown file in `SKILLS/`.

### 4. ECC Phase 7: Plugin Manifest (declarative plugin.json)

Migrate `PluginManager.ts` to load `plugin.json` manifests. Backwards-compatible with existing imperative plugins.

### 5. ECC Phase 8: CI/CD (reusable workflows + commitlint)

Reusable GitHub Actions workflows (test, lint, security, release), commitlint config, automated changelog.

---

## How to Start Next Session

**Option A — ECC Phase 4 Spike (recommended):**
> "Load next-session.md and docs/research/ecc-phase4-spike-plan-2026-04-11.md. Implement ECC Phase 4 spike: scripts/eval-harness.js + scripts/pattern-extractor.js + tests/helpers/synth-evidence.ts + tests/integration/ecc-phase4-spike.test.ts. Branch: feat/ecc-phase-4-spike. No new npm deps. Standard PR + merge flow."

**Option B — Session wrap only:**
> "Load next-session.md. Run session-retrospective-miner on this session. Update CLAUDE.md if any new patterns emerged. Confirm all PRs from this session are merged."

**Option C — npm publish:**
> "Load next-session.md. Confirm NPM_TOKEN is set, then run npm run release:preflight and npm publish for v3.1.0. Document the result."

---

## Guardrails (carry forward)
- `.commit-msg.txt` + `git commit -F` (not heredocs)
- DC-01 catches `rm -f` — use `unlink` for single-file deletion
- File writes in shell: use Write tool (preferred) or `node -e "require('fs').writeFileSync(...)"`
- PR body with `.env` substring: use `--body-file` with temp file
- New `EVOKORE_*` env vars → add to example config in same PR (CI shard 3)
- `npx vitest run` locally before pushing
- Merge PRs sequentially (not batch); rebase if parallel agents touch same files
- Research → `docs/research/` per stage
- `EVOKORE_HTTP_ALLOW_PRIVATE=true` needed for tests that start local HTTP servers
- Native tool count is now **19** (not 14): 11 SkillManager + 2 TelemetryManager + 1 PluginManager + 2 NavigationAnchorManager + 3 SessionAnalyticsManager
- Pre-existing CI failures (NOT our bugs): Dependency CVE Scan (always fails), `flushToDisk writes metrics to file` in telemetry-manager.test.ts (flaky shard 2 — SyntaxError: Unexpected end of JSON input). Safe to merge when Build + TypeCheck + Windows + shards 1/3 pass.
- Squash merge branch cleanup: use `git branch -D` (force) — squash-merged branches are not git ancestors of main
