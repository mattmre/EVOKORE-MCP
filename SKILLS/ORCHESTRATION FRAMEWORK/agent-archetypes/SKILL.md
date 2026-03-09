---
name: agent-archetypes
description: Reference agent definitions with capability taxonomy for multi-agent orchestration
category: Orchestration Framework
metadata:
  version: "1.0"
  source: "Agent33"
  tags: ["agents", "archetypes", "capabilities", "orchestration", "multi-agent"]
---

# Agent Archetypes

Reference architecture for multi-agent orchestration systems. These six agent definitions, imported from Agent33, establish the core roles, governance boundaries, and capability assignments needed to run a structured agent pipeline.

Each agent is defined as a JSON file that declares its role, inputs/outputs, governance scope, capability set, and operational constraints. Together they form a composable team where the orchestrator decomposes work, the director plans strategy, workers execute, QA validates, the researcher gathers information, and the browser agent handles web interaction.

## Agent Summary

| Agent | ID | Role | Scope | Key Capabilities | Escalation Target |
|---|---|---|---|---|---|
| **Orchestrator** | AGT-001 | orchestrator | full-system | P-01, P-02, P-03, P-05, V-05 | human-operator |
| **Director** | AGT-002 | director | project-level | P-01, P-02, P-03, P-04, P-05 | orchestrator |
| **Code Worker** | AGT-003 | worker | assigned-workspace | I-01, I-02, I-03, I-04, I-05 | orchestrator |
| **QA** | AGT-004 | qa | test-workspace | V-01, V-02, V-03 | orchestrator |
| **Researcher** | AGT-006 | researcher | read-only | X-01, X-02, X-03, X-04, X-05 | orchestrator |
| **Browser Agent** | -- | worker | browser-sandbox | (none assigned) | orchestrator |

### Agent Traits and Constraints

- **Orchestrator** -- No dependencies; top of the chain. Has full-system command access and internal-only network. No parallel execution. 8192 token limit, 300s timeout, 3 retries.
- **Director** -- Reports to orchestrator. No direct command execution; plans only. Requires approval for scope changes. 8192 token limit, 240s timeout, 2 retries.
- **Code Worker** -- Reports to orchestrator. Scoped to assigned workspace with build/test/lint commands. Requires approval for deploy. Parallel execution allowed. 16384 token limit, 180s timeout.
- **QA** -- Reports to orchestrator. Scoped to test workspace with test/lint/check commands. Parallel execution allowed. 8192 token limit, 180s timeout.
- **Researcher** -- Optionally reports to orchestrator. Read-only scope with external-read network access. No parallel execution. 32768 token limit, 300s timeout.
- **Browser Agent** -- Optionally reports to orchestrator. Sandboxed browser scope with external-read network. Parallel execution allowed. 16384 token limit, 300s timeout.

## Capability Taxonomy

Agent33 defines 25 spec capabilities across 5 categories. Each agent declares which capabilities it possesses via the `spec_capabilities` field.

### Planning (P)

| ID | Name | Description |
|---|---|---|
| P-01 | Task Decomposition | Break complex tasks into ordered sub-tasks with dependencies. |
| P-02 | Resource Allocation | Assign agents, models, and compute to sub-tasks. |
| P-03 | Priority Scheduling | Order execution based on urgency, cost, and dependency graphs. |
| P-04 | Risk Assessment | Identify failure modes and plan mitigations before execution. |
| P-05 | Workflow Design | Create and modify DAG workflow definitions. |

### Implementation (I)

| ID | Name | Description |
|---|---|---|
| I-01 | Code Generation | Generate source code from specifications or natural language. |
| I-02 | Code Modification | Refactor, fix, or extend existing codebases. |
| I-03 | Configuration Management | Generate and update configuration files and infrastructure. |
| I-04 | Data Transformation | Parse, convert, and reshape data between formats. |
| I-05 | Integration Wiring | Connect APIs, services, and message bus endpoints. |

### Verification (V)

| ID | Name | Description |
|---|---|---|
| V-01 | Unit Testing | Write and execute unit tests for individual components. |
| V-02 | Integration Testing | Verify interactions between multiple components or services. |
| V-03 | Output Validation | Check that outputs conform to schemas and business rules. |
| V-04 | Security Scanning | Run static analysis and vulnerability checks on code. |
| V-05 | Compliance Checking | Verify outputs meet governance and policy constraints. |

### Review (R)

| ID | Name | Description |
|---|---|---|
| R-01 | Code Review | Inspect code changes for quality, style, and correctness. |
| R-02 | Architecture Review | Evaluate design decisions and structural patterns. |
| R-03 | Documentation Review | Check documentation accuracy, completeness, and clarity. |
| R-04 | Performance Review | Analyze runtime characteristics and optimisation opportunities. |
| R-05 | Security Review | Audit code and configuration for security weaknesses. |

### Research (X)

| ID | Name | Description |
|---|---|---|
| X-01 | Web Search | Search the web and aggregate information from multiple sources. |
| X-02 | Codebase Analysis | Explore and understand existing code repositories. |
| X-03 | Literature Survey | Review papers, docs, and technical references on a topic. |
| X-04 | Competitive Analysis | Compare tools, frameworks, and approaches for a problem. |
| X-05 | Knowledge Synthesis | Combine findings into structured summaries and recommendations. |

## Agent Relationships

