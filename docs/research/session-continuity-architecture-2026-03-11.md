# Session Continuity Architecture Follow-Through (2026-03-11)

## Context

Agent33's continuity guidance treats EVOKORE as the reference implementation for session state, replay logs, task tracking, and session-wrap artifacts. By the start of `T18`, EVOKORE already had:

- `purpose-gate` writing `~/.evokore/sessions/{sessionId}.json`
- `session-replay` writing `~/.evokore/sessions/{sessionId}-replay.jsonl`
- `evidence-capture` writing `~/.evokore/sessions/{sessionId}-evidence.jsonl`
- `tilldone` writing `~/.evokore/sessions/{sessionId}-tasks.json`
- repo-side continuity docs in `docs/RESEARCH_AND_HANDOFFS.md`, `docs/session-logs/`, `next-session.md`, and `CLAUDE.md`

The gap was that these runtime artifacts were siblings, not a canonical architecture.

## Problem

Continuity data existed, but it was fragmented:

1. The session JSON file only tracked purpose initialization and recording.
2. Replay, evidence, and task files had no shared manifest or lifecycle metadata.
3. Runtime docs listed replay and task files but omitted the canonical purpose manifest and evidence log.
4. `T19` auto-memory and `T21` live status line would have no stable runtime continuity contract to build on.

## Decision

Add a shared session manifest contract at:

```text
~/.evokore/sessions/{sessionId}.json
```

This file becomes the canonical runtime continuity record. The append-only logs remain separate:

- replay stays in `*-replay.jsonl`
- evidence stays in `*-evidence.jsonl`
- tasks stay in `*-tasks.json`

The manifest stores:

- session identity and continuity version
- purpose and purpose timestamps
- lifecycle timestamps (`createdAt`, `updatedAt`, `lastPromptAt`, `lastActivityAt`)
- latest tool/evidence/task/stop-check metadata
- artifact paths
- derived metrics (`replayEntries`, `evidenceEntries`, `totalTasks`, `incompleteTasks`)

## Why this shape

- Additive: preserves the shipped file layout and existing hook behavior.
- Durable: creates one canonical file for downstream status, memory, and handoff tooling.
- Low-risk: hooks update the same manifest after their existing file writes instead of changing their primary storage.
- Observable: artifact counters are derived from the current files, so the manifest reflects real state instead of only in-memory counters.

## Out of scope for T18

- Claude auto-memory content under `~/.claude/projects/*/memory/` (`T19`)
- rendering a live terminal status line from the session manifest (`T21`)
- repo-session wrap docs beyond the control-plane refresh already done at root (`T22`)

## Validation

`test-session-continuity-validation.js` proves:

- first prompt creates the manifest
- purpose recording updates canonical state
- replay/evidence hooks update derived metrics
- TillDone CLI and stop-hook checks update task and stop-check metadata

## Follow-through

- `T19` should build its memory bootstrap on the manifest instead of guessing session state from scattered files.
- `T21` should read the manifest for operator-facing session status rather than scraping hook outputs ad hoc.
