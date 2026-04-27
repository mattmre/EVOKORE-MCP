# ADR 0005: Bounded Contexts of EVOKORE-MCP

**Status:** Accepted
**Date:** 2026-04-27
**Deciders:** Wave 0c adoption plan (panel review — DDD Architect lens)
**Supersedes:** None (first explicit context map)

> **Numbering note.** The Wave 0c adoption brief asked for `0001-bounded-contexts.md`, but `docs/adr/0001-session-manifest-jsonl.md` already exists. ADR identifiers are not reused, so this ADR claims the next free number (`0005`). The position in the sequence does not change its precedence: glossary and architecture work that lands after Wave 0c MUST honor the contexts named below.

---

## Context

EVOKORE-MCP's runtime surface has grown organically. As of `dist` v3.1.0 the
`src/` tree contains roughly 40 TypeScript modules covering skill discovery,
proxy aggregation, OAuth/RBAC, multi-tenant session isolation, webhook
delivery, orchestration, fleet supervision, claims/locking, memory, telemetry,
audit, voice, navigation anchors, and several adapter layers (TTS/STT,
session stores). The Wave 0c panel review (DDD Architect lens) flagged that
this surface is being implicitly treated as one homogeneous codebase. That
framing is wrong:

- Different parts of the code use the same words to mean different things.
  "Session" in `SessionIsolation` is an HTTP MCP transport session;
  "session" in `SessionManifest` and the Claude Code hooks is a local hook
  session keyed by `~/.evokore/sessions/{sessionId}.jsonl`.
- "Tool" in `SkillManager`/`ToolCatalogIndex` is a native or proxied MCP
  tool surfaced via `tools/list`; "tool" in webhook redaction logic refers
  to invocation arguments. Both are legitimate; conflating them would break
  one or the other.
- "Resource" in MCP Resources (`resources/list`) is a `skill://` or
  `evokore://` URI; "resource" in `ClaimsManager` is a free-form lock key
  used by orchestration; "resource" in `OAuthProvider` is the JWT
  `audience` claim. All three coexist and must not be merged.

A single repo-wide `UBIQUITOUS_LANGUAGE.md` written before this ADR would
collapse those distinct meanings into one fake glossary, which is a
classical Domain-Driven Design failure mode (false unification across
bounded contexts). The fix from DDD is to declare contexts and their
relationships first, then scope every glossary and architectural claim
to a named context.

This ADR exists to establish that map before the `ubiquitous-language` and
`improve-codebase-architecture` skills ship — not to reorganize code.

---

## Decision

EVOKORE-MCP is composed of the following **eight** bounded contexts. Every
context listed here traces to actual code present on `main`. No context is
aspirational.

### 1. Skill Registry & Discovery

**Responsibility.** Owns the merged skill corpus (~336 entries, recursive
indexing), workflow resolution (lexical + alias + reranking), the unified
tool catalog (native + plugin + proxied), discovery profiles, the
schema-deferred `tools/list` mode, and the static skill composition graph
that drives `nextSteps[]`.

**Primary modules.**
- `src/SkillManager.ts`
- `src/RegistryManager.ts`
- `src/ToolCatalogIndex.ts`
- `src/ToolCatalogPagination.ts`
- `src/ProfileResolver.ts`
- `src/rerank/successRerank.ts`

**Exposed surface.**
- Native tools: `docs_architect`, `skill_creator`, `resolve_workflow`,
  `search_skills`, `get_skill_help`, `discover_tools`,
  `proxy_server_status`, `refresh_skills`, `fetch_skill`, `list_registry`,
  `execute_skill`, `describe_tool`.
- MCP resources: `skill://*` URIs, `evokore://server/*`,
  `evokore://skills/categories`.
- MCP prompts: `resolve-workflow`, `skill-help`, `server-overview`.

### 2. Proxy & Routing

**Responsibility.** Owns the lifecycle of child MCP servers (stdio and
StreamableHTTP transports), tool prefixing for namespace isolation, rate
limiting (token bucket per server / per tool), error-triggered cooldown,
and routing of `CallToolRequest` to the correct child. Boots asynchronously
in the background after the MCP handshake completes.

**Primary modules.**
- `src/ProxyManager.ts`
- `src/utils/resolveCommandForPlatform.ts`
- `src/httpUtils.ts` (shared with exporters)

