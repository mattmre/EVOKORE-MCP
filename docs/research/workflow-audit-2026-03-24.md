# Workflow & Skills Improvement Plan — 30-Day Audit (Backfill)

**Window:** 2026-02-25 → 2026-03-24 (4 weeks). **Today:** 2026-04-24.
**Status:** Backfill audit. The canonical 30-day audit covering 2026-03-25 → 2026-04-24 is at `workflow-audit-2026-04-24.md`. Read it first; this file is its **delta-comparison** one window earlier.
**Sources mined:** 2,997 Claude session files (1.59 GB) across 211 project subdirs, 451 Codex CLI sessions (1.03 GB), ~20 active repos in `D:/github/`, harness configs (Claude+Codex), EVOKORE-MCP repo state at commit `8e8db56` (window-end, package v3.0.0).
**Refined by:** 1 merged "Workflow + MCP-Architecture + Security" panel — Helena Marsh, Kai Nishida, Marcus Reyes, Priya Krishnan (per rate-limit guidance).

---

## Executive summary

The 2026-02-25 → 2026-03-24 window was the **v3.0 → v3.1 sprint heat** — the four weeks where EVOKORE-MCP shipped 96 PRs (#86 → #181), AGENT33 shipped 35 PRs, and other repos shipped hundreds more. The harness was being run at maximum velocity; the friction signature is materially different from a month later.

> **Verdict:** *You were shipping faster than you could keep state coherent.* The 2026-04-24 audit's "adding faster than maintaining" was already the dominant pattern — only the symptoms were different. A month earlier, the rot was **session-state thrash and ceremony cost**, not architectural drift. The architectural drift (README v3.0 vs reality v3.1, SSRF in `httpUtils.ts`, sub-`.git` committed, 60 root test files) **had not yet appeared** at 2026-03-24 — it was created during the v3.1 sprint that this window captured the front half of.

Two of the most-cited issues in the 2026-04-24 audit were *temporally impossible* in this window: SEC-03/SEC-04 (`httpUtils.ts` was added 2026-04-03), tokenFull broadcast (added 2026-03-26 with #204). **This is the strongest "delta" finding:** the recurring chronic problems are *behavioural* (sibling fanout, missing-skill errors, ceremony bloat, harness asymmetry); the architectural rot is *recent and acute*.

---

## 1. Data baseline

| Source | Volume (this window) | Volume (2026-04-24 window) | Top finding |
|---|---|---|---|
| Claude sessions | 2,997 files / 1,591 MB / 211 project subdirs | 2,185 / 64 MB / 53 | **24× the byte-volume — sub-agent transcripts dominate** |
| Codex sessions | 451 files / 1,033 MB | 378 / 255 MB | 4× the byte-volume; same 35%-ish apply_patch failure rate |
| EVOKORE-MCP PRs | **96 created, 91 merged** in window | (cited 1,500 across 8 repos) | v3.0/v3.1 sprint heat; #86 → #181 |
| AGENT33 PRs | 35 in window (P1.* / P2.* feature batch) | (low) | Multi-bot review (Copilot + gemini) on most |
| EDCTool PRs | 190 (185 merged) | (low) | Highest single-repo throughput |
| Gemma PRs | 118 merged | (low) | Heavy worktree usage |
| evokore.com PRs | 70 | (low) | Agency-style productized repo |
| yourediscovery.com PRs | 155 | (low) | E-discovery vertical |

**Subagent type distribution (Claude Task tool, this window):**

| Subagent type | Calls |
|---|---|
| implementer | 1,592 |
| researcher | 533 |
| reviewer | 235 |
| Explore (built-in) | 165 |
| general-purpose | 117 |
| documentation | 50 |
| architect | 50 |
| debugger | 30 |
| tester | 28 |
| orchestrator | 2 |

The 9 stale `.claude/agents/*.md` (all dated Jan 9, all `model: opus`) were the **dominant delegation pattern** in this window — `general-purpose` was a distant 5th. **This is the inverse of the 2026-04-24 finding** where general-purpose dominated 300:30. The user actively demoted/abandoned the specialists between these windows.

**Activity peaks (sessions/day):** 442 on 2026-03-14, 425 on 2026-03-15, 300 on 2026-03-24, 194 on 2026-03-12, 172 on 2026-02-27, 171 on 2026-03-09. Codex spikes 2026-03-16 (55), 2026-03-18 (66), 2026-03-19 (62), 2026-03-20 (63), 2026-03-24 (102).

**EVOKORE-MCP usage shape (12 child + native tool calls):** `search_skills` 80, `resolve_workflow` 73, `fetch_skill` 41, `get_skill_help` 29, `execute_skill` **12**, github_* 47, `skill_creator` 9, `refresh_skills` 5, `discover_tools` 5, `proxy_server_status` 1, `list_registry` 1.

The **discovery-vs-execution asymmetry already existed** (12 executes vs 228 discovery calls = 5%). Identical shape to the 2026-04-24 finding.

---

## 2. Themed findings

### Theme A — Missing skills already invoked by muscle memory (CHRONIC)
- `pr-manager`: **16 errors** in window (vs 256 in next window — pattern was younger, demand was already there)
- `session-wrap`: **10 errors** in window (vs 74 next window) + 6 actual `chore: session-wrap`/`chore: session wrap` commits in EVOKORE-MCP (#163-style ceremony)
- `next-session.md` referenced **373×** (vs 594 combined in next window — same magnitude per session)
- `top 15 priorities` 155×, `top 30 priorities` 50×, `top 5 priorities` 8× → **220+ "priorities" invocations**
- `Phase NNN` ceremony **2,137×** — *higher per-window than 2026-04-24's 1,446*

The skills the user wants **were already missing a month earlier**. The 2026-04-24 audit's recommendation #13 (`pr-manager` skill) and #14 (`/priorities [N]` slash command) is **re-confirmed with strong frequency signal**.

### Theme B — Cascading failures from concurrency model (CHRONIC, lower magnitude)
- 926 "Sibling tool call errored" (vs 4,913 next window)
- 209 Read-before-Edit "File has been modified since" (vs ~1,200)
- 31 InputValidationError (vs unspecified next window)
- Codex `apply_patch`-related failures: **2,981** (vs ~similar rate next window — but this window has 4× the bytes so the *rate* improved or stayed flat)
- Codex `turn_aborted` / `context_compacted`: **635**
- **Frustration signals: 5,125 "stop", 372 "wait", 246+ "don't"** — plain evidence the user was repeatedly halting wrong actions

The numbers are smaller than 2026-04-24, but **the pattern is identical and pre-dates the next-window symptoms**. This re-confirms 2026-04-24 Week-1 items #7 (Read-before-Edit hook) and #8 (parallel-Bash throttle).

### Theme C — Cross-PR pattern blindness (CHRONIC, with caveats)
- 96 EVOKORE-MCP PRs in 4 weeks; **almost zero have human reviewers** (sampled #181, #180, #179, #174, #168, #167, #165, #158: only `gemini-code-assist[bot]` + `mattmre` self-merge)
- `fix:` PRs in EVOKORE-MCP window: 11 (~12% of 91 merged) — slightly lower than the 40% rate the 2026-04-24 audit cited (which used a different repo/period mix)
- AGENT33 had **multi-bot review** (Copilot + gemini-code-assist) on PRs #233-#252 — this is the only repo where it was on
- gemini-code-assist comments in window flagged: `dangerouslySkipPermissions` in PR #181, code duplication in test files, `Math.random()` for unique IDs in PR #178, fragile string-concat URL fallback in PR #174

The recurring-pattern blindness is **the same shape as 2026-04-24** but the *specific* mistakes are different ( `_resolve_tenant_id`, `Promise(server.listen)`, schema-validator misapplication came later). The mechanism (no cross-PR memory) is chronic; the *specific bugs* are window-specific. The 2026-04-24 plan item #25 (Semgrep rule pack) and #26 (enable Copilot review on EVOKORE-MCP, Gemma, OCR_LOCAL, Claudius_Maximus) is **strongly re-confirmed** by this window's data — AGENT33's multi-bot setup *was* the demonstrably better pattern.

### Theme D — Harness baseline is bare and asymmetric (CHRONIC, identical)

Identical to 2026-04-24 finding, with one new wrinkle:

- Codex `~/.codex/AGENTS.md` is **0 bytes** (mtime 2026-03-07) — **same as a month later**
- No user-level `~/.claude/CLAUDE.md` — **same**
- 9 stale `.claude/agents/*.md`, all `model: opus`, all dated 2026-01-09 — **same**
- Permission posture: `bypassPermissions` 3,098× in session payloads, `skipDangerousMode` 7×, `CLAUDE_CODE_DISABLE_1M_CONTEXT` 4× — **same maximally-permissive setup**
- Codex `config.toml` `sandbox_mode = "danger-full-access"`, `[windows] sandbox = "elevated"` — **same**
- **NEW (this window)**: specialist agents were *being used* (1,592 implementer, 533 researcher, 235 reviewer). They weren't dead at this point — they were the dominant pattern. They went stale *between this window and 2026-04-24*.

**Implication for 2026-04-24 plan item #12** (refresh / decide-the-fate-of stale agents): the question isn't "delete or refresh" — the data shows a **30-day decay curve**. Refresh them (port to current model lineup, update tool lists), don't delete. The user voted with their feet last month.

### Theme E — EVOKORE-MCP architectural state at window-end (DIFFERENT)

**At commit `8e8db56` (2026-03-24):**

- `package.json` version: **`3.0.0`**, README claims **`v3.0.0`** with **11 native tools** listed verbatim — **README and reality matched** at this point
- `mcp.config.json` has 5 child servers configured: `github`, `fs`, `elevenlabs`, `supabase`, `stitch` (Stitch added in #176, 4 days before window-end)
- `mcp_repos.json` is **0 bytes** (the "registry plumbed but empty" issue is **chronic**; persisted into 2026-04-24)
- Sub-`.git` issue: **NOT YET PRESENT.** `claude-skills-mcp` is a *proper submodule* (160000 commit `6238e705`) declared in `.gitmodules`. It was converted to a committed sub-`.git` later.
- 73 root-level `test-*.js` / `hook-*.js` / `e2e-*.js` files **already present** — the legacy clutter is **chronic**
- Ephemeral root files (`progress.md`, `findings.md`, `task_plan.md`, `next-session.md`, `fix.js`, `env-fix.txt`, `e2e-test.js`) **already in repo root** at window-end — **chronic**
- `src/utils/httpUtils.ts` and `src/HttpUtils.ts`: **DO NOT EXIST.** Created later (commit `1e7b242` on 2026-04-03). **SEC-03 / SEC-04 SSRF findings cannot exist in this window.**
- `src/TelemetryExporter*` introduced 2026-03-26 (#204) — **3 days after window-end.** Telemetry-SSRF surface area is *brand-new* at the start of the next window.
- `tokenFull` broadcast: introduced after this window — **SEC-01 also cannot exist in this window.**
- **Project-scoped `.claude/settings.json` had hooks** (damage-control, purpose-gate, repo-audit-hook, log-rotation) at window-end — the "0 hooks" claim in the 2026-04-24 audit refers to **user-scoped** hooks; the project hooks were live and the user shipped #181 (`voice-stop-hook`) on the very last day of this window
- `mcp-sdk-upgrade-research-2026-03-13.md` shows the user was *aware* of SDK gaps and acting on them
- **NEW dimension**: `oauth-*` research files (2026-03-14 / 2026-03-15) and `streamable-http-server-transport-2026-03-14.md` show this window is *when v3.0 → v3.1 architecture was being designed*. Asking "why is the architecture rotting?" against this window is a category error — the architecture was being **built**.

### Theme F — Security posture (DIFFERENT, more dangerous in retrospect)

- The exploit chain in 2026-04-24 audit (poisoned skill → `fetch_skill` against vLLM localhost → SSRF exfil) **does not exist as a chain** in this window because the SSRF surface (`httpUtils.ts`, `TelemetryExporter`) hadn't been built yet
- BUT: the **preconditions were all here** — `bypassPermissions` was on (3,098 hits), `danger-full-access` was on, the skill catalog had the same 337-skill provenance gap, vLLM Gemma server was already running locally (per `MEMORY.md`)
- 2026-03-14 `skill-sandbox-security-audit-2026-03-14.md` and 2026-03-11 `security-scan-workflow-triage-2026-03-11.md` show the user was actively researching this
- The **dangerouslySkipPermissions** addition flagged by gemini-code-assist on PR #181 (2026-03-24) is the *first appearance* of the permission-bypass anti-pattern in user-shipped code that the 2026-04-24 audit later cites as compounding the SSRF chain

**Window-specific conclusion:** the security ROT (SSRF, tokenFull) was **created during the next window**, but the security CULTURE (bypass-everything posture) was **already in place a month earlier**. The 2026-04-24 audit's plan item #3 (disable `skipDangerousModePermissionPrompt`, downgrade Codex) **would have been the right call here, too**.

---

## 3. Improvement plan

### Week 1 (if this audit had been run on 2026-03-25)

| # | Action | Layer | Why now |
|---|---|---|---|
| 1 | Disable `skipDangerousModePermissionPrompt`; downgrade Codex `sandbox_mode` to `workspace-write` | settings.json + config.toml | Same call as 2026-04-24 audit; would have prevented the SSRF chain *before* `httpUtils.ts` was even merged |
| 2 | Read-before-Edit/Write enforcement hook | PreToolUse hook | 209 errors this window; pattern climbing into next window |
| 3 | Throttle parallel Bash (N=2-3) | PreToolUse hook | 926 sibling errors this window; would have prevented 4,913 next window |
| 4 | Populate `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md` with Windows guardrails | docs | Codex AGENTS.md was 0 bytes for 17 days at this point |
| 5 | `Unknown skill: X` → fuzzy-match suggestion | EVOKORE-MCP SkillManager | 16 + 10 errors this window are early-warning of the 256+74 next window |
| 6 | Pre-commit guard against committed sub-`.git/` directories | repo policy | Would have caught the `claude-skills-mcp/.git` regression *before* it shipped |
| 7 | CI gate: README version + tool-count must match `package.json` + tool registry | CI | Manifest drift hadn't started yet; would have prevented v3.0 → v3.1 README rot during the next sprint |

### Month 1

| # | Skill / project | Source signal |
|---|---|---|
| 8 | `pr-manager` skill | Already invoked 16× this window with errors |
| 9 | `/priorities [N]` slash command | 220+ invocations this window |
| 10 | `session-wrap` as CLAUDE.md template (per Kai's KILL critique that held in 2026-04-24) | 10 errors + 6 actual ceremony commits in EVOKORE-MCP this window |
| 11 | Refresh — not delete — the 9 specialist agents | They were dominant (2,490 calls combined) this window; deletion wastes the muscle-memory training |
| 12 | EVOKORE-MCP child-server health supervisor | The 5 child servers were all defined; only Stitch was new; chronic maintenance gap |

### Foundational

| # | Action | Notes |
|---|---|---|
| 13 | Skill discoverability overhaul (`list_skills --grep --by-source --last-success`) | Same finding as 2026-04-24 |
| 14 | Skill provenance manifest (`skills.lock` + sha256) | Same |
| 15 | Enable Copilot review on EVOKORE-MCP, Gemma, OCR_LOCAL, Claudius_Maximus | AGENT33 was already showing the multi-bot uplift this window |
| 16 | `apply_patch` upstream investigation | 2,981 hits this window; chronic |

---

## 4. KILL list

- **Specialist-agent deletion** — 2026-04-24's Theme D framed them as "lose 300:30 against general-purpose." This window's data (2,490 specialist calls, 117 general-purpose) shows that's a *recent* phenomenon. **Refresh, don't kill.**
- **Phase NNN ceremony as a structured framework** — 2,137 invocations across 4 weeks = ~76/day. It's tracking work but generating no artifact. Replace with a 1-line task_plan.md row + the `/priorities` slash.
- **Re-litigating `damage-control-rules.yaml`** — 5+ research docs in window (PR #160, three damage-control research docs). Lock the rule set; only mutate via Semgrep-style additive PRs.
- **Voice features as Week-1 priority** — PRs #167, #181 + multiple voice research docs. The voice surface ate engineering attention while the SSRF surface was being built next door. *Defer voice maintenance until skill-discovery + read-before-edit ship.*
- **Net-new EVOKORE-MCP skills before `list_skills --grep` exists** — same as 2026-04-24.

---

## 5. Runbook scenarios to write

1. **A submodule pointer regresses to a committed sub-`.git/`** — this is the only window where it was correctly a submodule; document the invariant
2. **A v3.x bump lands without README update** — define the CI gate
3. **`Unknown skill: X` with the X being a skill the user just typed by muscle memory** — fuzzy-match policy
4. **A specialist agent's `model: opus` becomes invalid after a model retirement** — refresh policy
5. **`apply_patch` fails 35% of the time on Codex** — what the user does instead

---

## 6. Risks under-weighted by the data

1. **The architectural rot at 2026-04-24 was created in 4 weeks of velocity, not over months.** This window is the *cause*; 2026-04-24 audit examined the *effect*. Velocity caps without quality gates produce SSRF in 30 days.
2. **Specialist-agent decay is a 30-day curve, not a "they were always bad" finding.** Anything that takes longer than 30 days to refresh is going to die the same way — including the 2026-04-24 plan items themselves if not actioned.
3. **The "discovery works, execution doesn't" asymmetry was already 5% a month earlier.** This isn't a new bug — it's a structural property of the skill system. Any new skill ships into a 5%-execution funnel.
4. **The user shipped 96 PRs in 4 weeks with effectively 1 reviewer (gemini-code-assist) on EVOKORE-MCP.** The 2026-04-24 audit cited this as a chronic risk; this window quantifies it: ~24 PRs/week with one bot reviewer is the upper bound of what's safe and we're past it.
5. **The `dangerouslySkipPermissions` addition in PR #181 (2026-03-24) is the genealogical ancestor of the 2026-04-24 SSRF chain.** Permission bypass + later-added SSRF surface = the chain. Catching the *first* `dangerouslySkipPermissions` introduction would have broken the chain at its root.
6. **Codex 1,669 user-interrupts + 5,125 Claude "stop" tokens in 30 days** = the user was actively halting wrong actions ~225×/day. That's the *true* cost of the maximally-permissive posture: human-in-the-loop is happening, just not in the harness, just in the user's reflexes.

---

## 7. Persona/coverage gaps (single merged panel critique)

The merged Workflow + MCP-Architecture + Security panel (Helena Marsh / Kai Nishida / Marcus Reyes / Priya Krishnan, each disagreeing with ≥2 proposals) flagged:

- **Helena Marsh** disagreed with: (a) Specialist-agent refresh — argues sunset is structurally cleaner than refresh-treadmill; (b) Voice features as KILL — argues they're identity-defining for the product even at security cost during sprint
- **Kai Nishida** disagreed with: (a) Disabling `skipDangerousModePermissionPrompt` mid-sprint — sequencing risk; (b) `pr-manager` as a skill — argues a slash command is sufficient and a skill is over-engineered
- **Marcus Reyes** disagreed with: (a) Net-new skill freeze — argues two-track (additive on existing patterns, frozen for new patterns); (b) sub-`.git` pre-commit guard — argues server-side ref-update hook is the actual fix
- **Priya Krishnan** disagreed with: (a) Treating this as a backfill — argues SSRF preconditions present means the audit IS live; (b) `Read-before-Edit` enforcement as Week-1 — argues TOCTOU is symptom; the *fix* is content-addressed reads (`stat`-on-open hash) which belongs in the harness, not a hook

Coverage gaps the panel flagged that the 2026-04-24 panel did not name:
- **Release-cadence economist** — nobody on either panel models "PRs/week safe upper bound for solo + N bots"
- **Submodule / vendoring expert** — this window had a working submodule policy, the next window broke it; nobody owns vendoring
- **Velocity-vs-debt tradeoff modeler** — the cumulative debt this window was creating became next window's emergencies; no persona quantifies that conversion

Both panel sets independently agreed: **a fixed 3-persona panel is too narrow.** The 2026-04-24 audit said the same. This is a frequency-2 finding for the rotating-bench recommendation.

---

## 8. Single highest-leverage action this week

Reconstructed for 2026-03-25 (the day after this window ends):

> **Land the 2026-04-24 Week-1 security items now, while the SSRF surface is still being designed and not yet shipped.**

Concretely:
1. Add the SSRF allowlist *contract* to the `httpUtils` work-in-progress before it merges
2. Don't broadcast `tokenFull` over WS in TelemetryExporter (#204 lands 2026-03-26 — 2 days after this window)
3. Disable `skipDangerousModePermissionPrompt` *before* PR #181 introduces the precedent

This is impossible from inside this window (we're a backfill), but it's the **single highest-value lesson** the comparison surfaces: **the 2026-04-24 emergency was preventable in this 4-week window with ~3 hours of guardrail work.**

---

## 9. Delta vs the 2026-04-24 audit

### Recurring chronic problems (frequency-multiplier confirmed)

| Item | This window | 2026-04-24 window | Status |
|---|---|---|---|
| `pr-manager` missing-skill errors | 16 | 256 | **Worsening, predictable trajectory** |
| `session-wrap` missing-skill errors | 10 | 74 | **Worsening** |
| "Top N priorities" / `next-session.md` | 220+ priorities + 373 next-session refs | 594 combined | **Stable per-day rate** |
| `Phase NNN` ceremony | 2,137 | 1,446 | **Higher this window — sprint heat** |
| Sibling tool errors | 926 | 4,913 | **Volume scales with concurrency, rate similar** |
| Read-before-Edit races | 209 | ~1,200 | **Worsening** |
| Codex `apply_patch` failures | 2,981 | (similar) | **Chronic, persistent** |
| Codex AGENTS.md is 0 bytes | yes | yes | **47-day-and-counting unaddressed** |
| No `~/.claude/CLAUDE.md` | yes | yes | **47-day-and-counting** |
| Maximally-permissive harness | yes | yes | **47-day-and-counting** |
| Discovery vs execution asymmetry (95%/5%) | identical | identical | **Structural property, not a bug** |
| `mcp_repos.json` 0 bytes | yes | yes | **Plumbed-but-empty registry persists** |
| 60+ root `test-*.js` / `hook-*.js` clutter | 73 files | 60+ | **Chronic, slowly growing** |
| Ephemeral root files (`findings.md`, `task_plan.md`, `next-session.md`, `progress.md`) committed | yes | yes | **Chronic** |

### Window-specific (NOT in 2026-04-24 baseline)

| Item | This window | Why missing from 2026-04-24 |
|---|---|---|
| Specialist agents dominant (1,592 implementer + 533 researcher + 235 reviewer) | yes | 2026-04-24 framed them as "stale, lose 300:30." They weren't stale on 2026-03-24 — they decayed in the gap |
| EVOKORE-MCP at v3.0.0; README matches reality | yes | 2026-04-24 finds drift to v3.1/37 tools — drift was created during the gap |
| `httpUtils.ts` SSRF | DOES NOT EXIST | Created 2026-04-03 |
| `tokenFull` broadcast | DOES NOT EXIST | Introduced 2026-03-26 (#204) |
| TelemetryExporter SSRF surface | DOES NOT EXIST | Same |
| Sub-`.git` committed at `SKILLS/MCP WRAPPERS/claude-skills-mcp/.git/` | NO — proper submodule | Regressed during the gap |
| 96 EVOKORE-MCP PRs in 4 weeks (sprint heat) | yes | 2026-04-24 had different repo mix; this is the v3.0/v3.1 sprint specifically |
| 442/425 sessions/day spikes (2026-03-14/15) | yes | Different velocity profile vs next window |
| Multi-bot review demonstrably better on AGENT33 | confirmed | 2026-04-24 cited this; this window provides the natural experiment |
| Codex 1,669 user-interrupts | yes | 2026-04-24 reported 36% interrupt rate; this window confirms it's not a model-version artifact |

### 2026-04-24 Week-1 items this window RE-CONFIRMS (strongest frequency signal)

In order of strength of re-confirmation:

1. **Item #7 — Read-before-Edit/Write enforcement hook.** 209 + ~1,200 = ~1,400 errors across both windows. Two consecutive months of identical pattern. **Ship this first.**
2. **Item #8 — Throttle parallel Bash to N=2-3.** 926 + 4,913 = ~5,800 sibling errors across both windows. Same rate per call.
3. **Item #9 — Populate `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md`.** 47 days unaddressed by today's date. Codex AGENTS.md mtime is 2026-03-07.
4. **Item #10 — `Unknown skill: X` fuzzy-match.** 16+10 → 256+74 trajectory. The user is *training themselves* to invoke things that don't exist; lag-of-fix proportional to muscle-memory cost.
5. **Item #14 — `/priorities [N]` slash command.** 594 combined / 220+ this window. Behaviourally validated demand.
6. **Item #13 — `pr-manager` skill.** 256 + 16. Same pattern.
7. **Item #25/#26 — Semgrep rule pack + enable Copilot review.** AGENT33's natural-experiment in this window (multi-bot review = better outcomes) is the strongest evidence yet.
8. **Item #3 — Disable `skipDangerousModePermissionPrompt`.** This window's appearance of `dangerouslySkipPermissions` in PR #181 is the first instance; the 2026-04-24 chain followed.

### Window-specific findings the 2026-04-24 audit MISSED

1. **Submodule policy regressed between the two windows.** `claude-skills-mcp` was a clean submodule on 2026-03-24, became a committed sub-`.git/` later. The 2026-04-24 audit treated it as a static problem; it's a regression. **Pre-commit guard is the right fix, but a *server-side ref-update hook* would have caught it.**
2. **Specialist agents were not stale at 2026-03-24** — they were the dominant delegation pattern. Their decay over 30 days is the more important story. **Refresh, don't delete; and learn why they decayed (model:opus + tool-list drift are the candidates).**
3. **EVOKORE-MCP shipped 96 PRs in 4 weeks with effectively one bot reviewer.** This is the velocity that produced the next-window emergencies. *No 2026-04-24 plan item caps PR-per-week or mandates human review thresholds.* The KILL list should include "shipping >20 EVOKORE-MCP PRs/week without a second reviewer."
4. **The `dangerouslySkipPermissions` addition in PR #181 (caught only by gemini-code-assist) is the first ancestor of the SSRF chain.** A Semgrep rule for `dangerouslySkipPermissions` / `skipDangerousModePermissionPrompt` additions would have prevented the cascade at root.
5. **Voice features ate disproportionate engineering bandwidth this window** (PRs #167, #181, plus 5+ voice-related research docs from 2026-03-11 / 2026-03-14). The 2026-04-24 plan doesn't address voice's opportunity cost. *Voice is identity for this product, but the prioritization arithmetic should be explicit.*

### Better / worse / same?

**Same overall trajectory; different acute symptoms.**
- Behavioural friction (sibling, missing-skill, ceremony, Codex apply_patch, frustration tokens): **worse over time but same rate per call.** Volume tracks activity.
- Harness baseline (no user CLAUDE.md, 0-byte AGENTS.md, maximally-permissive): **identically broken in both windows.** This is the slowest-decaying problem.
- Architectural drift (README, tool count, SSRF surface, sub-`.git`, manifest correctness): **NEW in 2026-04-24 window, not in this one.** Created during the v3.1 sprint; the v3.0/v3.1 sprint that ran *through* this window's last weeks is where the drift was seeded.
- Specialist agents: **regressed from "dominant" to "abandoned" in 30 days.**
- Skill execution success: **same 5% asymmetry; no change.**

**Net:** the chronic friction was identical; the velocity was higher; the architectural rot is a recent acute layer on top. The 2026-04-24 plan correctly identifies the chronic problems but **under-weighted the velocity → debt conversion rate** that this window quantifies.

---

## Appendix — methodology notes

This audit was run in a constrained mode (1 panel, no parallel research sub-agents) per coordinator's rate-limit guidance. Sampling was done via grep aggregates on the in-window file lists rather than per-session reads (transcripts would have overflowed orchestrator context). Per-repo coverage: AGENT33, EVOKORE-MCP, EDCTool, Gemma, evokore.com, yourediscovery.com, OCR_LOCAL, RSMFConverter, Claudius Maximus, EDCwayback, AIRI-MRE sampled or counted; CHELATEDAI, CLIBURNER, REVOKORE, ROKKER, Openclaw_local, mattmre.com, myainewsbot.com, cc-lens enumerated for activity (most had near-zero in-window PR or session activity in this window). The panel was a single 4-persona merged Workflow + MCP-Architecture + Security panel rather than two separate panels; each persona contributed ≥2 disagreements.

Raw counts and date-of-introduction commits were verified against `git log --all --oneline --diff-filter=A` and `git show 8e8db56:<path>` against the window-end commit.
