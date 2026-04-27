---
name: to-issues
description: "Use when decomposing an existing PRD at docs/prd/{slug}.md into independently-grabbable vertical-slice GitHub issues, with each slice tagged AFK (agent-ready) or HITL (needs-human) and routed through a panel-of-experts critique instead of a live user-approval loop."
aliases: [decompose-prd, vertical-slice, slice-prd, prd-to-issues]
category: planning
tags: [issues, vertical-slice, tracer-bullet, decomposition, agent-ready]
version: 1.0.0
upstream: mattpocock/skills
upstream-sha: 90ea8eec03d4ae8f43427aaf6fe4722653561a42
upstream-path: to-issues/SKILL.md
license: MIT
resolutionHints:
  - decompose a PRD into issues
  - vertical slice planning
  - tracer-bullet decomposition
  - generate slice manifest from PRD
---

# to-issues — Decompose a PRD Into Vertical-Slice Issues

## When to use this skill

Use when a PRD already exists at `docs/prd/<slug>.md` (typically produced by
`to-prd` skill) and the next step is to break it into independently-grabbable,
vertically-sliced GitHub issues. EVOKORE-MCP runs autonomous agent sessions,
so issue decomposition is artifact-driven: read the PRD, emit a slice
manifest, and route shape-critique through `panel-of-experts` instead of a
live user-approval loop.

If no PRD exists yet, stop. The producer of this work — the `to-prd`
artifact — must already exist before this skill is entered. If the PRD
exists but has not been panel-reviewed, route it through
`panel-of-experts` before decomposing.

## Adapted From Upstream

This skill is adapted from `mattpocock/skills/to-issues` (upstream commit
`90ea8eec03d4ae8f43427aaf6fe4722653561a42`, MIT-licensed). The upstream
skill iteratively asks the user to confirm slice shape, dependency edges,
and acceptance criteria. EVOKORE-MCP replaces those user-loop gates with
a `panel-of-experts` critique pass and a damage-control-gated filing
flow.

## EVOKORE-Specific Adaptations

| Upstream behavior | EVOKORE behavior |
|---|---|
| "Ask the user how to slice" | Read `docs/prd/<slug>.md` and apply the slice-shape rules below; route uncertainty through `panel-of-experts` |
| "Iterate until the user approves the slice list" | Invoke `panel-of-experts` skill with persona set `[orchestration-planner, dependency-analyst, scope-cutter]` for slice-shape critique |
| "Confirm dependencies with the user" | Read the PRD's `## Dependencies` section + ADR cross-links; encode dependencies as issue-number references inside each slice manifest entry |
| "User picks AFK vs HITL" | Heuristic: a slice is AFK if its acceptance criteria are testable by an agent without human input; otherwise HITL |
| "User edits issue bodies" | Issue bodies are markdown files at `docs/issue-manifests/<slug>/<slice-id>.md`; edit those files, not inline shell strings |

## Slice-shape rules

A slice is a **vertical / tracer-bullet** chunk of work — it crosses every
layer it needs to cross to deliver one user-visible or agent-visible
behavior end-to-end. The following rules must hold for every slice:

1. **AFK or HITL.** Every slice is exactly one of:
   - **AFK** (autonomous, fully kickable). Acceptance criteria are
     entirely agent-testable. Apply label `agent-ready`.
   - **HITL** (requires human decision). Apply label `needs-human`.
2. **Acceptance criteria as a checklist.** Each slice has at least
   one and typically 3–8 checkbox items, each independently verifiable.
3. **Explicit dependency arrows.** Each slice lists predecessor slice
   IDs (or open issue numbers) it depends on. No implicit ordering.
4. **One commit-pressure unit.** A slice should fit roughly in a single
   PR. If the slice is too large, decompose further.
5. **Tagged with `triage:new`.** Newly-created issues enter the
   `github-triage` state machine at the `triage:new` state (see
   ADR-0006). Apply label `triage:new` in addition to `agent-ready` or
   `needs-human`.

