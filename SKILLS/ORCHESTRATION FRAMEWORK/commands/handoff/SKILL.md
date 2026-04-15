---
name: handoff
description: "Use when ending a session and preparing for the next session — creates checkpoint, updates next-session.md, and ensures all PRs are tracked."
aliases: [session-end, wrap, session-wrap]
category: orchestration
tags: [handoff, session-wrap, next-session, checkpoint, continuity]
archetype: AGT-013
version: 1.0.0
---

# /handoff — Session Handoff

Prepares for clean session handoff: creates checkpoint, updates next-session.md with current state, and verifies all in-progress work is tracked.

## Usage

```
/handoff
```

## Steps

1. Run `/session-checkpoint` to save current state
2. List all open PRs: `gh pr list --state open`
3. List incomplete tasks from tilldone
4. Update `next-session.md` with:
   - Current HEAD commit
   - Open PRs and their status
   - Pending tasks in priority order
   - "HOW TO START NEXT SESSION" instructions
5. Commit and push the updated next-session.md

## Done Criteria

- [ ] Session checkpoint created in docs/session-logs/
- [ ] next-session.md updated with current state
- [ ] All open PRs listed with their status
- [ ] Clear "HOW TO START" instructions for next session
- [ ] No uncommitted changes in working tree

## Integration

- Pairs with session-continuity.js for manifest state
- Voice stop hook fires on session end (VoiceSidecar)
- TillDone stop hook verifies task completion before allow
