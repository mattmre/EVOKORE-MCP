# Dynamic Tool Discovery Hardening - 2026-03-11

## Goal

Close `T13` by verifying which parts of the Agent33 discovery contract EVOKORE already satisfies, then harden the remaining lifecycle and regression gaps without rewriting the existing MVP.

## Current State

EVOKORE already had the core discovery architecture before this slice:

- `discover_tools` is a native tool
- `legacy` and `dynamic` discovery modes exist
- dynamic mode uses session-scoped activation state
- hidden proxied tools remain callable by exact prefixed name
- `ToolCatalogIndex` provides weighted Fuse.js matching
- benchmark and end-to-end discovery validation already exist

## Real Gaps Found

### 1. Session activation lifecycle was implicit

The activation map existed as `Map<sessionId, Set<toolName>>`, but it had no lifecycle controls.

Risks:

- stale activation state could accumulate forever in session-aware transports
- a long-idle session could retain outdated activations indefinitely
- the current behavior was under-documented, especially for stdio's single default session

### 2. No direct regression for `tools/list_changed`

The runtime emitted `sendToolListChanged()` best-effort, but the test suite did not prove that a client configured for `listChanged.tools` actually received and refreshed the projected tool list after discovery.

### 3. No direct regression for session isolation

The implementation stored activations per session, but there was no targeted validation proving that one session's activations remain invisible to another.

## Decision

Keep the existing MVP architecture and harden it rather than redesign it.

This slice adds:

- bounded activation-session state with stale-session reset/pruning
- explicit regression coverage for session isolation
- explicit regression coverage for `tools/list_changed`
- docs clarifying stdio versus session-aware transport behavior

## Trade-offs

- This does not attempt lazy child-server boot or full discovery analytics yet.
- Session pruning is opportunistic and in-memory; it is meant to prevent drift and unbounded growth, not to act as durable discovery persistence.
- stdio still effectively uses one default session key, which is correct for the current runtime shape.

## Validation

Recommended validation commands for this slice:

```bash
npm run build
node test-tool-discovery-validation.js
node test-tool-discovery-list-changed-validation.js
node test-tool-discovery-session-hardening-validation.js
node test-tool-discovery-benchmark-validation.js
npm test
```
