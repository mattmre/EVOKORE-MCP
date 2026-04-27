# Tool Discovery Tiering — Phased Development Plan

- **Created:** 2026-04-26
- **Status:** APPROVED FOR EXECUTION (REDUCED SCOPE) — second-pass panel critique applied
- **Owner:** Claude Code orchestration (overnight autonomous run) → operator review at wake
- **Priority:** P0 — immediate priority over the previous next-session.md queue until Sprint 1 ships
- **Source research:** `docs/research/dynamic-tool-discovery-research.md`
- **Panel reviews:** Q1/Q2/Q3 strategy panel + Panel A/B/C/D execution-risk panel (transcripts in session)

---

## 1. Why this exists

Initial `tools/list` payloads on every connecting MCP client are
12K–31K tokens. The existing binary
`EVOKORE_TOOL_DISCOVERY_MODE=legacy|dynamic` toggle is shipped but is
the floor of what the technique can do. Peers (Solo.io, Speakeasy,
Cloudflare Code Mode) ship 96–99.9 % reductions; we ship ~50–60 %.

**Important framing correction (panel D-DA):** native tools (33 of them)
are already `alwaysVisible: true` in `ToolCatalogIndex.createEntry()`.
Profile-driven token savings come almost entirely from **proxy tools**
(github 26 + fs 14 + elevenlabs 24, etc.). The "12K–31K tokens" headline
is dominated by proxy tool schemas. Native overhead is ~2–3K and is not
the lever this plan moves.

The panel also surfaced a real concurrency bug independent of the
strategy: the stdio activation Map in `src/index.ts:53` is keyed on a
literal `__stdio_default_session__` string, so concurrent stdio clients
running against the same EVOKORE process share each other's activation
state. This **must ship first** because it is a session-isolation
regression that exists today.

---

## 2. Scope (REDUCED after second-pass critique)

### Overnight autonomous run — IN SCOPE

- **Plan + next-session sync PR** — this document + next-session.md
  update + morning handoff template
- **Phase 0** — stdio singleton activation-Map leak fix
- **Sprint 1.1** — named profiles in `mcp.config.json` + `ProfileResolver`

### Deferred to subsequent sessions (handoff written, not executed)

- **Sprint 1.2** — MCP cursor pagination on `tools/list`
- **Sprint 1.3** — determinism + Fuse pinning + ranking order
- **Sprint 1.4** — profile presets + deprecation shim + tests + benchmark
- **Sprint 2** — auto-derived skill composition graph + `nextSteps[]`
- **Sprint 3** — schema-deferred `tools/list` (`describe_tool`)
- **Parked** — Cloudflare-style "Code Mode" tier-0 (research only)

### Why the reduction
Panel C-DA: sequential PR execution with rebase-on-merge requires the
operator to merge between each PR. Operator is asleep. Opening 5 PRs
overnight either stalls after PR 0 (sequential) or violates the
project's "never stack PRs" rule (parallel). Reducing to 2 PRs (Phase 0
+ Sprint 1.1) keeps the work additive — both can be opened as drafts
against `main` and merged in the morning by the operator without
mid-night rebase.

The deferred sprints are sequenced and self-contained in §10. New
sessions handle them.

---

## 3. Architecture target (end of Sprint 1, after deferred sprints land)

