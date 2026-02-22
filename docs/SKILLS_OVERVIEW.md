# EVOKORE-MCP Skills Overview

EVOKORE-MCP exposes over 200+ specialized Agent Skills and coding workflows. Below is a high-level overview of the major categories available in this library.

## General Coding Workflows
*Your Custom Scripts and Architectures*
- **`arch-aep-runner`**: Manages the ARCH-AEP Review Cycle and backlog prioritization.
- **`implementation-session`**: End-to-end implementation workflow, agent creation, and stale branch checks.
- **`session-wrap`**: PR generation, log updating, and handoff to the next AI session.
- **`pr-manager`**: Feature verification, technical deferment sweeps, and smart merging.
- **`docs-architect`**: Executes "Gold Standard" documentation overhauls.
- **`repo-ingestor`**: Uses multi-agent swarms to ingest external repositories and benchmarks.
- **`planning-with-files`**: The "Manus" workflow for progressive, multi-stage task orchestration.

## The Wshobson Plugin Library (146+ Skills)
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

## The Hive Framework
*Abstract troubleshooting and design*
- **`hive-concepts` / `hive-debugger`**: Framework-level reasoning and state-machine analysis.

---
### Finding a Skill
If you need a specific skill, ask your AI assistant to use the `search_skills` tool:
*"Do you have a skill for PostgreSQL database design?"*
The AI will execute the search tool, find `database-design/postgresql`, read it into context, and apply the workflow to your database requests.
