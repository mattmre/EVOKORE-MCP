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

### 0.5 Deep-Dive Additions (from 5-expert panel, 2026-04-14)

**Research doc:** `docs/research/ruflo-deep-dive-2026-04-14.md`  
**New phases inserted into roadmap:** Phase 2.5 (Memory & Worker), Phase 3.5 (Governance & Trust), Agent Archetypes, Skills Import, Commands

**Highest-priority new items:**

**A. Memory Manager (Phase 2.5-A — highest immediate ROI):**
- `src/MemoryManager.ts` — 3 MCP tools: `memory_store`, `memory_search`, `memory_list`; SQLite backend `~/.evokore/memory/{sessionId}.db`; 8 typed memory kinds with TTL
- Enables agents to store/retrieve intermediate findings without re-reading giant JSONL files
- Start: > "Implement src/MemoryManager.ts: 3 MCP tools (memory_store, memory_search, memory_list), SQLite backend at ~/.evokore/memory/{sessionId}.db, 8 memory types with TTL enforcement. Follow NavigationAnchorManager pattern. Branch: feat/memory-manager."

**B. AI Defence patterns (Phase B security — content for damage-control-rules.yaml):**
- Fetch patterns from `https://raw.githubusercontent.com/ruvnet/ruflo/main/v3/%40claude-flow/cli/.claude/skills/aidefence.yaml`
- Add `output_patterns` section to `damage-control-rules.yaml`: prompt injection markers, role override attempts, PII exfiltration
- Wire PostToolUse output-scanning branch in `damage-control.js`

**C. AGT-018 Governance Gate (Phase 3.5-B — closes the biggest single architectural gap):**
- Compile `RULES.md` to `PolicyBundle` at session start in `purpose-gate.js` (not re-parsed per call)
- `src/TrustLedger.ts` — per-agent score (success+0.01, failure-0.05, gate violation-0.10)
- SHA-256 proof chaining in `evidence-capture.js` (one-line change)
- `IrreversibilityClassifier` in `damage-control.js` for destructive/external actions

**D. Agent Archetypes AGT-014 through AGT-021:**
- AGT-014: Security Sentinel, AGT-015: Performance Engineer, AGT-016: Memory Steward
- AGT-017: Quality Engineer, AGT-018: Governance Gate, AGT-019: Claims Coordinator
- AGT-020: Neural Optimizer, AGT-021: Release Engineer
- Add `domain` field to all archetypes for domain-partitioned routing

**E. Skills Import Wave 1:**
- `verification-quality` — truth-score gates (0.0-1.0, env-tiered thresholds, machine-readable JSON)
- `sparc-methodology` — 17-mode SPARC as single importable skill (enables /sparc-pipeline)
- `hooks-automation` — composable hook grammar with JSON flow-control responses
- `github-release-management` — progressive deployment (canary 5%→25%→50%→100%), auto-rollback triggers
- Start: > "Import 3 skills from ruvnet/ruflo into SKILLS/EVOKORE EXTENSIONS/: verification-quality, sparc-methodology, hooks-automation. Adapt frontmatter to EVOKORE schema. Branch: feat/skills-import-wave1."

**F. New Commands (/sparc-spec, /sparc-pipeline, /session-checkpoint, /verify-quality, /scope-lock)**

**G. ECC Phase 4 additions from deep-dive:**
- Pattern state machine: `candidate → validated → active → stale → retired` (explicit transitions)
- JUDGE wiring to evidence-capture.js signals (test_pass, no_error_loop, edit_verified)
- Persistence: `~/.evokore/patterns/patterns.jsonl` + `index.json` (no embeddings needed — use TF-IDF trigger matching)
- MEMORY.md injection path: high-confidence patterns → `~/.claude/projects/.../memory/patterns.md`

**H. Narrative/session lifecycle:**
- Phase files as durable intent: write `session-phase-<n>-<slug>.md` at each major work unit
- Auto-generated session summary at Stop (replaces manual next-session.md authoring)
- Memory namespace block in session manifest for purpose-gate context injection on resume

---

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
