# Next Session Priorities

Last Updated (UTC): 2026-04-15

## Current Handoff State
- **Active branch:** `main` (clean)
- **HEAD:** `111194b` (feat: Wave 9 — OrchestrationRuntime — PR #276)
- **Open PRs:** None
- **Worktrees:** Root checkout + `laughing-neumann` worktree (claude/laughing-neumann — safe to remove after sync)
- **CI status:** All shards green. CVE Scan pre-existing failure (not introduced by this session). Shard 3 `test-worktree-cleanup-validation.js` has a 30s timeout flake on Windows only — pre-existing.

---

## COMPLETE PHASE STATUS

### ✅ COMPLETE — Waves 1–9 (PRs #247–276, all merged)

**Wave 1–6 (PRs #247–269)** — See previous session wrap for details.

**This Session (PRs #270–276, merged 2026-04-15):**

- **PR #270** — `feat: Wave 4 SKILLS-PR-2` — github-release-management, agentic-jujutsu, v3-mcp-optimization skills
- **PR #271** — `fix: telemetry flushToDisk JSON parse error` — pre-existing CI failure fixed (atomic write + test isolation via EVOKORE_TELEMETRY_DIR)
- **PR #272** — `feat: Wave 4 SKILLS-PR-3` — browser skill + CLAUDE.md progressive disclosure + trigger-explicit constraints
- **PR #273** — `feat: Wave 7` — ComplianceChecker.ts (stateless check against steering-mode + RULES.md), jscodeshift codemods (var-to-const, callback-to-async), ADR 0004 (vector memory trigger gate)
- **PR #274** — `feat: Wave 8-A` — plugin.json manifest support in PluginManager (PluginJsonManifest interface, evokore_min_version gating, getLoadedPlugins(), getPluginManifest())
- **PR #275** — `feat: Wave 8-B` — reusable GHA workflows (reusable-test/lint/security/release), commitlint config, conventional-changelog scripts
- **PR #276** — `feat: Wave 9` — OrchestrationRuntime (orchestration_start/stop/status MCP tools, AGT-013 loop detection via fleet_status liveness probes, scripts/orchestration-runner.js CLI)

---

## ⏳ PENDING (in priority order)

### GATED — Vector Memory (Phase 6)

Gate: `scripts/check-vector-trigger.js` must report BOTH:
1. `SkillManager.loadSkills()` indexed corpus ≥500 entries
2. `resolve_workflow` p50 latency >200ms over last 1,000 calls

Current corpus: ~340 skills (6 new skills added this session). Still below gate.

Until both conditions fire: no code, no dep, no stub.

ADR 0004 (`docs/adr/0004-vector-memory-trigger.md`) documents this gate formally.

---

### STANDALONE — npm publish v3.1.0

Blocked on `NPM_TOKEN`. git tag `v3.1.0` + GitHub release exist; `npm view evokore-mcp` returns 404.
```
npm run release:preflight
npm publish
```

---

### PRE-EXISTING ISSUES (not introduced this session)

- **CVE Scan:** Dependency CVE Scan workflow fails on every commit (pre-existing). Investigate with `npm audit --audit-level=high`.
- **Shard 3 `test-worktree-cleanup-validation.js`:** 30s timeout on Windows CI only. Pre-existing; passes with 90s timeout.

---

## EFFORT SUMMARY

| Wave | Status | Content | PRs |
|------|--------|---------|-----|
| 1 — Foundation | ✅ DONE | Phase 0-B/C/D, Phase 1-A/B | #248–252 |
| 2 — Intelligence | ✅ DONE | Phase 2-A/B, 2.5-A/B/C, 3-A/B, 3.5-A/B | #253–260 |
| 3 — Learning Loop | ✅ DONE | Phase 4-A (eval-harness + pattern-extractor) | #261 |
| 4 — Archetypes + Skills | ✅ DONE | AGT-PR-1/2/3 + SKILLS-PR-1/2/3 | #262–265, #270, #272 |
| 5 — Commands | ✅ DONE | 11 command skills (CMDS-PR-1/2/3/4) | #266–268 |
| 6 — Fleet | ✅ DONE | FleetManager | #269 |
| 7 — Polish | ✅ DONE | ComplianceChecker + codemods + ADR 0004 | #273 |
| 8 — ECC 7–8 | ✅ DONE | Plugin manifest + CI/CD reusable workflows | #274–275 |
| 9 — ECC 9 | ✅ DONE | OrchestrationRuntime via FleetManager + ClaimsManager | #276 |

**All planned waves complete.**

**Critical path remaining:** Vector Memory gate check (when corpus hits 500) → npm publish (when NPM_TOKEN available)

---

## HOW TO START NEXT SESSION

**Option A — npm publish v3.1.0 (if NPM_TOKEN is now available):**
> "Load next-session.md. Run npm run release:preflight. If clean, run npm publish to publish v3.1.0 to npm."

**Option B — Investigate and fix CVE Scan pre-existing failure:**
> "Load next-session.md. Run npm audit --audit-level=high and fix any high-severity CVEs. The Dependency CVE Scan GitHub Actions job has been failing on every commit."

**Option C — Check vector memory gate (if significant new skills were added):**
> "Load next-session.md. Run scripts/check-vector-trigger.js to see if the corpus≥500 + p50>200ms gate is now met. If met, proceed to implement Vector Memory (Phase 6)."

**Option D — Fix shard 3 Windows timeout flake:**
> "Load next-session.md. Investigate test-worktree-cleanup-validation.js — it times out at 30s on Windows CI only. Increase the timeout or fix the underlying slowness."
