# Workflow & Skills Audit Playbook

**Purpose:** Repeatable methodology for mining session logs, PRs, and harness configs across all repos to surface workflow improvements. Designed to be handed to a sub-agent for any time window.

**Origin:** Distilled from the 2026-04-24 audit (5 research agents + 2 expert panels) covering 2026-03-25 → 2026-04-24. See `workflow-audit-2026-04-24.md` for the original output.

---

## When to run this

- **Monthly cadence** — first business day of each month, looking back ~30 days
- **Backfill mode** — when reconstructing prior periods (4-week chunks)
- **Triggered** — after a major incident or velocity drop

The skill `session-retrospective-miner` (in EVOKORE-MCP `SKILLS/`) automates Phase 2 of this playbook; the rest is still agent-driven.

---

## Operating principles

1. **Sample, don't enumerate.** With 2,000+ session files per month, no agent can read them all. Aggregate by grep, sample deeply on the top 5-10 projects.
2. **Cite paths.** Every finding must reference a specific session JSONL, PR URL, or file:line so the user can spot-check.
3. **Counts beat anecdotes.** "X happened N times" trumps "I noticed X."
4. **Disagree on purpose.** Panel critiques fail when personas politely agree from different angles. Real challenge produces uncomfortable insights.
5. **Invert the additive bias.** Every "build a new skill" candidate must be tested against "delete something" or "modify CLAUDE.md instead."
6. **Verify citations against live code.** Every finding that names a specific symbol, file, string, or PR must be confirmed against `git log -S '<symbol>'` or `grep` on the current tree **in the same agent turn** it is written. Finding it in an older `docs/research/*.md` is not enough — prior audits can be stale by days or weeks. See the [2026-04-24 correction note](workflow-audit-2026-04-24.md) for why: three Week-1 items (`tokenFull`, sub-`.git`, `Unknown skill:`) were cited as open when commit `c5534c9` had already resolved them ~20 days earlier. **How to apply:** when a research agent cites `X needs fixing`, the same agent must run `git log --all -S 'X' --oneline | head -5` and include the output in its report; if the top commit's subject says "fix"/"remove"/"close", the item is reclassified as "already-resolved — consider regression-gate test instead".

---

## Phase 1 — Reconnaissance (sequential, fast)

Confirm before launching the parallel agents:

```bash
# Session log inventories (date range = $START to $END)
find /c/Users/mattm/.claude/projects -name "*.jsonl" -newermt "$START" ! -newermt "$END" | wc -l
find /c/Users/mattm/.codex/sessions  -type f         -newermt "$START" ! -newermt "$END" | wc -l

# Repo enumeration
ls /d/github/ | grep -v -- '-worktrees-\|-pr-\|-backups\|-archive'

# EVOKORE-MCP child server health
mcp__evokore-mcp__proxy_server_status
```

---

## Phase 2 — Parallel research agents (5 agents)

Spawn these as background `general-purpose` (or `researcher`) agents in a single message. Each gets a tight self-contained brief.

### Agent A — Claude Code session logs
- **Path:** `C:/Users/mattm/.claude/projects/`
- **Date filter:** `find ... -newermt "$START" ! -newermt "$END"`
- **Buckets to extract:**
  1. EVOKORE-MCP usage patterns (every `mcp__evokore-mcp__*` call; missing-skill errors with `Unknown skill: X` count)
  2. Repeated user corrections / friction (regex: `(?i)stop|don't|no not that|wait|again you|you keep`)
  3. Tool failures / workarounds (`Sibling tool call errored`, `File has been modified since read`, `InputValidationError`)
  4. Workflow patterns worth automating (any verbatim text repeated >50 times)
  5. Sub-agent delegation patterns (Task tool calls grouped by `subagent_type`)
- **Output:** ≤2,500 words, structured findings with counts, top 10 ranked improvement signals

### Agent B — Codex CLI session logs
- **Paths:** `C:/Users/mattm/.codex/sessions/YYYY/`, `C:/Users/mattm/.codex/history.jsonl`, `.codex/AGENTS.md`, `.codex/rules/`, `.codex/skills/`, `.codex/config.toml`
- **Buckets:** invocation patterns (standalone vs Claude bridge), task-type clusters, friction (`apply_patch verification failed`, `turn_aborted`, `context_compacted`, encoding errors, PowerShell errors), Codex configuration baseline, cross-tool patterns (where the user duplicates Claude work)
- **Output:** ≤2,000 words

