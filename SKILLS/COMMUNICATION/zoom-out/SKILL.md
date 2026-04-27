---
name: zoom-out
description: Use when an agent needs to go up a layer of abstraction — map calling modules, identify the seam at which a change should land, and check whether the bug or feature lives at the right altitude.
upstream: mattpocock/skills
upstream-sha: 90ea8eec03d4ae8f43427aaf6fe4722653561a42
upstream-path: zoom-out/SKILL.md
---

# Zoom Out

## When to use this skill

Use this skill when the current edit window is too low to make a sound design call — you need to see callers, public API surface, or the module boundary one layer above where you are looking. The trigger is "I am unfamiliar with this area" OR "this fix may belong somewhere else." Output is a short reframe paragraph plus a recommendation to keep zooming out or commit the current altitude.

## Adapted From Upstream

This adapter is derived from
[`zoom-out/SKILL.md`](../../upstream/mattpocock-skills/zoom-out/SKILL.md) in
the `mattpocock/skills` submodule pinned at
`90ea8eec03d4ae8f43427aaf6fe4722653561a42`. The upstream is a single-line
prompt that says *"I don't know this area of code well. Go up a layer of
abstraction. Give me a map of all the relevant modules and callers."*

To read the upstream body without loading the full file, prefer:

```text
nav_read_anchor SKILLS/upstream/mattpocock-skills/zoom-out/SKILL.md <anchor-id>
```

License: MIT, Copyright (c) 2026 Matt Pocock. See repo-root `NOTICE` and
`SKILLS/upstream/mattpocock-skills/LICENSE`.

## EVOKORE-Specific Adaptations

Concrete deltas vs the upstream prompt:

- **No "ask the user" loop.** The upstream prompt assumes a human in the
  loop will provide the higher-level framing. EVOKORE is autonomous — this
  adapter reads prior artifacts instead: the in-flight diff
  (`git diff --staged`), the active session manifest at
  `~/.evokore/sessions/{sessionId}.json`, the replay log at
  `~/.evokore/sessions/{sessionId}-replay.jsonl`, and any evidence already
  captured at `~/.evokore/sessions/{sessionId}-evidence.jsonl`.
- **`nav_get_map` substitution for "give me a map".** Where the upstream
  asks the human to provide a map of modules and callers, EVOKORE calls
  the native `nav_get_map` tool against the file under edit (and any
  obvious caller files surfaced by `git grep`) to get a token-efficient
  anchor map without loading whole files.
- **Bounded-context awareness.** When the file under edit lives inside a
  bounded context defined in `docs/adr/0005-bounded-contexts.md`, the
  reframe must name that context explicitly. Going up one layer of
  abstraction inside `Session & Continuity` is different from going up
  one layer inside `Skill Registry & Discovery`; the seam choice
  depends on which context's invariants apply.
- **Composition phrasing for downstream skills.** When the reframe
  recommends a follow-up, this adapter emits the literal phrasing the
  static composition graph parses (e.g., "invoke ubiquitous-language skill"
  or "invoke docs-architect skill") so `derive-skill-composition.js` can
  edge to the correct next step.
- **Trigger-explicit description.** Frontmatter `description` is rewritten
  from the upstream noun-ish phrasing into EVOKORE's "Use when ..." form so
  `resolve_workflow` semantic ranking can find this skill above deep
  reference leaves.

## Composition

- **Callers (skills that should invoke this skill):**
  - `simplify` — when a proposed simplification touches a public seam,
    invoke zoom-out skill first to confirm the seam is actually public.
  - `repo-ingestor` — early in a fresh-repo onboarding, invoke zoom-out
    skill to surface module boundaries before deeper analysis.
  - `orch-plan` — when a slice plan straddles an unclear module boundary,
    invoke zoom-out skill before locking the slice scope.

- **Callees (skills this skill may invoke):**
  - After zoom-out has identified a candidate seam, optionally invoke
    docs-architect skill to ensure the surface change is documented.
  - When the higher-altitude reframe reveals genuine domain ambiguity
    (e.g., two callers use "session" to mean different things), invoke
    ubiquitous-language skill (scoped to the relevant bounded context
    from `docs/adr/0005-bounded-contexts.md`).

## Procedure

1. **Identify the focus file(s).** Read the in-flight diff
   (`git diff --staged`, then `git diff` if nothing staged). If there is
   no diff, fall back to the file path the user named. Record the
   focus file(s) explicitly.

2. **Surface the local anchor map.** Call `nav_get_map` on each focus
   file. This returns a structured anchor list at ~100 tokens vs 4K-40K
   for a full file read. If the focus file has no `@AI:NAV` anchors,
   note it and continue (the absence is itself a signal — files without
   anchors tend to be the inner leaves, which is the wrong altitude
   for zoom-out by definition).

3. **Map callers.** Run `git grep -n "<exported-symbol>" -- 'src/**/*.ts'`
   for each public symbol in the focus file(s). Record at most ten
   caller hits — if there are more, the file is genuinely a hub and that
   fact becomes part of the reframe.

4. **Identify the bounded context.** Read
   `docs/adr/0005-bounded-contexts.md` (or `nav_read_anchor` it if
   anchored) and determine which bounded context the focus file belongs
   to. State the context name explicitly. If the focus file straddles
   contexts (e.g., it imports from two different contexts' modules),
   call that out — the seam may need to live at the context boundary.

5. **Write the reframe.** Emit one paragraph that answers three
   questions:
   - What layer is the focus file at? (leaf / module-internal / public
     surface / cross-context boundary)
   - What lives at the layer above? (callers, public API, MCP-surfaced
     tool definition, ADR-defined context boundary)
   - At which layer does the proposed change actually belong?

6. **Recommend next step.** End the reframe with a single recommendation:
   - `COMMIT-ALTITUDE` — the current edit window IS the right altitude;
     proceed with the change.
   - `ZOOM-FURTHER` — the change belongs higher up; restart at the
     caller's caller, or at the public API.
   - `ZOOM-IN` — the framing was already too high; drop into the named
     leaf module.
   - Optionally append "invoke X skill" pointing at the next skill the
     caller should run.

## Inputs and Outputs

**Inputs:** focus file path(s), optional bounded-context name (auto-detected
from ADR-0005 if not given), session manifest path (auto-detected from
`EVOKORE_SESSION_ID` env var or `~/.evokore/sessions/`).

**Outputs:** one reframe paragraph (markdown) plus one recommendation
token from `{COMMIT-ALTITUDE, ZOOM-FURTHER, ZOOM-IN}` and an optional
follow-up skill invocation. Do NOT write a separate output file — the
reframe is short enough to live in the conversation transcript and the
session replay log.

## Anti-patterns

- Zooming out without naming the bounded context. The reframe MUST cite
  which of the eight ADR-0005 contexts owns the focus file; otherwise
  the seam recommendation is meaningless.
- Producing a "map of all the relevant modules and callers" verbatim
  from the upstream prompt without filtering. EVOKORE's `nav_get_map` +
  `git grep` already structure the data; the reframe should be a
  paragraph, not a copy of the raw map.
- Recommending an unrelated skill in the closing line. If you don't
  have a precise downstream skill to invoke, omit the invocation —
  do not invent edges into `skill-graph.json`.
