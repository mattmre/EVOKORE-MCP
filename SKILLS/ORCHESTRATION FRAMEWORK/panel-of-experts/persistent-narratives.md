---
name: persistent-narratives
description: Cross-session persistence system for expert persona evolution and panel history
aliases: [panel-persistence, expert-memory, narrative-persistence]
category: orchestration
tags: [persistence, narratives, evolution, memory, cross-session]
version: 1.0.0
requires: [panel-of-experts]
---

# Persistent Expert Narratives

## Purpose

Expert personas are not static — they evolve based on meta-improvement feedback, domain shifts, and accumulated review experience. This system persists expert narrative state across sessions so improvements are not lost.

## Storage

```
~/.evokore/panel-narratives/
├── roster-snapshot.json          # Current state of all expert personas (serialized)
├── evolution-log.jsonl           # Append-only log of all persona changes
├── panel-history.jsonl           # Log of which panels were invoked, on what, with what outcome
└── improvement-recommendations/  # Pending improvements awaiting user approval
    └── {timestamp}-{panel}.json
```

## Roster Snapshot Schema

```json
{
  "version": "1.0.0",
  "last_updated": "2026-03-30T00:00:00Z",
  "experts": {
    "margaret-chen": {
      "name": "Margaret Chen",
      "role": "Principal Software Engineer",
      "panels": ["code-refinement"],
      "years_experience": 22,
      "effectiveness_score": null,
      "reviews_participated": 0,
      "unique_findings_count": 0,
      "last_meta_review": null,
      "custom_overrides": {}
    }
  }
}
```

## Evolution Log Schema

Each entry records a change to an expert persona:

```json
{
  "timestamp": "2026-03-30T00:00:00Z",
  "expert": "margaret-chen",
  "change_type": "background_update|lens_update|bias_update|challenge_update|new_expert|retired",
  "field": "background",
  "previous": "...",
  "updated": "...",
  "reason": "Meta-improvement cycle identified ...",
  "source_cycle": "session-id or panel-run-id"
}
```

## Panel History Schema

Each entry records a panel invocation:

```json
{
  "timestamp": "2026-03-30T00:00:00Z",
  "panel_type": "code-refinement",
  "artifact": "src/SessionIsolation.ts",
  "experts_active": ["margaret-chen", "james-okafor", "sofia-andersson"],
  "findings_count": { "critical": 1, "high": 3, "medium": 5 },
  "feasibility_run": true,
  "meta_improvement_run": false,
  "user_satisfaction": null,
  "session_id": "..."
}
```

## Loading Narratives at Session Start

When a panel review is invoked:

1. Check if `~/.evokore/panel-narratives/roster-snapshot.json` exists
2. If yes — load custom overrides on top of the base `expert-roster.md` definitions
3. If no — use base definitions from `expert-roster.md` (first run)
4. Check for pending improvements in `improvement-recommendations/`
5. If pending improvements exist — notify the user and ask if they should be applied

## Saving Narratives After a Cycle

After any panel review completes:

1. Append to `panel-history.jsonl` with the invocation record
2. If meta-improvement was run and changes were approved:
   a. Update `roster-snapshot.json` with new persona state
   b. Append change records to `evolution-log.jsonl`
   c. Remove applied entries from `improvement-recommendations/`

## User Commands

```
# View current expert roster state
orch-panel --roster

# View evolution history for a specific expert
orch-panel --history margaret-chen

# View pending improvement recommendations
orch-panel --pending-improvements

# Apply a pending improvement
orch-panel --apply-improvement {timestamp}-{panel}

# Reset an expert to base definition (discard all evolution)
orch-panel --reset-expert margaret-chen

# Export current roster (for sharing or backup)
orch-panel --export-roster > my-roster.json

# Import a roster (from another team or backup)
orch-panel --import-roster my-roster.json
```

## Integration with Session Manifest

Panel narrative state is referenced (not duplicated) in the session manifest:

```json
{
  "panel_narratives": {
    "roster_path": "~/.evokore/panel-narratives/roster-snapshot.json",
    "last_evolution": "2026-03-30T00:00:00Z",
    "pending_improvements": 2,
    "total_reviews": 15
  }
}
```

## Cross-Session Continuity

When a new session starts and panel reviews are likely:
- `purpose-gate` can inject: "Panel narratives available — {N} expert overrides, {M} pending improvements"
- `session-replay` logs panel invocations alongside tool usage
- `evidence-capture` captures panel findings as session evidence

## Versioning and Rollback

All narrative changes are append-only in `evolution-log.jsonl`. To rollback:
1. Read the log entries for the expert
2. Find the entry before the unwanted change
3. Apply the `previous` value from that entry
4. Append a rollback entry to the log

This preserves full audit trail of persona evolution.
