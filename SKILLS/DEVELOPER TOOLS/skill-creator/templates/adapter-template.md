---
name: <kebab-case-name>
description: Use when <specific trigger condition> — see When to use this skill below.
upstream: mattpocock/skills
upstream-sha: <SHA from .gitmodules>
upstream-path: <relative path inside submodule, e.g. zoom-out/SKILL.md>
---

<!--
  EVOKORE-MCP Adapter Skill Template
  ----------------------------------
  Copy this file into the appropriate EVOKORE category directory under SKILLS/
  (e.g., `SKILLS/DEVELOPER TOOLS/<skill-name>/SKILL.md`,
  `SKILLS/GENERAL CODING WORKFLOWS/<skill-name>/SKILL.md`) and fill in the
  placeholders.

  Frontmatter requirements:
    - name: kebab-case identifier; must match the skill directory name.
    - description: trigger-explicit ("Use when ...") so resolve_workflow can
      semantically match. Avoid vague noun phrases.
    - upstream: short slug `<owner>/<repo>` of the vendored upstream.
    - upstream-sha: pinned commit SHA recorded in `.gitmodules` and
      `SKILLS/upstream/UPSTREAM-mattpocock-skills.md`. Must match.
    - upstream-path: relative path INSIDE the submodule pointing at the
      upstream skill body that this adapter is derived from.

  Body structure (all three sections required):
    1. ## When to use this skill — 5-second-decide trigger summary.
    2. ## Adapted From Upstream — link or `nav_read_anchor` reference into
       the submodule.
    3. ## EVOKORE-Specific Adaptations — concrete delta vs upstream
       (e.g., user-loops collapsed into panel-of-experts invocations,
       continuity-manifest hooks added, native EVOKORE tools substituted
       for upstream CLI assumptions, etc.).

  Do NOT modify files inside `SKILLS/upstream/mattpocock-skills/`. Adapter
  bodies live exclusively in EVOKORE category directories.
-->

# <Adapter Skill Title>

## When to use this skill

<2-3 sentences. State the trigger condition first. A reader should be able to
decide in 5 seconds whether this skill applies to their task. Avoid leading
with implementation details.>

## Adapted From Upstream

This adapter is derived from
[`<upstream-path>`](../../../upstream/mattpocock-skills/<upstream-path>) in
the `mattpocock/skills` submodule pinned at
`<SHA from .gitmodules>`.

To read the upstream body without loading the full file, prefer:

```text
nav_read_anchor SKILLS/upstream/mattpocock-skills/<upstream-path> <anchor-id>
```

License: MIT, Copyright (c) 2026 Matt Pocock. See repo-root `NOTICE` and
`SKILLS/upstream/mattpocock-skills/LICENSE`.

## EVOKORE-Specific Adaptations

<List concrete deltas vs the upstream skill. Examples — replace with the real
adaptations for this skill:>

- **User-loop questions → panel-of-experts.** The upstream relies on
  human-in-the-loop confirmation prompts; EVOKORE substitutes
  `panel-of-experts` skill invocations against the relevant panel
  (e.g., `architecture`, `dependency-supply-chain`).
- **Continuity manifest hooks.** Outputs are written through the shared
  session manifest (`~/.evokore/sessions/{sessionId}.json`) instead of
  ad-hoc text files.
- **Native tool substitution.** Where the upstream assumed a generic CLI,
  the adapter calls the corresponding EVOKORE native tool (e.g.,
  `nav_read_anchor`, `search_skills`, `resolve_workflow`).
- **Trigger-explicit description.** Frontmatter `description` is rewritten
  in EVOKORE's "Use when ..." form so `resolve_workflow` semantic matching
  can rank this skill over deep reference leaves.

## Skill Body

<Procedural body of the adapter. Use imperative/infinitive voice. Reference
upstream content rather than copying it verbatim where possible — the
submodule is on disk and addressable by path. When upstream prose must be
quoted, attribute it ("Upstream `<upstream-path>` says: ...") and keep the
quote short.>
