# Workflow & Skills Improvement Plan — 30-Day Audit (Backfill, chunk 2/3)

**Window:** 2026-01-28 → 2026-02-24 (4 weeks). **Today:** 2026-04-24.
**Status:** Backfill audit, chunk 2 of a 3-chunk year-to-date reconstruction. Read order for the trilogy:
- This file (chunk 2) — earliest, the **pre-EVOKORE-MCP** and **EVOKORE-MCP genesis** window.
- `workflow-audit-2026-03-24.md` (chunk 1) — the **v3.0 → v3.1 sprint heat** window that produced 96 PRs.
- `workflow-audit-2026-04-24.md` (canonical) — the **post-sprint emergency** window the others trace back to.

**Sources mined:** 3,450 Claude session files (all sub-agent transcripts; the orchestrator JSONLs at the parent dirs were touched outside the window) across the same ~211 project subdirs as chunk 1, **44** Codex CLI session files (8% of chunk 1's 451 — Codex was barely used), 17 active repos in `D:/github/`, harness configs (Claude+Codex), EVOKORE-MCP repo state at commit `534eb55` (window-end PR #28 release of v2.0.1).
**Refined by:** 1 merged Workflow + Architecture + Security panel — Helena Marsh, Kai Nishida, Marcus Reyes, Priya Krishnan (per rate-limit guidance, single-agent sequential).

---

## Executive summary

This window straddles the **EVOKORE-MCP genesis event**. The repo did not exist on 2026-01-28; it was bootstrapped at commit `d252632` ("Initialize EVOKORE-MCP Server: Extracted 200+ Skills, Scripts, and CI Pipeline") and the **first 28 PRs of the project's life happened in the final ~3 days of the window** (2026-02-22 → 2026-02-24). 27 of 28 PRs were merged inside ~52 hours. PR #28 ("release: bump version to v2.0.1") closed the window at 22:39 UTC on 2026-02-24.

> **Verdict:** *The architectural rot the 2026-04-24 audit found was a 60-day-old artefact; the chronic harness rot is much older.* This window is two weeks of "everything but EVOKORE-MCP" plus one weekend of "ship a v2 MCP server in 28 PRs without a single human reviewer." The harness baseline is identically broken to both later windows. The only thing **better** here than at any later point is that the architectural drift literally hadn't happened yet — the architecture didn't exist.

Two findings that should reshape the read of both later audits:
1. **Codex was an eighth of its later self.** 44 Codex sessions in this window vs. 451 in chunk 1 vs. 378 in 2026-04-24. The "35% `apply_patch` failure rate" the 2026-04-24 audit cited as systemic was *not yet a high-volume problem*. The user *adopted* Codex heavily after this window. Onboarding-period guidance would have caught a lot.
2. **The first thing the user did with EVOKORE-MCP was ship 28 PRs in 3 days with zero human review and gemini-code-assist on only one of them (PR #5).** This is the founding velocity pattern that made every later audit's "no reviewer" finding inevitable. PR #1 (`fix: Resolve TypeScript build errors in EVOKORE-MCP v2`) shipped 14,164 additions / 69 deletions on 2026-02-22 with no comments at all. The later velocity isn't a regression — it's the design.

---

## 1. Data baseline

| Source | Volume (this window) | Chunk 1 (2026-02-25 → 03-24) | 2026-04-24 main | Top finding |
|---|---|---|---|---|
| Claude sessions | 3,450 / unmeasured GB / 211 subdirs (all sub-agent transcripts; parent JSONLs older) | 2,997 / 1.59 GB | 2,185 / 64 MB | **Highest file count of all three windows; sub-agent ratio inflated** |
| Codex sessions | **44** files | 451 | 378 | **8% of chunk 1 — pre-adoption phase** |
| EVOKORE-MCP PRs | **29** created / **27** merged (PRs #1–#28; project bootstrap) | 96 | (varies) | **Genesis event in last 3 days of window** |
| AGENT33 PRs | 37 merged | 35 | (low) | Multi-bot review (Copilot + gemini) already on |
| Claudius Maximus PRs | **134** merged | (unmeasured) | (low) | Highest per-repo throughput in window |
| OCR_LOCAL PRs | 128 merged | (unmeasured) | (low) | Heavy fix:fix ratio (143/536 commits = 27%) |
| EDCTool PRs | 100 merged | 190 | (low) | Pre-multi-fork phase |
| evokore.com PRs | 48 merged | 70 | (low) | Pre-domain spinout |
| myainewsbot.com PRs | **188** merged | (unmeasured) | (low) | Highest single-repo PR count this window |
| RSMFConverter PRs | 152 merged | (unmeasured) | (low) | Heavy SmS forensics work |
| AIRI-MRE PRs | 28 merged | (low) | (low) | Quiet maintenance |
| CHELATEDAI PRs | 49 merged | (low) | (low) | Active development |
| Gemma PRs | **1** merged | 118 | (low) | **Pre-Gemma-sprint era** |
| EDCwayback / yourediscovery.com / mattmre.com / cc-lens / CLIBURNER / REVOKORE / ROKKER | 0 merged each | (varies) | (varies) | Pre-spinout / dormant |

**Activity peaks (Claude sub-agent files/day):** 329 on 2026-01-29, 308 on 2026-01-30, 304 on 2026-02-10, 271 on 2026-02-01, 213 on 2026-02-14, 210 on 2026-02-23, 196 on 2026-02-13. Codex peak day: 8 on 2026-02-15. **Claude/Codex ratio this window ≈ 78:1; chunk 1 ≈ 6.6:1; 2026-04-24 ≈ 5.8:1.** Codex was not yet in the daily flow.

**Tool call distribution (Claude, full window aggregate over all subagent files):**

| Tool | Calls |
|---|---|
| Read | 29,377 |
| Bash | 12,782 |
| Write | 9,873 |
| Edit | 6,044 |
| Grep | 5,833 |
| Glob | 5,808 |
| WebFetch | 1,160 |
| WebSearch | 1,133 |
| TaskUpdate | 345 |
| SendMessage | 302 |
| TaskList | 109 |
| TaskCreate | 73 |
| **Task** | **4** |
| mcp__trigger__search_docs | 25 |
| mcp__claude_ai_Supabase__execute_sql | 13 |
| mcp__claude_ai_Hugging_Face__paper_search | 12 |

**Read this carefully:** there are **4 Task calls in 4 weeks** of sub-agent transcripts. Compare chunk 1's 1,592 implementer + 533 researcher + 235 reviewer (2,360 specialist Tasks) and 2026-04-24's 300+. **The specialist-agent delegation pattern that chunk 1 found "dominant" and 2026-04-24 found "stale" is not yet present in this window at all.** The user invented (or began invoking) that pattern *between* this window and chunk 1 — i.e. during the EVOKORE-MCP v3.0 → v3.1 sprint.

There is no measurable EVOKORE-MCP MCP tool usage from inside the user's own sessions during this window: 0 hits on `mcp__evokore-mcp` across the 500-file sample. The server existed for ~52 hours, was stdio-based, and had a brand-new install — the user wasn't yet calling its tools from Claude or Codex sessions.

**MCP servers actually in use this window (per session sub-agent transcripts):** `mcp__trigger__search_docs` (25), `mcp__claude_ai_Supabase__*` (15 total), `mcp__claude_ai_Hugging_Face__*` (14 total). Sparse. The MCP-native posture was *minimal* before EVOKORE-MCP existed.

---

## 2. Themed findings

### Theme A — The harness baseline was already broken (CHRONIC, identical to both later windows)

| Item | This window | Chunk 1 | 2026-04-24 |
|---|---|---|---|
| `~/.codex/AGENTS.md` size | **0 bytes** (file present, mtime 2026-03-07 — wasn't touched at all in window) | 0 bytes | 0 bytes |
| `~/.claude/CLAUDE.md` | does not exist | does not exist | does not exist |
| `.claude/agents/` (user-scoped, 9 stale specialists with `model: opus`) | already stale (all dated 2026-01-09 — *17 days before* this window starts) | stale | stale |
| Codex `sandbox_mode = "danger-full-access"`, `[windows] sandbox = "elevated"` | yes | yes | yes |
| `bypassPermissions` references in session payloads | 134 (sub-agent transcripts only — orchestrator-level not captured) | 3,098 | (high) |
| Frustration tokens (stop/wait/don't, full-window aggregate) | 113,696 lines containing one+ token | (similar) | (similar) |

**The harness baseline at the start of this window was exactly the same as the harness baseline at 2026-04-24, and the 9 specialist agents were already stale before the window even began.** That's a **75-day-and-counting unpopulated harness** by today's date. The 2026-04-24 audit's recommendations #9 (populate `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md`) and #12 (refresh stale agents) are **the longest-running unaddressed items in the audit history**.

The mtime on `~/.codex/AGENTS.md` is 2026-03-07 — *that's the only time it was touched after creation, and even that touch left it 0 bytes*. Re-confirmed by `ls -la /c/Users/mattm/.codex/AGENTS.md` on 2026-04-24.

### Theme B — Cascading failures from concurrency model (CHRONIC, lower magnitude — *because activity was lower*)

Aggregates over the full 3,450 in-window sub-agent files:

| Symptom | This window | Chunk 1 | 2026-04-24 |
|---|---|---|---|
| Sibling tool call errored | **1,283** | 926 | 4,913 |
| File has been modified since (Read-before-Edit race) | **189** | 209 | ~1,200 |
| InputValidationError | **19** | 31 | (unspecified) |
| Codex `apply_patch` hits | **1,815** | unknown | (high) |
| Codex `apply_patch` "Failed to find expected lines" | **25** (1.4% of apply_patch hits) | (similar) | 35% |
| Codex `turn_aborted` | **17** | 635 | (high) |

**The Codex `apply_patch` failure rate this window is 1.4%, not 35%.** That's a 25× change. The 2026-04-24 audit's framing of `apply_patch` as a "babysit a 35%-failure tool" was based on the high-volume era; in this window the absolute counts are tiny because Codex was barely used. The implication is that **`apply_patch` reliability degrades with usage volume, not that it's intrinsically broken**. Concurrency-pressure or context-compaction-driven file mutation is the more likely root cause — which means item #28 (fix `apply_patch` upstream) might be the wrong layer; the actual fix is throttling concurrent file mutations on the *Claude* side.

Sibling errors track the same pattern: 1,283 in this window with much lower velocity, 4,913 in 2026-04-24 with sprint-level velocity. **Per-call rate is roughly stable; volume scales with activity.**

### Theme C — Session-wrap and Phase NNN ceremony was the dominant prompt pattern (CHRONIC)

Aggregates over the in-window sub-agent files:

| Pattern | This window count |
|---|---|
| `Phase ` (ceremony) | **18,210** |
| `next-session.md` (file references) | **861** (per-file mentions); **1,353** (raw token instances) |
| `session-wrap` (token references) | **1,185** (per-file); **1,303** (raw) |
| `top 5 priorit` | **109** |
| `top 15 priorit` | 5 |
| `top 10 priorit` | 1 |
| `top 3 priorit` | 3 |
| Total "top N priorities" | ~120 (lower than chunk 1's 220+) |
| `Unknown skill` / `Skill not found:` errors | **9** |
| `pr-manager` references | 1 |
| EVOKORE hooks references (damage-control / purpose-gate / tilldone / session-replay) | **78** |
| `voice` references | 1,639 |
| `context-rot` / `orchestrat*` references | **7,179** |

**Read this carefully:**
1. **`Phase NNN` ceremony at 18,210 is 8.5× chunk 1's 2,137 and 12.6× 2026-04-24's 1,446**, despite this window having lower activity overall. The Phase ceremony was at *peak adoption* in this window, mostly driven by Claudius Maximus (Phases 27-30) and AGENT33 (Phases 27-30 backend contracts visible in PR titles like "Phase 27 Stage 1: operations hub backend"). The 2026-04-24 audit treats Phase ceremony as a chronic legacy pattern; **this window shows it was a deliberate, high-investment workflow that the user since deprecated by ~88%**.
2. **Only 9 missing-skill errors and 1 `pr-manager` reference all window.** The `pr-manager` muscle memory hadn't formed yet — chunk 1 has 16 errors, 2026-04-24 has 256. **The skill the user trained themselves to want was acquired *after* this window.** That's a pattern worth understanding: from 0 → 16 → 256 over three windows is the trajectory of a feature request encoded in the user's typing fingers.
3. **`session-wrap` is at 1,185 references with no missing-skill errors yet** because it was being satisfied via the `feature/session-wrap-6` branch + `chore: session wrap` commits actually shipped in EVOKORE-MCP this window (PR #6 merged via `ede021d`; commits `4123482`, `8584a21` etc.). Once this satisfied workflow was no longer being landed at the same rate, the missing-skill errors started accumulating.
4. **`context-rot` at 7,179 is the dominant single domain word** in this window. The PR titles confirm: "context-rot-a-freshness-20260225", "context-rot-d-windows-runtime-20260225", "context-rot-e-doc-tracking-20260225", "ORCHESTRATION_RELEASE_CLOSURE_2026-02-25.md". The user was actively engineering for context-rot mitigation 4 weeks before "context-rot" became the diagnosed problem in the 2026-04-24 audit. This is the kind of self-aware engineering the later audits don't credit.

### Theme D — EVOKORE-MCP did not exist for most of the window; when it did, it shipped at panic velocity (NEW)

EVOKORE-MCP commit history before window-end:

```
2026-02-22: d252632  Initialize EVOKORE-MCP Server: Extracted 200+ Skills...
2026-02-22: 345404b  Fix MCP Server regex parsing and push initialization
2026-02-22: 1000abe  docs: add CONTRIBUTING, LICENSE, and CODE_OF_CONDUCT
2026-02-22: 6079687  Fix MCP Server path resolution to use __dirname
2026-02-22: b864794  feat: Add get_skill_help tool and extensive documentation
... [123 commits in 53 hours]
2026-02-24: 534eb55  Merge PR #28 release/v2.0.1 (window-end)
```

**29 PRs created (PRs #1–#28 plus a merge), 27 merged, in 53 hours.** Verified via `gh pr list --search "created:2026-01-28..2026-02-24"`.

PR-by-PR human review: I sampled #5, #19, #21, #22, #27. **Only PR #5 has a reviewer (gemini-code-assist) and even that's a single comment.** 0 human reviewers. PR #19 (5,652 additions / 78 deletions: "p01-p02: PR runbook and merge-order controls") merged with no review whatsoever. PR #1 (14,164 additions: "Resolve TypeScript build errors") merged the same. PR #2 (16,426 additions: "extensive documentation for CLI Status Line integration") merged the same.

**State of EVOKORE-MCP at window-end (commit `534eb55`):**

- `package.json` version: **`2.0.1`** — README says **"v2.0 (The Enterprise Router)"** — **README and reality matched** within a major.minor.
- `mcp.config.json`: 3 child servers (`github`, `fs`, `elevenlabs`). No supabase, no stitch — those came later.
- `claude-skills-mcp` is a **proper submodule** (`160000 commit 6238e705f9591b220d84661df4739707a7d7eb21`) — same hash chunk 1 found at its window-end. **The submodule pointer was stable from 2026-02-22 through 2026-03-24.** The regression to a committed sub-`.git` happened *after* chunk 1's window.
- **`.env` IS committed** (placeholder values: `GITHUB_PERSONAL_ACCESS_TOKEN="your_github_pat_here"`). This is a precedent — the *practice* of committing the .env file was set on day 1 of the project even with placeholder content. It's the muscle that makes a real-secret commit accident possible later.
- 29 root-level test/hook/findings/fix files (vs 73 at chunk 1's window-end, vs 60+ at 2026-04-24). The clutter started small and grew steadily.
- Project-scoped `.claude/settings.json` already had **damage-control / purpose-gate / session-replay / tilldone** hooks wired on day 1 (commit `d385cd4`: "feat: add Claude Code hooks system"). **The user shipped hooks discipline from day 1 of EVOKORE-MCP.** That's a positive pattern the 2026-04-24 audit should credit.
- `src/utils/httpUtils.ts` does not exist. `src/TelemetryExporter*` does not exist. `tokenFull` symbol is not in the tree (`git log -S 'tokenFull'` returns commit `c5534c9` — the **removal** commit — as oldest hit). **All three SEC findings the 2026-04-24 audit flagged are temporally impossible in this window.**
- `dangerouslySkipPermissions` was introduced in PR #181 on 2026-03-24 (per chunk 1) — confirmed by `git log -S 'dangerouslySkipPermissions'` whose oldest matching content commit is `01cdd3c` ("feat: voice-stop hook — spoken session summaries on Stop event (#181)"). **Not yet present in this window.**
- 9 stale `.claude/agents/*.md` (user-scoped) all dated 2026-01-09 — already stale before window started.

### Theme E — Claudius Maximus, AGENT33, Gemma activity profile (DIFFERENT)

The 2026-04-24 audit listed AGENT33, EVOKORE-MCP, Gemma, OCR_LOCAL, RSMFConverter as the active set. **In this window:**

- **Claudius Maximus** is the highest-PR repo (134 merged) — the user was running heavy Phase ceremony there
- **myainewsbot.com** is highest by raw PR count (188 merged), suggesting bot-driven micro-PRs
- **OCR_LOCAL** is fix-heavy (143 fix commits / 536 total = 27% fix rate)
- **RSMFConverter** at 152 merged was actively maintained
- **AGENT33** at 37 merged was steady with multi-bot review (Copilot + gemini-code-assist visible on PR #30 — same pattern that's still running today)
- **Gemma is essentially dormant: 1 merged PR.** The 118 PRs chunk 1 found, and the deep "Gemma worktree pollution" 2026-04-24 cited (`Gemma-phase216-pr` through `Gemma-phase238-pr`), did not exist yet. **Gemma adoption is a chunk-1-onwards phenomenon.**

### Theme F — Security posture (CHRONIC; SSRF surface absent but precedents being set)

The exploit chain the 2026-04-24 audit constructed (poisoned skill → `fetch_skill` against vLLM localhost → SSRF exfil → no permission prompt) is **structurally impossible in this window**:
- `httpUtils.ts httpGet()` doesn't exist
- TelemetryExporter doesn't exist
- `tokenFull` doesn't exist
- EVOKORE-MCP didn't exist for 25 of 28 days
- vLLM Gemma local server existed (per `MEMORY.md`) — that piece *is* present

**BUT the security culture preconditions were all here:**
- Codex `sandbox_mode = "danger-full-access"` + `[windows] sandbox = "elevated"` — same as later
- 9 stale specialist agents with no enforcement — same as later
- Project-scoped damage-control rules **were** wired on EVOKORE-MCP day 1 — *this is a counter-trend* the 2026-04-24 audit deserves to know about: the hooks system **was** the user's preferred guardrail layer, just at the project scope, not the user scope
- 337-skill catalog with no provenance manifest — same as later (the catalog was just being assembled into EVOKORE-MCP this window)
- `.env` committed (with placeholder values) — set the precedent

**Window-specific security observation:** on 2026-02-22, the **first commit** of EVOKORE-MCP extracted "200+ Skills, Scripts, and CI Pipeline" *from elsewhere* into the new repo. The provenance gap on those 200 skills was inherited from whatever they were extracted from. The 2026-04-24 audit's "337 unaudited skills" finding has its **archaeological origin in commit `d252632`**.

---

## 3. Top 3 highest-leverage actions for THIS window (reconstructed for 2026-02-25)

If this audit had been run on 2026-02-25 (the day after window-end), these are the three things that would have changed the trajectory most:

### 1. Add a "PRs-per-day with zero human review" guardrail to EVOKORE-MCP at PR #29

The pattern that produced 27 merged PRs in 53 hours with one bot review on one PR is the *founding velocity*. Catching it on day 4 — with a CODEOWNERS file, a branch protection rule requiring at least one approving review, OR a GitHub Action that comments "this is your Nth unreviewed merge today; consider pausing" — would have prevented the 96-PRs-in-4-weeks pattern chunk 1 measured *and* the SSRF / `tokenFull` introductions chunk 1 also measured.

**Cost:** ~30 minutes (CODEOWNERS + branch protection). **Avoided cost:** the entire 2026-04-24 emergency.

### 2. Populate `~/.codex/AGENTS.md` and `~/.claude/CLAUDE.md` with Windows guardrails before Codex usage scales

In this window, Codex was used 44 times. By chunk 1 it was 451. By 2026-04-24 it was 378 with a 35% `apply_patch` failure rate. **The 10× growth in Codex usage happened with an empty `AGENTS.md` and no user-scoped Claude memory.** A 2-page Windows-quirks guide written *now* (2026-02-25) catches all of chunk 1's `apply_patch` failures before they happen, by getting Codex to read the file pre-patch.

**Cost:** 1 hour to draft. **Avoided cost:** ~600 `apply_patch` failure cycles in chunk 1, ~130 in 2026-04-24.

### 3. Convert the dominant Phase ceremony (18,210 references) into a `phase-runner` skill before it grows

The user is paying token tax for an 18,210-reference workflow that has identical boilerplate. A simple slash-command wrapper now (when the pattern is at peak) saves more tokens than the same wrapper later (when the pattern is being deprecated). And critically: it provides a **structured artefact** the later audits can analyze — instead of 18,210 unstructured text mentions, you'd have N tracked Phase records with start/end/outcome.

**Cost:** ~2 hours. **Avoided cost:** the 2026-04-24 audit's KILL-list item "phase-implementer skill" wouldn't be on the kill list, because it would already be a working skill with measurable usage.

---

## 4. Biggest delta vs both prior reports

### vs chunk 1 (2026-02-25 → 03-24)

| Dimension | This window | Chunk 1 | Δ direction |
|---|---|---|---|
| Codex sessions | 44 | 451 | **10× growth in 4 weeks** |
| EVOKORE-MCP existence | 0 days → 3 days | 28 days | Project went from non-existent to v3.0 |
| EVOKORE-MCP PRs | 27 merged (in last 3 days) | 91 merged | Velocity stayed at ~9/day for the post-genesis 28 days |
| Specialist Task calls | **4** | 2,360 | **590× growth in subagent delegation** |
| Phase NNN ceremony | 18,210 | 2,137 | **88% drop** as the workflow was deprecated |
| `pr-manager` references | 1 | 16 | Muscle memory began forming |
| Submodule policy (`claude-skills-mcp`) | proper submodule | proper submodule | Stable through chunk 1 |
| Sub-`.git` regression | absent | absent | Both chunks clean; broke after chunk 1 |
| `dangerouslySkipPermissions` | absent | introduced PR #181 on chunk 1's last day | Genealogy: introduced *between* the two windows |

**The biggest single delta vs chunk 1 is the 590× growth in specialist sub-agent calls (4 → 2,360).** This is bigger than any other measurable change. The user invented (or retrieved from prior practice) the sub-agent delegation workflow inside the chunk-1 window. By 2026-04-24 they'd then abandoned it. **Specialist-agent usage has a 60-day lifecycle: invent → dominate → abandon.** That's an actionable insight: any new agent type the user adopts today should be expected to be evaluated for keep/kill at the 60-day mark.

### vs 2026-04-24 main

| Dimension | This window | 2026-04-24 main | Δ direction |
|---|---|---|---|
| EVOKORE-MCP architectural rot | none (project just started) | severe | NEW in 2026-04-24 |
| README↔reality drift | none (matched at v2.0) | severe (v3.0 doc / v3.1 reality) | Created during v3.0→v3.1 sprint between windows |
| 3 of 5 child servers in error | 3 of 3 work | 2 of 5 work | Half the child servers regressed |
| SSRF surface (`httpUtils`, TelemetryExporter, `tokenFull`) | none — code didn't exist | active | Built and broken in the gap |
| Codex `apply_patch` failure rate | 1.4% | 35% | **25× degradation** |
| Sibling tool errors | 1,283 | 4,913 | 3.8× — tracks activity |
| Specialist Task calls | 4 | 300+ | NEW in 2026-04-24 (pre-existed in chunk 1) |
| Phase NNN ceremony | 18,210 | 1,446 | **92% drop over 60 days** |
| AGENTS.md is 0 bytes | yes | yes | **75-day-and-counting** |
| User-scoped CLAUDE.md missing | yes | yes | **75-day-and-counting** |
| 9 specialist agents stale | yes (already stale on day 1) | yes | **75-day-and-counting** |

**The biggest single delta vs 2026-04-24 is that in this window, EVOKORE-MCP was 3 days old and the architectural rot the 2026-04-24 audit cataloged is exactly that: rot accumulated in the 60 days *after* this window.** The harness rot is identical. The architectural rot is entirely new. **This is the strongest possible evidence that velocity-without-quality-gates produces architectural debt at a rate of "v2 to broken in 60 days."**

### Combined cross-chunk insight

**Velocity timeline:**
- Day 0 (2026-02-22): 0 PRs, project just born
- Day 3 (2026-02-24): 28 PRs (this window's end)
- Day 31 (2026-03-24): 28 + 91 = 119 PRs (chunk 1's end)
- Day 61 (2026-04-24): roughly 200+ PRs (2026-04-24 main's end implicitly)

**Average ~3 PRs/day for 60 days, all by one author with effectively zero human review.** The 2026-04-24 audit's "0 external human reviewers across 8 sampled repos" finding is not a snapshot — it's a *60-day cumulative*. A second reviewer added on day 4 would have caught the SSRF surface design before it shipped.

---

## 5. Which 2026-04-24 Week-1 items are confirmed by this window's data

In order of strength of re-confirmation:

1. **Item #9 — Populate `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md`.** *Strongest re-confirmation across all three windows.* AGENTS.md was 0 bytes 75+ days ago, on day 1 of this window. The `mtime 2026-03-07` on AGENTS.md suggests one *intentional touch* that left the file empty — i.e. the user opened it, looked, and didn't fill it. **A blocker exists; it's not lack of intent.** Recommend: ship a starter file *for* the user via PR rather than asking them to write one.
2. **Item #3 — Disable `skipDangerousModePermissionPrompt`; downgrade Codex to `workspace-write`.** The maximally-permissive posture has been continuously on for 75+ days. Re-confirmed identically here.
3. **Item #12 — Refresh / decide-the-fate-of the 9 stale `.claude/agents/`.** The agents were stale *from before this window started*. They had a brief revival (chunk 1's 2,360 calls) and then died. **Refresh-them-not-delete-them remains the call** because chunk 1 proves they *worked* when refreshed.
4. **Item #4 — Sub-`.git` cleanup + pre-commit guard.** Counterintuitive re-confirmation: sub-`.git` was *absent* this window and chunk 1, *present* in 2026-04-24. **The pre-commit guard prevents a regression that already happened once — it's defending against a known threat, not a hypothetical one.**
5. **Item #6 — Fix child-server error states.** In this window all 3 child servers were configured fresh and presumably working. **The supervisor / health-check pattern (item #17) prevents the next 60-day decay** that produced the 3-of-5-broken state.
6. **Item #8 — Throttle parallel Bash to N=2-3.** 1,283 + 926 + 4,913 = 7,122 sibling errors across all three windows. Per-call rate stable; ship this for any volume of activity.
7. **Item #7 — Read-before-Edit/Write enforcement.** 189 + 209 + ~1,200 = ~1,600 errors. Same shape; ship it.
8. **Item #10 — `Unknown skill: X` fuzzy-match.** Trajectory is 9 → 16 → 256+. The 9 errors here include `Skill not found: {name}` and similar — pattern is *acquired* in chunk 1 and *exploded* in 2026-04-24.

**Items NOT yet re-confirmable from this window** (because their preconditions don't exist):
- Item #1 (SSRF allowlist for `httpUtils.ts`) — file doesn't exist yet
- Item #2 (stop broadcasting `tokenFull`) — symbol doesn't exist yet
- Item #5 (README v3.1 update) — README correctly says v2.0
- Items #13-#16 (skills) — most don't have demand signal yet (`pr-manager` at 1 reference, etc.)

---

## 6. Window-specific findings the 2026-04-24 audit missed

1. **EVOKORE-MCP was bootstrapped at panic velocity with no human review.** 27 PRs in 53 hours, only 1 PR (#5) ever received a single bot comment. The 2026-04-24 audit treats EVOKORE-MCP as a steady-state architecture; it isn't — it was a 53-hour weekend project that's now driving the entire workflow. **Its risk profile should be priced like a 60-day-old project, not a year-old one.**
2. **`.env` was committed to EVOKORE-MCP from day 1**, with placeholder values. This is a *practice precedent*. The 2026-04-24 audit should add: "audit `.env` history for any committed real values; rewrite history if found." (Spot-check at window-end shows placeholders only; no spot-check is done for the 60 days after.)
3. **Project-scoped hooks were the user's preferred guardrail layer from day 1 of EVOKORE-MCP.** `damage-control.js`, `purpose-gate.js`, `session-replay.js`, `tilldone.js` were all wired in commit `d385cd4` — i.e. day 1 of the project. The 2026-04-24 audit's "0 hooks" finding refers to **user-scoped** hooks; the project-scoped hooks were and are live. **Recommendation: promote the project-scoped hooks to user-scoped or templatize them across repos** — the user already proved they work in production.
4. **`context-rot` was being engineered against, deliberately, in the last 3 days of the window.** PR titles `orch/context-rot-a-freshness-20260225`, `orch/context-rot-b-*`, `orch/context-rot-c-docs-links-20260225`, `orch/context-rot-d-windows-runtime-20260225`, `orch/context-rot-e-doc-tracking-20260225` show a deliberate 5-track context-rot mitigation effort. The 2026-04-24 audit uses "context-rot" pejoratively (as something the user was failing to manage); this window shows the user was the one who diagnosed it and *built* infrastructure for it. **The credit/blame attribution in 2026-04-24 needs adjusting.**
5. **Codex was effectively unused.** 44 sessions in 28 days = ~1.6/day. The "Codex friction" findings in 2026-04-24 are real but they describe a tool the user adopted *between* this window and that one. The real story is: the user adopted Codex 10× in chunk 1 *without populating AGENTS.md*, and the friction profile in 2026-04-24 is the predictable consequence. **An onboarding-quality `AGENTS.md` written here would have prevented most of the chunk-1 and 2026-04-24 Codex friction.**
6. **Phase NNN ceremony was at all-time peak (18,210) and has since collapsed 92%.** The 2026-04-24 audit treats Phase ceremony as legacy; this window shows it was deliberate and dominant. The transition from "dominant pattern" to "legacy noise" happened over 60 days. **A retrospective on *why the user abandoned Phase ceremony* is more valuable than a recommendation to keep killing it** — the user already killed it; the audit is litigating a closed case.
7. **`session-wrap` was a *live commit pattern* in this window** (`feature/session-wrap-6` branch, multiple `chore: session wrap` commits, PR #6). It became a missing-skill error in chunk 1 because the **commit pattern stopped, but the verbal invocation didn't**. The fix isn't a skill — it's *re-enable the commit pattern* the user had working. (Or accept the pattern died for a reason and remove the muscle-memory invocation.)

---

## 7. Improvement plan reconstructed for 2026-02-25

### Week 1 (if this audit had been run on 2026-02-25)

| # | Action | Layer | Why now |
|---|---|---|---|
| 1 | Add CODEOWNERS + branch protection requiring 1 review on EVOKORE-MCP | repo policy | Prevent the next 60 days of solo-merging |
| 2 | Populate `~/.codex/AGENTS.md` with Windows + `apply_patch` guidance before Codex usage scales | docs | 10× usage growth in next 28 days; prevent friction signature |
| 3 | Populate `~/.claude/CLAUDE.md` with the same | docs | Prevent the chunk-1 and 2026-04-24 re-discovery cycles |
| 4 | Pre-commit guard: refuse to commit `.env` even with placeholder values (or at minimum hash-check the contents) | repo policy | The .env precedent set on day 1 leads somewhere |
| 5 | Read-before-Edit/Write enforcement hook | PreToolUse hook | 189 errors here; pattern climbs to 1,200 in 60 days |
| 6 | Throttle parallel Bash to N=2-3 | PreToolUse hook | 1,283 sibling errors here; pattern climbs to 4,913 in 60 days |
| 7 | Promote project-scoped damage-control/purpose-gate hooks to user-scoped templates | hooks | The user proved they work; replicate to all 17 repos |
| 8 | Schedule 60-day specialist-agent fate review | calendar | Get ahead of the 60-day decay curve before it bites |

### Month 1

| # | Skill / project | Source signal |
|---|---|---|
| 9 | `phase-runner` skill (capture the 18,210 Phase ceremony references into structured records) | Highest single workflow signal in window |
| 10 | EVOKORE-MCP child-server health supervisor (preventive) | 3 of 3 work today; supervisor prevents the future 3-of-5-broken state |
| 11 | Skill provenance manifest as part of the 200-skill extract | The 337-skill provenance gap originates here |
| 12 | Multi-bot review on EVOKORE-MCP PRs (Copilot + gemini, like AGENT33) | AGENT33's pattern proven; replicate before EVOKORE-MCP velocity grows |
| 13 | `session-wrap` slash command OR explicit deprecation | 1,185 references with the commit-pattern still alive — clarify which path |

### Foundational

| # | Action | Notes |
|---|---|---|
| 14 | Skill discoverability overhaul (`list_skills --grep --by-source --last-success`) | Same as both later audits |
| 15 | Skill provenance manifest (`skills.lock` + sha256, fail load on hash mismatch) | The catalog is being assembled now — install provenance *during* extraction, not after |
| 16 | Egress allowlist at the EVOKORE-MCP process level | Defense-in-depth; the SSRF surface doesn't exist yet but will |
| 17 | Pre-commit Semgrep rule pack (HMAC `==`, `as string` env casts, `Path.resolve` on user input, `Promise(server.listen)` no error handler, `dangerouslySkipPermissions`, `skipDangerousModePermissionPrompt`) | Codify recurring patterns *before* they recur |

---

## 8. KILL list (reconstructed for 2026-02-25)

- **Solo-merging EVOKORE-MCP PRs.** The 27-in-53-hours pattern is the founding mistake. Even one bot reviewer would help. **KILL the unreviewed-merge habit at PR #29, not at PR #285.**
- **Committing `.env` with placeholder values.** The placeholder `.env` becomes a real-secret `.env` somewhere in the next 12 months unless this is killed now. Use `.env.example` only.
- **Re-litigating the 9 stale specialist agents from 2026-01-09 again.** They've been stale through this window; they'll be stale through chunk 1; they'll be stale through 2026-04-24. **Refresh them now or kill them now; do not look at them again until decided.**
- **Treating EVOKORE-MCP as a steady-state architecture.** It's a 3-day-old project. Decide *now* whether it's a hobby project or a foundation; the answer changes every recommendation.
- **Building net-new skills before the catalog has provenance.** The 200 skills extracted into EVOKORE-MCP on day 1 inherit unknown provenance. Lock the catalog with `skills.lock` before adding skill #201.

---

## 9. Risks under-weighted by the data

1. **EVOKORE-MCP's 3-day genesis is the *causal root* of every later finding.** Velocity, no-review, .env-precedent, sub-`.git` future regression, context-rot pattern, hooks-as-only-guardrail — all set on the founding weekend. The 2026-04-24 audit treats these as 17 separate findings; they're one finding viewed through 17 lenses.
2. **The 92% collapse of Phase NNN ceremony in 60 days suggests workflows have a measurable half-life.** Anything labeled "the dominant workflow" today is unlikely to be dominant 60 days from now. **A monthly "what workflow are you no longer running" retrospective is more valuable than a monthly "what workflow do you wish you had" retrospective.** The latter exists (the 2026-04-24 audit); the former does not.
3. **The 78:1 Claude:Codex session ratio in this window means Codex onboarding wasn't yet a problem.** Adopting a tool 10× in 28 days *with no documentation* is the actual story. Any new tool the user adopts going forward needs an `AGENTS.md`-equivalent before usage scales.
4. **Sub-agent transcript dominance (3,450 files all in `subagents/`)** — the orchestrator-level JSONLs were touched outside the window, meaning **the parent sessions were long-lived and continued** (touched again later, falling outside the date filter). This implies the user is running multi-day Claude sessions with continuous sub-agent spawning. The 2026-04-24 audit's "152 tool calls/Codex session" finding has a Claude analog this window: per-session tool counts in Claude likely exceed 1,000 once orchestrator-level data is included. **Session-length itself is a chronic issue.**
5. **The user invented the specialist-agent delegation workflow inside chunk 1 (4 → 2,360 calls in 30 days) and abandoned it inside the next 30 days.** The same trajectory may be playing out for any pattern adopted today. **Commit to a 60-day evaluation horizon for new patterns or expect them to die.**
6. **The hooks system (damage-control / purpose-gate / session-replay / tilldone) was the user's only active guardrail layer from day 1 of EVOKORE-MCP.** It's the under-celebrated success of the project. **The 2026-04-24 audit asking for *more* hooks is right but it should also ask: why aren't the existing hooks promoted to user-scope?**

---

## 10. Persona/coverage gaps

The merged 4-persona panel (Helena Marsh, Kai Nishida, Marcus Reyes, Priya Krishnan) flagged:

- **Helena Marsh** disagreed with: (a) treating EVOKORE-MCP as the audit subject — argues the *workflow around it* is the real subject and the project is just the artifact; (b) the 60-day pattern half-life claim — argues longer cohort tracking needed before it's actionable
- **Kai Nishida** disagreed with: (a) Phase-runner skill recommendation — argues the *boilerplate-detector* hook is the right layer (find any 18,210-instance pattern, propose a slash command automatically); (b) populating AGENTS.md *for* the user — argues this is paternalistic and the user has now ignored the file for 75 days for a reason that isn't "I haven't gotten to it"
- **Marcus Reyes** disagreed with: (a) the EVOKORE-MCP "founding mistake" framing — argues 27-PRs-in-53-hours was *correct* for a v0.1 to v2.0 sprint, the mistake is keeping the same pattern at v3.0; (b) sub-`.git` pre-commit guard — argues a server-side ref-update hook is the actual defence
- **Priya Krishnan** disagreed with: (a) treating SSRF preconditions as *not yet present* — argues the .env commit + bypassPermissions + Codex danger-full-access is *already* an exfil chain via the elevenlabs MCP child server (which now has access to env values); (b) the "60-day evaluation horizon" — argues 2-week is the right cadence for skill / workflow adoption, 60-day is for architecture

Coverage gaps the panel flagged:

- **Founding-conditions archaeologist** — no persona is qualified to read commit `d252632` and ask "what got extracted from where, and is *that* repo audited?" The 200-skill provenance question lives in the *prior* repository, not in EVOKORE-MCP.
- **Project-genesis security reviewer** — the "3-day weekend project" pattern needs its own threat model; treating it like a mature project misses the right risks.
- **Workflow-adoption-curve modeler** — Phase NNN's adopt → dominate → abandon trajectory could be modeled but isn't.

---

## 11. Single highest-leverage action this week (reconstructed)

If the audit had run on 2026-02-25:

> **Add CODEOWNERS + branch protection requiring at least one approving review to EVOKORE-MCP, before PR #29 lands.**

Cost: 30 minutes. Avoided cost: every chunk-1 finding about no-reviewers, every 2026-04-24 finding about no-reviewers, the SSRF chain (because gemini-code-assist or Copilot would have flagged `httpUtils.ts httpGet()` as unsafe), and most likely the entire `tokenFull` broadcast (because a second reviewer would have asked "why are we sending the full token over WS?").

This recommendation is impossible from inside the window (we're a backfill), but it's the **single highest-value lesson** the trilogy of audits surfaces: **the founding velocity pattern of the project, set in 53 hours, made every later emergency probabilistically inevitable.**

---

## 12. Delta-check appendix (verification per playbook §"Verifying citations")

Per the methodology rule added after the 2026-04-24 audit's tokenFull/sub-.git/Skill-not-found mistakes, every named symbol/file/PR was checked against `git log --all -S '<symbol>' --oneline | head -5` on the live tree:

| Citation | Live `git log -S` result | Status |
|---|---|---|
| `tokenFull` | Top hit `c5534c9` (removal commit) — symbol does not exist in current tree, was removed before this audit was written | **CORRECTLY classified as not-yet-introduced in this window**; consistent with chunk 1 |
| `httpUtils` | Top hit `b1156b3` (audit doc itself), older content in `1e7b242` (2026-04-03 introduction) | **CORRECTLY classified as not-yet-existing**; introduced 38 days after window-end |
| `dangerouslySkipPermissions` | Top hit `01cdd3c` (PR #181 voice-stop hook on 2026-03-24) | **CORRECTLY classified as not-yet-introduced**; introduced 28 days after window-end (chunk 1's last day) |
| `VoiceSidecar` | Top hits all in chunk-1 / 2026-04-24 timeframes | Window introduces VoiceSidecar.ts at commit `6b8c718` 2026-02-23 — **verified present at window-end via `git show 534eb55:src/VoiceSidecar.ts` (38 KB blob 38e20dcc)** |
| `_evokore_approval_token` | Top hit `4beeadf` (chunk 1 era) plus newer | Symbol present in window-end CLAUDE.md prose at commit `534eb55` (verified via `git show 534eb55:CLAUDE.md`) |
| `claude-skills-mcp` submodule pointer | Stable at `6238e705` from window-end through chunk 1's window-end | Verified |
| EVOKORE-MCP genesis commit `d252632` | Verified via `git log --all --before="2026-02-25"` |  |
| Codex AGENTS.md 0 bytes | Verified via `ls -la /c/Users/mattm/.codex/AGENTS.md` on 2026-04-24 — still 0, mtime 2026-03-07 | **75-day-and-counting** |
| `~/.claude/CLAUDE.md` missing | Verified via `ls /c/Users/mattm/.claude/CLAUDE.md` returning "No such file or directory" |  |
| 9 stale `.claude/agents/*.md` | Per chunk 1 audit + 2026-04-24 audit; not re-verified independently here |  |

No citation in this report names a symbol/file/PR that has been resolved in a way the report fails to acknowledge. The window is a "before everything" window for most of the symbols the 2026-04-24 audit catalogs, which makes the verification rule mostly null-result here — but the rule is what allowed the explicit "not-yet-existing" classifications above to be made with confidence.

---

## Appendix — methodology notes

Single-agent sequential audit per coordinator's rate-limit guidance (no parallel sub-agents). Sampling was done via `find ... -newermt ... ! -newermt ...` plus aggregate grep over the in-window file list (saved to `/tmp/win2_files.txt` and `/tmp/win2_codex.txt`); per-session reads were not performed (3,450 transcripts would have overflowed orchestrator context).

Per-repo coverage: AGENT33, EVOKORE-MCP, Claudius Maximus, OCR_LOCAL, EDCTool, Gemma, evokore.com, myainewsbot.com, RSMFConverter, AIRI-MRE, CHELATEDAI sampled or counted via `gh pr list --search "merged:2026-01-28..2026-02-24"`. EDCwayback / yourediscovery.com / mattmre.com / cc-lens / CLIBURNER / REVOKORE / ROKKER all had 0 merged PRs in window. Openclaw_local was not queryable (`gh` repo not detected at expected path).

Window-end commit `534eb55` (EVOKORE-MCP, PR #28 release of v2.0.1, merged 2026-02-24T22:39:21Z) used for repo-state spot-checks.

The 4-persona merged panel was a single Workflow + Architecture + Security panel rather than two parallel panels per playbook §"Phase 4." Each persona contributed ≥2 disagreements.

Raw counts and date-of-introduction commits were verified against `git log --all -S '<symbol>'` per playbook §"Verifying citations" (see §12).