```
┌─────────────────────────────────────────────────────────────────────┐
│  EVOKORE-MCP runtime                                                │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ ProfileResolver (Sprint 1.1 — IN SCOPE)                      │   │
│  │ - reads EVOKORE_TOOL_DISCOVERY_PROFILE                       │   │
│  │ - SAFETY-PIN: explicit EVOKORE_TOOL_DISCOVERY_MODE wins      │   │
│  │ - loads named profile from mcp.config.json                   │   │
│  │ - returns { alwaysVisibleTools, defaultActivations,          │   │
│  │             maxActiveTools, source, mode }                   │   │
│  └────────────────────┬─────────────────────────────────────────┘   │
│                       │                                             │
│  ┌────────────────────▼─────────────────────────────────────────┐   │
│  │ SessionIsolation (Phase 0 — IN SCOPE)                        │   │
│  │ - session keyed by composeSessionKey(sessionId, clientName)  │   │
│  │ - activatedTools seeded from profile.defaultActivations      │   │
│  │ - capped at profile.maxActiveTools                           │   │
│  └────────────────────┬─────────────────────────────────────────┘   │
│                       │                                             │
│  ┌────────────────────▼─────────────────────────────────────────┐   │
│  │ ToolCatalogIndex (Sprint 1.3 — DEFERRED)                     │   │
│  │ - alias-exact > prefix > Fuse ordering                       │   │
│  │ - Fuse pinned to exact version                               │   │
│  └────────────────────┬─────────────────────────────────────────┘   │
│                       │                                             │
│  ┌────────────────────▼─────────────────────────────────────────┐   │
│  │ ListToolsRequest handler (Sprint 1.2 — DEFERRED)             │   │
│  │ - cursor pagination on tools/list                            │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. PR sequence — overnight autonomous run

**Reordered after panel A-DA:** Phase 0 ships first because it's a real
session-isolation bug that does not depend on the strategy. The plan PR
documents the strategy and ships alongside, but does not gate the bug
fix.

| Order | Branch | Title | Files touched (≤) | Estimated LOC | PR state |
|-------|--------|-------|--------------------|---------------|----------|
| 1 | `fix/stdio-activation-singleton` | fix(session): namespace activation Map by client identity | `src/index.ts`, `src/SessionIsolation.ts`, 1 test | ≤120 | Open as **ready-for-review** (not draft) — bug fix, low risk |
| 2 | `docs/tool-discovery-tiering-plan` | docs: tool discovery tiering phased plan + next-session sync | `docs/plans/tool-discovery-tiering-2026-04-26.md`, `next-session.md`, `docs/handoffs/2026-04-26-overnight.md` | ~700 lines docs | Open as **ready-for-review** — docs only |
| 3 | `feat/discovery-profile-config` | feat(discovery): named profiles in mcp.config.json + ProfileResolver | `src/ProfileResolver.ts` (NEW), `src/index.ts`, `mcp.config.json`, `.env.example`, 2 tests | ≤300 | Open as **draft** — depends on PR 1 merge before rebase |

PRs 1 and 3 touch overlapping code in `src/index.ts` (PR 1 changes the
session-key composition, PR 3 reads the resolved profile from the
constructor). PR 3 is opened as draft on a branch based on PR 1's
branch, with an explicit note in the body: "rebase onto `main` after PR
1 merges; do not merge before then."

PR 2 (docs) is independent and can merge in any order.

---

## 5. Phase 0 — stdio singleton fix

### Problem
[src/index.ts:53,194-210](/src/index.ts) — `DEFAULT_SESSION_ID =
"__stdio_default_session__"` is the only key for stdio sessions.
Multiple stdio clients connected to the same EVOKORE process share one
activation Map. This is a session-isolation regression that already
exists today.

### Fix
- Add helper `composeSessionKey(sessionId, clientName)` exported from
  `src/SessionIsolation.ts`.
- For stdio without an explicit `sessionId`, the key becomes
  `__stdio__:{clientName || "anonymous"}`.
- `EvokoreMCPServer.getSessionId()` accepts the request `extra` plus
  optional `clientInfo` (read once on `initialize`, cached
  per-transport), and calls the helper.
- `SessionIsolation.createSession()` accepts an optional `clientIdentity`
  field stored on the session record for diagnostics.

### Acceptance
- New test `tests/unit/session-key-isolation.test.ts`:
  1. Two stub `initialize` flows with different `clientInfo.name`,
     activate a tool in client A, assert client B's session has empty
     `activatedTools`.
  2. Default behavior — single stdio client with no explicit
     `clientInfo` — uses `__stdio__:anonymous` and matches today's
     single-session expectation.
- All existing tests pass without modification.
- `npx tsc --noEmit` clean.
- `npm run build` clean.

### Risk
Low. Pure namespacing change. The default key `__stdio__:anonymous` is
distinct from the legacy `__stdio_default_session__`, so any state
accidentally persisted under the legacy key is *not* picked up — but
that state never persists across processes for stdio anyway (memory
store), and the behavior change is exactly the bug fix.

---

## 6. Sprint 1.1 — Named profiles in mcp.config.json

### Schema additions to `mcp.config.json`

```jsonc
{
  "profiles": {
    "default": {
      "mode": "legacy",
      "alwaysVisibleTools": [],
      "defaultActivations": [],
      "maxActiveTools": 40
    }
  },
  "activeProfile": "default"
}
```

The `default` profile preserves byte-identical behavior with today's
`legacy` mode. Operators opting in to tiering define additional named
profiles in their own `mcp.config.json`.

The four sample profiles (`coding`, `research`, `voice`, `legacy-full`,
`legacy-dynamic`) are **not** added to the canonical config in this
sprint. They ship as documentation in §10's deferred Sprint 1.4 to keep
the PR surgical.

### Resolution order — SAFETY-PIN SEMANTICS (panel B fix)

Operators have used `EVOKORE_TOOL_DISCOVERY_MODE` as a kill switch since
v3.0. Explicit MODE wins over PROFILE so that pinning `MODE=legacy` is
not silently overridden. Resolution rules:

1. If `EVOKORE_TOOL_DISCOVERY_MODE` is set (any value):
   - It wins. PROFILE is ignored. A stderr notice is emitted if PROFILE
     is also set: `[EVOKORE] Both MODE and PROFILE set; MODE wins
     (safety-pin). Unset MODE to use PROFILE.`
2. Else if `EVOKORE_TOOL_DISCOVERY_PROFILE=<name>` is set:
   - Look up `<name>` in `mcp.config.json` `profiles`. If present, use
     it. If absent, log error and fall back to `default`.
3. Else if `mcp.config.json` has `activeProfile: <name>`:
   - Look up `<name>`. Same fallback.
4. Else use the `default` profile.

### `src/ProfileResolver.ts` (NEW)

```ts
export interface ResolvedProfile {
  name: string;
  mode: 'legacy' | 'dynamic';
  alwaysVisibleTools: string[];
  defaultActivations: string[];
  maxActiveTools: number;
  source: 'env-mode' | 'env-profile' | 'config-active' | 'default';
}

