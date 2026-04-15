---
name: context-budget
description: "Use when you need to check the current session's context usage and get recommendations for compaction or continuation."
aliases: [budget, context-health, context-check]
category: orchestration
tags: [context, budget, compaction, session-analytics, tokens]
archetype: AGT-013
version: 1.0.0
---

# /context-budget — Check Context Budget

Reports current session context usage and provides recommendations for compaction or continuation.

## Usage

```
/context-budget
```

## What it does

1. Calls `session_context_health` tool (SessionAnalyticsManager)
2. Reports: context size %, cost per turn, compact recommendation
3. If context > 80%: recommends compaction now
4. If context > 90%: urgently recommends compaction

## Metrics

- **Context usage:** % of context window consumed
- **Cost per turn:** average token cost per conversation turn
- **Compact recommendation:** whether to compact before next major work unit

## Integration

- session_context_health tool from SessionAnalyticsManager
- Pre-compact hook fires automatically at 95% — this provides earlier warning
- Use `/session-checkpoint` before compacting to preserve state
