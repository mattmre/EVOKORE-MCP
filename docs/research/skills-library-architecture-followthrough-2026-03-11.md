# Skills Library Architecture Follow-Through - 2026-03-11

## Goal

Close `T14` by verifying whether EVOKORE still needed bulk Agent33 skill imports, then harden the runtime and docs around the skills library that is already present.

## Findings

The expected high-priority imports are already in the repository and indexed:

- HIVE framework skills
- `repo-ingestor`
- `mcp-builder`
- `planning-with-files`
- `docs-architect`
- `pr-manager`
- `webapp-testing`
- `skill-creator`
- WSHOBSON plugin library

The remaining gap was architectural rather than inventory-based:

- `SkillManager` only indexed `name`, `description`, category path, and body content
- richer frontmatter metadata from imported skills (`category`, `metadata`, nested `tags`, command aliases, framework membership) was mostly ignored
- there was no explicit regression test proving that the imported library actually exists and remains discoverable by its metadata

## Decision

Do not re-import skills that are already present.

Instead:

- parse and preserve richer frontmatter metadata in the skills index
- make `search_skills` and `resolve_workflow` more discovery-friendly for imported libraries by indexing tags and metadata text
- add explicit validation for the imported high-priority skills and WSHOBSON footprint
- refresh overview docs so the library description matches the current repo state

## Validation

```bash
npm run build
node test-skills-library-architecture-validation.js
npm test
```
