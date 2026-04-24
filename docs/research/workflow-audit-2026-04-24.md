# Workflow & Skills Improvement Plan — 30-Day Audit

**Window:** 2026-03-25 → 2026-04-24 (30 days). **Today:** 2026-04-24.
**Sources mined:** 2,185 Claude session files (64 MB), 378 Codex CLI sessions (255 MB), 9 Copilot artifacts, ~20 active repos in `D:/github/`, full Claude+Codex harness configs, EVOKORE-MCP repo audit.
**Refined by:** 2 expert panels (Workflow + MCP-Architecture/Security) using EVOKORE-MCP's panel-of-experts framework.

---

## Executive summary

The data tells one consistent story across both tools, all repos, and the harness configs:

> **You're adding faster than you're maintaining.** The roadmap is full; the runbook is empty.

The single largest measurable waste in 30 days was **~8,500 wasted tool calls** across three classes — parallel-Bash sibling failures (4,913), user-cancelled fanouts (2,377), and Read-before-Edit races (~1,200). Above that sits a category of "missing skill" failures — `pr-manager` (256 errors) and `session-wrap` (74 errors) — where the user has trained themselves to invoke things that don't exist. Below it sits a quiet but more dangerous category: **EVOKORE-MCP architectural rot** (3 of 5 child servers in error state, README claims v3.0/11 tools while reality is v3.1/37 tools, registry plumbed-but-empty, two HIGH security findings unfixed for 20+ days, 60 legacy test files cluttering the root).

**Both expert panels agreed on this verdict:** the proposed top-12 was 70% additive / 30% remedial. **Reverse the ratio for the next 30 days.** Two of the highest-leverage items aren't on the user's mental list at all (fix child-server health, fix README/manifest drift) — strong evidence of own-project bias.

---

## 1. Data baseline