## Inputs to read before decomposing

1. `docs/prd/<slug>.md` — the source PRD.
2. `docs/adr/0005-bounded-contexts.md` — to ensure each slice falls
   inside a single bounded context where possible. Cross-context slices
   require panel review.
3. Existing `docs/issue-manifests/*` entries — to avoid duplicate
   slices.
4. Open GitHub issues with the same slug (via
   `gh issue list --search "<slug>"`) — to merge with prior triage
   work rather than duplicate it.

## Slice manifest

Write the slice manifest to
`docs/issue-manifests/<slug>.json`. The manifest is the canonical
machine-readable source for filing. Schema:

```json
{
  "prd": "docs/prd/<slug>.md",
  "generatedAt": "<ISO-8601>",
  "slices": [
    {
      "id": "<slug>-001",
      "title": "<short imperative title>",
      "bodyFile": "docs/issue-manifests/<slug>/<slug>-001.md",
      "labels": ["triage:new", "agent-ready"],
      "deps": [],
      "afk": true
    }
  ]
}
```

Per-slice body files at `docs/issue-manifests/<slug>/<slice-id>.md`
contain the full issue body in markdown:

```
# <Title>

**PRD:** docs/prd/<slug>.md
**Slice:** <slug>-001
**Type:** AFK | HITL

## Context
…

## Acceptance criteria
- [ ] …
- [ ] …

## Dependencies
- depends on: <slug>-000

## Out of scope
…
```

## Panel review gate

After the slice manifest is written, **invoke `panel-of-experts` skill
with persona set `[orchestration-planner, dependency-analyst,
scope-cutter]`** for slice-shape critique. The panel checks:

- Slice independence (can each be grabbed in any order modulo
  declared deps?).
- Bounded-context alignment per ADR-0005.
- AFK/HITL labelling correctness.
- Whether any slice is too big and needs further decomposition.

If the panel returns blocking findings, edit
`docs/issue-manifests/<slug>.json` and the per-slice body files in
place, then re-invoke the panel.

## Filing the issues

Damage-control rule DC-41 blocks `gh issue create` from agent worktrees
by default, and DC-43 blocks `gh issue edit --add-label` for sensitive
labels.

**Path A — default, no env override.** Write the manifest and per-slice
body files. Stop. A human or orchestrator with the env overrides set
can file later.

**Path B — `EVOKORE_AUTO_FILE_ISSUES=true`.** Iterate the manifest's
`slices[]` and run for each:

```bash
gh issue create \
  --title "<title>" \
  --body-file "<bodyFile>" \
  --label "triage:new" \
  --label "agent-ready"
```

Always pass labels via `--label` flags and the body via `--body-file`.
Never use `-b`/`-m` inline. After issue creation, write the issue
number back into the manifest's `slices[].issue` field for downstream
chaining.

If `EVOKORE_AUTO_LABEL_ISSUES=true` is also set, a follow-up
`gh issue edit <num> --add-label "<label>"` may be used for
post-creation label adjustments. Otherwise, label changes are emitted
as recommendations in the agent's report rather than executed.

## Composition

For each AFK slice (label `agent-ready`), **invoke `tdd` skill** to
write the failing test, then implement against the slice's acceptance
criteria.

For each HITL slice (label `needs-human`), **invoke `pr-manager`
skill** to prepare the slice for human review.

For any slice that the panel-review marks as cross-cutting or
architectural, **run `architecture-planning` panel** before either of
the above.

## Reporting back

The skill's final output must include:

- The path `docs/issue-manifests/<slug>.json`.
- The count of AFK slices vs HITL slices.
- The panel verdict and any blocking findings.
- Whether issues were filed (Path B) or just manifested (Path A).
- The `for each AFK slice, invoke tdd skill` and `for each HITL slice,
  invoke pr-manager skill` lines so the composition graph picks them
  up.