export function resolveActiveProfile(
  config: { profiles?: Record<string, ProfileDef>; activeProfile?: string },
  env: NodeJS.ProcessEnv,
): ResolvedProfile;
```

The resolver is pure (no side effects beyond stderr deprecation
notices) and unit-testable.

### Wiring
- `EvokoreMCPServer.constructor` calls `resolveActiveProfile()` and
  stores `this.activeProfile`.
- `rebuildToolCatalog()` passes `activeProfile.alwaysVisibleTools` to
  `new ToolCatalogIndex(...)`.
- `ToolCatalogIndex.createEntry` flips `alwaysVisible: true` for any
  proxy tool whose name is in the allowlist (in addition to all native
  tools, which are already `alwaysVisible: true`).
- `EvokoreMCPServer.discoveryMode` continues to be set from the
  resolved profile's `mode` field; back-compat preserved.

### Acceptance
- Unit test `tests/unit/profile-resolver.test.ts`:
  - all 4 resolution-order cases
  - safety-pin precedence (MODE wins over PROFILE when both set)
  - missing profile name falls back to `default` with stderr error
- Integration test `tests/integration/profile-config-loading.test.ts`:
  - boot EVOKORE with a custom profile in `mcp.config.json`, assert
    `tools/list` includes the listed proxy tools as `alwaysVisible`
- Backward compat:
  - With no env vars, no `activeProfile`, no `profiles` block →
    `default` profile in `mcp.config.json` baseline ships → behavior is
    byte-identical to current `legacy` mode (verified by snapshot test
    against the pre-merge `tools/list` output)
- `npx tsc --noEmit` clean.
- `npm run build` clean.

### Risk
Medium. The interaction matrix between MODE and PROFILE is the
break-point. Test matrix (codified in `profile-resolver.test.ts`):

| MODE | PROFILE | activeProfile | expected mode | expected source |
|------|---------|---------------|---------------|-----------------|
| (unset) | (unset) | (unset) | legacy (default) | `default` |
| `legacy` | (unset) | (unset) | legacy | `env-mode` |
| `dynamic` | (unset) | (unset) | dynamic | `env-mode` |
| (unset) | `coding` | (unset) | dynamic (from coding) | `env-profile` |
| `legacy` | `coding` | (unset) | **legacy + warn** (MODE wins) | `env-mode` |
| `dynamic` | `coding` | (unset) | **dynamic + warn** (MODE wins, mode unchanged) | `env-mode` |
| (unset) | (unset) | `coding` | dynamic (from coding) | `config-active` |
| (unset) | `unknownName` | (unset) | legacy (default fallback + error) | `default` |

---

## 7. (DEFERRED) Sprint 1.2 — Cursor pagination

Pre-staged design lives here so the next session can pick up cleanly.

- `EVOKORE_TOOLS_LIST_PAGE_SIZE` env var — **default 35** (panel B fix:
  Cursor IDE caps at 40, default 35 keeps headroom)
- Cursor: `Buffer.from(JSON.stringify({offset, version}), 'utf8').toString('base64')`
  where `version` is a hash of the projected tool-name list
- Non-paging clients receive only page 1 — document this **explicitly**
  as deliberate truncation strategy with a stderr warning when the first
  call returns `nextCursor` and the client never pages
- Acceptance: round-trip cursor; cursor invalidation on
  `tools/list_changed`; opt-out env `EVOKORE_TOOLS_LIST_PAGE_SIZE=0`

---

## 8. (DEFERRED) Sprint 1.3 — Determinism + Fuse pin

Pre-staged design lives here.

- Replace Fuse-only ranking in `ToolCatalogIndex.discover()` with
  three-stage ordering: alias/exact > prefix > Fuse fallback
- Pin Fuse exact version in `package.json` (drop `^`)
- Determinism unit test: 100-run check for fixed query ordering
- **Important caveat (panel B-DA):** the `default` profile's "byte-
  identical to legacy" guarantee from Sprint 1.1 must be re-verified
  after Sprint 1.3 because ranking changes can leak through
  `discover_tools` results even in legacy mode. Add a snapshot test that
  captures both `tools/list` and `discover_tools("read_file")` output
  before and after Sprint 1.3.

---

## 9. (DEFERRED) Sprint 1.4 — Profile presets + deprecation shim + tests + benchmark

Pre-staged design lives here.

- Ship `coding`, `research`, `voice` profiles as additions to the
  default `mcp.config.json`
- Add `legacy-full` + `legacy-dynamic` synthetic profiles for the
  deprecation shim
- Extend `scripts/benchmark-tool-discovery.js` to emit token counts
  per profile
- **Use a real tokenizer** (panel B fix): wire in `tiktoken` (the
  actively maintained OpenAI port) or `js-tiktoken` (pure-JS, ~2 MB,
  noted as the working option in
  `docs/research/ecc-cascade-feasibility-panel-2026-03-30.md`) for
  accurate counting; do NOT use char/4 estimates for budget enforcement.
  Note: the older `@dqbd/tiktoken` package is deprecated — its README
  redirects users to `js-tiktoken`, so do not pin a new dependency on
  it. If a real tokenizer is impractical, label all budget claims as
  "approximate" and reduce them by 30 %.
- `EVOKORE_TOOL_DISCOVERY_MODE` deprecation timeline documented in
  `docs/TOOL_DISCOVERY_PROFILES.md`
- `CLAUDE.md` runtime additions section: 3-line summary linking to the
  full doc

### Acceptance budgets (approximate, char/4 estimate; refine with real tokenizer)
- `coding` profile initial `tools/list` ≤ ~8K tokens
- `research` profile ≤ ~5K tokens
- `voice` profile ≤ ~3K tokens
- `default` profile = current `legacy` mode (no token regression)

---

## 10. Deferred work — handoff for next session

### Sprint 1.2 / 1.3 / 1.4 — finish Sprint 1
Per §7–§9 above. Order: 1.2 → 1.3 → 1.4. Each in its own PR. Estimated
1–2 dev-days total once Phase 0 + Sprint 1.1 are merged.

### Sprint 2 — Auto-derived skill composition graph

**Why deferred:** the panel called the original "hand-edit `composes`
frontmatter on 170+ skills" approach a context-rot trap. The replacement
(static analyzer + injection-table parser + cycle detection +
`nextSteps[]` runtime activation + 7-mandatory-injection-point
allowlist) is its own 5–8 day sprint and would explode this PR chain.

**Sprint 2.0 — code-refinement blocker — RESOLVED.** Panel D's original
finding was that `SKILLS/ORCHESTRATION FRAMEWORK/panel-of-experts/panels/code-refinement.md`
exists only as a panel definition and that the
`pr-manager → security-review → code-refinement` chain in prose was
aspirational. Sprint 2.0 verified that the panel definition is itself a
loadable skill (frontmatter `name: panel-code-refinement`, indexed by
`SkillManager.loadSkills()`), that neither `pr-manager` nor
`security-review` skill bodies ever invoked code-refinement, and that
the imagined chain only existed in three planning docs from the
overnight orchestrator run. Resolution: option (b) — remove the
dangling references. See
[`docs/decisions/2026-04-26-code-refinement-blocker.md`](../decisions/2026-04-26-code-refinement-blocker.md).

**What to pick up:**
- Build `scripts/derive-skill-composition.js` — locates the injection
  table inside
  `SKILLS/ORCHESTRATION FRAMEWORK/panel-of-experts/SKILL.md` by
  searching for the section header (e.g. an `## Injection Points`
  / `### Mandatory Injection Points` markdown heading) rather than
  hard-coded line numbers, since SKILL.md is edited frequently and
  line offsets drift. Then statically scans all `SKILLS/**/SKILL.md`
  files for `invoke .*-skill|run .*panel` references, emits a
  `skill-graph.json` artifact at build time. (For an even more
  durable contract, add a structured frontmatter or HTML-comment
  marker — e.g. `<!-- @AI:NAV(SEC:injection-points) -->` — when this
  feature is implemented and parse against the marker.)
