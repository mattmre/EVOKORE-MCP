---
name: workflow-templates
description: DAG-based workflow templates for incident response, release gating, code review, and more
category: Orchestration Framework
metadata:
  version: "1.0"
  source: "Agent33"
  tags: ["workflows", "DAG", "templates", "automation", "orchestration"]
---

# DAG-Based Workflow Templates

Reusable workflow definitions imported from Agent33's orchestration engine. Each template is a JSON file describing a directed acyclic graph (DAG) of steps that an orchestrator can execute with dependency awareness, parallel execution, conditional branching, and retry logic.

## What Are DAG-Based Workflows?

A DAG workflow models a task as a graph of steps where:

- **Dependency-aware execution** -- Steps declare which other steps they depend on via `depends_on`. The executor resolves the dependency graph and runs steps in topological order.
- **Parallel execution** -- Steps that share no dependencies run concurrently up to a configurable `parallel_limit`.
- **Conditional branching** -- Steps with `action: "conditional"` evaluate an expression and route execution through `then` or `else` sub-step arrays.
- **Retry and timeout** -- Each step can specify `retry.max_attempts`, `retry.delay_seconds`, and `timeout_seconds` for resilience.
- **Input/output wiring** -- Step outputs are referenced by downstream steps using template expressions like `${step_id.outputs.field}` or `{{ steps['step_id'].field }}`.

## Workflow JSON Schema

Every workflow file follows this top-level structure:

```json
{
  "name": "workflow-name",
  "version": "1.0.0",
  "description": "What this workflow does",
  "triggers": {
    "manual": true,
    "on_event": ["event-name"],
    "on_change": ["glob/pattern/**"],
    "schedule": "cron-expression or null"
  },
  "inputs": {
    "param_name": {
      "type": "string|array|object",
      "description": "What this input is",
      "required": true,
      "default": null
    }
  },
  "outputs": {
    "result_name": {
      "type": "string|object|array",
      "description": "What this output contains"
    }
  },
  "steps": [ ... ],
  "execution": {
    "mode": "dependency-aware|sequential",
    "parallel_limit": 4,
    "continue_on_error": false,
    "fail_fast": true,
    "timeout_seconds": 300,
    "dry_run": false
  },
  "metadata": {
    "author": "agent-33",
    "created": "2026-01-30",
    "tags": ["tag1", "tag2"]
  }
}
```

### Step Structure

Each step in the `steps` array has:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier referenced by `depends_on` and output expressions |
| `name` | string | Human-readable description of what the step does |
| `action` | string | Action type to execute (see below) |
| `agent` | string or null | Agent name for `invoke-agent` actions |
| `command` | string or null | Shell command for `run-command` actions |
| `inputs` | object | Key-value map of inputs, may reference upstream outputs |
| `outputs` | object | Key-value map of named outputs produced by this step |
| `depends_on` | array | List of step IDs that must complete before this step runs |
| `condition` | string or null | Expression evaluated for `conditional` actions |
| `then` | array or null | Sub-steps to run when condition is true |
| `else` | array or null | Sub-steps to run when condition is false |
| `steps` | array or null | Sub-steps for `parallel-group` actions (one iteration per input item) |
| `retry` | object | `{ max_attempts, delay_seconds }` |
| `timeout_seconds` | number | Maximum execution time for this step |

## Available Action Types

| Action | Description | Key Fields |
|--------|-------------|------------|
| `invoke-agent` | Delegates work to a named agent (e.g., `researcher`, `security-scanner`, `code-worker`) | `agent`, `inputs` |
| `run-command` | Executes a shell command and captures stdout | `command` |
| `validate` | Runs validation checks on inputs (schema conformance, quality gates) | `inputs`, produces `is_valid` and `issues` |
| `transform` | Applies a data transformation or template rendering | `inputs.template` or `inputs.text` |
| `conditional` | Evaluates a `condition` expression and branches into `then`/`else` sub-steps | `condition`, `then`, `else` |
| `parallel-group` | Iterates over a collection and runs contained `steps` in parallel for each item | `steps` (sub-step array), references `${parallel.item}` |
| `wait` | Pauses execution for a duration or until an external signal | `timeout_seconds` |
| `execute-code` | Runs inline code (Python, JS) within the workflow executor | `command` with inline code |
| `http-request` | Makes an HTTP request to a URL and captures the response body | `url`, produces response `body` |

## Available Templates

| Template | File | Description | Use Case |
|----------|------|-------------|----------|
| Code Review Pipeline | `example-pipeline.json` | Parallel lint + security scan with quality gate | Automated PR review, CI integration |
| Incident Triage | `incident-triage.json` | Log collection, severity classification, remediation planning | On-call incident response |
| Release Readiness | `release-readiness.json` | Evidence collection, smoke tests, risk review, approval gate | Release go/no-go decisions |
| Content Generation | `content-generation.json` | Research, draft, review with quality gate and revision loop | Blog posts, documentation, reports |
| Deep Research | `deep-research.json` | Search, parallel source reading, synthesis, validation | Autonomous research and Q&A |
| Monitor & Alert | `monitor-alert.json` | Parallel source fetching, keyword matching, conditional alerting | Scheduled monitoring, watchlists |
| RAG Chatbot | `rag-chatbot.json` | Document ingestion, vector search, contextual answer generation | Document Q&A, knowledge bases |
| Web Scrape & Extract | `web-scrape-extract.json` | Parallel page fetching, structured data extraction, validation | Data collection, competitive analysis |

## Customizing Templates

### 1. Adjust Inputs and Defaults

Modify the `inputs` block to match your specific parameters. Change `default` values and mark fields as `required: false` when appropriate.

### 2. Swap Agent Names

Replace agent references (e.g., `"agent": "researcher"`) with your own agent identifiers. The workflow executor resolves agent names at runtime.

### 3. Modify Conditions

Edit `condition` expressions to match your acceptance criteria. For example, change a quality threshold:

```json
"condition": "${review.outputs.quality_score} >= 90"
```

### 4. Add or Remove Steps

Insert new steps anywhere in the `steps` array. Set `depends_on` to wire them into the DAG. Remove steps you do not need -- just ensure no remaining step references a removed step ID.

### 5. Tune Execution Parameters

Adjust `execution.parallel_limit` for your concurrency capacity. Set `continue_on_error: true` for fault-tolerant pipelines. Increase `timeout_seconds` for long-running operations.

### 6. Configure Triggers

Set `schedule` to a cron expression for periodic workflows. Add event names to `on_event` for event-driven execution. Use `on_change` with glob patterns for file-change triggers.

## Template Expression Syntax

Two expression styles are used across the templates:

- **Dollar-brace**: `${step_id.outputs.field}` or `${inputs.param}`
- **Jinja-style**: `{{ steps['step_id'].field }}` or `{{ 'value' if condition else 'other' }}`

Both resolve at runtime. Use whichever style the executor supports. The core templates use dollar-brace syntax; the pipeline templates use Jinja-style.
