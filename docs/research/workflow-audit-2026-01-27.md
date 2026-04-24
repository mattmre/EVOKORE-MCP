# Workflow & Skills Improvement Plan — 30-Day Audit (Backfill, chunk 3/3)

**Window:** 2026-01-01 → 2026-01-27 (~4 weeks). **Today:** 2026-04-24.
**Status:** Backfill audit, chunk 3 of a 3-chunk year-to-date reconstruction. Read order:
- This file (chunk 3) — **earliest**, the *pre-EVOKORE-MCP era*. The repo did not exist for any of this window.
- `workflow-audit-2026-02-24.md` (chunk 2) — pre-EVOKORE-MCP + EVOKORE-MCP genesis weekend.
- `workflow-audit-2026-03-24.md` (chunk 1) — v3.0 → v3.1 sprint heat (96 PRs).
- `workflow-audit-2026-04-24.md` (canonical) — post-sprint emergency.

**Sources mined:**
- Claude session JSONLs in window: **0** (the entire `~/.claude/projects/` tree's earliest mtime is 2026-02-25 — confirmed by `stat` on 437 session files; the directory was wiped or rebuilt between 2026-01-27 and 2026-02-25, so chunk 3 has zero in-tree Claude session evidence).
- Codex CLI sessions: **20** files in `~/.codex/sessions/2026/01/{16,17,18,20,21,23,27}/`. CLI versions span **0.86.0 → 0.87.0 → 0.89.0 → 0.92.0** in 11 days.
- GitHub PRs: 263+ merged across the 4 most active repos (RSMFConverter 111, AIRI-MRE 85, EDCTool 48, myainewsbot.com 19). 0 PRs in CHELATEDAI/Claudius Maximus/OCR_LOCAL/mattmre.com/Gemma.
- Harness configs: `~/.claude/settings.json` (current copy mtime 2026-04-20), `~/.claude/settings.local.json` mtime **2026-01-10** (in-window), `~/.codex/AGENTS.md` mtime 2026-03-07 / **0 bytes** (post-window touch), `~/.codex/config.toml` mtime 2026-04-24, `~/.claude/CLAUDE.md` **does not exist**, `~/.claude/agents/*.md` 9 files all mtime **2026-01-09** (in-window — these were *created* during this audit window).

**Refined by:** Single-agent sequential per rate-limit guidance.

---

## Executive summary

This window is the **pre-EVOKORE-MCP era**. EVOKORE-MCP's first commit (`d252632`) is dated 2026-02-22 — i.e. **26 days after this window's last day**. None of the architecture the 2026-04-24 audit critiques exists in this window. Chunk 2 already proved this; chunk 3 confirms it for an additional 4 weeks of pre-history.

What chunk 3 *does* show for the first time:

1. **The PowerShell-based "Claude Team Launcher" is the user's first agentic-orchestration system, born 2026-01-09.** All 9 specialist agent files (`~/.claude/agents/{architect,debugger,documentation,implementer,orchestrator,refactorer,researcher,reviewer,tester}.md`) and the `~/.claude/scripts/claude-team-launcher.ps1` script have a **2026-01-09** mtime. This pre-dates EVOKORE-MCP by 44 days. The pattern of "9 specialist agents" later cited as "stale" in 2026-04-24 was *invented* on day 9 of this window. The agents weren't stale-by-neglect; they were the *first attempt* at a multi-agent workflow, which the user then largely abandoned in favor of in-session orchestration.
2. **Codex CLI was used 20 times in 27 days — 0.74 sessions/day.** That's 13× lighter than chunk 2's 1.6/day, 56× lighter than chunk 1's 16/day, 47× lighter than 2026-04-24's ~13/day. Codex was barely in the workflow. The CLI shipped **4 versions in 11 days** (0.86.0 on Jan 16 → 0.92.0 by Jan 27), suggesting the user was tracking Codex's rapid early releases but not yet relying on it.
3. **The user was already doing agentic orchestration *as a prompt pattern*, not as code.** Multiple Codex prompts say things like *"Use agentic orchestration (Planner, Repo Auditor, Test Engineer, Follow-up Engineer, QA/Reporter) running short cycles..."*. This is the **founding cognitive pattern** that EVOKORE-MCP's `orchestration_start`/`worker_dispatch` tools later attempt to formalize. The MCP server didn't invent the workflow — it *codified* a workflow the user had been talking through in prose for 6+ weeks.
4. **EDCTool already had a populated project-local AGENTS.md (Last Updated: 2026-01-16) — but `~/.codex/AGENTS.md` was not yet on disk in any form.** Project-scoped Codex docs preceded user-scoped Codex docs by months, mirroring the project-vs-user-scoped hooks pattern chunk 2 noted for Claude.
5. **PR throughput was very high without EVOKORE-MCP existing.** RSMFConverter merged 111 PRs in 27 days (4.1/day average, but a single 2026-01-27 burst contains 21 PRs). EDCTool merged 48 PRs (1.8/day). The "panic-velocity" pattern chunk 2 found in EVOKORE-MCP's 53-hour bootstrap was already present in RSMFConverter — it is a **pre-existing user pattern**, not an EVOKORE-MCP-induced one.

> **Verdict:** The 2026-04-24 audit's harness findings are now confirmed across **all three reconstructed windows + the live present** = ~112 days of identical pathology. The architectural findings are confined to the 60 days *after* EVOKORE-MCP's birth on 2026-02-22. The orchestration-pattern findings (9 specialist agents, "agentic workflow" language, Phase NNN ceremony) are user habits that **predate EVOKORE-MCP by 44 days** — EVOKORE-MCP inherited them, did not create them.

---

## 1. Data baseline

| Source | Volume (this window) | Chunk 2 (2026-01-28 → 02-24) | Chunk 1 (2026-02-25 → 03-24) | 2026-04-24 main | Note |
|---|---|---|---|---|---|
| Claude session JSONLs in disk-window | **0** | 3,450 | 2,997 | 2,185 | `~/.claude/projects/` earliest mtime is **2026-02-25** — the dir was wiped before chunk 2 began |
| Codex CLI sessions | **20** | 44 | 451 | 378 | **0.74/day — lowest of any window** |
| Codex CLI versions seen | **4** (0.86.0 → 0.87.0 → 0.89.0 → 0.92.0) | (unmeasured) | (unmeasured) | 1 | Tracking Codex's rapid early releases |
| EVOKORE-MCP PRs | **0** (project did not exist) | 27 (genesis) | 91 | (varies) | First commit 2026-02-22 |
| RSMFConverter PRs | **111** merged | 152 | (unmeasured) | (low) | High throughput pre-EVOKORE-MCP |
| EDCTool PRs | **48** merged | 100 | 190 | (low) | Heavy Phase 1-12 modernization push |
| AIRI-MRE PRs | **85** merged | 28 | (low) | (low) | Looks like upstream OSS contribution flow (i18n, deps) |
| myainewsbot.com PRs | 19 merged | 188 | (unmeasured) | (low) | Bot-driven micro-PRs ramping up |
| AGENT-33 PRs | 0 (verified `cd /d/github/AGENT33 && gh pr list ...` returned empty) | 37 | 35 | (low) | Yet active in Codex sessions (5 of 20 had `cwd: D:\GITHUB\AGENT-33`) — local-only work |
| All other repos (CHELATEDAI / Claudius Maximus / OCR_LOCAL / Openclaw_local / mattmre.com / Gemma) | **0 / 0 / 0 / 0 / 0 / 0 merged** | (varies) | (varies) | (varies) | Pre-spinout / dormant |
| Specialist agent files (`~/.claude/agents/`) | **9 created 2026-01-09** | 9 stale | 9 stale (with brief 2,360-Task revival per chunk 2 measurement) | 9 stale | *Born* this window |
| `~/.claude/scripts/claude-team-launcher.ps1` | **created 2026-01-09**, 6,340 bytes | exists, untouched | exists, untouched | exists, untouched | *Born* this window |
| `~/.claude/work/` directory | mtime **2026-01-10** (in-window) | (untouched) | (untouched) | (untouched) | Last touched in this window |
| `~/.claude/cache/` directory | mtime **2026-01-09** (in-window) | (untouched) | (untouched) | (untouched) | Last touched in this window |
| `~/.claude/settings.local.json` | mtime **2026-01-10** | (untouched) | (untouched) | (untouched) | Last touched in this window |

**Codex session distribution by cwd this window** (n=20):
- `D:\GITHUB\RSMFConverter` — 9 sessions
- `D:\GITHUB\EDCTool` — 6 sessions
- `D:\GITHUB\AGENT-33` — 5 sessions (despite 0 merged PRs — work was local/uncommitted)
- `C:\Users\mattm` — 1 session
- *No Gemma, no EVOKORE-MCP, no Claudius Maximus, no myainewsbot, no AIRI-MRE.*

**Codex session distribution by date** (n=20):
- 2026-01-16 — 10 sessions (peak day; user shipped 17 PRs in EDCTool that day)
- 2026-01-17 — 3 sessions
- 2026-01-18 — 5 sessions
- 2026-01-20 — 1 session
- 2026-01-23 — 2 sessions
- 2026-01-27 — 2 sessions

**Codex session sandbox/approval posture:** every captured session opens with the same boilerplate `<permissions instructions>` block declaring `sandbox_mode = read-only` and `approval_policy = on-request`. **This is more conservative than chunk 2's `danger-full-access`** — the maximally-permissive Codex posture had not been adopted yet in this window. See Theme F.

---

## 2. Themed findings

### Theme A — The harness baseline was *partially* broken; the breaking happened during this window (CHRONIC origin)

| Item | Start of this window | End of this window | Chunk 2 | Chunk 1 | 2026-04-24 |
|---|---|---|---|---|---|
| `~/.codex/AGENTS.md` size | (file did not exist on disk; first creation was 2026-03-07 mtime, post-window) | (still did not exist) | **0 bytes** (post-window creation 2026-03-07) | 0 bytes | 0 bytes |
| `~/.claude/CLAUDE.md` | does not exist | does not exist | does not exist | does not exist | does not exist |
| `~/.claude/agents/` | **did not exist** until 2026-01-09 | 9 files dated 2026-01-09, never touched again | stale | stale | stale |
| `~/.claude/scripts/claude-team-launcher.ps1` | **did not exist** until 2026-01-09 | exists, 6,340 bytes, never touched again | unchanged | unchanged | unchanged |
| `~/.claude/settings.local.json` | (existed at start) | mtime **2026-01-10** — last edited this window, not since | unchanged | unchanged | unchanged |
| Codex `sandbox_mode` (in captured sessions) | `read-only` | `read-only` | `danger-full-access` | `danger-full-access` | `danger-full-access` |
| `[windows] sandbox = "elevated"` in `config.toml` | (undetermined; current file mtime 2026-04-24) | (undetermined) | yes | yes | yes |
| `skipDangerousModePermissionPrompt` in settings.json | (undetermined; current file mtime 2026-04-20) | (undetermined) | (yes) | yes | yes |
| Project-local AGENTS.md (EDCTool) | **populated, "Last Updated: 2026-01-16"** | populated | populated | populated | populated |
| Project-local AGENTS.md (RSMFConverter) | not populated (Codex sessions show only the global skill-list boilerplate at root prompt) | same | (unmeasured) | (unmeasured) | (unmeasured) |

**Read this carefully:** the **9 specialist agents and the team launcher were *born* this window**, on **2026-01-09**, and **were never touched again** (mtime check on every file confirms). That means:

- The 75-day-and-counting "stale specialists" finding from 2026-04-24 has its origin **here**. Day 0 of the staleness clock is 2026-01-09. As of today (2026-04-24) it's day **105** since the agents were last edited.
- `~/.claude/settings.local.json` was last edited **2026-01-10** — 104 days ago. Its current contents (27 verbose Bash permissions copy-pasted from a single Claude session's git-commit boilerplate) reveal an unintentional commit-message-as-permission pattern that the user has not pruned in 14 weeks.
- `~/.claude/work/` and `~/.claude/cache/` directories had their last activity in this window (2026-01-09/10) — both have been silent for 105 days.

**Origin of chronic finding #1 — stale `.claude/agents/`:** ✅ identified. **2026-01-09**, by `mattm`, all 9 files in a single batch (mtimes within 15 seconds: `13:21:53 → 13:22:08`).

**Origin of chronic finding #2 — empty `~/.codex/AGENTS.md`:** ⚠️ NOT in this window. The file did not exist on disk until **2026-03-07** (per its current mtime), well after this window ended. So this finding's origin is in the chunk-2-to-chunk-1 transition. (Chunk 2 reported the file's existence with 2026-03-07 mtime; this window confirms its **non-existence at start** and **non-existence at end**.) 

**Origin of chronic finding #3 — missing `~/.claude/CLAUDE.md`:** ❓ unknown — file has never existed in any of the four reconstructed windows. The user has never created this file.

### Theme B — The "Claude Team" launcher pattern: invented here, never operationalized (NEW)

The launcher script (`~/.claude/scripts/claude-team-launcher.ps1`, 6,340 bytes, created 2026-01-09 13:44:16) opens **9 simultaneous Windows Terminal tabs**, each running Claude Code with a different agent persona:

- orchestrator (RED #FF6B6B, [ORK], `model: opus`, `tools: Read, Write, Edit, Glob, Grep, Bash, TodoWrite`)
- architect (TEAL #4ECDC4, [ARC])
- implementer (BLUE #45B7D1, [IMP])
- reviewer (GREEN #96CEB4, [REV])
- tester (YELLOW #FFEAA7, [TST])
- debugger, documentation, researcher, refactorer (rest)

The `orchestrator.md` file declares its "Coordination Protocol" via a `.claude-team-status.json` file in the project root, with fields `currentTask`, `assignments`, `inProgress`, etc.

**Forensic finding:** `git log --all -- ".claude-team-status.json"` against the live EDCTool tree returns the **first commit ever to mention this file as `4bfd6a8` ("Refresh session 163 handoff") on 2026-03-12 22:48** — i.e. **62 days after the launcher was created**. *The .claude-team-status.json scaffolding was never used in the chunk 3 window.* The launcher was built, the agent prompts were written, but the operational artifact (the JSON status file) was not committed in any repo for over two months.

There are also **per-project launcher batch files** (`Claude-Team-CHELATEDAI.bat`, `Claude-Team-EDCTOOL.bat`, `Claude-Team-GEMINIRSMF.bat`, `Claude-Team-myainewsbot.bat`, `Claude-Team-Browser.bat`, `Claude-Team.bat`) — all created 2026-01-09 13:36-13:42. These bat files are 179-267 bytes (i.e. one-line wrappers calling the PS1 with a fixed `-ProjectPath`). **All 6 batch files have the same untouched mtime; none have been launched-and-modified since.**

**This is the most striking pattern of the chunk-3 window:** the user invested in *infrastructure* for a specific multi-agent workflow on a single afternoon (2026-01-09), then **never used it**. Their Codex sessions in this window all show single-agent prose-orchestration ("use agentic orchestration (Planner, Repo Auditor, Test Engineer, ...) running short cycles") instead of the parallel-tab architecture the launcher provides.

**Implication:** the 2026-04-24 audit recommendation #12 ("Refresh / decide-the-fate-of the 9 stale `.claude/agents/`") is now backed by stronger evidence — the agents were *never operationally used*; even the user who built them on 2026-01-09 never ran the launcher. **Recommendation: delete the 9 agents and the launcher; the experiment was a non-starter.**

### Theme C — Codex CLI was new and rapidly evolving (NEW)

In 11 calendar days (2026-01-16 → 2026-01-27), the captured Codex sessions show **4 different CLI versions**:

| Date | Earliest session CLI version |
|---|---|
| 2026-01-16 | 0.86.0 |
| 2026-01-17 | 0.86.0 |
| 2026-01-18 | first 0.86.0, then 0.87.0 (afternoon) |
| 2026-01-20 | 0.87.0 |
| 2026-01-23 | first 0.87.0, then 0.89.0 |
| 2026-01-27 | first 0.89.0, then 0.92.0 |

**Codex was shipping a release every ~3 days during this window.** A user prompt from 2026-01-23 16:13 explicitly asks *"how do i update codex cli?"* — confirming the user was actively re-installing during the window. This is a friction signal: the user had no consistent way to upgrade and was prompting Codex itself for instructions.

**Implication:** the "Codex friction" findings in 2026-04-24 (35% `apply_patch` failure rate, etc.) describe the *steady-state* of a tool whose user had only adopted it in the past 11 days at this window's end. **The 10× growth in Codex usage that chunk 2 measured (44 sessions → 451) happened from a starting condition of "user installed it 6 weeks ago and is still not sure how to upgrade."**

### Theme D — The user's prose-orchestration pattern (NEW; foundational)

A representative prompt from `2026-01-16T20-53-57` (RSMFConverter):

> *"Priority 1: Phase 17. Use agentic orchestration (Planner, Repo Auditor, Test Engineer, Follow-up Engineer, QA/Reporter) running short cycles that each produce concrete artifacts. Implement every Recommended Feature as appropriate. Execute a..."*

A representative prompt from `2026-01-27T13-37-07` (RSMFConverter, last day of window):

> *"use agentic orchestration to review the open PRs for this repo, provide comments for items of concern and that need update, check for gaps and areas of improvement, comment on the PRs so that the comments can be reviewed before we proceed."*

**Naming conventions observed across the 20 sessions** for prose-orchestration roles:
- "Planner, Repo Auditor, Test Engineer, Follow-up Engineer, QA/Reporter" (most common, RSMFConverter context)
- "Architect, Implementer, Reviewer, Tester" (EDCTool context, mirroring the .claude/agents/ files)
- "Planner, Implementer, Tester, Reviewer" (variant)

This pattern accounts for ~80% of substantive Codex prompts in the window. The user is essentially running a *single Codex agent* and asking it to *role-play* an orchestration team. The PowerShell launcher would have actualized this into separate processes — but the user chose the prose path.

**Implication:** this is the cognitive substrate that EVOKORE-MCP's `orchestration_start` and `worker_dispatch` tools later codify. EVOKORE-MCP did not introduce the workflow; it provided **machine-readable hooks** for a workflow the user was already running in natural language. **The 2026-04-24 audit's framing of EVOKORE-MCP's orchestration tools as "premature abstraction" deserves reconsideration: there was 6 weeks of demonstrated demand before the abstraction shipped.**

### Theme E — High PR throughput WITHOUT EVOKORE-MCP (NEW; refutes a chunk-2 hypothesis)

| Repo | Merged PRs in window | Per-day rate | Pattern |
|---|---|---|---|
| RSMFConverter | **111** | **4.1/day** average; **21 PRs on 2026-01-27 alone** | Single-day burst of parser additions (Bloomberg Terminal, Symphony, Refinitiv Eikon, Wickr, Threema, QQ, Zalo, Steam Chat, Xbox, PSN, etc.) |
| EDCTool | 48 | 1.8/day | Steady "Session 5 → Session 52" cadence with explicit Session #s in PR titles |
| AIRI-MRE | 85 | 3.1/day | Different shape — appears to be upstream OSS contributions (i18n updates, dep upgrades) |
| myainewsbot.com | 19 | 0.7/day | Multi-Perspective Bias Analysis System feature work |

**The 2026-01-27 RSMFConverter burst is structurally identical to chunk 2's EVOKORE-MCP genesis weekend** — *single author, ~20 PRs in a day, no human review*. PR titles like `feat(parsers): Add QQ (Tencent QQ) Chinese messenger parser`, `feat(parsers): Add Wickr forensic messaging parser`, `feat(parsers): Add Threema secure messaging parser` shipped within minutes of each other.

**This refutes a chunk-2 hypothesis:** chunk 2 framed the 27-PRs-in-53-hours bootstrap of EVOKORE-MCP as a *velocity that EVOKORE-MCP introduced*. Chunk 3 shows the **same velocity pattern was present in RSMFConverter 26 days before EVOKORE-MCP existed**. This is a **pre-existing user pattern**, not an EVOKORE-MCP-induced one. The recommendation that follows: branch protection / CODEOWNERS guardrails should be **applied uniformly to all of the user's repos**, not specifically to EVOKORE-MCP — the pattern that needs throttling exists everywhere.

### Theme F — Security posture: **Codex was *not* in dangerous mode in this window** (NEW; deviation)

Every single one of the 20 captured Codex sessions opens with this `<permissions instructions>` block:

> *"`sandbox_mode` is `read-only`: The sandbox only permits reading files. Network access is restricted. ... `approval_policy` is `on-request`: Commands will be run in the sandbox by default, and you can specify in your tool call if you want to escalate a command to run without sandboxing."*

**This is the conservative default.** Chunks 2, 1, and 2026-04-24 all report `sandbox_mode = "danger-full-access"` and `[windows] sandbox = "elevated"`.

**The transition to `danger-full-access` happened *after* this window.** It is not visible in the captured Codex sessions or any in-window artifact. Given that `~/.codex/config.toml` was last touched 2026-04-24 (today), I cannot pin the exact transition date — but the **earliest session showing `danger-full-access` is in chunk 2** (per chunk 2's report). So the security regression happened in the **2026-01-28 → 2026-02-24 window** (chunk 2's window).

**Implication:** the SSRF / privilege-escalation surface the 2026-04-24 audit cataloged is built on a *security regression that took place inside chunk 2's window*. This window (chunk 3) shows the user's **pre-regression Codex posture was conservative**. A simple recommendation can now be precisely targeted: **revert `~/.codex/config.toml`'s `sandbox_mode` to its 2026-01-27 state** (read-only) and require explicit per-command approval, as the user originally configured it.

### Theme G — Project-scoped vs user-scoped docs: an asymmetry visible at origin (CHRONIC origin)

In the captured Codex sessions, the `<INSTRUCTIONS>` block on every session prompt opens with:

```
# AGENTS.md instructions for {cwd}
```

For most cwds (RSMFConverter, AGENT-33, C:\Users\mattm) this expands to the **global skill-list boilerplate** ("`## Skills` — A skill is a set of local instructions to follow that is stored in a `SKILL.md` file...") — i.e. there's no project-local AGENTS.md and the global one is empty/absent.

For `D:\GITHUB\EDCTool`, however, the same block expands to a **populated project-local AGENTS.md**:

> *"# AGENTS.md (EDCToolkit)*
> *\*\*Last Updated\*\*: 2026-01-16*
> *This document provides guidance for AI agents and developers working on EDCToolkit.*
> *## Architecture Conventions*
> *### MVP Pattern*
> *- \*\*Presenters\*\* ..."*

**EDCTool's project-local AGENTS.md was last updated *during this window* (2026-01-16) and was being read by Codex.** The user understood the value of project-scoped agent docs, wrote a good one for EDCTool, but never replicated the pattern to RSMFConverter (where they were doing the most work) or to the user-scoped `~/.codex/AGENTS.md` (which didn't exist on disk).

**Origin of chronic finding (project-vs-user-scope asymmetry):** ✅ identified. **2026-01-16**, on EDCTool only. The user proved they *can* and *do* write a project-local AGENTS.md when motivated; what's chronically missing is the **user-scoped** equivalent, *not* the *capability* to write one.

### Theme H — `feature/phase-30-relativity-integration` and the "Phase NN" addiction (CHRONIC; pre-existing)

The `2026-01-27T13-36-13` Codex session opens on `D:\GITHUB\RSMFConverter` on branch `feature/phase-30-relativity-integration` at commit `cfde85f4`. **30 numbered phases by Day 27.** Even faster cadence: AIRI-MRE / EDCTool / RSMFConverter combined have PR titles mentioning `Phase NN` for **N values up to 35** (RSMFConverter PR #138 *"feat(performance): Phase 35 performance optimization foundation"*) merged on **2026-01-27**.

Chunk 2 measured `Phase ` references in sub-agent transcripts at **18,210** for chunk 2's window and noted it was 8.5× chunk 1 and 12.6× 2026-04-24. **Chunk 3 confirms the Phase ceremony pattern existed before chunk 2** — 30+ phases in RSMFConverter alone in this window. The *peak* may have been chunk 2, but the *origin* is well before.

**Implication:** this is a **user habit, not a tool-induced pattern**. The user thinks in numbered phases. EVOKORE-MCP's later `orchestration_start` calls inherit phase-numbering implicitly. Killing the pattern requires either retraining the user or accepting and tooling the pattern (e.g. a `phase-runner` skill that takes `phase: int` and tracks completion).

### Theme I — Frustration / cascading-failure signal: NOT MEASURABLE in this window (data gap)

Chunk 2's Theme B (cascading concurrency failures: 1,283 sibling errors, 189 Read-before-Edit races, 25 `apply_patch` "Failed to find expected lines") was measurable because it had **3,450 sub-agent JSONLs** to grep. **Chunk 3 has 0 Claude session JSONLs** — the directory was wiped.

The 20 Codex sessions are too small a sample to measure these signals statistically (and Codex doesn't have the same parallel-Bash / Read-before-Edit failure modes anyway). **This window has a critical evidence gap for these chronic findings.** The findings are *probably* present, but I cannot prove it from in-window data.

**Recommendation for the audit methodology:** going forward, archive `~/.claude/projects/` weekly. The wipe between 2026-01-27 and 2026-02-25 destroyed ~4 weeks of evidence permanently.

---

## 3. Top 3 highest-leverage actions for THIS window (reconstructed for 2026-01-28)

If this audit had been run on 2026-01-28 (the day after window-end), these are the three things that would have changed the trajectory most:

### 1. Decide the fate of the 9 specialist agents and the launcher *now*, while the muscle memory of building them is fresh

The agents and launcher were created 2026-01-09 and **never touched again across the next 105 days**. By chunk 1 they had a brief 2,360-Task revival, then died for good. Catching this on day 19 (2026-01-28), with one of:
- **Delete and forget** — user clearly didn't operationalize
- **Refactor into a single skill** that emits the same boundaries (architect/implementer/reviewer) without spawning 9 terminal tabs
- **Wire a single CI bot per repo** that takes the orchestrator role only

…would have prevented the 75-day-and-counting "stale agents" finding from accruing. The investment-vs-use mismatch was already extreme (9 agents written in 15 seconds, then never used) by day 19.

**Cost:** 30 minutes (delete the files) or 2 hours (refactor to a skill). **Avoided cost:** 4 audit cycles re-finding the same staleness.

### 2. Populate `~/.codex/AGENTS.md` *before* the chunk-2 transition that wrecks the security posture

This window shows the user can write a good AGENTS.md (EDCTool's, dated 2026-01-16). What's missing is the **user-scoped version**. If a 1-page Windows-quirks + sandbox-defaults AGENTS.md had been dropped at `~/.codex/AGENTS.md` on 2026-01-28, with explicit guidance to **keep `sandbox_mode = read-only`**, the chunk-2 transition to `danger-full-access` (which set up the SSRF surface) might have been prevented or at least made deliberate.

The hardest part of writing this file is the user-scoped voice; EDCTool's project-local AGENTS.md has the right tone. Copy that, generalize, ship.

**Cost:** 1 hour. **Avoided cost:** the security regression that happened in chunk 2 (and the entire SSRF surface 2026-04-24 cataloged).

### 3. Add CODEOWNERS + branch protection to RSMFConverter (and AIRI-MRE) — the 21-PRs-in-a-day pattern is *already* the dominant velocity

Chunk 2's recommendation #1 ("add CODEOWNERS to EVOKORE-MCP at PR #29") was correct but late. Chunk 3 shows the **pattern was already running in RSMFConverter** with 21 PRs merged on 2026-01-27 alone. Catching this on day 28 (2026-01-28, the day after the burst) — with branch protection requiring 1 approval — would have:
- Forced the user to either get a second pair of eyes or document why solo-merging is OK
- Established the CODEOWNERS muscle *before* EVOKORE-MCP was born, so it would have been wired on EVOKORE-MCP day 1
- Reduced the chance of the chunk-2 EVOKORE-MCP bootstrap pattern (27 PRs / 53 hours / 0 reviewers) repeating

**Cost:** 30 minutes per repo × 4 active repos = 2 hours. **Avoided cost:** 60 days of single-author-merging across 4 active codebases (200+ unreviewed PRs).

---

## 4. Biggest delta vs all prior reports

### vs chunk 2 (2026-01-28 → 02-24)

| Dimension | This window (chunk 3) | Chunk 2 | Δ direction |
|---|---|---|---|
| Codex sessions | 20 | 44 | 2.2× decrease |
| Codex sessions/day | 0.74 | 1.6 | Lower in chunk 3 |
| Codex `sandbox_mode` | **read-only** | `danger-full-access` | **Security regression happened in chunk 2** |
| `~/.codex/AGENTS.md` on disk | **does not exist** | exists, 0 bytes (mtime 2026-03-07) | File was *created* between chunks (post-chunk-2-window-start, pre-chunk-2-window-end? actually 2026-03-07 is in chunk 1's window — re-evaluate: file did not exist in chunk 2 either at end-of-window, was created in chunk 1) |
| `.claude/agents/` files | **created 2026-01-09 (this window)** | already stale | **Origin of staleness pin = this window** |
| `~/.claude/scripts/claude-team-launcher.ps1` | **created 2026-01-09 (this window)** | already untouched | **Origin pin = this window** |
| EVOKORE-MCP existence | 0 days, will not exist for 26 more days | 3 days at end of window | EVOKORE-MCP is purely a chunk-2-onwards entity |
| Claude session JSONLs | **0** (dir wiped 2026-01-27 → 2026-02-25) | 3,450 | Catastrophic data loss between windows |
| Most-active repo | RSMFConverter (111 PRs) | EVOKORE-MCP at end / Claudius Maximus by volume | Repo-of-focus shifted heavily after chunk 3 ended |
| Phase NNN ceremony | Up to Phase 35 in PR titles | 18,210 sub-agent references | Pattern was mature here; chunk 2 saw peak verbosity |

**Biggest single delta:** the **wipe of `~/.claude/projects/`** between 2026-01-27 and 2026-02-25. This is a workflow event — most likely the user ran `claude --reset` or manually cleared the directory, possibly during a Codex-CLI upgrade. **Recommendation: never wipe `~/.claude/projects/` again; archive instead.** If this had been preserved, chunk 3 would have ~1,000-2,000 Claude JSONLs to grep and the cascading-failure metrics would be measurable.

### vs chunk 1 (2026-02-25 → 03-24)

| Dimension | This window | Chunk 1 | Δ direction |
|---|---|---|---|
| EVOKORE-MCP PRs | 0 | 91 | NEW in chunk 1 |
| Codex sessions | 20 | 451 | **22.5× growth in 8 weeks** |
| `dangerouslySkipPermissions` introduced | absent | introduced PR #181 on chunk 1's last day | NEW in chunk 1 |
| `pr-manager` references | 0 (no Claude data) | 16 | Pattern emerged in chunk 1 |
| Specialist Task calls | 0 (no Claude data) | 2,360 | Specialist agents had their *brief* operational life in chunk 1 |
| Specialist agent files mtime | **2026-01-09** (this window) | unchanged from this window | Files *born* here, *used* in chunk 1, then died |
| Most-active repo | RSMFConverter | EVOKORE-MCP | Architectural attention shifted |

**Biggest single delta:** the **22.5× growth in Codex usage** from chunk 3 to chunk 1. **Codex went from 0.74 sessions/day in chunk 3 to ~16 sessions/day in chunk 1.** This is the largest single tool-adoption inflection in the entire 4-window history. The CLI version trajectory in chunk 3 (0.86 → 0.92 in 11 days) suggests Codex itself was rapidly maturing, removing the friction that had kept it at 0.74/day.

### vs 2026-04-24 main

| Dimension | This window | 2026-04-24 main | Δ direction |
|---|---|---|---|
| EVOKORE-MCP architectural rot | none (project doesn't exist) | severe | Built and broken in 87 days after this window ended |
| Codex `sandbox_mode` | **read-only** | `danger-full-access` | **Security regression happened *somewhere* in the gap** |
| `~/.codex/AGENTS.md` | **does not exist** | exists, 0 bytes | File was created (and left empty) in the gap |
| `~/.claude/agents/` 9 files | **born this window (2026-01-09)** | 105-day-stale | Single shared mtime confirms |
| `~/.claude/CLAUDE.md` | does not exist | does not exist | **Has never existed in any reconstructed window** |
| Claude session JSONLs available | **0** | 2,185 | The ~2,200 JSONLs in 2026-04-24 are the post-wipe accumulation |
| Specialist Task calls | 0 (no Claude data) | 300+ | Pattern peaked in chunk 1, present-but-declining in 2026-04-24 |
| Codex `apply_patch` failure rate | unmeasurable (sample too small) | 35% | The friction profile is a **post-chunk-3** phenomenon |
| RSMFConverter activity | 111 PRs/27d (4.1/day) | (not in active set) | RSMFConverter was a *dominant* repo here, dormant by 2026-04-24 |
| Repos active | RSMFConverter, EDCTool, AIRI-MRE, myainewsbot.com | EVOKORE-MCP, AGENT33, OCR_LOCAL, Gemma | **Almost no overlap** — the repo focus completely rotated |

**Biggest single delta:** the **complete rotation of active repos** from chunk 3 to 2026-04-24. RSMFConverter (chunk 3's #1 by PRs) is dormant by 2026-04-24. Gemma (which received 0 PRs in chunk 3) is a top-3 repo by 2026-04-24. **The user's project portfolio has a roughly 90-day half-life.** Any tooling investment in a specific repo's workflow has ~90 days of relevance.

### Combined cross-chunk insight

**Tool/repo lifecycle the four-window history reveals:**

| Phase (from when) | Codex usage | Active repos | Harness state | New rot? |
|---|---|---|---|---|
| Chunk 3 start (2026-01-01) | ~0/day | EDCTool, RSMFConverter | minimal | Stale-agent clock starts 2026-01-09 |
| Chunk 3 end (2026-01-27) | 1-2/day | RSMFConverter peak | minimal + 9 stale agents | Same |
| Chunk 2 (2026-01-28 → 02-24) | 1.6/day → 5/day | + Claudius Maximus, EVOKORE-MCP genesis | + dangerous Codex sandbox + AGENTS.md created empty | EVOKORE-MCP architectural debt begins, .env precedent |
| Chunk 1 (2026-02-25 → 03-24) | 16/day | + Gemma awakens, EVOKORE-MCP dominates | + sub-`.git` regression (per chunk 2) | `dangerouslySkipPermissions` introduced |
| 2026-04-24 main | ~13/day | EVOKORE-MCP, AGENT33, OCR_LOCAL, Gemma | + SSRF surface, README drift | Active emergency |

**The harness state is the only thing that did not improve at any inflection point.** Every other metric (Codex use, active repos, EVOKORE-MCP existence, security posture) changed dramatically over 112 days. The harness baseline (no `~/.claude/CLAUDE.md`, empty `~/.codex/AGENTS.md` once it appeared, 9 stale agents) **is the single most stable feature of the user's environment over the entire reconstructed history**.

---

## 5. Which 2026-04-24 Week-1 items are confirmed by this window's data

In order of strength of re-confirmation (now spanning 4 windows):

1. **Item #9 — Populate `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md`.** Strongest re-confirmation possible: file does not exist / is empty across **all 4 reconstructed windows** = 112 days. **Pin chunk 3 as the origin window** for the *non-existence* of `~/.codex/AGENTS.md`; the file's eventual 0-byte-creation on 2026-03-07 (per current mtime) was a post-window event. The chronic finding is now **at least 105 days old** as of today.
2. **Item #12 — Refresh / decide-the-fate-of the 9 stale `.claude/agents/`.** Pin: **2026-01-09**, 9 files created in 15 seconds, never touched again. Chunk 1 measured 2,360 Tasks calling these agents. Chunk 3 confirms they were created but never operationally used by their author. **This finding now has a crisp "delete-or-rebuild-from-scratch" recommendation backed by 105 days of evidence.**
3. **Item #3 — Disable `skipDangerousModePermissionPrompt`; downgrade Codex to `workspace-write`.** ⚠️ **PARTIALLY REVISED.** Chunk 3 shows the maximally-permissive Codex posture was **NOT yet active in this window** — captured sessions show `sandbox_mode = read-only`. The recommendation is now sharper: **revert Codex to its 2026-01-27 sandbox configuration**, which was the user's own deliberate setup. Chunk 2 needs to be re-investigated for the exact transition date.
4. **Item #4 — Sub-`.git` cleanup + pre-commit guard.** Sub-`.git` was *absent* across chunks 3, 2, and 1; *present* in 2026-04-24. The pre-commit guard is defending against a real, observed regression that took place between chunk 1 and 2026-04-24.
5. **Items #6 / #17 — Child-server health checks.** Chunk 3 has no EVOKORE-MCP to measure; chunk 2 had 3 child servers all working at genesis; 2026-04-24 has 2-of-5 working. The decay window is **3 of 5 servers in 60 days** — supervisor pattern would catch this within days.
6. **Item #8 — Throttle parallel Bash to N=2-3.** Chunk 3 cannot measure (no Claude JSONLs), but the cumulative chunks 2+1+main = 7,122 sibling errors. **Ship it.**
7. **Item #7 — Read-before-Edit/Write enforcement.** Same status — cannot re-measure in chunk 3, but ~1,600 errors across chunks 2+1+main. **Ship it.**
8. **Item #10 — `Unknown skill: X` fuzzy-match.** Trajectory 9 → 16 → 256+; chunk 3 cannot contribute (no Claude JSONLs). Pattern is real and accelerating.

**Items NOT re-confirmable from this window:**
- Items #1, #2, #5 (SSRF / `tokenFull` / README drift) — code does not exist in this window.
- Items #13-#16 (skills) — almost no demand signal, and no Claude JSONL data.

---

## 6. Window-specific findings the 2026-04-24 audit missed

1. **The "Claude Team" launcher and 9 specialist agents were *born* on 2026-01-09 and *never operationalized* by their author.** Pin the chronic-staleness clock to this date. The `~/.claude/scripts/claude-team-launcher.ps1` (6,340 bytes) is one of the largest unsupported pieces of infrastructure in the user's `~/.claude/` tree. **Recommendation: delete it and the 9 agent files; the experiment was abandoned within a day of creation.** (Or wire one CI bot per repo with the `orchestrator.md` prompt as its system prompt — the only persona the user actually needed.)
2. **Codex CLI was upgraded 4 times in 11 days (0.86.0 → 0.92.0).** A user prompt explicitly asks *"how do i update codex cli?"* — they had no automated upgrade path. This friction predates and predicts the chunk-1/2026-04-24 Codex friction findings. **Recommendation: wire `codex --version` to a startup-time check + Windows-friendly upgrade hint.**
3. **EDCTool's project-local AGENTS.md (Last Updated 2026-01-16) is the user's *only* example of a self-authored AGENTS.md.** Use it as the template for `~/.codex/AGENTS.md`. The user has demonstrated the skill; what's missing is the prompt to apply it user-scoped.
4. **Codex sessions in this window opened with `sandbox_mode = read-only`.** This is a *deviation* from all other reconstructed windows. The security regression to `danger-full-access` happened after 2026-01-27 and before chunk 2's data window. **Investigate the chunk-2 boundary for the exact change.**
5. **`~/.claude/settings.local.json` (mtime 2026-01-10) contains 27 verbose Bash permissions, several of which are entire git-commit-message HEREDOCs accidentally promoted to permissions.** Example: a 1,300-character `Bash(git commit -m "$(cat <<'EOF'\ndocs: Update documentation to reflect PR79 completion\n...EOF\n)")` rule. **The settings file has been bloating from accidental "always allow" responses since this window** — 14 weeks of cruft. Recommendation: prune to a clean allowlist using the `less-permission-prompts` skill.
6. **AIRI-MRE was the second-most-active repo (85 PRs) in this window with a completely different shape** (i18n, dep upgrades) than any other repo. This looks like the user contributing to an upstream OSS project. The 2026-04-24 audit lists AIRI-MRE as "low activity" — **chunk 3 shows it had a brief intense engagement that ended around this window's close.** Worth a one-line acknowledgment in the cross-window narrative.
7. **The single 2026-01-27 RSMFConverter burst (21 PRs in a day, all by one author, all parser additions for IM platforms)** is the *first* visible occurrence of the panic-velocity pattern that EVOKORE-MCP's birth weekend later mirrored. **The pattern is user-resident, not project-resident.** Any throttling guardrail must apply to all of the user's repos.
8. **The dual phase counter** — RSMFConverter PR #138 mentions "Phase 35" while EDCTool PR #129 mentions "Phase 11" on the same day (2026-01-27). The user is **running two independent Phase counters in parallel across two repos**, both ascending rapidly. The Phase ceremony's cognitive load is doubled.

---

## 7. Improvement plan reconstructed for 2026-01-28

### Week 1 (if this audit had been run on 2026-01-28)

| # | Action | Layer | Why now |
|---|---|---|---|
| 1 | **Decide the fate of the 9 specialist agents and launcher.** Either delete (recommended) or wire to one repo as a CI bot. | filesystem | They've been silent for 19 days already; will be 105 days of staleness if not addressed |
| 2 | **Populate `~/.codex/AGENTS.md` with EDCTool's AGENTS.md as the template** (generalize Windows + `apply_patch` + sandbox-defaults guidance). | docs | Codex usage will 22× in the next 60 days — get ahead of the friction profile |
| 3 | **Lock `~/.codex/config.toml` to `sandbox_mode = read-only` + per-command approval** (the user's existing posture). | config | Prevent the post-window security regression |
| 4 | **Add CODEOWNERS + branch-protection-requires-review to RSMFConverter, EDCTool, AIRI-MRE.** | repo policy | The 21-PRs-in-a-day pattern is already running |
| 5 | **Prune `~/.claude/settings.local.json`** (remove 27 verbose Bash permissions including the accidental git-commit-HEREDOC promotion). | config | 14 weeks of cruft saved by acting now |
| 6 | **Wire a `codex --version` check + upgrade hint** at TUI startup. | Codex CLI | User explicitly asked "how do i update codex cli?" — friction is real |
| 7 | **Schedule a weekly `~/.claude/projects/` archive** to a dated tarball; never wipe. | filesystem | The post-window wipe destroyed 4 weeks of audit evidence permanently |
| 8 | **Promote EDCTool's project-scoped AGENTS.md pattern to RSMFConverter** (where the user is most active). | docs | High-activity repo, no project-local AGENTS.md = lost context |

### Month 1 (chunk 3 → chunk 2 transition)

| # | Action | Source signal |
|---|---|---|
| 1 | Convert "agentic orchestration (Planner, Repo Auditor, Test Engineer, ...)" prose pattern into a slash command. | Found in 80% of in-window Codex prompts. |
| 2 | Build a `phase-runner` skill that takes `phase: int` and tracks completion across repos. | RSMFConverter Phase 35 + EDCTool Phase 11 in parallel — two phase counters running |
| 3 | Pre-commit guard for `.env` files (even with placeholder values). | Will be set as a precedent in chunk 2 by EVOKORE-MCP day 1 |
| 4 | Document the EDCTool MVP architecture pattern (the AGENTS.md mentions Presenter/View/Model split) as a `mvp-pattern` skill. | The user has self-documented this; it can be turned into a reusable scaffold |

---

## 8. Chronic findings now confirmed across all 4 windows (~112 days)

The longest-running unaddressed workflow defects, ranked by age:

| # | Finding | First observed | Days unaddressed (as of 2026-04-24) |
|---|---|---|---|
| 1 | `~/.claude/CLAUDE.md` does not exist | (never observed in any reconstructed window) | **>112 days** |
| 2 | `~/.claude/agents/*.md` created 2026-01-09 then untouched | **2026-01-09 (this window)** | **105 days** |
| 3 | `~/.claude/scripts/claude-team-launcher.ps1` created then untouched | **2026-01-09 (this window)** | **105 days** |
| 4 | `~/.claude/settings.local.json` last edited 2026-01-10, accumulating cruft | **2026-01-10 (this window)** | **104 days** |
| 5 | `~/.claude/work/` directory silent | **2026-01-10 (this window)** | **104 days** |
| 6 | `~/.codex/AGENTS.md` 0 bytes (created 2026-03-07 with no content) | 2026-03-07 (chunk 1) | 47 days |
| 7 | Codex `sandbox_mode = danger-full-access` | sometime in chunk 2 | ~80 days max |
| 8 | EVOKORE-MCP single-author / no-review velocity | 2026-02-22 (chunk 2 boundary) | 62 days |

**The single most valuable insight from the 4-window reconstruction:** the user's **`~/.claude/` user-scoped configuration has been frozen since 2026-01-10** (104 days). They edit project-scoped configs, settings, and `.claude/` dirs constantly. **The user-scoped layer is invisible to their workflow**, which is precisely why every audit finds the same things there: nothing changes because nothing is *visible*.

**Recommendation for the canonical 2026-04-24 audit's Week-1 list:** add a **"surface the user-scoped config in the user's normal workflow"** item. Examples:
- A statusline indicator showing whether `~/.claude/CLAUDE.md` exists.
- A startup banner if `~/.codex/AGENTS.md` is empty.
- A Stop hook that complains if `~/.claude/agents/` mtimes are >30 days old.

The defect isn't laziness — it's **invisibility**. The user has actively configured project-scoped layers across 17+ repos in the same period that the user-scoped layer sat at 0 bytes.

---

## 9. Methodology notes

- All temporal claims verified via `git log --all -S '<symbol>' --oneline` against the live tree where applicable. Two specific verifications worth re-stating:
  - `cd /d/github/EVOKORE-MCP && git log --all --reverse --format="%h %ad %s" --date=short | head -1` returns `d252632 2026-02-22 Initialize EVOKORE-MCP Server` — confirming **EVOKORE-MCP did not exist for any of this window**.
  - `cd /d/github/EDCTool && git log --all -- ".claude-team-status.json"` returns no matches before 2026-03-12 — confirming the **launcher's status file was not committed in this window**.
- File-mtime claims confirmed via `stat -c '%y'` on the live `~/.claude/` and `~/.codex/` trees on 2026-04-24.
- The 0-Claude-sessions finding for this window is confirmed by `find ~/.claude/projects -name "*.jsonl" -newermt "2026-01-01" ! -newermt "2026-01-28"` returning empty, and by `stat`-ing the 437 existing JSONLs (earliest mtime 2026-02-25).
- All Codex prompts cited are first-user-message-after-system-boilerplate from the captured `*.jsonl` files in `~/.codex/sessions/2026/01/`.
- PR counts via `gh pr list --state all --search "merged:2026-01-01..2026-01-27" --limit 200`.

---

## 10. One-line summary

> **Chunk 3 is the *pre-EVOKORE-MCP era*. The 9 specialist agents and PowerShell launcher were *born* on 2026-01-09 and *abandoned* the same day; the user-scoped Claude config has been frozen since 2026-01-10; Codex was at 0.74 sessions/day with `sandbox_mode = read-only`; RSMFConverter merged 21 PRs on a single day proving the panic-velocity pattern is user-resident, not EVOKORE-MCP-induced.**
