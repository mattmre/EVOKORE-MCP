# ADR 0006: GitHub Issue Triage State Machine

**Status:** Accepted
**Date:** 2026-04-27
**Deciders:** Wave 2 PRD/Issues toolkit synthesis
**Supersedes:** None (new triage policy)
**Related:** ADR-0005 (bounded contexts) — places this decision in the
"Skill Registry & Discovery" and "Orchestration & Fleet" bounded
contexts.

---

## Context

EVOKORE-MCP is an autonomous, agent-driven system. The user kicks off a
task and agents research → plan → panel-grill the plan → implement →
test → report. Open GitHub issues are part of this loop: they capture
work the agents can grab.

Without a documented triage workflow:

- New issues sit in an unsorted state with no clear owner.
- Agents cannot tell whether an issue is ready to grab or needs
  architectural review first.
- Out-of-scope decisions are lost between sessions; the same dismissed
  issue gets re-triaged on every new run.
- Maintainer-driven triage (the upstream `mattpocock/skills/github-triage`
  pattern) does not fit because there is no continuous human in the
  loop.

The Wave 2 PRD/Issues toolkit (skills `to-prd`, `to-issues`,
`triage-bug`, `github-triage`) needs a stable transition contract to
chain reliably and to be validated in CI.

---

## Decision

Adopt a **7-label state machine** for open GitHub issues, executed by
the `github-triage` skill, with two terminal states and explicit
transition conditions. An open issue carries **exactly one** `triage:*`
label at any time. Newly-filed issues default to `triage:new`.

### The 7 labels

| Label | Meaning |
|---|---|
| `triage:new` | Fresh, unsorted. Default for newly-filed issues. |
| `triage:investigating` | `triage-bug` skill is reading evidence / replay logs to root-cause. |
| `triage:ready-for-agent` | Has a TDD plan or is otherwise AFK; ready to be grabbed by an autonomous agent. |
| `triage:needs-architecture` | Escalate to a panel; cross-cutting or hits an undecided bounded context. |
| `triage:human-review` | HITL gate; ambiguous scope, ambiguous ownership, or risk above agent comfort. |
| `triage:wontfix` | Captured in `.out-of-scope/<slug>.md`; **terminal**. |
| `triage:done` | PR merged or otherwise resolved; **terminal**. |

### Transition table

| From | To | Condition |
|---|---|---|
| `triage:new` | `triage:investigating` | reproducible signal in evidence JSONL or `test_failure` row exists |
| `triage:new` | `triage:wontfix` | duplicate of an existing closed issue OR obsolete |
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

### Invariants (CI-enforceable)

1. Every open issue carries **exactly one** `triage:*` label.
2. Every issue at `triage:ready-for-agent` has an accompanying
   `docs/agent-briefs/<issue-number>.md` file.
3. Every issue at `triage:wontfix` has an accompanying
   `.out-of-scope/<slug>.md` file with the dismissal rationale.
   (Documented; CI enforcement is follow-up work.)

`scripts/validate-issue-metadata.js` enforces invariants 1 and 2 in
CI. Exits 1 on violation, 0 on clean.

---

## Bounded-context placement

Per ADR-0005, this decision lives at the intersection of:

- **Skill Registry & Discovery** — the labels and transitions are
  consumed by `github-triage` and exposed to `resolve_workflow`
  through the composition graph.
- **Orchestration & Fleet** — the state machine is what the orchestrator
  uses to know which issues are AFK (autonomous, fully kickable) versus
  HITL (human-in-the-loop). `triage:ready-for-agent` is the "AFK
  doorway"; `triage:human-review` is the "HITL doorway".

---

## Consequences

### Positive

- Agents can independently determine which issues to grab next.
- Out-of-scope decisions are captured in `.out-of-scope/` and survive
  across sessions, preventing re-triage churn.
- CI invariants make drift detectable.
- The composition graph (`scripts/derive-skill-composition.js`) can
  follow `github-triage -> triage-bug -> tdd` automatically.

### Negative / costs

- Existing repos that have not adopted the labels need a one-time
  backfill. Apply `triage:new` to every currently-open issue without
  a `triage:*` label as the seed.
- Damage-control DC-43 blocks `gh issue edit --add-label` from agent
  worktrees by default. Operators must opt in with
  `EVOKORE_AUTO_LABEL_ISSUES=true` for transitions to apply
  automatically; otherwise the agent emits the transition as a
  recommendation and a human applies it.

### Neutral

- The state machine is intentionally minimal. Sub-states (e.g.,
  `triage:ready-for-agent:in-flight`) can be added later without
  breaking the invariants.

---

## References

- `SKILLS/PROJECT MANAGEMENT/github-triage/SKILL.md` — runtime
  authority for the transitions.
- `SKILLS/QA/triage-bug/SKILL.md` — produces `docs/bugs/<slug>.md`,
  consumed by `triage:investigating -> triage:ready-for-agent`.
- `SKILLS/PLANNING/to-issues/SKILL.md` — files new issues with
  `triage:new` + AFK/HITL labels.
- `scripts/validate-issue-metadata.js` — CI invariant validator.
- ADR-0005 — bounded contexts.
