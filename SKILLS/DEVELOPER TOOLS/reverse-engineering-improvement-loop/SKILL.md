---
name: reverse-engineering-improvement-loop
description: Convert completed reverse-engineering work into better future workflows, skills, and panel narratives. Use after meaningful milestones, repeated friction, or major analysis wins.
aliases: [re-learning-loop, binary-analysis-improvement, re-retrospective]
category: Developer Tools
tags: [reverse-engineering, memory, evidence, improvement, orchestration]
version: 1.0.0
resolutionHints:
  - improve reverse-engineering workflow over time
  - capture lessons from a reversing session
  - update re skills and panel memory
metadata:
  source: evokore
  derived_from: [panel-of-experts, persistent-narratives, improvement-cycles, session-wrap]
---

# Reverse Engineering Improvement Loop

This skill keeps reverse engineering from resetting to zero every session. It is the slim memory layer: keep only what future runs can reuse.

## Run This After

- a major unknown binary onboarding session
- a subsystem naming campaign
- a debugger session that resolved a recurring ambiguity
- a malware triage pass that changed the investigation direction
- any milestone where the same confusion or workaround showed up more than once

## Workflow

1. Review the evidence bundle, not just the final narrative.
2. Extract recurring friction:
   - wrong first tool choice
   - missing checklist
   - repeated breakpoint pattern
   - weak handoff artifact
   - panel coverage gap
3. Convert the friction into a concrete improvement target:
   - new skill
   - updated workflow
   - persona refinement
   - new evidence template
   - rule or automation candidate
4. Keep only reusable conclusions in persistent memory.
5. Feed the rest into normal session output and move on.

## EVOKORE Hooks to Use

- `session-replay`
- `evidence-capture`
- `persistent-narratives`
- `improvement-cycles`
- `session-wrap`

## Good Output

- one durable lesson with proof
- one workflow change or skill candidate
- one memory update that future sessions should inherit

## Anti-Pattern

Do not dump full transcripts into memory. If a future analyst cannot act on it quickly, it does not belong in the persistent layer.
