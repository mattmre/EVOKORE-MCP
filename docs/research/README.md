# Research Program (Competitive + Parity)

Last updated: 2026-03-06

This directory tracks active research, implementation notes, and continuity artifacts used to keep EVOKORE-MCP current without losing its core identity as a secure MCP router, skill orchestrator, and HITL-governed proxy layer.

## Current active research themes

- **Dynamic tool discovery**: rollout posture, catalog indexing, session-scoped activation, benchmark artifacts, and compatibility tradeoffs.
- **Voice and VoiceSidecar**: separation of proxied ElevenLabs tools, VoiceMode guidance, VoiceSidecar runtime behavior, and live-provider validation strategy.
- **Hook observability**: JSONL telemetry, viewer tooling, replay/tilldone continuity, and fail-safe operator diagnostics.
- **Release/runtime parity**: version consistency, release gating, Windows command behavior, and documentation/test alignment.
- **Research log structure**: keeping research notes, session logs, tracker entries, and next-session handoffs aligned instead of scattered.

## Start here

- `dynamic-tool-discovery-research.md`: the MVP discovery design/research report.
- `ecosystem-sprint-results.md`: broader ecosystem findings and adaptation opportunities.
- `release-pipeline-research.md`: release-flow and publishing analysis.
- `remaining-items-research.md`: targeted follow-up research gaps.
- `ORCHESTRATION_RELEASE_CLOSURE_2026-02-25.md`: durable closure artifact for the earlier release/handoff slice.
- `open-pr-audit-2026-03-04*.md`: queue, publication, and landing-state audit artifacts.

## How this directory is organized

- **Focused topic reports** live as standalone markdown files.
- **Operational research snapshots** capture queue state, PR audits, or release observations.
- **Cross-repo parity work** documents which external projects are worth borrowing from and which ideas do not fit EVOKORE.
- **Directory README files** should summarize the latest active themes so future sessions can orient quickly.

## Current research priorities reflected in the repo

### Dynamic discovery and cataloging

Recent shipped/runtime-relevant outcomes:

- `discover_tools` is now a native EVOKORE tool.
- `legacy` remains the default discovery mode.
- `dynamic` mode activates proxied tools per session.
- hidden proxied tools remain callable by exact name.
- the benchmark contract now supports deterministic stdout artifacts and optional `--live-timings`.

### Voice stack separation

Current research and implementation posture distinguishes:

- proxied ElevenLabs MCP tools inside the router
- VoiceMode as a separate Claude Code voice system
- VoiceSidecar as a standalone WebSocket runtime with hot-reloaded `voices.json`

### Hook observability and continuity

Active documentation/research continuity now treats these as linked concerns:

- hook logs in `~/.evokore/logs/hooks.jsonl`
- replay logs and task state in `~/.evokore/sessions/`
- session logs in `docs/session-logs/`
- restart instructions in `next-session.md`

### Runtime and governance parity

Recent research-to-implementation alignment areas include:

- Windows command resolution (`npx` remap only)
- unresolved env placeholder failure behavior
- release workflow gates
- PR metadata and tracker consistency guardrails
- docs canonical link validation

## Current tracked repos

Previously researched (append mode):

- `danielmiessler-personal-ai-infrastructure`
- `mbailey-voicemode`
- `elevenlabs-elevenlabs-mcp`
- `elevenlabs-cli`

Recent append completed:

- `danielmiessler-personal-ai-infrastructure` deep re-review: hooks, runtime, installer, and voice implementation patterns.

Competitive set still worth monitoring:

- `prefecthq-fastmcp`
- `mcp-use-mcp-use`
- `bytedance-deer-flow`
- `modelcontextprotocol-registry`
- `mcpjungle-mcpjungle`
- `heurist-agent-framework`

## Selection rule used for repo research

1. Similarity to EVOKORE scope: MCP, orchestration, tool/runtime surfaces, security, or continuity.
2. Evidence of meaningful implementation depth, not just feature lists.
3. Clear adaptation value for EVOKORE’s constraints and operating model.