| Source | Volume | Top finding |
|---|---|---|
| Claude Code sessions | 2,185 files / 64 MB / 53 projects | 256 `Unknown skill: pr-manager` errors; 4,913 sibling tool errors |
| Codex CLI sessions | 378 files / 255 MB / avg 152 tool calls per session | 35% `apply_patch` failure rate; 36% user-interrupt rate; 95% activity drop in April |
| Copilot | 9 active files | Plan-agent has a Discovery→Alignment→Design loop the other tools lack |
| PRs across 8 repos | 64 sampled, ~1,500 in window | Schema-validator misapplication (#1 theme, 34 hits, 5 repos); 0 external human reviewers |
| EVOKORE-MCP repo | 39 src modules, ~150 SKILL.md files, 2 HIGH security open | README v3.0 vs reality v3.1; 60 legacy test files; sub-`.git` committed |
| Harness config | Claude+Codex+Copilot | Codex `AGENTS.md` 0 bytes; Claude has no user-level CLAUDE.md; 0 hooks; both run maximally permissive |

**Active repos by recent Claude activity (top 10):** RSMFConverter, OCR_LOCAL, myainewsbot.com, Claudius Maximus, AGENT33, EVOKORE-MCP, Gemma, yourediscovery.com, plus EVOKORE-MCP/RSMFConverter worktrees.

**EVOKORE-MCP usage shape:** 95% of MCP calls are *discovery* (`search_skills` 135, `get_skill_help` 113, `resolve_workflow` 31, `fetch_skill` 18). Actual `execute_skill` only 36 — and the most-attempted skills (`panel-architecture-planning`, `panel-of-experts`, `panel-code-refinement`) often fall back to manually-pasted persona prompts via the Task tool. **Discovery works; execution doesn't.**

---

## 2. Themed findings

### Theme A — Missing skills the user already invokes by muscle memory
- `pr-manager` invoked 119× via Skill tool, referenced 268× in prompts → 256 errors
- `session-wrap` invoked 72× as a bare slash → 74 errors
- "Review CLAUDE.md and next-session.md, top N priorities" repeated **594× combined** across Claude+Codex
- "Phase NNN" ceremony repeated **1,446×** with identical boilerplate

You are paying token tax for a workflow you've already standardized.

### Theme B — Cascading failures from concurrency model
- 4,913 "Sibling tool call errored" + 2,377 user-cancelled parallel `cd` calls = the dominant tool-call failure mode
- 1,200 Read-before-Edit/Write race errors
- 35% Codex `apply_patch` "Failed to find expected lines" rate (file mutated between read and patch)

**Architect's verdict:** throttling is a band-aid; the result schema doesn't compose so the agent retries by widening fanout. Fix the schema, not the rate. But ship the throttle anyway — a 20-line PR shouldn't wait for a quarterly schema redesign.

### Theme C — Cross-PR pattern blindness (no bot or human catches recurrence)
Same `_resolve_tenant_id` mistake recurred in 3 AGENT33 PRs in days. `Promise(server.listen)` no-error-handler caught in two consecutive EVOKORE-MCP PRs. Schema-validator misapplication: 34 hits across 5 repos. 40% of `fix:` PRs are <100 lines (high hotfix rate).

**Zero external human reviewers across 8 sampled repos.** The only repo with multi-bot review (AGENT33 — Copilot + gemini-code-assist) materially outperforms single-bot repos.

### Theme D — Harness baseline is bare and asymmetric
- Codex `AGENTS.md` is **0 bytes** despite ~378 sessions in 30 days re-discovering the same Windows/PowerShell quirks
- No user-level `~/.claude/CLAUDE.md`
- Codex has **187 skills**, Claude has **9 stale agents** (all dated Jan 9, all hardcoded `model: opus`) — likely degraded against current model lineup
- **Zero Claude hooks** despite a hooks pipeline already existing in `EVOKORE-MCP/scripts/hooks/`
- Permission allowlists on both sides are bloated dead weight
- Both run maximally permissive (`bypassPermissions` + `skipDangerousModePermissionPrompt` on Claude; `danger-full-access` + Windows `elevated` on Codex)

### Theme E — EVOKORE-MCP architectural rot
- **3 of 5 child servers in error**: elevenlabs, stitch, supabase
- README claims v3.0.0 / 11 tools; reality is v3.1.0 / ~37 tools — manifest drift on an MCP server is a **protocol-correctness bug**
- 2 HIGH security findings unaddressed since 2026-04-04: SEC-01 (`tokenFull` broadcast over WS), SEC-03 (`httpUtils.ts httpGet()` lacks SSRF protection)
- Plus SEC-04 (TelemetryExporter SSRF), REL-01 (HttpServer transport-close race), PERF-03 (AuditLog reads full JSONL into memory)
- `mcp_repos.json` is one line — registry plumbed but empty
- `worker_dispatch` worker types hard-coded to 4 strings
- `SKILLS/MCP WRAPPERS/claude-skills-mcp/.git/` is a committed sub-`.git`
- 60+ root-level `test-*.js` files predate vitest migration
- 9 stale `.claude/worktrees/` left around
- **CLAUDE_CODE_DISABLE_1M_CONTEXT=1** is set explicitly — opted out of long context

### Theme F — Security posture
The exploit chain the AppSec persona constructed is real:

> Poisoned skill in vendored catalog → `fetch_skill` against `http://localhost:8000/v1/models` (your vLLM Gemma server) → exfils prompts/keys via TelemetryExporter SSRF (SEC-04) → no permission prompt because `bypassPermissions` + `skipDangerousModePermissionPrompt`.

There are 337 unaudited skills (150 vendored + 187 in `~/.codex/skills/`) with no provenance manifest. Single-user is **not** a security boundary on Windows.

---

## 3. Final improvement plan (panel-refined)

### 🚨 Week 1 — security & architecture remediation (do these first)

| # | Action | Layer | Why now |
|---|---|---|---|
| 1 | Patch `httpUtils.ts httpGet()` with SSRF allowlist | EVOKORE-MCP code | Closes SEC-03 + SEC-04 + localhost-vLLM exfil chain in one commit |
| 2 | Stop broadcasting `tokenFull` over WS (SEC-01) | EVOKORE-MCP code | localhost is not a trust boundary on Windows |
| 3 | Disable `skipDangerousModePermissionPrompt`; downgrade Codex to `workspace-write` | settings.json + config.toml | Today there is no boundary at all |
| 4 | Remove committed `SKILLS/MCP WRAPPERS/claude-skills-mcp/.git/`; pre-commit guard | EVOKORE-MCP repo | History-rewrite vulnerability |
| 5 | Update README to v3.1.0; auto-generate from `package.json` + tool registry as CI gate | EVOKORE-MCP code + CI | Drift becomes a build break |
| 6 | Fix the 3 erroring child servers (elevenlabs, stitch, supabase) — disable in `mcp.config.json` if not in use | EVOKORE-MCP config | Pretending they're up is worse than admitting they're down |

### ⚡ Week 1 — DX & infrastructure (no debate)

| # | Action | Layer | Win |
|---|---|---|---|
| 7 | Read-before-Edit/Write enforcement | PreToolUse hook | Eliminates ~1,200 errors/month; closes TOCTOU corruption vector |
| 8 | Throttle parallel Bash to N=2-3 concurrent | PreToolUse hook | Eliminates ~7,300 cascade errors/month |
| 9 | Populate `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md` with Windows guardrails | docs | Stops every-session re-discovery |
| 10 | `Unknown skill: X` → fuzzy-match suggestion | EVOKORE-MCP SkillManager | Eliminates dominant skill-system DX failure |
| 11 | Delete 60 root-level `test-*.js` files; clean 9 stale `.claude/worktrees/` | EVOKORE-MCP repo | Restores trust at clone time |
| 12 | Refresh / decide-the-fate-of the 9 stale `.claude/agents/` | .claude/agents | Specialists currently lose 300:30 against general-purpose |

### 📦 Month 1 — the skill batch

| # | Skill | Source signal |
|---|---|---|
| 13 | `pr-manager` registered as EVOKORE-MCP skill | 256 errors / 268 prompts |
| 14 | `/priorities [N]` Claude slash command | 594 combined invocations — highest behaviorally-validated demand |
| 15 | `session-wrap` as CLAUDE.md template, NOT a skill | 74 errors but Kai's KILL critique held |
| 16 | Audit & fix `panel-*` skill invocation reliability + add a "why did this skill fail" trace tool | Discovery works, execution doesn't |
| 17 | EVOKORE-MCP child-server supervisor (backoff + circuit breaker + `child_status` first-class tool) | 3 of 5 children in error |
| 18 | `evokore-doctor` CLI — child-server health, registry state, manifest drift, stale worktrees, dead config | Runbook gap |
| 19 | Auto-summarize last session into auto-memory at session end (Stop hook) | 2 memory entries despite heavy use |

### 🏗️ Foundational (30–60 day projects)

| # | Action | Notes |
|---|---|---|
| 20 | Skill discoverability overhaul (`list_skills --grep --by-source --last-success`, fuzzy router) | **Block all new skills until this lands** |
| 21 | Skill provenance manifest (`skills.lock` + sha256, fail load on hash mismatch) | Closes 337-unaudited-skill supply-chain vector |
| 22 | Egress allowlist at the EVOKORE-MCP process level | Defense-in-depth |
| 23 | Reconcile Codex 187 vs Claude 9 skill asymmetry — port/retire/keep-platform-specific | Expected ~30 keepers, ~150 deletions |
| 24 | Tenant isolation: typed `RequestContext` refactor + Semgrep rule (NOT "memory agent") | The skill-layer fix alone won't change behavior |
| 25 | Pre-commit Semgrep rule pack: HMAC `==`, `as string` env casts, default-fallback IDs, `Path.resolve` on user input, `Promise(server.listen)` without error handler | Codifies recurring patterns |
| 26 | Enable Copilot review on EVOKORE-MCP, Gemma, OCR_LOCAL, Claudius_Maximus | Cheapest single PR-quality win |
| 27 | Re-enable `eslint-plugin-jsx-a11y` as `error` in Claudius_Maximus and any React repo | The 1,345-warning cleanup PR (#704) was preventable at lint |
| 28 | Fix `apply_patch` upstream — investigate Codex CLI patch context width | Stop asking the user to babysit a 35%-failure tool |

### ❌ KILL list

- **Tool-param cheatsheet hook** — 110 errors over 30 days = 3.6/day. Add 6 lines to CLAUDE.md instead.
- **`session-wrap` as a full skill** — manual wrap-ups produce better artifacts. CLAUDE.md instruction sufficient.
- **`phase-implementer` as a full skill, until the 1M-context decision is revisited** — the phase ceremony assumes long context; you've explicitly disabled it.
- **"Cross-PR memory agent" as written in proposal #12** — zero direct invocations in 30 days. Split it: keep Semgrep + IDOR-skill; drop the agent.
- **Re-litigating `rules/default.rules` 143 entries one-by-one** — truncate to last-30-days actual usage; archive in one PR.
- **Any new EVOKORE-MCP skill before `list_skills --grep` exists** — you cannot ship to a registry users can't search.

---

## 4. Runbook scenarios to write before next major release

1. **A child MCP server is in error state at 3am**
2. **`fetch_skill` returned data from an internal address**
3. **`apply_patch` left a file in a partial state**
4. **Skill registry returns `Unknown skill: X` for a skill the user knows exists**
5. **Claude Code or Codex CLI updated and EVOKORE-MCP lost its connection**

---

## 5. Risks the research agents under-weighted

1. **Skill proliferation accelerates the discovery problem** — block new skills until #20 (router) lands.
2. **Hooks compound silently** — build hook observability before adding hooks.
3. **Single-reviewer (gemini-code-assist) on 7 of 8 repos is a systemic blind spot.**
4. **`bypassPermissions` + `danger-full-access` on Windows with 20 repos and active EVOKORE-MCP server: a single prompt-injected document can rewrite the filesystem.**
5. **The user is the sole reviewer of their own AI's PRs.**
6. **Session length itself is unaddressed** — 152 tool calls/Codex session means context compaction is constant.

---

## 6. Persona/coverage gaps in current EVOKORE-MCP panel-of-experts library

Both panels independently flagged these missing personas:

- **AppSec / multi-tenancy expert**
- **Windows-platform expert**
- **MCP protocol + skill-discovery UX expert**
- **Codex-internals / GPT-5 prompting expert**
- **Security-architecture / prompt-injection threat-modeler**
- **Code-archaeology / dead-code expert** (no panel rewards subtraction)
- **Reviewer-redundancy / multi-bot orchestration expert**

Helena's structural critique: **a fixed 3-persona panel is too narrow** for a domain this broad. The setup needs a **rotating bench of 7-10 personas**, with at most 3-4 active per critique session.

---

## 7. Two existing EVOKORE-MCP skills the user is not yet using

- **`session-retrospective-miner`** — automates the work I just did manually with 5 agents. Already built; never invoked.
- **`improvement-cycles`** — structured retrospective with metrics review templates.

**Recommendation:** make `session-retrospective-miner` a monthly cron-fired routine. Output drops into `docs/research/retro-YYYY-MM.md`. This audit becomes self-running.

---

## 8. The single highest-leverage thing to do this week

If you do nothing else, do these three in one sitting (~2 hours):

1. **Patch the SSRF in `httpUtils.ts httpGet()`** — closes the localhost-exfil chain.
2. **Update the EVOKORE-MCP README to match v3.1.0 / 37 tools and gate it in CI.** Restores the manifest contract.
3. **Add the read-before-edit + parallel-Bash-throttle hooks** — eliminates ~8,500 wasted tool calls/month.

---

## Appendix — agent reports archived

Raw agent outputs (each 1,500–2,500 words, with citations to specific session paths and PR URLs):
- Claude session log analysis: `tasks/a380765cd101adfcd.output`
- Codex session log analysis: `tasks/ad0873b9465cddcb1.output`
- PR pattern analysis: `tasks/a9bb59772bb6d56e6.output`
- EVOKORE-MCP repo audit: `tasks/ad3b2a5fac95937df.output`
- Copilot + harness audit: `tasks/a7d95c2984e1b737f.output`
- Workflow expert panel: `tasks/a0d3572d47add0cd8.output`
- MCP architecture/security panel: `tasks/adcacda82eb53376f.output`

(All under `C:/Users/mattm/AppData/Local/Temp/claude/C--Users-mattm/6f2472a9-22ff-4917-a841-3c42550b1879/`.)