**Exposed surface.** No native tools of its own; surfaces every prefixed
proxied tool through the unified `ToolCatalogIndex`. Health is reported via
the `proxy_server_status` tool owned by Skill Registry & Discovery.

### 3. Auth & Security

**Responsibility.** Authenticates HTTP requests (static bearer or JWKS-backed
JWT), enforces RBAC roles, runs the HITL approval flow with token issuance,
and runs declarative compliance checks against `RULES.md` and steering
modes. Owns the sandboxing primitives that wrap skill execution.

**Primary modules.**
- `src/auth/OAuthProvider.ts`
- `src/SecurityManager.ts`
- `src/ComplianceChecker.ts`
- `src/ContainerSandbox.ts`

**Exposed surface.** No first-class native MCP tools; participates in every
`CallToolRequest` via the SDK request handler. Approval state is persisted
at `~/.evokore/pending-approvals.json` and surfaced through the dashboard
`/approvals` page.

### 4. Session & Continuity

**Responsibility.** Owns the dual notion of "session" in EVOKORE: the
in-memory per-connection state for HTTP MCP transport, and the on-disk
append-only JSONL session manifest used by Claude Code hooks. Provides
pluggable session stores (memory / file / Redis) and the multi-tenant
filesystem layout described in ADR 0003.

**Primary modules.**
- `src/SessionIsolation.ts`
- `src/SessionManifest.ts`
- `src/SessionManifest.schema.ts`
- `src/SessionStore.ts`
- `src/stores/MemorySessionStore.ts`
- `src/stores/FileSessionStore.ts`
- `src/stores/RedisSessionStore.ts`
- `src/HttpServer.ts` (transport shell that hosts the SessionIsolation map)

**Exposed surface.** No directly named native tools; provides the
`sessionId` that everything else keys off. Session lifecycle events
(`session_start`, `session_end`, `session_resumed`) are emitted through
Audit & Webhooks.

### 5. Orchestration & Fleet

**Responsibility.** Spawns and supervises agent subprocesses, coordinates
multi-agent runs, manages cross-process resource locks for
mutually-exclusive work, and dispatches background workers (test runs,
repo analysis, security scans, benchmarks). Reads the trust ledger to
decide which agents are eligible for which tiers of work.

**Primary modules.**
- `src/OrchestrationRuntime.ts`
- `src/FleetManager.ts`
- `src/ClaimsManager.ts`
- `src/WorkerManager.ts`
- `src/WorkerScheduler.ts`
- `src/TrustLedger.ts`

**Exposed surface.**
- Native tools: `orchestration_start`, `orchestration_stop`,
  `orchestration_status`, `fleet_spawn`, `fleet_claim`, `fleet_release`,
  `fleet_status`, `claim_acquire`, `claim_release`, `claim_list`,
  `claim_sweep`, `worker_dispatch`, `worker_context`.

### 6. Audit & Webhooks

**Responsibility.** Single sink for security-relevant events
(authentication, session lifecycle, tool calls of admin/approval scope,
approval grants/denies, configuration changes), and outbound delivery of
those events to subscribers under the Webhook Envelope v1 contract
(ADR 0002). HMAC-signed, fire-and-forget with retry/backoff. Owns the
audit-redaction code path that strips secrets from payloads before
signing.

**Primary modules.**
- `src/AuditLog.ts`
- `src/AuditExporter.ts`
- `src/WebhookManager.ts`
- `src/PluginManager.ts` (lifecycle events surfaced as webhooks)

**Exposed surface.** No native tools; emits `tool_call`, `tool_error`,
`session_start`, `session_end`, `session_resumed`, `approval_requested`,
`approval_granted`, `plugin_loaded`, `plugin_unloaded`,
`plugin_load_error`. The `reload_plugins` native tool is owned here
because plugin loading is the trigger for the corresponding webhooks.

### 7. Telemetry & Analytics

**Responsibility.** Aggregates per-tool call counts, error counts, and
latency distributions; exports them to a configured HTTP sink with HMAC
signatures; records routing-decision telemetry (which candidates the
reranker considered, and which one succeeded); and answers operator-facing
questions about session context size, replay/evidence density, and trust.

**Primary modules.**
- `src/TelemetryManager.ts`
- `src/TelemetryExporter.ts`
- `src/TelemetryIndex.ts`
- `src/SessionAnalyticsManager.ts`
- `src/NavigationAnchorManager.ts`

