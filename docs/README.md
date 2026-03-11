# EVOKORE-MCP Documentation Portal

Use this page as the main portal for repository documentation.

## Getting Started

- [Repository README](../README.md)
- [SETUP.md](./SETUP.md)
- [Usage Guide](./USAGE.md)
- [Troubleshooting Guide](./TROUBLESHOOTING.md)
- [Use Cases and Walkthroughs](./USE_CASES_AND_WALKTHROUGHS.md)
- [Training & Use Cases](./TRAINING_AND_USE_CASES.md)

## Architecture & Runtime

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [TOOLS_AND_DISCOVERY.md](./TOOLS_AND_DISCOVERY.md)
- [VOICE_AND_HOOKS.md](./VOICE_AND_HOOKS.md)
- [CLI Integration Notes](./CLI_INTEGRATION.md)
- [Voice CLI Research](./VOICE_CLI_RESEARCH.md)
- [Skills Overview](./SKILLS_OVERVIEW.md)
- [All Skills Crib Sheet](./ALL_SKILLS_CRIB_SHEET.md)
- [V2 Phase 2 Architecture Design](./V2_PHASE2_ARCHITECTURE_DESIGN.md)
- [V2 Architecture Plan](./V2_ARCHITECTURE_PLAN.md)
- [V2 Multi-Agent Workflows](./V2_MULTI_AGENT_WORKFLOWS.md)

## Operators & Maintainers

- [TESTING_AND_VALIDATION.md](./TESTING_AND_VALIDATION.md)
- [Release Flow](./RELEASE_FLOW.md)
- [Submodule Workflow](./SUBMODULE_WORKFLOW.md)
- [PR_MERGE_RUNBOOK.md](./PR_MERGE_RUNBOOK.md)
- [PR Template](../.github/PULL_REQUEST_TEMPLATE.md)
- [Release Notes v2.0.1](./RELEASE_NOTES_v2.0.1.md)

## Research & Continuity

- [RESEARCH_AND_HANDOFFS.md](./RESEARCH_AND_HANDOFFS.md)
- [ORCHESTRATION_TRACKER.md](./ORCHESTRATION_TRACKER.md)
- [RESEARCH_DECISIONS_LOG.md](./RESEARCH_DECISIONS_LOG.md)
- [PRIORITY_STATUS_MATRIX.md](./PRIORITY_STATUS_MATRIX.md)
- [Research README](./research/README.md)
- [Ecosystem Sprint Results](./research/ecosystem-sprint-results.md)
- [Session Logs](./session-logs/)
- [next-session.md](../next-session.md)
- [Latest Orchestration Log (2026-03-10, Stabilization Recovery)](./session-logs/session-2026-03-10-stabilization-recovery.md)
- [AGENT33 Migration Plan](./AGENT33_MIGRATION_PLAN.md) *(historical)*
- [AGENT33 Improvement Instructions](./AGENT33_IMPROVEMENT_INSTRUCTIONS.md)

## Validation & Governance

Important validation anchors:

- Docs canonical links: `node test-docs-canonical-links.js`
- Ops docs guardrails: `node test-ops-docs-validation.js`
- HITL token docs guardrail: `node test-hitl-token-docs-validation.js`
- Tracker consistency guard: `node test-tracker-consistency-validation.js`
- Next session freshness guard: `node test-next-session-freshness-validation.js`
- Voice hook transport: `node test-voice-e2e-validation.js`
- Voice sidecar runtime smoke: `node test-voice-sidecar-smoke-validation.js`
- Voice sidecar hot-reload: `node test-voice-sidecar-hotreload-validation.js`
- Hook observability behavior: `node hook-e2e-validation.js` and `node hook-test-suite.js`
- Tool prefix collision guard: `test-tool-prefix-collision-validation.js`
- VoiceMode Windows docs guardrail: `node test-voice-windows-docs-validation.js`
- Windows command resolution guard: `node test-windows-exec-validation.js`
- Release workflow guardrails: `node test-npm-release-flow-validation.js`
- PR metadata validation: `node test-pr-metadata-validation.js`
- Submodule commit-order guard: `node test-submodule-commit-order-guard-validation.js`

## Recommended reading paths

### New operator

1. [SETUP.md](./SETUP.md)
2. [USAGE.md](./USAGE.md)
3. [USE_CASES_AND_WALKTHROUGHS.md](./USE_CASES_AND_WALKTHROUGHS.md)
4. [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

### Maintainer

1. [ARCHITECTURE.md](./ARCHITECTURE.md)
2. [TOOLS_AND_DISCOVERY.md](./TOOLS_AND_DISCOVERY.md)
3. [VOICE_AND_HOOKS.md](./VOICE_AND_HOOKS.md)
4. [TESTING_AND_VALIDATION.md](./TESTING_AND_VALIDATION.md)
5. [RESEARCH_AND_HANDOFFS.md](./RESEARCH_AND_HANDOFFS.md)

## Legacy path mapping

> **Note:** These are historical references only. The canonical paths below should be used for all new links.

- legacy `/docs/architecture.md` -> `./V2_ARCHITECTURE_PLAN.md`
- legacy `/docs/workflows.md` -> `./V2_MULTI_AGENT_WORKFLOWS.md`

These aliases are kept so existing references remain valid even though the current runtime-oriented architecture guide now lives in [ARCHITECTURE.md](./ARCHITECTURE.md).
