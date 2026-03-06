# EVOKORE-MCP Phase 3 Core Infrastructure Roadmap

Phase 3 is the proposed next infrastructure pass after Phase 2. The goal of this roadmap is not to promise a full platform rewrite, but to define an initial, repo-specific path for tightening runtime orchestration, tool exposure, transport handling, and security boundaries in the current `src/` architecture.

## 1. Why Phase 3 now

Phase 2 delivered meaningful hardening in the proxy layer, especially the child server registry and cooldown wrapper in `src/ProxyManager.ts`. That work improved safety and observability for proxied tools, but it also made the next set of constraints more visible:

- EVOKORE still starts from a mostly boot-everything upfront model in `src/index.ts`.
- Tool discovery remains tied to eager child-server startup and full tool listing.
- Runtime state is tracked at the server level, but not at the request, session, or workflow level.
- Security policy is mostly a HITL gate around proxied tool calls, not a broader execution boundary.
- Skills and tools coexist, but they are not represented as one coherent execution surface.

That makes Phase 3 a reasonable planning point: the codebase now has enough concrete structure to evolve, but the current seams are still small enough to refactor in controlled PR slices.

## 2. Baseline after Phase 2

Current repo evidence suggests the Phase 2 baseline is:

- `src/ProxyManager.ts`
  - boots child servers from `mcp.config.json`
  - tracks a per-server `ServerState` registry
  - prefixes proxied tools into a shared registry
  - injects `_evokore_approval_token` into proxied tool schemas
  - applies cooldown behavior for repeated low-signal or failing tool calls
- `src/SecurityManager.ts`
  - loads `permissions.yml`
  - supports `allow`, `require_approval`, and `deny`
  - generates and validates short-lived approval tokens bound to tool name + args
- `src/SkillManager.ts`
  - indexes `SKILLS/`
  - exposes native tools such as `resolve_workflow`, `search_skills`, and `get_skill_help`
  - includes native tools that directly depend on specific proxied tool names such as `fs_read_file` and `fs_write_file`
- `src/index.ts`
  - initializes security, skills, and proxy subsystems sequentially
  - exposes one MCP server over stdio
  - returns the entire native + proxied tool set via `ListTools`
- `src/VoiceSidecar.ts`
  - already demonstrates a more explicit lifecycle model: connect, stream messages, flush, finalize, and clean up resources

This is a solid Phase 2 platform baseline, but not yet a general runtime core.

## 3. Architectural gaps after Phase 2

The following gaps are directly visible in the current code and are the main candidates for Phase 3 work.

### 3.1 No session runtime state layer

`ProxyManager.ts` tracks `ServerState`, and `SecurityManager.ts` tracks pending approval tokens, but there is no shared runtime state layer for:

- session identity
- request correlation
- workflow-level state
- per-session tool exposure
- policy/audit context across native and proxied execution

Today, state is spread across isolated maps instead of a single runtime model.

### 3.2 Full upfront tool listing and eager server boot

`src/index.ts` calls `loadServers()` during startup, and `ListTools` returns the full combined tool list from cache. In practice this means:

- child servers are booted before the first real need
- the tool surface is determined eagerly
- failures during boot reduce availability even if the user never needs that server
- future session-scoped or policy-scoped tool exposure will be harder to layer in cleanly

### 3.3 Shallow stdio-centric lifecycle and transport model

The current server and proxy path is strongly stdio-oriented:

- `src/index.ts` uses `StdioServerTransport`
- `src/ProxyManager.ts` stores `StdioClientTransport`
- `ServerState.connectionType` includes `'sse'` only at the type level as a future transport option; the actual implementation is still hardcoded around stdio boot/connect

By contrast, `src/VoiceSidecar.ts` already shows a more explicit lifecycle reference: long-lived connection setup, message streaming, flush/finalize stages, and cleanup. Phase 3 should likely adopt that kind of lifecycle thinking for MCP child runtimes as well.

### 3.4 HITL-only security boundary

`SecurityManager.ts` currently answers a narrow question: should a proxied tool call be allowed, denied, or paused for approval? That is useful, but shallow as a system boundary:

- policy is keyed to tool name, not session, role, origin, or transport
- native skill tools are not represented under the same enforcement model
- there is no broader execution policy for discovery, delegation, or server activation

Phase 3 should treat HITL as one policy action, not the whole security model.

### 3.5 Skill/tool disconnect

`SkillManager.ts` exposes native skill tools, but some of those tools assume specific proxied filesystem tools exist. Examples include:

- `docs_architect` calling `fs_read_file`
- `skill_creator` calling `fs_write_file`

That creates a coupling where skills are conceptually “native,” but operationally depend on external tool names and prefix conventions. The result is a blurred boundary between:

- knowledge retrieval
- workflow guidance
- executable actions

Phase 3 should reduce that disconnect instead of growing more one-off cross-calls.

## 4. Proposed workstreams (ordered with dependencies)

The following workstreams are ordered to minimize churn and make later decisions cheaper.

### Workstream 1: Introduce a minimal runtime state layer

Initial scope:

- add a proposed runtime/session state module
- centralize correlation IDs, server activation state, approval context, and request metadata
- keep this small at first; avoid a broad persistence story in the initial pass

Why first:

- later transport, security, and tool-catalog changes need one place to hang state

### Workstream 2: Split tool catalog from server boot

Initial scope:

- separate “tool discovery metadata” from “active connected child process”
- allow EVOKORE to describe candidate tools without requiring all child servers to be booted first
- define a proposed lazy activation path for proxied servers

