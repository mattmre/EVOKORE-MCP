# Research Program (Competitive + Parity)

Last updated: 2026-02-25

This directory tracks ongoing repo and paper research used to keep EVOKORE-MCP current while preserving its identity as a secure MCP aggregator with skill orchestration and HITL controls.

## Latest orchestration closure

- `ORCHESTRATION_RELEASE_CLOSURE_2026-02-25.md`: release closure artifact (PR outcomes, workflow run `22404533191`, npm publish gate, next slice decision).

## Research structure

- `PARITY_ROADMAP.md`: prioritized feature-adaptation backlog.
- `SESSION_40_AGENT_PLAN.md`: proposed next-session parallel analysis layout.
- `IMPLEMENTATION_DEEP_DIVE_2026-02-25.md`: concrete implementation patterns and failure-driven learnings.
- `papers/README.md`: external paper findings and adaptation notes.
- `<repo>/README.md`: per-repo log with:
  - feature findings,
  - security/runtime/permanence notes,
  - parity opportunities,
  - fit constraints for EVOKORE.

## Current tracked repos

Previously researched (append mode):
- `danielmiessler-personal-ai-infrastructure`
- `mbailey-voicemode`
- `elevenlabs-elevenlabs-mcp`
- `elevenlabs-cli`

Recent append completed:
- `danielmiessler-personal-ai-infrastructure` deep re-review (2026-02-25): hooks/runtime/installer/voice implementation + failure-driven parity shortlist.

New competitive set (high stars + recent work signal):
- `prefecthq-fastmcp`
- `mcp-use-mcp-use`
- `bytedance-deer-flow`
- `modelcontextprotocol-registry`
- `mcpjungle-mcpjungle`
- `heurist-agent-framework`

## Selection rule used this cycle

1. Similarity to EVOKORE scope (MCP, agent orchestration, tool/runtime surfaces).
2. High-star repos and/or high weekly activity.
3. Evidence of meaningful features (security controls, runtime architecture, deployment maturity, tool interoperability).
