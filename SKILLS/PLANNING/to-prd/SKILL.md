---
name: to-prd
description: "Use when synthesizing a Product Requirements Document (PRD) from prior session evidence (replay logs, ADRs, evidence captures, prior PRDs) and routing it through a panel-of-experts review instead of a live user-feedback loop."
aliases: [prd, product-requirements, write-prd, synthesize-prd]
category: planning
tags: [prd, planning, requirements, agent-driven, panel-review]
version: 1.0.0
upstream: mattpocock/skills
upstream-sha: 90ea8eec03d4ae8f43427aaf6fe4722653561a42
upstream-path: to-prd/SKILL.md
license: MIT
resolutionHints:
  - draft a PRD from existing context
  - turn an idea into a PRD without user dialogue
  - synthesize requirements from evidence and replay logs
  - prepare a PRD for agent-driven decomposition
---

# to-prd — Synthesize a PRD From Existing Context

## When to use this skill

Use when the next agent step needs a Product Requirements Document but the
upstream signal is **not** a live user dialogue — instead it is some combination
of:

- a prior session's `~/.evokore/sessions/*-replay.jsonl` and
  `~/.evokore/sessions/*-evidence.jsonl`
- one or more existing `docs/prd/*.md` to revise or merge
- an ADR under `docs/adr/` describing a contract that must be productized
- a triaged bug at `docs/bugs/<slug>.md` whose fix has product-shaped scope
- a panel-of-experts artifact requesting a feature

The output is a markdown PRD at `docs/prd/<slug>.md` plus a panel-review
invocation. EVOKORE-MCP is agent-driven: the user is **not** treated as a live
oracle inside this skill. Every "ask the user" step from the upstream
`mattpocock/skills/to-prd` is rewritten to either read a prior artifact or to
emit a panel invocation.

If you do not have any of the inputs above, stop. Either generate them first
(e.g., run `triage-bug`, `repo-ingestor`, or open a panel) or escalate to a
human via the HITL flag (see "Filing the PRD").

## Adapted From Upstream

This skill is adapted from `mattpocock/skills/to-prd` (upstream commit
`90ea8eec03d4ae8f43427aaf6fe4722653561a42`, MIT-licensed). The upstream
skill assumes a conversational user who iteratively answers requirements
questions and approves the final PRD. EVOKORE-MCP runs autonomous agent
sessions, so the conversational loop has been replaced with artifact reads
and a panel-of-experts review gate.

## EVOKORE-Specific Adaptations

The following user-loop steps from upstream have been rewritten:

| Upstream behavior | EVOKORE behavior |
|---|---|
| "Ask the user about goals and non-goals" | Read goals/non-goals from evidence/replay JSONL, ADRs, and any predecessor PRD; if missing, emit a `panel-of-experts` invocation with personas `[product-strategist, technical-architect]` |
| "Iterate on user stories until the user approves" | Generate **agent stories** (since EVOKORE is agent-driven) plus optional user stories, then invoke `panel-of-experts` skill with persona set `[product-strategist, technical-architect, qa-lead]` for PRD review |
| "Wait for user feedback before filing" | Write the PRD to `docs/prd/<slug>.md` and stop. Filing is gated by `EVOKORE_AUTO_FILE_ISSUES=true`; otherwise the path is emitted for HITL review |
| "Confirm scope with the user" | Read the most recent `docs/adr/*.md` whose status is `Accepted` for the relevant bounded context; if scope is ambiguous, route through the panel |

## Inputs to read before drafting

Before writing a single line of the PRD, ingest in this order:

1. The current session manifest at `~/.evokore/sessions/{sessionId}.json` for
   the active session purpose.
2. The latest `~/.evokore/sessions/*-replay.jsonl` for tool-call sequences
   that motivated the PRD.
3. The latest `~/.evokore/sessions/*-evidence.jsonl` for `tool_error`,
   `test_failure`, and `git_operation` rows that frame the problem statement.
4. Existing `docs/prd/*.md` files (search for slug overlap; merge or
   supersede rather than duplicate).
5. Relevant `docs/adr/*.md` files (especially ADR-0005 bounded contexts) so
   the PRD respects existing architectural decisions.
6. `docs/agent-briefs/*.md` if a `github-triage` flow has already produced
   per-issue briefs that motivate the PRD.

## PRD artifact contents

Write the PRD to `docs/prd/<slug>.md` where `<slug>` is kebab-case derived
from the working title. The PRD must contain these sections, in order:

1. `# PRD: <Title>` — H1 with the human-readable title.
2. `**Status:** Draft | Reviewed | Accepted` and `**Date:** YYYY-MM-DD`.
3. `## Problem Statement` — what's broken or missing today, grounded in
   evidence rows or ADR references.
4. `## Goals` — bulleted, measurable.
5. `## Non-Goals` — bulleted, with one-line rationale per item.
6. `## Success Metrics` — concrete signals (test pass count, latency
   budget, evidence-row volume, etc.).
7. `## Agent Stories` — primary form for EVOKORE-MCP. Each story is
   `As <agent role>, when <trigger>, I produce <artifact> so that <next
   step>`.
8. `## User Stories` — optional, only when humans are in the loop (HITL
   flows).
9. `## Acceptance Criteria` — checklist of pass/fail conditions, each
   testable by an agent without human input.
10. `## Out of Scope` — explicit boundaries with one-line "why not now".
11. `## Dependencies` — references to other PRDs, ADRs, skills, or open
    issues. Use relative repo paths.
12. `## Open Questions` — items to route through `panel-of-experts` rather
    than to a live user.

## Panel review gate

After the PRD draft is written, **invoke `panel-of-experts` skill with
persona set `[product-strategist, technical-architect, qa-lead]`** to
critique the PRD. The panel is the autonomous replacement for the
upstream "user approves the PRD" gate.

If the panel returns blocking findings, edit `docs/prd/<slug>.md` in
place and re-invoke the panel. If the panel converges on "Accepted",
update the PRD frontmatter `Status:` line to `Reviewed` and proceed to
filing.

## Filing the PRD

Damage-control rule DC-41 blocks `gh issue create` from agent worktrees
by default. The skill must therefore split filing into two paths:

**Path A — default, no env override.** Write the PRD to
`docs/prd/<slug>.md` and emit the path in the agent's report. A human or
an orchestrator with `EVOKORE_AUTO_FILE_ISSUES=true` set can later file
it. Stop here.

**Path B — `EVOKORE_AUTO_FILE_ISSUES=true` is set.** Run:

```bash
gh issue create \
  --title "PRD: <Title>" \
  --body-file "docs/prd/<slug>.md" \
  --label prd
```

Always use `--body-file`. Never use `-b`/`-m` for PRD bodies — damage-control
flags inline shell strings containing `.env` substrings or special
characters as false positives. The PRD file is the canonical source of
truth.

## Composition

After the PRD is written and reviewed, **next, invoke `to-issues` skill**
to decompose the PRD into independently-grabbable vertical slices and
optional GitHub issues. The `to-issues` skill reads `docs/prd/<slug>.md`
directly; you do not pass arguments inline.

If the PRD's panel review surfaced cross-cutting architectural concerns,
**run `architecture-planning` panel** before invoking `to-issues`.

## Reporting back

The skill's final output (in the agent's reply) must include:

- The path `docs/prd/<slug>.md`.
- The PRD's `Status:` field (Draft / Reviewed / Accepted).
- The panel-review verdict and any open blocking findings.
- Whether the PRD was filed as a GitHub issue (Path B) or not (Path A).
- The `next, invoke to-issues skill` line so the composition graph picks
  it up.
