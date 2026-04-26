# Next Session Priorities

Last Updated (UTC): 2026-04-26

## ⚠️ ACTIVE PRIORITY SET — Tool Discovery Tiering Sprint (P0)

**Plan:** [docs/plans/tool-discovery-tiering-2026-04-26.md](docs/plans/tool-discovery-tiering-2026-04-26.md)

**Status (post-overnight, post-merge):** Phase 0 + Sprint 1.1 + plan
docs **landed on `main`**. The next session resumes with **Sprint 2
and Sprint 3** as the operator-rearranged top of the deferred queue
(see "Deferred queue — REARRANGED" below). All other tracks (security
A/B, reliability, BUG-28, vector gate, npm publish, hosted VPS) remain
paused until the rearranged tiering work ships.

**Why it jumped the queue:** every connecting MCP client pays a 12K–31K
token tax on the initial `tools/list`. Panel-of-experts review (Q1/Q2/Q3
strategy + Panel A/B/C/D execution-risk) confirmed the existing binary
`EVOKORE_TOOL_DISCOVERY_MODE=legacy|dynamic` toggle is the floor of what
the technique can do — peers (Solo.io, Speakeasy, Cloudflare Code Mode)
ship 96–99.9 % reductions while we ship ~50–60 %. The same review also
surfaced a real session-isolation bug (stdio activation Map keyed on
the shared literal `__stdio_default_session__`) that was independent
of the strategy and shipped alongside the docs PR.

**Overnight scope (REDUCED after second-pass critique) — ALL MERGED:**