- Extend `execute_skill` in `src/SkillManager.ts` to read
  `skill-graph.json` and return `nextSteps: [{skill, reason}]` in its
  payload.
- Server-side: when `nextSteps[]` is non-empty, auto-activate the
  referenced tools in the session's activation set and emit one
  `sendToolListChanged()`.
- Cycle detection + max depth = 5; explicit `transitiveCloseExpand`
  allowlist for `release-readiness`, `repo-ingestor`, `docs-architect`,
  `orch-review`, `orch-plan`, `tool-governance`, `orch-refactor`.
- Hot-reload: `refresh_skills` invalidates `skill-graph.json` and
  re-emits `tools/list_changed`.
- Force the 7 mandatory injection-point downstream skills into every
  default profile's `alwaysVisibleTools`.

### Sprint 3 — Schema-deferred tools/list

**Why deferred:** highest-leverage technique per peer scan (96–100×
reduction in benchmarks) but requires a client-compat matrix first
(Claude Code, Cursor, Continue, Cline). That research shouldn't share a
PR with the tiering work.

**What to pick up:**
- Add `EVOKORE_TOOL_SCHEMA_MODE=full|deferred`. In `deferred`,
  `tools/list` returns `{name, 1-line description, _meta: { schema_deferred: true }}`
  with no `inputSchema`.