```
                    human-operator
                         |
                    [Orchestrator]  (AGT-001)
                    /    |    \
                   /     |     \
           [Director] [Worker] [QA]
           (AGT-002) (AGT-003) (AGT-004)
                   \
                    +--- [Researcher] (AGT-006, optional)
                    +--- [Browser Agent] (optional)
```

### Dependency Chain

1. **Orchestrator** is the root. It has no dependencies and escalates only to a human operator.
2. **Director** works under the orchestrator's direction. It produces plans that the orchestrator distributes.
3. **Code Worker** receives task assignments from the orchestrator and executes them in a scoped workspace.
4. **QA** receives validation assignments from the orchestrator and runs against worker outputs.
5. **Researcher** optionally receives research queries from the orchestrator. Can also operate standalone.
6. **Browser Agent** optionally receives web tasks from the orchestrator. Can also operate standalone.

### Escalation Paths

All agents except the orchestrator escalate to the orchestrator. The orchestrator escalates to the human operator. This creates a two-tier escalation model: agent-to-orchestrator, orchestrator-to-human.

## Agent Definition Schema

Each agent JSON file follows this schema (fields from `agent.schema.json`):

| Field | Type | Required | Description |
|---|---|---|---|
| `$schema` | string | no | Path to the JSON Schema for validation |
| `name` | string | yes | Unique agent name |
| `version` | string | yes | Semantic version of the definition |
| `role` | string | yes | Agent role: `orchestrator`, `director`, `worker`, `qa`, `researcher` |
| `description` | string | yes | Human-readable description of the agent's purpose |
| `agent_id` | string | no | Unique identifier (e.g., AGT-001) |
| `status` | string | yes | Lifecycle status: `active`, `deprecated`, `experimental` |
| `capabilities` | string[] | yes | Runtime capabilities: `orchestration`, `file-read`, `file-write`, `code-execution`, `api-calls`, `validation`, `research` |
| `spec_capabilities` | string[] | yes | Taxonomy capabilities from the P/I/V/R/X catalog |
| `governance` | object | yes | Scope, allowed commands, network access, and approval gates |
| `governance.scope` | string | yes | Access boundary: `full-system`, `project-level`, `assigned-workspace`, `test-workspace`, `read-only`, `browser-sandbox` |
| `governance.commands` | string | yes | Allowed shell commands (comma-separated) or `all` / `none` |
| `governance.network` | string | yes | Network access: `internal`, `external-read`, `none` |
| `governance.approval_required` | string[] | yes | Actions requiring human or orchestrator approval |
| `ownership` | object | yes | Owner team and escalation target |
| `inputs` | object | yes | Typed input parameters the agent accepts |
| `outputs` | object | yes | Typed output fields the agent produces |
| `dependencies` | array | yes | Other agents this agent depends on (with optional flag and purpose) |
| `prompts` | object | yes | Paths to system prompt, user prompt template, and examples |
| `constraints` | object | yes | Operational limits: max_tokens, timeout_seconds, max_retries, parallel_allowed |
| `metadata` | object | yes | Author, created/updated dates, and tags |

## Defining Custom Agents

To create a new agent archetype:

1. **Copy a template.** Start from the closest existing archetype (e.g., copy `worker.json` for a new specialist worker).

2. **Set identity fields.** Give it a unique `name`, `agent_id`, `version`, and `description`.

3. **Assign capabilities.** Pick runtime capabilities from the allowed set and spec capabilities from the P/I/V/R/X taxonomy tables above.

4. **Define governance.** Scope the agent's access: what commands it can run, what network access it has, and what actions require approval.

5. **Declare inputs and outputs.** Each field needs a type, description, and required flag. This is the agent's contract with the orchestrator.

6. **Set dependencies.** List which agents this one reports to. Use `"optional": true` if the agent can also operate independently.

7. **Configure constraints.** Set token limits, timeouts, retry counts, and whether parallel instances are allowed.

8. **Write prompts.** Create the system and user prompt files referenced in the `prompts` field. The system prompt defines the agent's persona and rules; the user prompt is the template for each invocation.

### Example: Adding a Documentation Writer

```json
{
  "name": "doc-writer",
  "version": "1.0.0",
  "role": "worker",
  "description": "Generates and maintains project documentation from code and specifications.",
  "agent_id": "AGT-010",
  "status": "active",
  "capabilities": ["file-read", "file-write"],
  "spec_capabilities": ["I-01", "I-02", "R-03"],
  "governance": {
    "scope": "assigned-workspace",
    "commands": "none",
    "network": "none",
    "approval_required": []
  },
  "ownership": {
    "owner": "platform-team",
    "escalation_target": "orchestrator"
  },
  "inputs": {
    "source_files": { "type": "array", "description": "Files to document", "required": true },
    "style_guide": { "type": "string", "description": "Documentation style to follow", "required": false }
  },
  "outputs": {
    "documents": { "type": "array", "description": "Generated documentation files" }
  },
  "dependencies": [
    { "agent": "orchestrator", "optional": false, "purpose": "Receives documentation tasks" }
  ],
  "prompts": {
    "system": "prompts/doc-writer/system.md",
    "user": "prompts/doc-writer/user.md",
    "examples": []
  },
  "constraints": {
    "max_tokens": 16384,
    "timeout_seconds": 180,
    "max_retries": 2,
    "parallel_allowed": true
  },
  "metadata": {
    "author": "your-team",
    "created": "2026-01-01",
    "updated": "2026-01-01",
    "tags": ["documentation", "worker"]
  }
}
```
