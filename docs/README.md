# EVOKORE-MCP Documentation Map

Use this file as the canonical entrypoint for repository documentation.

## Core Guides

- [Usage Guide](./USAGE.md)
- [Troubleshooting Guide](./TROUBLESHOOTING.md)
- [Release Flow](./RELEASE_FLOW.md)
- [CLI Integration Notes](./CLI_INTEGRATION.md)
- [Submodule Workflow](./SUBMODULE_WORKFLOW.md)
- [Orchestration Tracker](./ORCHESTRATION_TRACKER.md)
- [Research Decisions Log](./RESEARCH_DECISIONS_LOG.md)
- [Ecosystem Sprint Results](./research/ecosystem-sprint-results.md)
- [Priority Status Matrix](./PRIORITY_STATUS_MATRIX.md)
- [PR Merge Runbook](./PR_MERGE_RUNBOOK.md)
- [PR Template](../.github/pull_request_template.md)
- [Release Notes v2.0.1](./RELEASE_NOTES_v2.0.1.md)
- [Session Logs](./session-logs/)
- [Latest Orchestration Log (2026-03-06, Phase 3 Review Readiness)](./session-logs/session-2026-03-06-phase-3-review-readiness.md)

## Validation Anchors

- Docs canonical links: `test-docs-canonical-links.js`
- Ops docs guardrails: `test-ops-docs-validation.js`
- Next session freshness guard: `test-next-session-freshness-validation.js`
- Voice hook transport: `test-voice-e2e-validation.js`
- Voice persona/speed refinement: `test-voice-refinement-validation.js`
- Voice sidecar runtime smoke: `test-voice-sidecar-smoke-validation.js`
- Voice sidecar hot-reload: `test-voice-sidecar-hotreload-validation.js`
- Hook observability behavior: `hook-test-suite.js` and `hook-e2e-validation.js`
- VoiceMode Windows docs guardrail: `test-voice-windows-docs-validation.js`
- Windows command resolution guard: `test-windows-exec-validation.js`
- Submodule commit-order guard: `test-submodule-commit-order-guard-validation.js`
- Release workflow guardrails: `test-npm-release-flow-validation.js`
- Tool prefix collision guard: `test-tool-prefix-collision-validation.js`
- Dynamic tool discovery guard: `test-tool-discovery-validation.js`
- Tracker consistency guard: `test-tracker-consistency-validation.js`

## Architecture & Reference

- [v2 Phase 2 Architecture Design](./V2_PHASE2_ARCHITECTURE_DESIGN.md) - Covers the Stateful Hypervisor Registry and Infinite Loop Cooldown Wrapper implemented in Phase 2

- [v2 Architecture Plan](./V2_ARCHITECTURE_PLAN.md)
- [v2 Multi-Agent Workflows](./V2_MULTI_AGENT_WORKFLOWS.md)
- [Skills Overview](./SKILLS_OVERVIEW.md)
- [Training & Use Cases](./TRAINING_AND_USE_CASES.md)

## Legacy Path Mapping

- `/docs/architecture.md` -> `./V2_ARCHITECTURE_PLAN.md`
- `/docs/workflows.md` -> `./V2_MULTI_AGENT_WORKFLOWS.md`