**Exposed surface.**
- Native tools: `get_telemetry`, `reset_telemetry`,
  `session_context_health`, `session_analyze_replay`,
  `session_work_ratio`, `session_trust_report`, `nav_get_map`,
  `nav_read_anchor`.

### 8. Memory & Knowledge

**Responsibility.** Owns long-lived per-agent / per-session knowledge,
context, task, and decision records on the local filesystem. Distinct
from session manifests (which are append-only event logs) and from
the skill corpus (which is read-mostly source files). The vector-memory
gate from ADR 0004 lives here.

**Primary modules.**
- `src/MemoryManager.ts`

**Exposed surface.**
- Native tools: `memory_store`, `memory_search`, `memory_list`.

### Out-of-context (intentional non-membership)

The voice subsystem (`src/VoiceSidecar.ts`, `src/STTProvider.ts`,
`src/TTSProvider.ts`, `src/stt/*.ts`, `src/tts/*.ts`) runs as an
**out-of-process sidecar** on `ws://localhost:8888`. It is intentionally
not a bounded context of the MCP server: `index.ts` does not import it,
and it ships its own lifecycle. Treat it as an external system that
happens to live in the same repo. If voice grows MCP-side surface, a
follow-up ADR should promote it to a context.

---

## Context Map / Relationships

The relationship vocabulary follows Eric Evans' *Domain-Driven Design*
context-mapping patterns: **anti-corruption layer** (ACL), **shared
kernel** (SK), **customer-supplier** (CS), **conformist** (CF),
**open host service** (OHS).

| Upstream | Downstream | Pattern | Where it lives |
|---|---|---|---|
| Skill Registry & Discovery | Proxy & Routing | **ACL** | `ToolCatalogIndex` consumes proxied tool definitions but normalizes them (prefixing, keyword extraction, alwaysVisible policy) before exposing them. The proxy's raw `Tool` shape never leaks into reranker/profile logic. |
| Session & Continuity | Orchestration & Fleet | **SK** | The shared kernel is the manifest contract at `~/.evokore/sessions/{sessionId}.jsonl` plus claim sentinel files. Both contexts read and append to it; ADR 0001 (JSONL append-only) and ADR 0003 (tenant directory layout) define the shared shape. |
| Session & Continuity | Auth & Security | **CS** | Auth is the customer: it produces an authenticated identity (`tenantId` from JWT `sub` claim) that Session & Continuity consumes to choose the per-tenant directory. Auth does not know about manifest internals. |
| All seven runtime contexts | Audit & Webhooks | **CS** (many → one) | Every other context produces audit entries / webhook events; Audit & Webhooks supplies the canonical envelope (Envelope v1, ADR 0002). Producers must conform to `WebhookEventType`. |
| All seven runtime contexts | Telemetry & Analytics | **OHS** | `TelemetryManager.recordToolCall` is an open host service: any context calls it the same way; the published shape (`TelemetryMetrics`) is the public contract. |
| MCP SDK upstream | Skill Registry & Discovery, Proxy & Routing, Auth & Security | **CF** | These contexts conform to the `@modelcontextprotocol/sdk` `Tool`, `Resource`, and request-schema types. Conformance is by design — the whole point of EVOKORE is to be MCP-compliant. |
| Memory & Knowledge | Skill Registry & Discovery | **ACL** (one-way, deferred) | Memory is read-only from Discovery's perspective; the vector-memory gate (ADR 0004) defines exactly when and how Memory becomes an upstream search source. Until the gate fires, the relationship is dormant. |
| Auth & Security | Audit & Webhooks | **CS** | Auth produces `auth_success` / `auth_failure` / `approval_*` events; Audit & Webhooks delivers them. |
| Orchestration & Fleet | Telemetry & Analytics | **CS** | Trust ledger updates and worker outcomes flow into `session_trust_report` / `session_analyze_replay`. |

Diagrammatically (`>` reads "feeds"):

```
     +------------------+      +-------------------+
     | Skill Registry & |<-ACL-+ Proxy & Routing   |
     | Discovery        |      |                   |
     +---+--------+-----+      +---------+---------+
         |        |                      |
         |OHS     |CF (MCP SDK)          |CF (MCP SDK)
         v        v                      v
     +--------------------+  +-------------------------+
     | Telemetry &        |<-+ Audit & Webhooks (CS)   |
     | Analytics (OHS)    |  +------------+------------+
     +--------+-----------+               ^
              ^                           |CS (events)
              |CS                         |
     +--------+-----------+      +--------+------------+
     | Orchestration &    |--SK->| Session & Continuity|
     | Fleet              |<-SK--+                     |
     +--------------------+      +---------+-----------+
                                           ^
                                           |CS (tenantId)
                                 +---------+-----------+
                                 | Auth & Security     |
                                 +---------------------+
                                           ^
                                           |ACL (deferred)
                                 +---------+-----------+
                                 | Memory & Knowledge  |
                                 +---------------------+
```