- Add `describe_tool` native tool — `{ tools: string[] } → { schemas: Tool[] }`.
- Compat probe: log when a client invokes a tool without first calling
  `describe_tool`. After 1 minute, if no client has called
  `describe_tool` once, fall back to `full` mode and emit a stderr
  warning.
- Document the new flag and fallback behavior in
  `docs/TOOL_DISCOVERY_PROFILES.md`.

### Parked — Cloudflare-style "Code Mode" tier-0
Devil's Advocate (Vasquez) noted Code Mode's 1K-token unicorn requires
uniform typed SDKs. Our 76 heterogeneous proxy tools don't share a
schema family. Revisit only if Sprint 3's deferral benchmark is
insufficient.

---

## 11. Multi-agent orchestration playbook

### Concurrency model — REVISED

- Each PR runs in its **own worktree** under `.claude/worktrees/agent-*`,
  branched from the canonical `main` (or, for PR 3, branched from PR 1's
  branch with an explicit "rebase before merge" note in the PR body).
- **Hard limit: 3 PRs total in the autonomous overnight run** (panel
  C-A fix). PRs 4+ are deferred to the next session, no exceptions.
- Independent **research / audit** agents may run in parallel with an
  active implementation agent, but they do not touch source files.

### Per-PR agent contract

Every implementation agent receives a self-contained brief structured
as:

