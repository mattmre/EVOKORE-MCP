---
name: workflow-run
description: "Use when you need to execute a DAG-structured workflow template from SKILLS/ORCHESTRATION FRAMEWORK/workflow-templates/."
aliases: [workflow, run-workflow, dag-run]
category: orchestration
tags: [workflow, dag, orchestration, automation, templates]
archetype: AGT-013
version: 1.0.0
---

# /workflow-run — Execute Workflow DAG Template

Runs a named workflow template from `SKILLS/ORCHESTRATION FRAMEWORK/workflow-templates/`, orchestrating steps in dependency order.

## Usage

```
/workflow-run "panel-review-generic"
/workflow-run "reverse-engineering-analysis"
/workflow-run "reverse-engineering-improvement-loop"
```

## Available Workflows

| Name | Description |
|------|-------------|
| panel-review-generic | Multi-expert panel review with parallel expert agents |
| reverse-engineering-analysis | Full binary analysis + report generation |
| reverse-engineering-improvement-loop | Iterative skill improvement with JUDGE gate |

## What it does

1. Loads `workflow-templates/{name}.json` from the SKILLS directory
2. Resolves step dependencies into execution order
3. Spawns sub-agents for each step (parallel where dependencies allow)
4. Collects outputs and passes them to dependent steps
5. Returns a summary of all step outcomes

## Step Types

- `agent`: Spawns a sub-agent with the step prompt
- `skill`: Executes a named SKILL.md file
- `bash`: Runs a shell command (requires damage-control approval)
- `human`: Pauses for human review (HITL gate)

## Integration

- Workflow DAGs are stored as JSON in SKILLS/.../workflow-templates/
- Uses AGT-013 (Loop Operator) for step failure detection
- Step outputs feed into the next step's context
