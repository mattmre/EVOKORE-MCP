---
name: agent-spawn
description: "Use when you need to spawn a specialist sub-agent to handle a specific task domain without polluting the main session context."
aliases: [spawn, spawn-agent, sub-agent]
category: orchestration
tags: [agent, spawn, orchestration, delegation, parallel]
archetype: AGT-019
version: 1.0.0
---

# /agent-spawn — Spawn Specialist Sub-Agent

Delegates a specific task to a specialist sub-agent, keeping the main session context clean.

## Usage

```
/agent-spawn "researcher" "Find all usages of TrustLedger in src/"
/agent-spawn "implementer" "Implement the score decay function in src/TrustLedger.ts"
/agent-spawn "tester" "Write vitest tests for pattern-extractor.js"
```

## Available Archetypes

| Archetype | Domain | Best for |
|-----------|--------|----------|
| researcher | research | Codebase analysis, dependency tracing |
| implementer | execution | Feature implementation, bug fixes |
| tester | quality | Test writing, coverage analysis |
| reviewer | quality | Code review, security audit |
| architect | orchestration | Design decisions, API design |
| debugger | execution | Root cause analysis, bug investigation |

## What it does

1. Creates an Agent tool call with the specified subagent_type
2. Passes the task description and relevant context
3. The sub-agent runs in isolation and returns a result
4. Result is summarized in the main session context

## Best practices

- Use researcher before implementer (plan before code)
- Keep sub-agent prompts self-contained (include file paths, context)
- Use isolation: worktree for implementers that write code
- Prefer sequential spawning to avoid worktree race conditions

## Integration

- Works with AGT-019 (Claims Coordinator) for resource claim management
- Sub-agent results are captured in session-replay log
- SessionAnalyticsManager tracks subagent counts per session
