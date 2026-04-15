# Next Session Priorities

Last Updated (UTC): 2026-04-15

## Current Handoff State
- **Active branch:** `main` (clean)
- **HEAD:** `8f17b2d` (feat: Wave 6 Phase 5-A — FleetManager — PR #269)
- **Open PRs:** None
- **Worktrees:** Root checkout + `romantic-bhabha` worktree (feat/commands-quality-ecc — safe to remove)

---

## COMPLETE PHASE STATUS

### ✅ COMPLETE — Waves 1–6 (PRs #247–269, all merged 2026-04-14/15)

**Wave 1 — Foundation**
- Phase 0-A — ADRs 0001-0003 + WEBHOOK_ENVELOPE_V1 spec (PR #247)
- Phase 0-B — SessionManifest JSONL core (PR #248)
- Phase 0-C — Hook migration wave 1 (PR #249)
- Phase 0-D — Hook migration wave 2 (PR #250)
- Phase 1-A — ClaimsManager with exclusive resource claims (PR #251)
- Phase 1-B — Tenant path scoping for SessionIsolation (PR #252)

**Wave 2 — Intelligence Layer**
- Phase 2-B — Cross-IDE configs (Cursor, Windsurf, Continue) (PR #253)
- Phase 2-A — Nav anchor seeding + purpose-gate dedup (PR #254)
- Phase 2.5-A — MemoryManager with 3 MCP tools (PR #255)
- Phase 2.5-B/C — Async worker dispatch + TillDone dependency graph (PR #256)
- Phase 3-A — RL-lite routing reranker + TelemetryIndex (PR #257)
- Phase 3-B — WorkerScheduler DLQ (PR #258)
- Phase 3.5-A — Trust Ledger + SHA-256 proof chain + IrreversibilityClassifier (PR #259)
- Phase 3.5-B — Governance Gate (PolicyBundle + ContinueGate + AGT-018) (PR #260)

**Wave 3 — Learning Loop**
- Phase 4-A — ECC Phase 4 spike (eval-harness + pattern-extractor + 20 tests) (PR #261)

**Wave 4 — Archetypes + Skills**
- AGT-PR-1 — Security Sentinel (AGT-014) + Claims Coordinator (AGT-019) (PR #262)
- AGT-PR-2 — Performance Engineer (AGT-015) + Memory Steward (AGT-016) + Quality Engineer (AGT-017) (PR #263)
- SKILLS-PR-1 — verification-quality + sparc-methodology + hooks-automation (PR #264)
- AGT-PR-3 — Neural Optimizer (AGT-020) + Release Engineer (AGT-021) + domain field on all 15 archetypes (PR #265)

**Wave 5 — Commands**
- CMDS-PR-1 — /sparc-spec + /sparc-pipeline (PR #266)
- CMDS-PR-2 — /session-checkpoint + /scope-lock (PR #267)
- CMDS-PR-3+4 — /verify-quality, /agent-spawn, /workflow-run, /pattern-learn, /tdd, /quality-gate, /context-budget, /handoff, /fleet-status (PR #268)

**Wave 6 — Fleet**
- Phase 5-A — FleetManager (fleet_spawn/claim/release/status, platform killTree, 17 tests) (PR #269)

---

## ⏳ PENDING (in priority order)

### WAVE 4 (remaining) — Skills Import

**SKILLS-PR-2** `feat/skills-import-wave2`
- `github-release-management` — progressive canary deployment (5%→25%→50%→100%), auto-rollback triggers
- `agentic-jujutsu` — concurrent non-locking VCS for multi-agent workflows, 87% auto-conflict resolution
- `v3-mcp-optimization` — 6 ProxyManager optimization patterns (O(1) hash-map tool lookup, 3-tier cache, batch/compress)
- Target: `SKILLS/EVOKORE EXTENSIONS/`
- Start: *"Create SKILLS/EVOKORE EXTENSIONS/github-release-management/SKILL.md (progressive canary: 5%→25%→50%→100%, auto-rollback), SKILLS/EVOKORE EXTENSIONS/agentic-jujutsu/SKILL.md (multi-agent non-locking VCS, 87% auto-conflict), and SKILLS/EVOKORE EXTENSIONS/v3-mcp-optimization/SKILL.md (6 ProxyManager patterns: O(1) lookup, 3-tier cache, batch/compress). EVOKORE frontmatter: aliases, category, tags, archetype affinity, trigger-explicit descriptions. Branch: feat/skills-import-wave2."*

**SKILLS-PR-3** `feat/skills-import-wave3`
- `browser` — AI-optimized automation with abbreviated refs (93% context reduction), multi-session isolation
- Update `CLAUDE.md`: progressive disclosure constraint for skill authoring + trigger-explicit description pattern
- Start: *"Create SKILLS/EVOKORE EXTENSIONS/browser/SKILL.md — AI-optimized browser automation with abbreviated refs (93% context reduction) and multi-session isolation. Update CLAUDE.md with progressive disclosure constraint for skill authoring and trigger-explicit description pattern. Branch: feat/skills-import-wave3."*

---

### WAVE 7 — Polish

**Phase 7-A** `feat/compliance-codemods`
- `src/ComplianceChecker.ts` — validates CallToolRequest against steering-mode + RULES.md policy bundle
- `scripts/codemods/` — jscodeshift var→const, async-await normalisation
- `docs/adr/0004-vector-memory-trigger.md` — documents the corpus≥500 + p50>200ms gate
- Start: *"Implement src/ComplianceChecker.ts: validates CallToolRequest toolName+args against the active steering-mode from steering-modes.json and PolicyBundle from RULES.md. Returns {allowed: boolean, reason?: string, steeringMode: string}. Wire into index.ts CallTool handler before tool dispatch. Add scripts/codemods/var-to-const.js and scripts/codemods/callback-to-async.js (jscodeshift). Add docs/adr/0004-vector-memory-trigger.md. Tests: tests/integration/ComplianceChecker.test.ts. Branch: feat/compliance-codemods."*

---

### WAVE 8 — ECC 7–8

**Phase 7: Plugin Manifest** `feat/plugin-manifest`
- Migrate `PluginManager.ts` to support optional `plugin.json` manifests alongside current plugin.js loading
- Backwards-compatible; `plugin.json` schema: `{ name, version, description, tools[], permissions[], evokore_min_version }`
- Start: *"Add optional plugin.json manifest support to src/PluginManager.ts. Schema: { name, version, description, tools[], permissions[], evokore_min_version }. Backwards-compatible — existing plugins load without a manifest. Add manifest validation on load. Tests: tests/integration/PluginManager-manifest.test.ts. Branch: feat/plugin-manifest."*

**Phase 8: CI/CD** `feat/cicd`
- Reusable GitHub Actions: `.github/workflows/reusable-test.yml`, `reusable-lint.yml`, `reusable-security.yml`, `reusable-release.yml`
- `commitlint.config.js` + automated changelog via `conventional-changelog`
- Start: *"Add reusable GitHub Actions workflow files: .github/workflows/reusable-test.yml, reusable-lint.yml, reusable-security.yml, reusable-release.yml. Add commitlint.config.js for conventional commits enforcement. Automated changelog via conventional-changelog. Branch: feat/cicd."*

---

### WAVE 9 — ECC 9 via FleetManager (after Wave 6+7)

Multi-agent orchestration runtime using FleetManager (PR #269) + ClaimsManager.

- `src/OrchestrationRuntime.ts` — wraps FleetManager; manages agent lifecycle contracts via ClaimsManager; AGT-013 loop detection via fleet_status liveness probes
- `scripts/orchestration-runner.js` — standalone orchestration runner
- 3 MCP tools: `orchestration_start`, `orchestration_stop`, `orchestration_status`
- Start: *"Implement src/OrchestrationRuntime.ts: multi-agent ECC coordination using FleetManager (fleet_spawn/claim/release/status from PR #269) + ClaimsManager. AGT-013 loop detection via fleet_status liveness probes. Expose orchestration_start, orchestration_stop, orchestration_status MCP tools. Add scripts/orchestration-runner.js. Tests: tests/integration/OrchestrationRuntime.test.ts. Branch: feat/orchestration-runtime."*

---

### GATED — Vector Memory (Phase 6)

Gate: `scripts/check-vector-trigger.js` must report BOTH:
1. `SkillManager.loadSkills()` indexed corpus ≥500 entries
2. `resolve_workflow` p50 latency >200ms over last 1,000 calls

Until both conditions fire: no code, no dep, no stub.

---

### STANDALONE — npm publish v3.1.0

Blocked on `NPM_TOKEN`. git tag `v3.1.0` + GitHub release exist; `npm view evokore-mcp` returns 404.
```
npm run release:preflight
npm publish
```

---

## EFFORT SUMMARY

| Wave | Status | Content | PRs |
|------|--------|---------|-----|
| 1 — Foundation | ✅ DONE | Phase 0-B/C/D, Phase 1-A/B | #248–252 |
| 2 — Intelligence | ✅ DONE | Phase 2-A/B, 2.5-A/B/C, 3-A/B, 3.5-A/B | #253–260 |
| 3 — Learning Loop | ✅ DONE | Phase 4-A (eval-harness + pattern-extractor) | #261 |
| 4 — Archetypes + Skills | 🟡 PARTIAL | AGT-PR-1/2/3 + SKILLS-PR-1 done; PR-2/PR-3 pending | #262–265 |
| 5 — Commands | ✅ DONE | 11 command skills (CMDS-PR-1/2/3/4) | #266–268 |
| 6 — Fleet | ✅ DONE | FleetManager | #269 |
| 7 — Polish | ⏳ PENDING | ComplianceChecker + codemods + ADR 0004 | — |
| 8 — ECC 7–8 | ⏳ PENDING | Plugin manifest + CI/CD | — |
| 9 — ECC 9 | ⏳ PENDING | OrchestrationRuntime via FleetManager | — |

**Critical path remaining:** Wave 4 (SKILLS-PR-2/3) → Wave 7 → Wave 8 → Wave 9

---

## HOW TO START NEXT SESSION

**Option A — Skills Import Wave 2 (no code risk, can start immediately):**
> "Load next-session.md. Create SKILLS/EVOKORE EXTENSIONS/github-release-management/SKILL.md (canary deployment 5%→25%→50%→100%), SKILLS/EVOKORE EXTENSIONS/agentic-jujutsu/SKILL.md (multi-agent non-locking VCS), SKILLS/EVOKORE EXTENSIONS/v3-mcp-optimization/SKILL.md (6 ProxyManager patterns). EVOKORE frontmatter on each. Branch: feat/skills-import-wave2."

**Option B — Wave 7 ComplianceChecker:**
> "Load next-session.md. Implement src/ComplianceChecker.ts: validates CallToolRequest against active steering-mode (steering-modes.json) + RULES.md PolicyBundle. Returns {allowed, reason, steeringMode}. Wire into src/index.ts before tool dispatch. Add scripts/codemods/var-to-const.js and callback-to-async.js (jscodeshift). Add docs/adr/0004-vector-memory-trigger.md. Tests: tests/integration/ComplianceChecker.test.ts. Branch: feat/compliance-codemods."

**Option C — Wave 8 Plugin Manifest:**
> "Load next-session.md. Add optional plugin.json manifest support to src/PluginManager.ts. Schema: {name, version, description, tools[], permissions[], evokore_min_version}. Backwards-compatible. Tests: tests/integration/PluginManager-manifest.test.ts. Branch: feat/plugin-manifest."

**Option D — Wave 9 OrchestrationRuntime (Wave 6 is done — go for it):**
> "Load next-session.md. Implement src/OrchestrationRuntime.ts: multi-agent ECC orchestration via FleetManager + ClaimsManager. AGT-013 loop detection via fleet_status. Expose orchestration_start/stop/status MCP tools. Scripts/orchestration-runner.js. Tests: tests/integration/OrchestrationRuntime.test.ts. Branch: feat/orchestration-runtime."