### Agent C — PR review pattern analysis
- **Tool:** `gh` CLI (already auth'd)
- **Scope:** Canonical repos in `D:/github/` (skip `*-worktrees-*`, `*-pr-*`)
- **Per repo:** `gh pr list --state all --limit 50 --json number,title,createdAt,updatedAt,state,additions,deletions,reviewDecision`
- **For high-activity repos:** `gh api repos/OWNER/REPO/pulls/N/comments` and `/reviews` on 5-10 sampled PRs
- **Buckets:** recurring reviewer comment themes, missed-error / hotfix patterns, PR size & churn signals, bot vs human review observations, language-specific recurring issues
- **Output:** ≤2,500 words with PR URLs

### Agent D — EVOKORE-MCP repo audit
- **Path:** `D:/github/EVOKORE-MCP/`
- **Sections:** repo at-a-glance, current skill catalog (table), tool catalog (grouped: core/admin/experimental), recent activity (`git log --since="$START" --oneline`), open issues + TODO grep, architecture notes, auditor-observed gaps
- **Output:** ≤2,000 words

### Agent E — Copilot + harness config audit
- **Paths:** Copilot at `C:/Users/mattm/AppData/Roaming/Code/User/globalStorage/github.copilot-chat/`. Harness at `~/.claude/{settings.json,settings.local.json,CLAUDE.md,agents/,plugins/,teams/,projects/C--Users-mattm/memory/}` and `~/.codex/{config.toml,AGENTS.md,rules/,skills/,memories/}`. Per-repo: glob `D:/github/*/CLAUDE.md` and `D:/github/*/AGENTS.md`
- **Buckets:** Copilot footprint, Claude harness baseline (hooks, permissions, env, agents, plugins, memory), Codex config baseline, per-repo CLAUDE.md/AGENTS.md survey, cross-tool config drift
- **Output:** ≤2,000 words

---

## Phase 3 — Main-context synthesis

The orchestrator (you) clusters findings from the 5 reports into themes, ranks signals by frequency × cost-of-pain, and drafts a candidate top-N improvement list. Tag each candidate with the layer where it should live (skill / hook / CLAUDE.md / EVOKORE-MCP code / config) to fight the bias to default everything to "build a skill."

---

## Phase 4 — Expert panel critique

Spawn TWO parallel panel agents:

### Panel 1 — Workflow & process (Meta-Improvement Panel from EVOKORE-MCP)
- Personas: **Dr. Helena Marsh** (Organizational Psychologist), **Kai Nishida** (Process Optimization Engineer), **Serena Okafor** (Domain Expertise Curator)
- See `SKILLS/ORCHESTRATION FRAMEWORK/panel-of-experts/panels/panel-meta-improvement.md` for full persona prompts and protocol
- Required output: KILL list (≥2), ADD list (≥3), sequencing recommendation, under-weighted risks (≥4), persona/coverage gaps in current EVOKORE-MCP

### Panel 2 — MCP architecture & security
- Personas: **Marcus Reyes** (MCP Architect, 12yr distributed systems), **Priya Krishnan** (AppSec / agent-system pentester, 15yr), **Tomás Fischer** (DX engineer, ships dev tools)
- Required output: architectural verdict, top 5 security/architecture/DX actions each, KILL list, ADD list, runbook scenarios (≥3)

**Each persona MUST disagree with at least 2 proposals.** Real critique, not validation theater. Brief each agent with the consolidated Phase 3 findings + the 12 candidate proposals.

---

## Phase 5 — Final report

Single markdown document at `docs/research/workflow-audit-YYYY-MM-DD.md` containing:

1. Executive summary (one paragraph + the verdict line)
2. Data baseline table
3. Themed findings (A–F)
4. Improvement plan: Week 1 / Month 1 / Foundational
5. KILL list
6. Runbook scenarios to write
7. Under-weighted risks
8. Persona/coverage gaps
9. Single highest-leverage action this week

**Always cross-reference** with prior monthly reports to identify recurring vs new themes.

---

## Standing constraints

- **Today's date** must be passed explicitly in every agent brief — they can't see your system reminders.
- **Windows shell quirks:** use forward slashes in bash paths; sandboxed bash is the safe default.
- **Don't read agent JSONL output files directly** — they're full transcripts and overflow the orchestrator's context.
- **Word limits matter** — agents produce shallow work without them.
- **`bypassPermissions` is on** — agents will not be prompted; they will edit and commit. Brief them on what NOT to touch (especially: settings.json, .codex/config.toml, .git/, ephemeral files like task_plan.md, findings.md, progress.md).

---

## Per-repo coverage checklist

Active repos as of 2026-04-24 — confirm each is sampled or explicitly excluded per audit:

- [ ] AGENT33
- [ ] AIRI-MRE
- [ ] CHELATEDAI
- [ ] CLIBURNER
- [ ] Claudius Maximus
- [ ] EDCTool
- [ ] EDCwayback
- [ ] EVOKORE-MCP
- [ ] Gemma
- [ ] OCR_LOCAL
- [ ] Openclaw_local
- [ ] REVOKORE
- [ ] ROKKER
- [ ] RSMFConverter
- [ ] cc-lens
- [ ] evokore.com
- [ ] mattmre.com
- [ ] myainewsbot.com
- [ ] yourediscovery.com

(Worktree-derived dirs like `*-worktrees-*` and `Gemma-phase-*` should be considered duplicates of their canonical repo unless they show distinct PR activity.)

---

## Time-window chunking guidance

For backfill, use 4-week chunks anchored to calendar weeks. The audit was originally calibrated to a 30-day window; chunks longer than 6 weeks degrade the panel's ability to spot temporal patterns.

| Chunk | Start | End | Notes |
|---|---|---|---|
| Current | last Monday | today | Weekly check |
| Last month | 30 days ago | today | Default |
| Quarter | 90 days ago | today | Trend analysis |
| Custom | $START | $END | Always pass explicit dates |

---

## How this becomes self-running

The medium-term goal: this playbook fires monthly via `scheduled-tasks` MCP, drops a draft into `docs/research/`, posts a GitHub issue with the top-3 Week-1 actions, and tags @mattmre for review. The implementation is in the Month-1 batch of the 2026-04-24 plan (item #19 + #18 evokore-doctor).
