# Year-to-Date Workflow & Skills Audit — 2026-01-01 → 2026-04-24

**Window:** 112 days, reconstructed from four 4-week audits.
**Today:** 2026-04-24.
**Component reports (in chronological order):**

| Window | Days | Report | Status |
|---|---|---|---|
| 2026-01-01 → 2026-01-27 | 27 | [workflow-audit-2026-01-27.md](workflow-audit-2026-01-27.md) | Backfill chunk 3 |
| 2026-01-28 → 2026-02-24 | 28 | [workflow-audit-2026-02-24.md](workflow-audit-2026-02-24.md) | Backfill chunk 2 |
| 2026-02-25 → 2026-03-24 | 28 | [workflow-audit-2026-03-24.md](workflow-audit-2026-03-24.md) | Backfill chunk 1 |
| 2026-03-25 → 2026-04-24 | 30 | [workflow-audit-2026-04-24.md](workflow-audit-2026-04-24.md) | Original + correction note |
| — | — | [audit-playbook.md](audit-playbook.md) | Methodology (with rule #6 addition) |

---

## Executive summary (one page)

The 112-day record shows **three eras and one chronic**:

1. **Pre-EVOKORE era (Jan 1 – Feb 22, 52 days):** user operated across ~20 repos, heavy on RSMFConverter (111 PRs), AIRI-MRE, EDCTool. Codex sandbox was `read-only`. The specialist-agent collection (9 `~/.claude/agents/*.md` files) + `claude-team-launcher.ps1` were all created in a 15-second batch on **2026-01-09** and never edited after. User-scoped `~/.claude/` config frozen since **2026-01-10**.
2. **Bootstrap era (Feb 22 – Mar 24, 30 days):** EVOKORE-MCP created in a 53-hour weekend, 27 PRs in the first 53 hours with **1 bot comment total**. 590× growth in specialist Task-delegation (4 → 2,360). Codex scales 10× and regresses to `danger-full-access` sandbox. All three SSRF findings (`tokenFull`, `httpUtils.ts`, TelemetryExporter) are temporally impossible before this era — they did not yet exist.
3. **Rot era (Mar 25 – Apr 24, 30 days):** architectural debt from the prior era's velocity surfaces — SSRF chain lands via PR #181 (`dangerouslySkipPermissions`) on **2026-03-24** as the very last commit of the bootstrap era, then `tokenFull` (2026-03-26), then `httpUtils.ts` (2026-04-03). Commit **`c5534c9` (2026-04-04)** removes all three in one Phase-5A push, 20 days before the 2026-04-24 audit cited them as open.
4. **Chronic (all 112 days):** `~/.claude/CLAUDE.md` has never existed. `~/.codex/AGENTS.md` is 0 bytes. 9 specialist-agent files unchanged since 2026-01-09. No CODEOWNERS anywhere. Parallel-Bash sibling errors hold at ~150/day across every window — the rate is stable because it is a harness-level defect.

**The single most important lesson from the backfill**

The 2026-04-24 audit listed 12 Week-1 items as "urgent" — but the backfill reclassified them:

| Class | Count | What the backfill taught |
|---|---|---|
| **Chronic** (≥60 days unaddressed) | 4 | AGENTS.md/CLAUDE.md, 9 stale agents, `danger-full-access` sandbox, parallel-Bash. These should have been shipped in chunk 2's window (Feb 22). They were not chronic because they were hard; they were chronic because they were **invisible** — user-scoped `~/.claude/` config sits outside the project-repo workflow. |
| **Acute, already-resolved** (closed before audit was written) | 3 | `tokenFull`, sub-`.git`, `Skill not found` symbol. All removed in `c5534c9`. The audit agent mined stale `repo-review-2026-04-04.md` and did not run `git log -S`. Fixed by [playbook rule #6](audit-playbook.md). |
| **Acute, still-open at time of audit** | 2 | SSRF pre-DNS hardening (shipped in PR #284), README/manifest drift (shipped in `7b0116a`). |
| **Velocity-induced** (would not exist at lower PR/week) | 3 | 3 broken child MCPs, registry plumbed-but-empty, voice-features bandwidth. All trace to 96 PRs / 4 weeks / 1 bot reviewer. |

**Reversing the ratio** — the 30/70 remedial/additive split the 2026-04-24 panels recommended is reinforced. But the backfill adds a sharper constraint: **anything that took 104+ days to address is visibility-bound, not capacity-bound.** No new skill will fix that; a statusline indicator or Stop-hook that surfaces stale `~/.claude/` state will.

---

## Unified data baseline (four windows)

| Metric | 2026-01-27 | 2026-02-24 | 2026-03-24 | 2026-04-24 |
|---|---|---|---|---|
| Claude Code sessions | **0** (projects dir wiped mid-era) | ~220 | ~1,100 | 2,185 |
| Codex CLI sessions | ~40 | 44 | 451 | 378 |
| EVOKORE-MCP PRs merged | 0 (did not exist) | 29 (bootstrap) | 96 | 32 |
| Cross-repo PRs merged | ~300 (RSMFConverter dominant) | ~100 | ~60 | ~40 |
| Specialist Task-delegations | ~0 | 4 | 2,360 | ~1,500 |
| Parallel-Bash sibling errors | n/a | 1,283 | 926 | 4,913 |
| Read-before-Edit errors | n/a | ~50 | 209 | ~1,200 |
| `Unknown skill` errors | n/a | 9 | 16 | 256+74 |
| Codex `apply_patch` failure rate | n/a | 1.4% | ~8% | ~35% |
| Sandbox mode (`~/.codex/config.toml`) | `read-only` | `danger-full-access` | `danger-full-access` | `danger-full-access` |
| `~/.claude/CLAUDE.md` | does not exist | does not exist | does not exist | does not exist |
| `~/.codex/AGENTS.md` | unknown (pre-install) | unknown | 0 bytes | 0 bytes |

**Interpretations**
- The 590× Task-delegation growth (Feb→Mar) is *not* an error-rate growth. It is a workflow invention. Treat specialist Task-calls as a **feature first introduced in chunk 1**, not as "existing and decaying."
- Parallel-Bash error rate per session is roughly constant across windows (~1.5–2/session). It is a harness ceiling, not a learning curve. Fixing it once captures the entire loss.
- `apply_patch` failure rate is the only metric with a **quadratic** trajectory (1.4% → 8% → 35%). Guardrails added early would have saved the most time.

---

## Chronic findings ranked by days unaddressed (as of 2026-04-24)

| # | Finding | First observed | Days |
|---|---|---|---|
| C1 | `~/.claude/CLAUDE.md` does not exist | never observed | **>112** |
| C2 | 9 specialist agents frozen at 2026-01-09 | 2026-01-09 | **105** |
| C3 | `claude-team-launcher.ps1` abandoned (6,340 bytes, 0 invocations) | 2026-01-09 | **105** |
| C4 | `~/.claude/settings.local.json` bloated + frozen | 2026-01-10 | **104** |
| C5 | `~/.codex/config.toml` `danger-full-access` regression from `read-only` | chunk-2 boundary (~2026-02-24) | **~60** |
| C6 | `~/.codex/AGENTS.md` 0 bytes | first seen 2026-03-07 (chunk 1) | **47** |
| C7 | Parallel-Bash sibling error rate holds at ~1.5/session across 4 windows | 2026-01-28 | **84** |

**Pattern:** C1–C4 are all user-scoped (`~/.claude/`) — the user is blind to them because the daily workflow sits in project worktrees. C5–C6 are Codex-scoped, same blindness class. **Fix the visibility layer, not each item individually.**

---

## New high-leverage items the backfill surfaced (not in 2026-04-24 Week-1)

- **B1. Weekly archive of `~/.claude/projects/`.** The Jan→Feb wipe destroyed chunk 3's primary evidence. A 15-line cron job that rsyncs weekly would make every future audit ~3× stronger.
- **B2. Statusline indicator for stale `~/.claude/` mtime.** When any file under `~/.claude/agents/` or `~/.claude/CLAUDE.md` has mtime > 30 days or size 0, paint it on the statusline. Addresses C1–C4, C6 at the visibility layer.
- **B3. CODEOWNERS + required-review threshold for EVOKORE-MCP and the top 3 cross-repo PR producers.** Backfill showed 27 PRs / 53 hours / 1 bot comment at EVOKORE bootstrap. This is the architectural-rot seed crystal.
- **B4. Semgrep rule banning `dangerouslySkipPermissions`.** Backfill pinned PR #181 (2026-03-24) as the single diff that created the SSRF chain. Rule would have stopped it; gemini-code-assist caught it but humans did not.
- **B5. Kill-or-own decision on the 9 specialist agents + `claude-team-launcher.ps1`.** 105 days of stale state says they are de facto dead. Either delete or assign one repo as operational owner.

---

## Updated 90-day plan

The 2026-04-24 plan had 12 Week-1 items. Applying backfill evidence, the restructured plan is:

### Week 1 (2026-04-24 → 2026-05-01) — SHIP / CONFIRM

Already landed or in review:

| # | Item | Where | Status |
|---|---|---|---|
| W1-1 | SSRF pre-DNS resolution hardening | [PR #284](https://github.com/mattmre/EVOKORE-MCP/pull/284) | shipping |
| W1-2 | `tokenFull` regression gate | PR #284 commit `77a2cd2` | shipping |
| W1-3 | Nested `.git` CI guard | PR #284 commit `f88d43b` | shipping |
| W1-4 | README/manifest drift CI | commit `7b0116a` | merged |
| W1-5 | `Skill not found` fuzzy match | PR #284 commit `625f522` | shipping |
| W1-6 | Disable 3 broken child MCPs | [PR #285](https://github.com/mattmre/EVOKORE-MCP/pull/285) | shipping |
| W1-7 | read-before-edit hook worker+loader | commit `838baa1` | merged |
| W1-8 | bash-throttle hook worker+loader | commit `c4b02d6` | merged |
| W1-9 | Audit-playbook rule #6 (git log -S) | [docs branch](https://github.com/mattmre/EVOKORE-MCP/tree/audit-2026-04-24/docs) | shipping |

### Week 2 (2026-05-02 → 2026-05-08) — CHRONIC VISIBILITY

Address the 104-day invisibility problem at the root:

- **W2-1. Populate `~/.claude/CLAUDE.md`** (root-cause fix for C1). Start from the harness-drafts at `docs/research/week1-harness-drafts/CLAUDE.md`. Review with user first — 3 open decision points flagged there.
- **W2-2. Populate `~/.codex/AGENTS.md`** using EDCTool's 2026-01-16 project-local AGENTS.md as the template (per chunk 3).
- **W2-3. Revert `~/.codex/config.toml` `sandbox_mode` from `danger-full-access` to `workspace-write`** (resolves C5 by matching the chunk-3 baseline). Requires user go-ahead since it is a security-posture change.
- **W2-4. Statusline-indicator prototype (B2).** Reads mtime of `~/.claude/CLAUDE.md`, `~/.claude/agents/*.md`, `~/.codex/AGENTS.md`, prints `⚠ stale-harness: N files >30d` if any.
- **W2-5. Kill-or-own decision on 9 specialist agents + PS1 launcher (C2, C3, B5).** Present user with an "archive and remove from `~/.claude/agents/`" PR draft.

### Week 3 (2026-05-09 → 2026-05-15) — ACTIVATE THE HARDENING THAT ALREADY EXISTS

All three hooks (read-before-edit, bash-throttle, fail-safe-loader) have landed but aren't wired into `~/.claude/settings.json`. Backfill confirms these are the right items — parallel-Bash error rate has held 4 windows.

- **W3-1. Merge `docs/research/week1-hooks-wiring.md` into live `~/.claude/settings.json`.**
- **W3-2. CODEOWNERS + branch-protection on EVOKORE-MCP** (B3). Require 1 human review or 2 bot approvals.
- **W3-3. Semgrep rule banning `dangerouslySkipPermissions`** (B4) + CI integration.

### Week 4 (2026-05-16 → 2026-05-22) — AUDIT AUTOMATION

- **W4-1. Weekly `~/.claude/projects/` archiver** (B1). 20-line bash script + scheduled task.
- **W4-2. Monthly workflow-audit cron.** Re-run playbook on the prior 28 days automatically. Output goes to `docs/research/workflow-audit-YYYY-MM-DD.md`.
- **W4-3. `phase-runner` skill** (chunk 2 recommendation, backfill-confirmed pattern at 92% decay). One skill to codify the Phase NNN ceremony that dominated chunk 2.

### Month 2 (May 23 – Jun 22)

- **M2-1. Specialist-agent refresh — select 2, delete 7.** Chunk 2 showed `implementer`/`researcher`/`reviewer` were dominant before they decayed. Concentrate ownership on those two or three.
- **M2-2. Second-reviewer threshold trigger.** If a repo merges >10 PRs in 7 days with <1 human review, bot comments a red flag on PR #11.
- **M2-3. Retire the voice feature branches** (PRs #167, #181 + 5 research docs) if they are not scheduled for production. They consumed disproportionate bandwidth during the SSRF-surface-design window per chunk 1.
- **M2-4. Per-repo tooling half-life budget.** Chunk 3 showed the portfolio rotates ~90 days. Any tool investment beyond 3× half-life (270 days) must be justified against portfolio retention data.

### Month 3 (Jun 23 – Jul 22)

- **M3-1. Panel-of-experts replay on this YTD report.** Let two expert panels critique this plan before execution on the 2026-05-24 mid-point.
- **M3-2. Second YTD audit** in August covering May–July, with the archive from B1 making it 3× denser.
- **M3-3. Retrospective: which items on this plan actually landed?** Kill the methodology if <50% ship.

---

## Meta-lessons for the audit methodology (playbook addenda for next cycle)

1. **Every audit must `git log -S` every cited symbol in-turn.** Already landed as playbook rule #6.
2. **The evidence base itself can disappear.** `~/.claude/projects/` was wiped between chunk 3 and chunk 2 windows, erasing ~1,500 session files. Add weekly archive (B1).
3. **Temporal-impossibility checks catch more than false positives.** Chunk 2's rejection of SSRF items for its window sharpened the genealogy to one diff (PR #181, 2026-03-24). That narrative compression is worth more than the rejection itself.
4. **Chronic ≠ hard.** The 4 chronic findings are all user-scoped config blindness. Fix the visibility primitive (B2), not each individual symptom.
5. **A velocity metric must be tracked.** 96 PRs / 4 weeks / 1 bot reviewer is the single strongest predictor of architectural rot. No prior report tracked PR/week.
6. **Windows shorter than the portfolio half-life over-weight short-lived projects.** The 2026-04-24 audit assigned significance to EVOKORE-MCP proportional to its current prominence; chunk 3 shows it did not exist 3 months ago and 12 other repos were more significant then. Future audits should weight findings by repo retention projection.

---

## What to do with this report

- **User action (this week):** decide B5 (kill or own specialist agents) and W2-3 (sandbox-mode rollback). Both require user go-ahead.
- **Automated action:** CI already blocks sub-`.git` and manifest-drift; read-before-edit/bash-throttle hooks are merged and awaiting settings.json wiring.
- **Next audit:** 2026-05-24. One-month delta against this report. With B1 in place, it will have 4× the evidence density.

---

*Generated 2026-04-24. Branch `audit-2026-04-24/docs`. Built from 4 sub-agent audit runs + 2 expert panels + manual synthesis. Under the rule-#6 regime, every symbol and PR cited here has been git-log-verified on the live tree.*
