---
name: orchestration-schemas
description: JSON schemas for agent definitions, workflow configurations, and orchestrator settings
category: Orchestration Framework
metadata:
  version: "1.0"
  source: "Agent33"
  tags: ["orchestration", "schemas", "json-schema", "validation"]
---

# Orchestration Schemas

JSON Schema definitions for validating orchestration configuration files. These schemas provide IDE autocompletion, validation, and documentation for the orchestration framework's configuration formats.

## Schemas

| Schema | Purpose |
|--------|---------|
| [agent.schema.json](./agent.schema.json) | Define agent roles, capabilities, inputs/outputs, and constraints |
| [workflow.schema.json](./workflow.schema.json) | Define workflow steps, triggers, execution modes, and dependencies |
| [orchestrator.schema.json](./orchestrator.schema.json) | Configure the orchestration engine (incremental processing, execution, triggers, filters) |

## Agent Schema

Defines the structure for agent definitions:

- **Required fields**: `name`, `version`, `role`
- **Roles**: orchestrator, director, worker, reviewer, researcher, validator
- **Capabilities**: file-read, file-write, code-execution, web-search, api-calls, orchestration, validation, research, refinement
- **Constraints**: max_tokens, timeout_seconds, max_retries, parallel_allowed

## Workflow Schema

Defines the structure for workflow definitions:

- **Required fields**: `name`, `version`, `steps`
- **Step actions**: invoke-agent, run-command, validate, transform, conditional, parallel-group, wait
- **Execution modes**: sequential, parallel, dependency-aware
- **Triggers**: manual, on_change (glob patterns), schedule (cron), on_event

## Orchestrator Schema

Defines configuration for the orchestration engine:

- **Incremental processing**: staged changes, unstaged changes, branch diff
- **Execution settings**: mode, parallel_limit, timeouts, fail_fast
- **Triggers**: full_refresh_patterns, category_triggers
- **Filters**: include/exclude glob patterns
- **Dry run**: simulate without side effects

## Usage

Reference a schema in your JSON configuration:

```json
{
  "$schema": "./agent.schema.json",
  "name": "my-agent",
  "version": "1.0.0",
  "role": "worker"
}
```
