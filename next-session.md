# Next Session Priorities

Last Updated (UTC): 2026-04-26

## ⚠️ ACTIVE PRIORITY SET — Tool Discovery Tiering Sprint (P0)

**Plan:** [docs/plans/tool-discovery-tiering-2026-04-26.md](docs/plans/tool-discovery-tiering-2026-04-26.md)

**Status (overnight autonomous run):** in progress on session
`sharp-tharp-090e3d`. PRs are being opened against `main`; **operator
must review and merge in the morning**. Until this sprint completes,
the rest of this file (security A/B, reliability, BUG-28, vector gate,
npm publish, hosted VPS) is paused — **come back to it once the
tiering sprint ships.**

**Why it jumped the queue:** every connecting MCP client pays a 12K–31K
token tax on the initial `tools/list`. Panel-of-experts review (Q1/Q2/Q3
strategy + Panel A/B/C/D execution-risk) confirmed the existing binary
`EVOKORE_TOOL_DISCOVERY_MODE=legacy|dynamic` toggle is the floor of what
the technique can do — peers (Solo.io, Speakeasy, Cloudflare Code Mode)
ship 96–99.9 % reductions while we ship ~50–60 %. The same review also
surfaced a real session-isolation bug
([src/index.ts:53](src/index.ts:53) — stdio activation Map keyed on
literal `__stdio_default_session__`) that is independent of the
strategy and ships in this sprint regardless.

**Overnight scope (REDUCED after second-pass critique):**

| Order | Branch | Title | Status |
|-------|--------|-------|--------|
| 1 | `fix/stdio-activation-singleton` | fix(session): namespace activation Map by client identity | (see overnight handoff) |
| 2 | `docs/tool-discovery-tiering-plan` | docs: tool discovery tiering phased plan + next-session sync | (see overnight handoff) |
| 3 | `feat/discovery-profile-config` | feat(discovery): named profiles in mcp.config.json + ProfileResolver | draft, depends on PR 1 (see overnight handoff) |

**Deferred to subsequent sessions** (full handoff details in the plan
doc §10):

- Sprint 1.2 — MCP cursor pagination on `tools/list`
- Sprint 1.3 — determinism + Fuse pinning + ranking order
- Sprint 1.4 — profile presets + deprecation shim + tests + benchmark
- Sprint 2 — auto-derived skill composition graph + `nextSteps[]`
- Sprint 3 — schema-deferred `tools/list` (`describe_tool` companion)
- Parked — Cloudflare-style "Code Mode" tier-0 (research only)

**Morning operator handoff:** see
[docs/handoffs/2026-04-26-overnight.md](docs/handoffs/2026-04-26-overnight.md)
once the run completes for exact PR URLs, statuses, and the resume
command for the next session.

---

## Current Handoff State
- **Active branch:** `main` (clean) at run start
- **HEAD at run start:** `fdac565` (`docs: add hosted-VPS EVOKORE track to next-session.md`)
- **Open PRs:** none at run start; up to 3 expected to be open after the overnight tiering run
- **Worktrees:** orchestrator session running on
  `sharp-tharp-090e3d`; per-PR worktrees spawned under
  `.claude/worktrees/agent-*` and removed after each PR ships

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

> "Load `docs/plans/tool-discovery-tiering-2026-04-26.md` and
> `docs/handoffs/2026-04-26-overnight.md`. Confirm the morning state —
> which PRs landed, which are still open, which are deferred. Resume
> with the next deferred sprint in §10 of the plan (Sprint 1.2 if
> Sprint 1.1 merged, otherwise pick up Sprint 1.1 work)."

### Option A — Security A

> "Load next-session.md and docs/research/repo-review-2026-04-04.md. Implement the approval-token exposure fix (`SEC-01`) as a narrow slice on a fresh branch from main. Remove full-token leakage from pending-approval surfaces and align docs/JSDoc with runtime behavior. Add targeted tests and keep the PR focused."

### Option B — Security B

> "Load next-session.md and docs/research/repo-review-2026-04-04.md. Implement shared SSRF blocking for src/httpUtils.ts and align TelemetryExporter URL validation. Add loopback/private/metadata redirect tests. Keep the slice separate from unrelated network changes."

### Option C — Reliability

> "Load next-session.md and docs/research/repo-review-2026-04-04.md. Implement the HttpServer lifecycle and reconnect follow-up items (`REL-01`, `REL-02`, `REL-03`, `OPS-01`, `OPS-05`) on a fresh branch from main with targeted integration coverage."
