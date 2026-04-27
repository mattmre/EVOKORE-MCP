---
name: github-triage
description: "Use when transitioning open GitHub issues through a 7-state label-based triage state machine (triage:new through triage:done) by reading issue bodies and evidence rather than waiting for maintainer triggers, and producing per-issue agent briefs and out-of-scope rationales."
aliases: [issue-triage, label-state-machine, agent-triage]
category: project-management
tags: [github, triage, state-machine, labels, agent-brief, out-of-scope]
version: 1.0.0
upstream: mattpocock/skills
upstream-sha: 90ea8eec03d4ae8f43427aaf6fe4722653561a42
upstream-path: github-triage/SKILL.md
license: MIT
resolutionHints:
  - triage open issues
  - move issues through label states
  - generate agent briefs for issues
  - capture out-of-scope rationale
---

# github-triage — Label-Based Issue State Machine

## When to use this skill

Use when there is at least one open GitHub issue in this repository that
needs to be moved through the triage state machine (see ADR-0006). The
skill replaces the upstream "maintainer manually triggers" model with an
**agent-driven** transition: the agent reads the issue body, the labels,
linked artifacts under `docs/`, and the latest evidence/replay JSONL,
then decides the next state.

If there are no open issues, stop. If the only open issues are already
in terminal states (`triage:done`, `triage:wontfix`), stop. If a
`docs/agent-briefs/<issue-number>.md` artifact already exists for the
issue but the issue's labels do not match the brief's recommended next
state, fix the brief first.

## Adapted From Upstream

This skill is adapted from `mattpocock/skills/github-triage` (upstream
commit `90ea8eec03d4ae8f43427aaf6fe4722653561a42`, MIT-licensed). The
upstream skill uses 7 labels with a documented transition table, an
`AGENT-BRIEF.md` artifact pattern, and an `.out-of-scope/` knowledge
base. EVOKORE-MCP keeps all three but rewires the transition triggers
from "maintainer comments on the issue" to "agent reads evidence and
applies the rule".

## EVOKORE-Specific Adaptations

| Upstream behavior | EVOKORE behavior |
|---|---|
| "Maintainer triggers triage" | Agent runs this skill against `gh issue list --state open --json number,labels,title` and transitions automatically per the rule below |
| "User describes the bug to triage" | Read the issue body + linked `docs/bugs/<slug>.md` (if present) + most recent evidence JSONL; route ambiguity to `triage:human-review` |
| "Human writes the agent brief" | Agent writes `docs/agent-briefs/<issue-number>.md` from the issue body + linked artifacts |
| "Human applies labels" | Agent emits the label transition; actual `gh issue edit --add-label` calls are gated by `EVOKORE_AUTO_LABEL_ISSUES=true` (DC-43) |
| "Maintainer dismisses out-of-scope items" | Agent writes `.out-of-scope/<slug>.md` with rationale and emits the `triage:wontfix` label transition |

## The 7-label state machine

The state machine is also documented in `docs/adr/0006-triage-state-machine.md`.
This skill body is the runtime authority; the ADR is the architectural
decision record.

### Labels

- `triage:new` — fresh, unsorted. Default for newly-filed issues.
- `triage:investigating` — `triage-bug` skill is reading evidence /
  replay logs to root-cause.
- `triage:ready-for-agent` — has a TDD plan or is otherwise AFK; ready
  to be grabbed by an autonomous agent.
- `triage:needs-architecture` — escalate to a panel; the issue is
  cross-cutting or hits an undecided bounded context.
- `triage:human-review` — HITL gate; ambiguous scope, ambiguous
  ownership, or risk that exceeds agent comfort.
- `triage:wontfix` — captured in `.out-of-scope/<slug>.md`; terminal.
- `triage:done` — PR merged or otherwise resolved; terminal.

### Transition table

| From | To | Condition |
|---|---|---|
| `triage:new` | `triage:investigating` | reproducible signal in evidence JSONL or test_failure row exists |
| `triage:new` | `triage:wontfix` | duplicate of an existing closed issue OR obsolete (component removed / superseded by ADR) |
| `triage:new` | `triage:human-review` | ambiguous scope, no clear owner, or risk above agent comfort |
| `triage:investigating` | `triage:ready-for-agent` | TDD plan complete in `docs/bugs/<slug>.md` |
| `triage:investigating` | `triage:needs-architecture` | root cause is cross-cutting per ADR-0005 |
| `triage:ready-for-agent` | `triage:done` | linked PR merged on `origin/main` |
| `triage:ready-for-agent` | `triage:human-review` | linked PR blocked (CI red, review block, or merge conflict the agent cannot resolve) |
| `triage:needs-architecture` | `triage:ready-for-agent` | `architecture-planning` panel produced an Accepted ADR or PRD |
| `triage:needs-architecture` | `triage:wontfix` | panel concludes the work is out of scope |
| `triage:human-review` | `triage:ready-for-agent` | HITL resolves and applies decision via comment |
| `triage:human-review` | `triage:wontfix` | HITL closes as out-of-scope |
| `triage:done` | (terminal) | — |
| `triage:wontfix` | (terminal) | — |

