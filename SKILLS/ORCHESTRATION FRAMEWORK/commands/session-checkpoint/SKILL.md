---
name: session-checkpoint
description: "Use when you want to save a timestamped snapshot of current session state (tasks, evidence, purpose) to docs/session-logs/ for crash recovery or handoff."
aliases: [checkpoint, save-session, session-save]
category: orchestration
tags: [session, checkpoint, recovery, handoff, tilldone]
archetype: AGT-013
version: 1.0.0
---

# /session-checkpoint — Create Session Checkpoint

Saves a timestamped snapshot of the current session's task status, evidence summary, and purpose to `docs/session-logs/session-checkpoint-<ts>.md`.

## Usage

```
/session-checkpoint
node scripts/session-checkpoint.js
node scripts/session-checkpoint.js --session <session-id> --out <output-dir>
```

## What it does

1. Reads current tilldone task list from `~/.evokore/sessions/{sessionId}-tasks.json`
2. Reads evidence log from `~/.evokore/sessions/{sessionId}-evidence.jsonl`
3. Reads session purpose from the session manifest
4. Computes metrics: task completion rate, test pass rate, git op count
5. Writes `docs/session-logs/session-checkpoint-{timestamp}.md`

## Output

A markdown checkpoint file containing:
- Task progress table (completed/pending)
- Evidence summary (test results, git ops, edit traces)
- Recent git operations (last 5)
- Resume instructions for the next session

## When to use

- Before a long break (context will be lost)
- Before context compaction (pre-compact hook)
- After completing a major phase
- At the end of each session (in addition to session-wrap)
- Before handing off to another agent or session

## Integration

- Works with purpose-gate.js: checkpoint path can be injected into additionalContext
- Used by AGT-013 (Loop Operator) to anchor recovery evidence
- `/scope-lock` uses the checkpoint as its baseline state