---

## Consequences

**Positive.**

- **Per-context glossary.** The future `ubiquitous-language` skill MUST
  produce one glossary per bounded context, not one repo-wide glossary.
  "Session", "tool", "resource", "tenant", and "manifest" are explicitly
  allowed to mean different things in different contexts. The glossary
  format must include a `Context:` field for each term.
- **Architecture work is scoped.** The `improve-codebase-architecture`
  skill (and any other architecture-touching skill) MUST cite which
  context(s) it operates in before proposing a refactor. A change that
  spans contexts (e.g., touches both `SessionIsolation` and
  `OrchestrationRuntime`) requires explicit context-map review.
- **Ownership for new features.** Any new cross-cutting feature
  (a new env var, a new tool, a new event type) must declare which
  context owns it in its PR description. Reviewers are expected to
  reject PRs that claim "shared" ownership without a corresponding
  shared-kernel update to this ADR.
- **Drift catcher.** The accompanying test
  (`test-bounded-contexts-adr.js`) parses this ADR and verifies that
  every claimed `src/...` module path actually exists. If a module
  is renamed or removed without updating the ADR, CI fails.

**Negative / accepted trade-offs.**

- **Voice deferred.** The voice sidecar is intentionally outside the
  context map. If it grows MCP-side surface, the omission becomes
  visible in code review and a follow-up ADR is required.
- **No DDD-style aggregate decomposition yet.** This ADR names contexts
  and their relationships, not aggregates inside each context. Aggregate
  modeling (e.g., "is `ClaimsManager` an aggregate root or a domain
  service?") is left to a future ADR if the team adopts more DDD
  vocabulary.
- **One module = one context.** A few modules (e.g., `httpUtils.ts`)
  are technically used by both Proxy & Routing and Audit & Webhooks
  exporters. They are listed once under their primary context. Pure
  utility modules under `src/utils/` are not assigned a context.

---

## Alternatives Considered

| Option | Verdict | Rationale |
|---|---|---|
| Single repo-wide glossary, no context map | Rejected | Collapses three legitimate meanings of "session", "resource", "tool". Classical DDD anti-pattern. |
| Per-file architectural docs, no global map | Rejected | Cannot answer "which context owns this new feature?" without a global map. |
| Adopt a finer-grained context decomposition (e.g., split Proxy from Tool Catalog) | Rejected | `ToolCatalogIndex` exists explicitly to unify native + plugin + proxied tools; splitting it would create a fake boundary the code does not honor. |
| Adopt a coarser decomposition (e.g., merge Audit & Webhooks into Telemetry) | Rejected | They have different delivery semantics (durable vs. fire-and-forget) and different consumer contracts (audit sinks vs. event subscribers). |
| Promote voice now | Deferred | `index.ts` does not import voice; promoting it would lie about the import graph. |

---

## Related ADRs and Decisions

- ADR 0001 — Session Manifest Append-Only JSONL (`docs/adr/0001-session-manifest-jsonl.md`)
  — defines the shared-kernel contract between Session & Continuity and Orchestration & Fleet.
- ADR 0002 — Webhook Envelope v1 Contract (`docs/adr/0002-webhook-envelope-v1.md`)
  — defines the customer-supplier envelope for Audit & Webhooks.
- ADR 0003 — Tenant Directory Layout (`docs/adr/0003-tenant-directory-layout.md`)
  — defines the customer-supplier layout between Auth & Security and
  Session & Continuity.
- ADR 0004 — Vector Memory Trigger Gate (`docs/adr/0004-vector-memory-trigger.md`)
  — defines when the dormant ACL between Memory & Knowledge and Skill
  Registry & Discovery becomes active.
- Decision 2026-04-26 — `code-refinement` skill reference blocker
  (`docs/decisions/2026-04-26-code-refinement-blocker.md`)
  — illustrates the "imagined skill chains" failure mode the per-context
  glossary work is meant to prevent.