Dependency:

- should build on the runtime state layer so activation can be tracked explicitly

### Workstream 3: Establish a transport/lifecycle abstraction

Initial scope:

- introduce a proposed abstraction above direct stdio client/server transport usage
- model connect, ready, call, health, and teardown as lifecycle steps
- keep stdio as the first implementation while leaving room for SSE or sidecar-style adapters

Dependency:

- easier once tool activation is no longer fused to one eager stdio boot path

### Workstream 4: Expand policy from HITL interceptor to execution boundary

Initial scope:

- evolve security checks from proxied call interception into a broader policy layer
- cover native tools, proxied tools, and server activation decisions under one proposed policy surface
- preserve Phase 2 approval-token behavior where still useful

Dependency:

- runtime state and lifecycle hooks should exist first so policy has enough context to evaluate

### Workstream 5: Reconcile skill execution with tool execution

Initial scope:

- identify which native skill tools are retrieval/guidance only
- identify which native tools are actually wrappers around execution tools
- define a proposed bridge so skills do not hardcode raw proxied tool names where avoidable

Dependency:

- best done after catalog and policy layers are clearer

## 5. Candidate module boundaries in `src/` (clearly proposed)

These are candidate boundaries only. They are meant to guide PR slicing, not lock the final design.

- `src/RuntimeState.ts`
  - proposed home for session/request/runtime state primitives
  - could own correlation IDs, activation records, and shared audit context

- `src/ToolCatalog.ts`
  - proposed read model for native tools, proxied tool descriptors, and availability metadata
  - should be separate from process boot

- `src/RuntimeSupervisor.ts`
  - proposed orchestration layer for child runtime activation, health transitions, and teardown
  - could absorb parts of `ProxyManager.ts` over time

- `src/transports/StdioRuntimeAdapter.ts`
  - proposed stdio implementation of a broader runtime transport contract

- `src/transports/SseRuntimeAdapter.ts`
  - candidate future transport adapter, even if Phase 3 only defines the interface and not full support

- `src/PolicyEngine.ts`
  - proposed successor or companion to `SecurityManager.ts`
  - would keep HITL support but add richer evaluation inputs and actions

- `src/SkillExecutionBridge.ts`
  - proposed boundary between skill-oriented tools and executable tool calls
  - intended to reduce direct dependencies on prefixed raw tool names inside `SkillManager.ts`

- `src/index.ts`
  - should likely remain the composition root, but with thinner startup logic than it has today

## 6. Validation strategy

Phase 3 should be validated incrementally rather than through one large end-state claim.

Recommended validation approach:

- keep existing behavior green while refactoring:
  - `test-proxy-cooldown.js`
  - `test-hitl.js`
  - `test-hitl-hardening.js`
  - `test-skill-manager.js`
  - voice-sidecar tests as lifecycle references rather than direct feature coverage
- add focused tests per workstream:
  - runtime state creation and cleanup
  - lazy server activation vs eager activation
  - transport adapter contract tests
  - policy application across native and proxied tools
  - skill/tool bridge behavior when expected proxied tools are unavailable
- prefer contract-level tests over broad end-to-end rewrites in the first Phase 3 PRs
- keep docs aligned with proposed behavior only; avoid documenting unsupported transport or policy capabilities as shipped

## 7. Recommended PR slicing / rollout

To keep risk down, the rollout should probably be split into small planning and implementation slices.

1. **Planning/doc PR**
   - this roadmap
   - no shared tracker edits
   - no broad README reshaping while PR #63 is open

2. **Runtime state PR**
   - introduce proposed runtime/session primitives
   - minimal integration into existing `index.ts` / `ProxyManager.ts`

3. **Tool catalog + lazy activation PR**
   - separate listing metadata from process startup
   - keep stdio behavior as default implementation path

4. **Transport abstraction PR**
   - extract stdio adapter contract
   - no need to promise full alternate transport support in the same PR

5. **Policy boundary PR**
   - expand beyond proxied HITL-only checks
   - preserve backward-compatible approval-token flows where possible

6. **Skill/tool reconciliation PR**
   - reduce direct hardcoded reliance on `fs_*` proxy tool names inside native skill tooling

## 8. Non-goals and wording cautions

This roadmap should stay disciplined about what it is **not** claiming.

Non-goals for this planning doc:

- not a commitment to implement every candidate module listed above
- not a promise of full SSE, WebSocket, or remote-runtime support in Phase 3
- not a promise of persistent session storage or distributed orchestration
- not a proposal to rewrite `VoiceSidecar.ts`; it is only a lifecycle reference
- not a proposal to replace the current Phase 2 security model outright before an incremental migration path exists

Recommended wording for follow-up docs and PRs:

- use terms such as **proposed**, **candidate**, **initial scope**, and **incremental**
- avoid terms such as **complete redesign**, **full transport support**, or **unified runtime solved**

## 9. Open questions

- Should lazy activation be driven by first tool use, first tool listing request, or explicit server metadata?
- What minimum runtime/session object is enough for policy and observability without overbuilding persistence?
- Should native skill tools and proxied tools appear as one normalized catalog, or remain distinct with shared policy hooks?
- How much of `ProxyManager.ts` should be extracted versus left in place behind a thinner facade?
- Is `SecurityManager.ts` better evolved in place, or should a new policy layer coexist temporarily during migration?
- Which current child server metadata belongs in `mcp.config.json`, and which belongs in code-level runtime descriptors?
