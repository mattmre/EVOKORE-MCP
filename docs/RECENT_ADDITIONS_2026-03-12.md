# EVOKORE Recent Additions Report

**Report date:** 2026-03-12  
**Coverage window:** 2026-02-26 through 2026-03-12

This report summarizes the highest-signal additions and shipped changes from the last two weeks. It is written for operators, maintainers, and reviewers who want a product-level view of what changed without reading every commit or session log.

## Executive Summary

Over the last two weeks, EVOKORE-MCP moved from a capable MCP router into a more complete operator platform.

The biggest additions were:

- stronger multi-server runtime behavior and discovery ergonomics
- deeper skill indexing and semantic workflow resolution
- a continuity-first operator stack with session manifests, managed Claude memory, status summaries, and repo-state auditing
- hardened hook, voice, and safety systems
- more durable release, CI, PR-governance, and documentation workflows

## What We Added

## 1. Runtime And Tooling

### Multi-server aggregation matured

EVOKORE already proxied child MCP servers, but the runtime is now more operator-friendly:

- aggregated child-server state is exposed via `proxy_server_status`
- registered tool counts and server health are visible without leaving the MCP surface
- duplicate prefix collisions are guarded and validated more explicitly

### Dynamic tool discovery became a first-class workflow

The discovery surface is now more usable and more predictable:

- dynamic tool activation is session-scoped
- `tools/list_changed` behavior is covered directly
- hidden proxied tools remain callable by exact prefixed name for compatibility
- discovery benchmarking now has a stable JSON artifact contract

### Skill retrieval improved materially

The skill system now does more than scan Markdown files:

- recursive skill indexing is in place
- imported library metadata, tags, aliases, and taxonomy signals are indexed
- search performance is measured and guarded
- `resolve_workflow` does better semantic matching and explains why a skill matched

## 2. Operator Continuity And Session Safety

### Canonical session continuity landed

EVOKORE now has a shared session manifest at:

```text
~/.evokore/sessions/{sessionId}.json
```

This manifest ties together:

- purpose-gate state
- replay/evidence/task artifacts
- branch and workspace identity
- continuity metadata used by operator tooling

### Managed Claude memory landed

The repo now generates managed Claude memory files for EVOKORE under the Claude project memory directory:

- `MEMORY.md`
- `project-state.md`
- `patterns.md`
- `workflow.md`

This gives repo-aware, restart-friendly memory that aligns with the continuity manifest.

### Manifest-backed status line landed

The old network-heavy status path has been replaced with a continuity-first runtime:

- `scripts/status.js` now depends on `scripts/status-runtime.js`
- branch/worktree pressure, purpose, task pressure, and continuity health come from canonical state first
- managed Claude memory acts as fallback rather than the primary source of truth

### Repo-state audit automation landed

EVOKORE now ships a dedicated operator preflight:

```bash
npm run repo:audit
npm run repo:audit -- --json
```

It reports:

- branch divergence from `main`
- live worktrees
- stale local branches
- merged remote branch candidates without open PRs
- open PR heads
- control-plane drift in handoff docs

## 3. Hooks, HITL, And Safety

### Canonical hook entrypoints landed

The repo now follows a more stable hook layout under:

```text
scripts/hooks/
```

with compatibility retained for legacy entrypoints.

### Hook bootstrap hardening landed

All active entrypoints now share a fail-safe loader so bad hook bootstrap state does not take down the whole session.

### HITL approval flow was hardened

The `_evokore_approval_token` contract now applies cleanly even when proxied upstream tools omit `inputSchema.properties`.

### Damage-control coverage expanded

Damage-control now covers more realistic destructive or exfiltration patterns:

- reverse-shell patterns
- encoded payload execution
- download-and-execute chains
- broader secret-path coverage
- stronger path extraction

The repo also now has dedicated damage-control validation coverage through:

```bash
node test-damage-control-validation.js
```

## 4. Voice And Interaction Systems

### Voice sidecar follow-through landed

The standalone VoiceSidecar path is now more usable in real operator sessions:

