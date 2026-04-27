# Upstream Provenance: mattpocock/skills

This file documents EVOKORE-MCP's vendoring of the **read-only git submodule**
at `SKILLS/upstream/mattpocock-skills`. It lives in the parent repo (one level
up from the submodule) so the submodule itself stays unmodified — adapter
SKILL.md files for EVOKORE consumption live in their respective EVOKORE
category directories (e.g., `SKILLS/DEVELOPER TOOLS/`, `SKILLS/GENERAL CODING
WORKFLOWS/`) and reference upstream content via the `upstream:` /
`upstream-sha:` / `upstream-path:` frontmatter fields documented in
`SKILLS/DEVELOPER TOOLS/skill-creator/SKILL.md`.

## Source

- **Source URL:** https://github.com/mattpocock/skills
- **Pinned commit SHA:** `90ea8eec03d4ae8f43427aaf6fe4722653561a42`
- **Fetched date:** 2026-04-27
- **License type:** MIT
- **Copyright holder:** Copyright (c) 2026 Matt Pocock
- **Authoritative LICENSE file:** `SKILLS/upstream/mattpocock-skills/LICENSE`
- **Repo-root attribution:** `NOTICE`

## Adapted Subset (Wave 0a → downstream PRs)

The following upstream skills are slated for ADAPT/ADOPT into EVOKORE-MCP
adapter SKILL.md files. Wave 0a (this PR) only establishes provenance and the
adapter-template scaffolding; the actual adapter ports land in subsequent PRs.

1. `zoom-out`
2. `ubiquitous-language`
3. `improve-codebase-architecture`
4. `to-prd`
5. `to-issues`
6. `triage-bug` (upstream directory: `triage-issue`)
7. `github-triage`
8. `design-an-interface` (concept)
9. `setup-pre-commit`
10. `tdd` (technique)
11. `write-a-skill` (technique)
12. `git-guardrails` (technique; upstream directory: `git-guardrails-claude-code`)

> Note: 12 rows are listed because the brief enumerated 11 ADAPT/ADOPT targets
> but `triage-bug` and `git-guardrails` map to upstream directories with
> slightly different names. Both upstream paths are tracked here for
> completeness so adapter SKILL.md `upstream-path:` frontmatter resolves
> unambiguously.

## Upgrade Procedure

To pull a fresh upstream and re-pin:

```bash
# 1. Update the submodule to the upstream HEAD (or a chosen tag/SHA).
git submodule update --remote SKILLS/upstream/mattpocock-skills

# 2. Inspect the new SHA.
cd SKILLS/upstream/mattpocock-skills
git rev-parse HEAD
cd -

# 3. Stage and commit the parent-repo pointer bump.
git add SKILLS/upstream/mattpocock-skills
git commit -m "chore(vendor): bump mattpocock/skills to <new-sha>"

# 4. Update NOTICE (root) and this UPSTREAM-mattpocock-skills.md with the new
#    pinned SHA and fetched date, then re-stage and follow up.
```

After bumping, audit every adapter SKILL.md whose `upstream-sha:` frontmatter
points at the old SHA — those references are stale until refreshed.

## Drift Check

To verify the submodule still tracks the recorded SHA (no unintended pointer
drift, no local edits):

```bash
git submodule status SKILLS/upstream/mattpocock-skills
```

Output legend:

- Leading space: clean and at the recorded commit. Healthy.
- Leading `+`: submodule's HEAD has moved. Investigate, then either bump
  the recorded pointer (see Upgrade Procedure) or reset back.
- Leading `-`: submodule is uninitialized. Run
  `git submodule update --init SKILLS/upstream/mattpocock-skills`.
- Trailing `-dirty`: working tree inside the submodule has uncommitted
  changes. Do not commit edits inside this submodule; revert with
  `git -C SKILLS/upstream/mattpocock-skills checkout -- .`

## Adapter Authoring Pointer

When porting one of the upstream skills above, copy the scaffolding template
at `SKILLS/DEVELOPER TOOLS/skill-creator/templates/adapter-template.md`
into the appropriate EVOKORE category directory and fill in:

- `upstream-sha:` — must match the SHA above (`90ea8eec03d4ae8f43427aaf6fe4722653561a42`)
- `upstream-path:` — relative path inside this submodule, e.g. `zoom-out/SKILL.md`