```
ROLE: implementer for <PR title>
WORKTREE: .claude/worktrees/<unique-name>
BRANCH: <branch name>
BASE: <origin/main | other branch>
PLAN SOURCE: docs/plans/tool-discovery-tiering-2026-04-26.md
SCOPE LIMIT: only the files listed in §<phase number>
EXIT CRITERIA:
  1. <bulleted acceptance from §<phase>>
  2. npx vitest run <relevant test files only> passes
  3. npx tsc --noEmit passes
  4. npm run build passes
  5. branch pushed to origin
  6. PR opened against main with the body template in §12
DO NOT:
  - touch files outside SCOPE LIMIT
  - run npm install except where the plan calls for it
  - merge the PR
  - delete branches
  - amend or force-push
RETURN:
  - PR URL
  - any deviation from the plan with rationale
```

### Iterative air-check loop — REVISED (panel A fix)

After every implementation agent returns, the orchestrator (this
session) runs a verify pass before opening the PR:

1. `git status --short` in the agent's worktree — confirm only the
   expected files changed
2. `git diff origin/main...HEAD` — read the diff and sanity-check
3. `npx vitest run <scoped paths>` — only the relevant test paths plus
   the test files the agent wrote (full suite at sprint-end, not per
   PR; full vitest takes minutes on Windows and would consume the
   overnight budget)
4. `npx tsc --noEmit` — type check
5. `npm run build` — full TypeScript compile to `dist/` (CI runs this;
   skipping it makes the PR red on push)
6. **GitHub Actions quota check** — `gh api /repos/:owner/:repo/actions/billing/usage`
   or fallback to a no-op note. If quota is < 200 minutes remaining,
   stop the sprint and write the deferred work to next-session.md
7. If any check fails: send the agent back with the specific failure;
   do not open the PR

### Handoff trigger — CONCRETE (panel C fix)

The orchestrator stops opening new PRs when **any** of:
- 3 PRs have been opened in this autonomous run
- A check in the air-check loop fails twice on the same PR
- GitHub Actions quota is below 200 minutes
- More than 90 minutes have elapsed in the orchestrator's wall-clock
  since the run started

When the trigger fires, the orchestrator **must** complete:
- `docs/handoffs/2026-04-26-overnight.md` capturing PR URLs, statuses,
  deviations, blocked items, and the exact resume instructions
- A final `next-session.md` update reflecting all open PRs + deferred
  work
- A summary message to the user (if active)

### Damage-control awareness
Project-specific gotchas (from `CLAUDE.md`) the orchestrator must
respect:

- `.env.example` paths trigger damage-control false positives — use
  `git add -A` or stage other files first