- hook-side persona forwarding now works through `VOICE_SIDECAR_PERSONA`
- payload persona metadata is supported as fallback
- `voices.json` hot-reload behavior is documented and validated

### Voice runtime and docs are more explicit

The repo now more clearly distinguishes:

- ElevenLabs as proxied MCP tooling
- VoiceMode as direct conversation tooling
- VoiceSidecar as standalone hook-driven speech infrastructure

## 5. Release, CI, And Governance

### Security workflow hardening landed

The Trivy-based security workflow was repaired and hardened so it stopped acting like a repo-wide blocker.

### Dependency and environment hygiene improved

Recent additions also included:

- `.env` drift and encoding remediation
- shared hook log rotation and session pruning
- submodule workflow guardrails
- PR metadata validation
- tracker consistency and handoff freshness checks

### Release and cross-CLI workflows improved

The last two weeks also shipped:

- safer npm release workflow validation
- canonical-root-safe cross-CLI config sync
- better Windows runtime guidance around `npx`, `uv`, and `uvx`

## 6. Documentation And Research

The documentation surface expanded substantially:

- architecture and operator guides were overhauled
- research notes now capture implementation rationale for the major roadmap slices
- session logs and handoff artifacts now act as a deliberate continuity layer
- the docs suite now reflects the continuity-first operator model instead of only the router runtime

## Notable Shipped PRs In This Window

| PR | Theme | What it added |
|---|---|---|
| `#81` | Env hygiene | `.env` drift and encoding fixes |
| `#84` | Hook durability | shared hook log rotation and session pruning |
| `#85` | Cross-CLI sync | sync validation and docs hardening |
| `#86` | Docs hygiene | documentation link and orphaned-reference cleanup |
| `#87` | Skill monitoring | skill index performance monitoring and metrics |
| `#88` | Purpose/status | status line wiring into purpose-gate |
| `#89` | Voice hardening | VoiceSidecar security and resilience improvements |
| `#90` | Skill retrieval | recursive skill indexing with weighted search |
| `#91` | Security CI | Trivy/security-scan workflow repair |
| `#92` | Hooks | canonical hook entrypoints |
| `#93` | Hook safety | fail-safe bootstrap hardening |
| `#94` | HITL | universal approval-token schema injection hardening |
| `#95` | Discovery | dynamic tool discovery session hardening |
| `#96` | Skills | metadata-aware skills library indexing |
| `#97` | Aggregation | operator-visible proxy server status |
| `#98` | Workflow resolution | semantic skill resolution improvements |
| `#99` | CLI sync | canonical-root-safe sync behavior |
| `#100` | Continuity | canonical session manifest architecture |
| `#101` | Memory | repo-aware Claude memory sync |
| `#102` | Status | manifest-backed status line |
| `#103` | Voice follow-through | persona-aware voice hook transport |
| `#104` | Safety replay | reconciled damage-control expansion on current `main` |
| `#105` | Repo hygiene | repo-state audit automation |

## What Changed For Operators

If you use EVOKORE day to day, the practical changes are:

1. Start sessions with `npm run repo:audit`.
2. Rely on the continuity manifest and managed Claude memory rather than informal scratch context.
3. Use `proxy_server_status` to inspect aggregated child-server health.
4. Expect stronger damage-control behavior and broader validation coverage.
5. Expect the docs and handoff flow to be much more restartable than they were two weeks ago.

## Suggested Reading Order

If you want the shortest path through the new additions:

1. [../README.md](../README.md)
2. [SETUP.md](./SETUP.md)
3. [USAGE.md](./USAGE.md)
4. [ARCHITECTURE.md](./ARCHITECTURE.md)
5. [TESTING_AND_VALIDATION.md](./TESTING_AND_VALIDATION.md)
6. [RESEARCH_AND_HANDOFFS.md](./RESEARCH_AND_HANDOFFS.md)
7. [research/post-merge-cleanup-accounting-2026-03-12.md](./research/post-merge-cleanup-accounting-2026-03-12.md)
