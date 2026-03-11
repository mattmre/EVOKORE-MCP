# Auto-Memory Architecture Follow-Through (2026-03-11)

## Context

Agent33's auto-memory follow-through calls out EVOKORE's pattern of maintaining a project-scoped Claude memory directory under:

```text
~/.claude/projects/{project-hash}/memory/
```

On this machine, EVOKORE already has a real memory directory:

```text
C:\Users\mattm\.claude\projects\D--GITHUB-EVOKORE-MCP\memory\
```

but it was stale. It still described:

- `main` at `3f23365`
- stabilization PRs `#81-#85` as pending
- 2-level skill indexing with ~47 visible skills

That made the memory layer a context-rot source instead of a continuity aid.

## Problem

The runtime continuity manifest from `T18` solved session state, but there was still no managed bridge into Claude's auto-loaded memory directory:

1. the memory directory was manual and stale
2. there was no deterministic mapping from repo root to Claude memory project
3. there was no repo-owned script for refreshing `MEMORY.md` and topic files
4. future sessions could read contradictory state from `MEMORY.md` vs `next-session.md` / `task_plan.md`

## Decision

Add a repo-owned Claude memory sync layer:

- `scripts/claude-memory.js`: repo-aware memory detection and managed file generation
- `scripts/sync-memory.js`: CLI entrypoint for operators and validation
- extend the session manifest with `workspaceRoot` and `repoName` so memory sync can prefer repo-scoped session state

The managed memory set is:

- `MEMORY.md`
- `project-state.md`
- `patterns.md`
- `workflow.md`

## Why this shape

- Uses the real Claude memory runtime surface instead of inventing a second memory system
- Keeps `CLAUDE.md` for operator guidance and uses memory files for fast, project-specific continuity
- Builds directly on the `T18` session manifest so the latest session purpose and activity can flow into memory
- Is safe to run repeatedly because the managed files are deterministic outputs from repo state

## Scope boundary

`T19` does not attempt semantic summarization of arbitrary prior sessions. It refreshes a small, high-signal memory set from:

- current git/workspace state
- `next-session.md`
- `CLAUDE.md`
- `task_plan.md` when present
- the latest repo-scoped session manifest

## Validation

`test-auto-memory-validation.js` proves:

- repo roots map to deterministic Claude memory locations
- repo-scoped session manifests are selected for sync
- managed memory files are created and populated with current-state content

## Follow-through

- `T21` should consume the same repo-scoped session manifest and managed memory files instead of scraping independent state
- session-wrap should run `npm run memory:sync` after the remaining roadmap slices land