### Invariants

- An open issue carries **exactly one** `triage:*` label at any time.
  `validate-issue-metadata.js` enforces this.
- Issues at `triage:ready-for-agent` must have an accompanying
  `docs/agent-briefs/<issue-number>.md` file. Enforced by the same
  validator.
- Issues at `triage:wontfix` must have an accompanying
  `.out-of-scope/<slug>.md` file with the dismissal rationale. (This
  invariant is documented but not yet enforced by the validator —
  follow-up work.)

## Inputs to read before transitioning

1. `gh issue list --state open --json number,labels,title --limit 200`
   — get the open-issue universe.
2. For each issue, `gh issue view <num> --json
   number,title,body,labels,comments` to read its body and current
   `triage:*` label.
3. The latest `~/.evokore/sessions/*-evidence.jsonl` — to find
   reproducible signals that justify `triage:new -> triage:investigating`.
4. `docs/bugs/<slug>.md` (if linked from issue body) — for TDD-plan
   readiness.
5. `docs/adr/0005-bounded-contexts.md` — for cross-context detection.
6. Existing `docs/agent-briefs/*.md` — to avoid overwriting prior work.
7. Existing `.out-of-scope/*.md` — to avoid re-triaging dismissed issues.

## Per-issue agent brief

For every issue transitioning **into** `triage:ready-for-agent`, write
`docs/agent-briefs/<issue-number>.md`. The brief is what the
downstream `tdd` or `to-issues` agent reads before grabbing the issue.

```
# Agent Brief: Issue #<num>

**Issue:** <repo>#<num> — <title>
**Current label:** triage:ready-for-agent
**PRD:** docs/prd/<slug>.md (if applicable)
**Bug triage:** docs/bugs/<slug>.md (if applicable)

## What the agent should do
<2–4 imperative sentences>

## Acceptance criteria
- [ ] …

## Suspect surface
- file: `<path>` — <why>

## TDD plan reference
<link to docs/bugs/<slug>.md ## TDD fix plan, or 'this is a feature
 slice; no bug triage'>

## Composition
- if this is a leaf issue, invoke `tdd` skill
- if this is a meta-issue spawning sub-issues, invoke `to-issues` skill
```

## Out-of-scope knowledge base

For every issue transitioning **into** `triage:wontfix`, write
`.out-of-scope/<slug>.md`. Survives across sessions; new triage rounds
read this directory first to avoid re-triaging dismissed work.

```
# Out of scope: <Title>

**Issue:** <repo>#<num>
**Date:** YYYY-MM-DD
**Reason:** duplicate | obsolete | superseded by <ADR/PRD> | risk-too-high

## Rationale
<1–3 paragraphs explaining why this work was dismissed>

## Cross-references
- supersedes: <issue numbers>
- superseded by: <ADR / PRD path>
```

## Applying labels

Damage-control DC-43 blocks `gh issue edit --add-label` for sensitive
labels by default.

**Path A — default, no env override.** Emit the recommended label
transition in the agent's report and inside the agent-brief
artifact's frontmatter / first-line metadata. Stop. A human or
orchestrator with `EVOKORE_AUTO_LABEL_ISSUES=true` set can apply.

**Path B — `EVOKORE_AUTO_LABEL_ISSUES=true`.** Apply transitions:

```bash
gh issue edit <num> --remove-label "triage:new" --add-label "triage:investigating"
```

Always remove the prior `triage:*` label in the same call to maintain
the "exactly one `triage:*` label" invariant. Never use `gh issue
edit` to set arbitrary labels — only the documented transitions.

## Composition

For each issue at state `triage:investigating`, **invoke `triage-bug`
skill**. `triage-bug` reads evidence/replay JSONL and produces
`docs/bugs/<slug>.md`.

For each issue at state `triage:needs-architecture`, **run
`architecture-planning` panel**. The panel produces an Accepted ADR
or escalates to `triage:wontfix`.

For each issue at state `triage:ready-for-agent`:

- If it is a meta-issue spawning sub-issues, **invoke `to-issues`
  skill**.
- If it is a leaf issue with a complete TDD plan, **invoke `tdd`
  skill**.

For each issue at state `triage:human-review`, the skill **does not
auto-transition**. Emit the brief and stop.

## Reporting back

The skill's final output must include:

- The number of issues processed and their pre/post labels.
- Per-issue paths to any new `docs/agent-briefs/*.md` or
  `.out-of-scope/*.md` artifacts.
- Whether label transitions were applied (Path B) or only emitted as
  recommendations (Path A).
- The downstream invocation lines (`invoke triage-bug skill`, `invoke
  to-issues skill`, `invoke tdd skill`, `run architecture-planning
  panel`) so the composition graph picks them up.