- `git commit -m` with complex strings can misfire — use
  `.commit-msg.txt` with `git commit -F`
- PR bodies mentioning `.env` should use `gh pr create --body-file <file>`
- `.claude/settings.json` BOM byte-order mark on Windows breaks Linux
  CI — use the `Write` tool to create / overwrite, never PowerShell
  `Out-File`
- `git worktree remove` after each PR ships if the worktree is no
  longer needed

---

## 12. PR body template

Every PR uses this body, filled in from §4 / §5 / §6 acceptance:

```markdown
## Description
<one-paragraph what + why>

Part of the **Tool Discovery Tiering** sprint
(`docs/plans/tool-discovery-tiering-2026-04-26.md`).

## Type of Change
- [x] <Bug fix | New feature | Refactor | Docs>

## Testing
- `npx vitest run <scoped paths>` — passes locally
- `npx tsc --noEmit` — clean
- `npm run build` — clean
- <phase-specific tests>

## Evidence
<paste of test runner summary>

## Plan checkpoint
This PR is **PR <N>** in the overnight autonomous run.
Previous: PR <N-1> (`<status>`). Next session picks up at: <Sprint name>.

## Deferred
<Sprint 1.2/1.3/1.4 link — handoff in docs/handoffs/2026-04-26-overnight.md>
```

---

## 13. Acceptance criteria for "overnight run done"

The autonomous run is **done** when:

1. PR 1 (Phase 0) is open against `main`, ready-for-review, CI-clean
   locally.
2. PR 2 (docs) is open against `main`, ready-for-review.
3. PR 3 (Sprint 1.1) is open against `main`, in draft, with body
   explaining the rebase dependency on PR 1.
4. `docs/handoffs/2026-04-26-overnight.md` is written and committed in
   PR 2, listing all PR URLs, deferred work, and morning resume
   instructions.
5. `next-session.md` is updated in PR 2 with the new priority queue and
   preserves all existing content.

---

## 14. Out-of-scope guardrails

- `MemoryManager`, `WorkerManager`, `OrchestrationRuntime` — unrelated
- `WebhookManager`, `OAuthProvider` — unrelated
- VoiceSidecar — unrelated
- The four still-open security / reliability tracks in the previous
  `next-session.md` queue. They remain priorities AFTER this sprint
  ships.
- npm publish gating — operator action, not Claude Code's

---

## 15. Rollback plan

Phase 0 (PR 1) is independently revertable. Sprint 1.1 (PR 3) depends
on PR 1 being merged but is itself revertable; the `default` profile
preserves byte-identical legacy behavior, so any client unhappy with
the new system can:
- Set `EVOKORE_TOOL_DISCOVERY_MODE=legacy` (safety pin overrides
  everything per §6) — exact match to today's behavior
- OR remove the `profiles` block from `mcp.config.json` and unset
  `activeProfile` — `default` profile loads automatically

The plan PR (PR 2) is docs-only and has no rollback risk beyond a
`git revert` of the file additions.

---

## 16. Worst-case wake-up scenario (panel C-Vega framing)

What does the operator see when they wake up?

**Best case (everything works):**
- 3 PRs open against `main`. Two ready-for-review, one draft.
- Local CI clean, GitHub Actions running.
- `docs/handoffs/2026-04-26-overnight.md` summarizes status with merge
  order and rebase notes.
- `next-session.md` reflects new priority queue.

**Likely case (one PR fails air-check):**
- Plan + Phase 0 PRs open. Sprint 1.1 deferred to next session.
- Handoff doc explains why; resume command included.

**Worst case (orchestrator hits context limit early):**
- Plan PR open (only docs were written before context pressure).
- Phase 0 + Sprint 1.1 deferred to next session.
- Handoff doc explains, points to plan.
- The bug remains unfixed for one more day. Operator is not surprised
  because the handoff doc is honest about what shipped.

The plan does **not** allow an unbounded run. The 3-PR cap, 90-minute
wall-clock cap, quota-check abort, and air-check failure abort are all
enforced.
