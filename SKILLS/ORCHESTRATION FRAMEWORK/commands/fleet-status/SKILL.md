---
name: fleet-status
description: "Use when you need to check the status of all running agents, workers, and claims in the current fleet."
aliases: [fleet, agent-status, worker-status]
category: orchestration
tags: [fleet, agents, workers, claims, monitoring]
archetype: AGT-019
version: 1.0.0
---

# /fleet-status — Fleet Status Dashboard

Reports the current status of all running agents, workers, and resource claims.

## Usage

```
/fleet-status
```

## What it checks

1. **Active claims:** `claim_list` tool (ClaimsManager) — shows all locked resources
2. **Worker status:** `worker_context` tool — shows running/completed workers
3. **Trust scores:** `session_trust_report` tool — shows per-agent trust tiers
4. **Memory usage:** `memory_list` tool — shows active memory entries
5. **Session analytics:** `session_work_ratio` tool — shows evidence/replay density

## Output Format

Reports each dimension with a summary and any warnings:

```
=== Fleet Status ===
Claims: 2 active (none stale)
Workers: 1 running (test_run), 2 complete
Trust: 3 agents — 2 Trusted, 1 Standard
Memory: 47 entries (12 active kinds)
Work ratio: 0.21 (healthy)
```

## Integration

- Uses 5 native MCP tools: claim_list, worker_context, session_trust_report, memory_list, session_work_ratio
- Pairs with AGT-013 (Loop Operator) for anomaly detection
- Results feed into /session-checkpoint for state snapshot
