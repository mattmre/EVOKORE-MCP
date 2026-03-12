# EVOKORE-MCP Skills Overview

EVOKORE-MCP currently indexes roughly **336** specialized skills and workflow files. The searchable library includes EVOKORE-native workflows plus imported Agent33, HIVE, WSHOBSON, and curated skill collections, all exposed through the same search and workflow-resolution surface.

## General Coding Workflows
*Your Custom Scripts and Architectures*
- **`arch-aep-runner`**: Manages the ARCH-AEP Review Cycle and backlog prioritization.
- **`implementation-session`**: End-to-end implementation workflow, agent creation, and stale branch checks.
- **`session-wrap`**: PR generation, log updating, and handoff to the next AI session.
- **`pr-manager`**: Feature verification, technical deferment sweeps, and smart merging.
- **`docs-architect`**: Executes "Gold Standard" documentation overhauls.
- **`repo-ingestor`**: Uses multi-agent swarms to ingest external repositories and benchmarks.
- **`planning-with-files`**: The "Manus" workflow for progressive, multi-stage task orchestration.

## Orchestration Framework
*Imported Agent33 orchestration commands, governance, and workflow specs*
- **`handoff-protocol`** / **`policy-pack-v1`**: Agent-to-agent coordination and policy controls.
- **`orch-*` command skills**: Direct orchestration entry points like `orch-plan`, `orch-tdd`, `orch-review`, and `orch-deploy`.
- **`workflow-templates` / `agent-archetypes` / `tool-governance`**: Durable orchestration specs and operational templates.

## The Hive Framework
*Goal-driven agent design, testing, and debugging*
- **`hive`**: Meta-router for the Hive skill family.
- **`hive-create`** / **`hive-test`**: Agent creation and iterative testing workflows.
- **`hive-concepts` / `hive-patterns` / `hive-debugger`**: Architecture, optimization, and runtime debugging guidance.
- **`hive-credentials`**: Credential detection and setup support for Hive agents.

## The WSHOBSON Plugin Library
*Extremely detailed architectural patterns and testing strategies.*
- **Backend Development**: Microservices, CQRS, Saga Orchestration, API Design.
- **Frontend & Mobile**: React State Management, React Native Architecture, Tailwind Systems.
- **Cloud Infrastructure**: Terraform, Multi-Cloud, Service Mesh, Istio, Linkerd.
- **Security Scanning**: Threat Mitigation Mapping, SAST configuration, STRIDE Analysis.
- **Data Engineering**: Spark Optimization, dbt Transformations, Airflow DAGs.
- **Blockchain & Web3**: Solidity Security, DeFi Protocol Templates, NFT Standards.
- **Observability**: Prometheus Configuration, SLO Implementation, Grafana Dashboards.

## Developer Tools & Automation
*Curated from composio/awesome-claude-skills & refly*
- **`changelog-generator`**: Automated release note formatting.
- **`artifacts-builder`**: Best practices for generating reusable code artifacts.
- **`webapp-testing`**: E2E framework guides.
- **`file-organizer` / `invoice-organizer`**: Standardized sorting algorithms for filesystem data.
- **`competitive-ads-extractor`**: Research extraction workflows.

---
### Finding a Skill
If you need a specific skill, ask your AI assistant to use the `search_skills` tool:
*"Do you have a skill for PostgreSQL database design?"*
The AI will execute the search tool, find the best-matching skill, read it into context, and apply the workflow to your request.

For broader natural-language intents, use `resolve_workflow`:
*"I need to wrap up this session and leave a clean handoff."*
EVOKORE will semantically rank the best workflow matches, explain why they matched, and inject the top skills directly into the response.

## Operator notes

- Skill indexing is recursive, not limited to a shallow two-level directory walk.
- Search quality now includes aliases, tags, frontmatter metadata, and semantic hints.
- Performance monitoring exists on top of the recursive shape, so large-library regressions are visible in validation.