| Order | PR | Title | State |
|-------|----|-------|-------|
| 1 | [#289](https://github.com/mattmre/EVOKORE-MCP/pull/289) | fix(session): namespace stdio activation Map by per-instance id | merged |
| 2 | [#288](https://github.com/mattmre/EVOKORE-MCP/pull/288) | docs: tool discovery tiering phased plan + next-session sync | merged |
| 3 | [#290](https://github.com/mattmre/EVOKORE-MCP/pull/290) | feat(discovery): named profiles in mcp.config.json + ProfileResolver | merged |

All three PRs landed with full CI green (Type Check, Build, Windows
Runtime Validation, all three test shards, security scans). One round
of gemini-code-assist review feedback addressed before merge:

- PR #289: switched the per-instance prefix from `stdio:${uuid}` to
  `stdio-${uuid}` so the id is safe as a Windows filename component
  (FileSessionStore writes `~/.evokore/sessions/<sessionId>.json`).
- PR #290: surface JSON parse errors from `loadDiscoveryConfig` to
  stderr before soft-failing to `{}`, so a malformed `mcp.config.json`
  discovery block is not silently ignored at startup.
- PR #288: stop recommending the deprecated `@dqbd/tiktoken` package
  (its README redirects to `js-tiktoken`); replaced the hard-coded
  SKILL.md `lines 237-298` reference with a header-based section
  locator + optional `@AI:NAV` marker recommendation.

### Deferred queue — REARRANGED per operator priority shift (2026-04-26)

The operator explicitly rearranged the deferred queue **after** the
overnight run merged. Sprint 2 and Sprint 3 are now the next two items
to tackle, ahead of Sprints 1.2 / 1.3 / 1.4. Rationale: they are the
two highest-leverage techniques in the panel scan (skill composition +
schema-deferred discovery). Sprint 2 has a verified blocker —
`code-refinement` is a panel-of-experts panel, not an executable skill,
so the `pr-manager → security-review → code-refinement` chain must be
either (a) wired up by building the skill or (b) cleaned up by removing
the dangling reference. Sprint 3 needs a client-compatibility matrix
research pass before implementation.

**New priority order:**

1. **Sprint 2 — Auto-derived skill composition graph + `nextSteps[]`**
   - Plan: `docs/plans/tool-discovery-tiering-2026-04-26.md` §10
   - 5–8 day sprint. First PR is the `code-refinement` blocker
     resolution (build OR remove); second PR is
     `scripts/derive-skill-composition.js` + `skill-graph.json`
     artifact; third PR is `execute_skill` returning `nextSteps[]` +
     auto-activation hook + `tools/list_changed` emission.
   - Use the markdown-heading section locator (or add a structured
     `<!-- @AI:NAV(SEC:injection-points) -->` marker) when parsing the
     panel-of-experts SKILL.md injection table — do NOT hard-code line
     numbers, the file is edited too frequently.

2. **Sprint 3 — Schema-deferred `tools/list` + `describe_tool`**
   - Plan: §10
   - **Prerequisite:** client-compatibility matrix research first
     (Claude Desktop, Cursor, Cline, Continue, custom MCP clients).
     Schema deferral is the highest-leverage technique in the panel
     scan (96–100× reduction in benchmarks) but only works if clients
     gracefully fall back when `inputSchema` is absent on `tools/list`
     and present on `describe_tool`. Do not start implementation
     without that matrix.

3. *(was-priority-1)* Sprint 1.2 — MCP cursor pagination on
   `tools/list`
4. *(was-priority-2)* Sprint 1.3 — determinism + Fuse pinning +
   ranking order
5. *(was-priority-3)* Sprint 1.4 — profile presets + deprecation shim
   + tests + benchmark (with `tiktoken` / `js-tiktoken`, NOT
   `@dqbd/tiktoken`)
6. **Parked** — Cloudflare-style "Code Mode" tier-0 (research only;
   revisit only if Sprint 3's deferral benchmark is insufficient)

After all of the above complete, return to the original queue (Security
A, Security B, Reliability, BUG-28 test conversion, vector gate
instrumentation, npm publish v3.1.0, and the long-term hosted-VPS
track).

**Morning operator handoff:** see
[docs/handoffs/2026-04-26-overnight.md](docs/handoffs/2026-04-26-overnight.md)
for the per-PR evidence record from the overnight run.

---

## Current Handoff State
- **Active branch:** `main` (clean)
- **HEAD:** `802d600` (`feat(discovery): named profiles in mcp.config.json + ProfileResolver (#290)`)
- **Open PRs:** none (all three overnight PRs merged: #288, #289, #290)
- **Worktrees:** orchestrator session running on
  `sharp-tharp-090e3d`; per-PR agent worktrees retired post-merge

---

## Recent Landed Work

### ✅ COMPLETE — Post-Phase-4 wave now on `main`

- PR `#270` — Wave 4 skills import wave 2
- PR `#271` — telemetry flush JSON parse fix
- PR `#272` — browser skill + skill-authoring guidance
- PR `#273` — ComplianceChecker + codemods + ADR 0004
- PR `#274` — plugin manifest support
- PR `#275` — reusable CI/CD workflows + commitlint + changelog automation
- PR `#276` — OrchestrationRuntime via FleetManager + ClaimsManager
- PR `#277` — CLI sync expansion to Copilot and Codex

### Important correction

The older Wave 4 / Wave 7 / Wave 8 / Wave 9 items previously listed as pending
have already landed. Do not restart those slices.

---

## Actual Remaining Queue (priority order)

### 0. Control-Plane Sync

Docs-only slice to refresh planning artifacts after PRs `#270`-`#277`.

- `next-session.md`
- `task_plan.md`
- dated research audit
- dated session log

### 1. Security A — Approval Token Exposure

Primary source: `docs/research/repo-review-2026-04-04.md`

- `SEC-01` — remove full approval-token exposure from pending-approval surfaces
- `DX-05` — align pending-approval docs/JSDoc with runtime behavior
- optionally include tightly-related access-gate follow-up only if the write surface stays narrow

### 2. Security B — Shared HTTP SSRF Hardening

Primary source: `docs/research/repo-review-2026-04-04.md`

- `SEC-03` — add private/loopback/metadata SSRF blocking to `src/httpUtils.ts`
- `SEC-04` — align `TelemetryExporter` URL validation with the stronger network posture
- add redirect-chain coverage

### 3. Reliability — HttpServer / Reconnect Lifecycle

Primary source: `docs/research/repo-review-2026-04-04.md`

- `REL-01`, `REL-02` — transport cleanup / interval lifecycle
- `REL-03` — avoid long synchronous reconnect blocking in proxied-tool path
- `OPS-01`, `OPS-05` — start-up error cleanup and safer env parsing

### 4. Test Hardening — BUG-28 Remainder

Convert remaining source-scraping integration tests to behavioral assertions.

Known TODO-marked files include:
- `tests/integration/file-session-store-validation.test.ts`
- `tests/integration/container-sandbox-validation.test.ts`
- `tests/integration/oauth-jwt-validation.test.ts`
- `tests/integration/redis-session-store-validation.test.ts`
- `tests/integration/session-store.test.ts`
- `tests/integration/skill-fetch.test.ts`
- `tests/integration/skill-registry.test.ts`
- `tests/integration/skill-watcher-stability.test.ts`
- `tests/integration/stt-whisper-validation.test.ts`

### 5. GATED — Vector Trigger Instrumentation Only

Do not implement vector memory yet.

Missing prerequisite work:
- create `scripts/check-vector-trigger.js`
- define the corpus-count source of truth
- define the latency source for `resolve_workflow` p50 over the last 1,000 calls
- report current gate status

### 6. STANDALONE — npm publish `v3.1.0`

Still blocked on operator verification of `NPM_TOKEN`.

Current known state:
- Git tag exists
- GitHub release exists
- npm package is still unpublished / externally absent

Commands after operator action:

```powershell
npm run release:preflight
npm publish
```

### 7. FUTURE — Hosted EVOKORE on VPS (cross-platform, cross-session)

Long-term strategic track. Not on the immediate critical path but a high-impact
direction once SEC-A / SEC-B / Reliability land.

**Concept**

Stand up EVOKORE-MCP on a personal VPS behind a dedicated subdomain (e.g.
`mcp.evokore.<domain>`) so it's reachable as a remote HTTP MCP endpoint from
any client that supports MCP Connectors:

- Claude Code on the web (claude.ai/code account-level Connector)
- Claude Desktop
- Codex / OpenAI clients with MCP support
- any future MCP-aware client

This replaces per-repo `.mcp.json` (PR `#287` baseline) with a single
user-scoped attachment that follows the user across every repo, every
session, every device — including phone-only sessions.

**Auth**

API-key / bearer-token gate using the existing `OAuthProvider`
(`src/auth/OAuthProvider.ts`) with `EVOKORE_OAUTH_*` env vars, or a simpler
static bearer scheme if account-level Connector UI doesn't yet support full
OAuth flows. Pick whichever the target client actually accepts.

**Centralized state — the real payoff**

Once EVOKORE is hosted instead of per-laptop, all the session state can be
centralized:

- Session memory (`MemoryManager`) — currently `~/.evokore/sessions/...`
  per machine; promote to a Postgres-backed store on the VPS so memory
  follows the user across machines and clients.
- Session replay + evidence JSONL — same pattern, persisted server-side.
- Audit log (`AuditLog.write()`) — durable across sessions, searchable.
- TillDone tasks, claims, fleet state — shared across devices.

**Postgres + enrichments**

With Postgres in front of the memory layer, longer-term analytics become
tractable:

- Cross-session pattern detection (which skills get used together, where
  retries cluster, where work-ratio drops).
- Embeddings for semantic recall over months of session history.
- Per-repo and per-tool usage rollups.
- Compliance / audit queries over the full timeline rather than per-file
  JSONL grepping.

**Productization angle**

The same VPS-hosted shape can ship as first-class repo functionality:
operators run `evokore-mcp` against their own VPS + Postgres and get all
of the above out of the box. That turns EVOKORE from a local aggregator
into an offering: "Bring your own VPS, bring your own Postgres, get
durable cross-platform AI session memory."

**Rough build-out checklist (for future planning)**

1. Container image / `Dockerfile` + `docker-compose` for VPS deploy.
2. Postgres-backed `MemoryManager` adapter behind the existing interface.
3. Server-side sink for replay / evidence / audit JSONL → Postgres.
4. Subdomain + TLS via Caddy or Cloudflare in front of EVOKORE HTTP.
5. Bearer-token auth wired through `OAuthProvider` with key rotation.
6. Migration tool: import existing `~/.evokore/sessions/*` into Postgres.
7. Dashboard updates to query the remote store.
8. Docs: "Self-host EVOKORE on a VPS" guide.

**Why it's worth doing eventually**

- Phone-first usage actually works (the original PR `#287` motivation).
- Memory and audit history survive laptop changes, OS reinstalls, and
  worktree thrash.
- Same backend powers Claude, Codex, and any future MCP client equally.
- Opens the door to a hosted/SaaS or self-host-as-product surface for
  EVOKORE without forking the codebase.

**Status**

Not started. PR `#287` is the per-repo fallback; this is the durable
cross-repo / cross-platform replacement.

---

## Critical Path Remaining

Control-plane sync -> approval-token hardening -> shared SSRF hardening ->
reliability/reconnect fixes -> BUG-28 conversion wave -> vector gate
instrumentation -> operator-gated npm publication

---

## How To Start Next Session

### Option Z — Resume the Tool Discovery Tiering sprint (P0, blocks all others)

The overnight run shipped Phase 0 + Sprint 1.1 + plan docs (PRs #288 /
#289 / #290, all merged). Per the operator priority shift on
2026-04-26, the next session picks up **Sprint 2 first, then Sprint
3**, NOT Sprints 1.2 / 1.3 / 1.4.

**Sprint 2 — Skill composition graph + `nextSteps[]` (start here):**

> "Load `docs/plans/tool-discovery-tiering-2026-04-26.md` §10 and
> `docs/handoffs/2026-04-26-overnight.md`. Phase 0 + Sprint 1.1 +
> docs all landed on `main` (PRs #288 / #289 / #290). Pick up
> Sprint 2 — auto-derived skill composition graph + `nextSteps[]`.
> First slice: resolve the verified `code-refinement` blocker —
> either build it as an executable skill under
> `SKILLS/ORCHESTRATION FRAMEWORK/.../code-refinement/SKILL.md`
> with proper trigger-explicit description and progressive
> disclosure, OR remove the dangling reference from `pr-manager`.
> Decide based on what `pr-manager → security-review →
> code-refinement` is supposed to actually do, not on which option
> is faster. Then build `scripts/derive-skill-composition.js`
> using a markdown-heading section locator (NOT line numbers) for
> the panel-of-experts SKILL.md injection table."

**Sprint 3 — Schema-deferred `tools/list` + `describe_tool` (do
research first):**

> "Load `docs/plans/tool-discovery-tiering-2026-04-26.md` §10
> Sprint 3. Before any implementation, produce a client-compatibility
> matrix covering Claude Desktop, Cursor, Cline, Continue, and any
> other custom MCP clients in repo docs. For each client, document:
> does it tolerate `inputSchema` being absent on `tools/list`? Does
> it call a separate tool to fetch the schema before invocation, and
> if so under what method name? What's the user-visible failure mode
> when a tool is called without a cached schema? Land that matrix as
> a `docs/research/tools-list-deferred-schema-compat-2026-04-XX.md`
> doc PR. Only after the matrix is on main do we start the
> implementation slice (`describe_tool` companion + flag-gated
> deferred `tools/list`)."

### Option A — Security A

> "Load next-session.md and docs/research/repo-review-2026-04-04.md. Implement the approval-token exposure fix (`SEC-01`) as a narrow slice on a fresh branch from main. Remove full-token leakage from pending-approval surfaces and align docs/JSDoc with runtime behavior. Add targeted tests and keep the PR focused."

### Option B — Security B

> "Load next-session.md and docs/research/repo-review-2026-04-04.md. Implement shared SSRF blocking for src/httpUtils.ts and align TelemetryExporter URL validation. Add loopback/private/metadata redirect tests. Keep the slice separate from unrelated network changes."

### Option C — Reliability

> "Load next-session.md and docs/research/repo-review-2026-04-04.md. Implement the HttpServer lifecycle and reconnect follow-up items (`REL-01`, `REL-02`, `REL-03`, `OPS-01`, `OPS-05`) on a fresh branch from main with targeted integration coverage."
