---
name: triage-bug
description: "Use when triaging a bug from session evidence (evidence-capture JSONL, replay JSONL, telemetry, repo-audit) instead of from a live user description, and producing a TDD fix plan plus a docs/bugs/{slug}.md triage artifact."
aliases: [bug-triage, evidence-bug-triage, replay-bug, triage-from-evidence]
category: quality
tags: [bug, triage, evidence, replay, telemetry, root-cause, tdd-plan]
version: 1.0.0
upstream: mattpocock/skills
upstream-sha: 90ea8eec03d4ae8f43427aaf6fe4722653561a42
upstream-path: triage-bug/SKILL.md
license: MIT
resolutionHints:
  - triage a bug from evidence
  - root cause from replay logs
  - reproduce a bug without user input
  - generate a TDD plan from a failure signal
---

# triage-bug — Triage a Bug From Evidence, Not From a User

## When to use this skill

Use when there is a bug signal that needs root-cause analysis and a TDD
fix plan, and the source of that signal is **not** a live user
description. EVOKORE-MCP is agent-driven; bugs surface through:

- `tool_error` rows in `~/.evokore/sessions/*-evidence.jsonl`
- `test_failure` rows in `~/.evokore/sessions/*-evidence.jsonl`
- abnormal call sequences in `~/.evokore/sessions/*-replay.jsonl`
- branch / worktree / control-plane drift surfaced by
  `npm run repo:audit`
- telemetry anomalies via the `get_telemetry` native tool

If a human reported the bug verbally and the signal hasn't been captured
yet, escalate to HITL: stop, ask the orchestrator to file a
`triage:new` issue, and re-enter this skill once evidence rows exist.

## Adapted From Upstream

This skill is adapted from `mattpocock/skills/triage-bug` (upstream
commit `90ea8eec03d4ae8f43427aaf6fe4722653561a42`, MIT-licensed). The
upstream skill assumes a user describes the bug, the agent asks
clarifying questions, and the user confirms reproduction steps.
EVOKORE-MCP is agent-driven, so all of those steps are replaced with
artifact reads.

## EVOKORE-Specific Adaptations

| Upstream behavior | EVOKORE behavior |
|---|---|
| "Ask the user to describe the bug" | Read most recent `~/.evokore/sessions/*-evidence.jsonl` for `tool_error` / `test_failure` rows |
| "Ask the user for reproduction steps" | Read corresponding `~/.evokore/sessions/*-replay.jsonl` for the call sequence leading up to the failure (timestamp window before the error row) |
| "Ask the user about environment" | Run `npm run repo:audit` for branch/worktree drift; optionally call `get_telemetry` native tool for runtime context |
| "Iterate with user on root cause hypothesis" | Invoke `panel-of-experts` skill with persona set `[debugger, architect, qa-lead]` if the root cause crosses bounded contexts (ADR-0005) |
| "User confirms the fix plan" | The fix plan is a TDD plan (failing test path + expected assertion + fix surface) written to `docs/bugs/<slug>.md`; the actual confirmation is the **failing test commit** produced by the downstream `tdd` skill |

## Inputs to read before triaging

In order:

1. `~/.evokore/sessions/*-evidence.jsonl` (latest by mtime). Filter for
   `tool_error`, `test_failure`, and `git_operation` rows in the last
   N hours. Pin the canonical evidence row(s) for this bug.
2. `~/.evokore/sessions/*-replay.jsonl` (matching session ID). Read
   the call window leading up to the pinned evidence row(s) — typically
   the prior 10–30 tool calls or a 60-second timestamp window.
3. `npm run repo:audit` output. Capture branch/worktree pressure,
   stale upstreams, and control-plane drift signals.
4. Optionally invoke `get_telemetry` native tool for retry rates and
   p50 latencies on the implicated tools.
5. Existing `docs/bugs/*.md` files — search for slug overlap so the
   triage merges with prior work rather than duplicating it.
6. `docs/adr/0005-bounded-contexts.md` to determine whether the bug
   sits in a single bounded context or crosses several.

## Triaged-bug artifact

Write the triage to `docs/bugs/<slug>.md`. Slug is kebab-case derived
from the failing component or test name. The artifact must contain:

```
# Bug: <Title>

**Status:** Triaged | TDD-Planned | Fix-In-Flight | Resolved
**Date:** YYYY-MM-DD
**Bounded Context:** <ADR-0005 context name>

## Reproducible steps from replay
<numbered list of tool calls extracted from replay JSONL, with
 timestamps and arg shapes — never inline raw secrets>

## Failure signal
<the exact `tool_error` or `test_failure` evidence row(s),
 quoted verbatim, with file/line refs if present>

## Root cause hypothesis
<one paragraph; cite suspect file:line refs from the replay window>

## Suspect surface
- file: `<path>` line: `<n>` — <why it is suspect>
- file: `<path>` line: `<n>` — <why it is suspect>

## TDD fix plan
- **Failing test path:** `<tests/.../*.test.ts or test-*.js>`
- **Expected-behavior assertion:** <what the new test asserts>
- **Fix surface:** `<files most likely to need edits>`
- **Regression guards:** <existing tests that must stay green>

## Out of scope
<what this triage explicitly does not fix; cross-link to other
 bugs/PRDs if scope spilled>

## Composition
- next, invoke `tdd` skill
```

## Filing the bug as a GitHub issue

Damage-control DC-41 blocks `gh issue create` from agent worktrees by
default.

**Path A — default, no env override.** Write
`docs/bugs/<slug>.md` and stop. Emit the path in the agent's report
for HITL or orchestrator to file later.

**Path B — `EVOKORE_AUTO_FILE_ISSUES=true`.** Run:

```bash
gh issue create \
  --title "Bug: <Title>" \
  --body-file "docs/bugs/<slug>.md" \
  --label bug \
  --label "triage:investigating"
```

Always `--body-file`. Never inline-quote the body via `-b`/`-m` —
damage-control flags inline strings containing failure dumps as
high-risk false positives.

If the bug is HITL (requires human decision on scope or fix
direction), apply label `needs-human` instead of `triage:investigating`,
and the downstream `github-triage` skill will route it.

## Composition

After the triage is written, **next, invoke `tdd` skill**. The `tdd`
skill reads `docs/bugs/<slug>.md`'s `## TDD fix plan` section directly
and produces the failing-test commit. `triage-bug` -> `tdd` is
explicitly part of the 11-skill transitive allowlist for the
composition graph (per the runtime-safety contract).

If the panel review of the root-cause hypothesis surfaced architectural
concerns, **run `architecture-planning` panel** before invoking `tdd`.

## Reporting back

The skill's final output must include:

- The path `docs/bugs/<slug>.md`.
- The pinned evidence row(s) with session ID and timestamp.
- The TDD fix plan summary (failing-test path + assertion + fix
  surface).
- Whether the bug was filed as a GitHub issue (Path B) or not (Path A).
- The `next, invoke tdd skill` line so the composition graph picks it
  up.
