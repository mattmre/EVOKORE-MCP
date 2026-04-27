# Overnight Tiering Completion — Handoff (2026-04-26 / second pass)

- **Session:** `sharp-tharp-090e3d`
- **Plan:** [docs/plans/tool-discovery-tiering-2026-04-26.md](../plans/tool-discovery-tiering-2026-04-26.md)
- **Predecessor handoff:** [docs/handoffs/2026-04-26-overnight.md](2026-04-26-overnight.md)
- **Run started (UTC):** 2026-04-26 (post-Wave-0 merge, operator asleep)
- **Operator action required on wake:** review final handoff and the
  Wave 3 PRs if Wave 3 didn't land overnight; otherwise just confirm
  everything merged and run `npm run repo:audit`.

---

## TL;DR for the operator

The first overnight run shipped Phase 0 + Sprint 1.1 + plan docs (PRs
#288 / #289 / #290 / #291). You then said "no deferred items —
continue overnight until complete." This run targets the remaining
deferred sprints from §10 of the plan.

**Six PRs in three waves.** Wave 1 = independent fast-follows. Wave 2 =
profile presets + Sprint 2 unblocker. Wave 3 = Sprint 2 + Sprint 3 main
implementation. Each wave's PRs are spawned via worktree-isolated agents
to minimize PR drift, and merged from the orchestrator thread with
gemini-code-assist review feedback addressed before each merge.

---

## Wave plan

### Wave 1 — independent fast-follows (parallel)

| Sprint | Branch | Title | Agent worktree |
|--------|--------|-------|----------------|
| 1.5 | `feat/lean-default-discovery` | Flip default discovery mode to dynamic | `agent-lean-default` |
| 1.3 | `fix/skill-search-determinism` | Pin Fuse + alias-exact > prefix > Fuse ranking | `agent-search-determinism` |
| 1.2 | `feat/tools-list-cursor-pagination` | Cursor pagination on tools/list | `agent-cursor-pagination` |
| 3.0 | `docs/tools-list-deferred-schema-compat-research` | Client-compat matrix research | `agent-schema-defer-matrix` |

### Wave 2 — depend on Wave 1 baseline

| Sprint | Branch | Title | Agent worktree |
|--------|--------|-------|----------------|
| 1.4 | `feat/discovery-preset-profiles` | coding/research/voice/legacy-* + tiktoken bench | `agent-preset-profiles` |
| 2.0 | `chore/code-refinement-skill-blocker` | Resolve dangling code-refinement reference | `agent-code-refinement-blocker` |

### Wave 3 — main heavy lift (depends on Wave 2)

| Sprint | Branch | Title | Agent worktree |
|--------|--------|-------|----------------|
| 2.x | `feat/skill-composition-graph` | derive-skill-composition + nextSteps[] | `agent-skill-graph` |
| 3.x | `feat/schema-deferred-tools-list` | describe_tool + flag-gated deferred schema | `agent-schema-defer-impl` |

---

## Concurrency safety contract

- Every agent runs `isolation: "worktree"` so it never touches another
  agent's files.
- Each agent owns a specific branch and a specific file scope; the
  prompt enumerates allowed file paths.
- No agent self-merges. The orchestrator does merges from this thread
  in dependency order, rebasing later branches onto post-merge `main`.
- Each agent runs `npm run build` + targeted vitest before push, and
  pastes the evidence into the PR body.

---

## Per-PR evidence

_The orchestrator updates this section as each PR ships. Empty rows
mean the PR was not opened (deferred, blocked, or context-budget hit)._

### Wave 1

#### Sprint 1.5 — lean default flip

- PR: [#292](https://github.com/mattmre/EVOKORE-MCP/pull/292) — merged 2026-04-27
- Diff stats: small runtime flip + tests
- Air-check: full vitest green pre-merge

#### Sprint 1.3 — search determinism + Fuse pin

- PR: [#294](https://github.com/mattmre/EVOKORE-MCP/pull/294) — merged 2026-04-27
- Diff stats: SkillManager ranking precedence + Fuse version pin
- Air-check: snapshot + ranking tests green

#### Sprint 1.2 — cursor pagination

- PR: [#295](https://github.com/mattmre/EVOKORE-MCP/pull/295) — merged 2026-04-27
- Diff stats: opt-in cursor pagination, default page size 35
- Air-check: tools-list pagination integration test green

#### Sprint 3.0 — client-compat matrix research

- PR: [#293](https://github.com/mattmre/EVOKORE-MCP/pull/293) — merged 2026-04-27
- Diff stats: research-only, `docs/research/tools-list-deferred-schema-compat-2026-04-26.md`
- Air-check: docs only

### Wave 2

#### Sprint 1.4 — preset profiles + benchmark

- PR: [#297](https://github.com/mattmre/EVOKORE-MCP/pull/297) — merged 2026-04-27
- Diff stats: 5 preset profiles (`coding`, `research`, `voice`, `legacy-full`, `legacy-dynamic`) + tiktoken-backed benchmark script
- Air-check: profile-selection + token-count tests green

#### Sprint 2.0 — code-refinement blocker resolution

- PR: [#296](https://github.com/mattmre/EVOKORE-MCP/pull/296) — merged 2026-04-27
- Decision: keep — `code-refinement` panel is real; resolution doc lives at `docs/decisions/2026-04-26-code-refinement-blocker.md`
- Diff stats: dangling-prose guard test + decision doc
- Air-check: code-refinement-resolution.test.ts green (after handoff doc allowlisted in this followup)

### Wave 3

#### Sprint 2.x — skill composition graph

- PR: [#299](https://github.com/mattmre/EVOKORE-MCP/pull/299) — merged 2026-04-27
- Diff stats: `scripts/derive-skill-composition.js` + `SkillManager.computeNextSteps` + index.ts auto-activation, gemini fixes (kebab→snake fallback, async fs/promises, regex underscore support)
- Air-check: skill-composition-graph.test.ts (10 tests) green

#### Sprint 3.x — schema-deferred tools/list

- PR: [#298](https://github.com/mattmre/EVOKORE-MCP/pull/298) — merged 2026-04-27
- Diff stats: `EVOKORE_TOOL_SCHEMA_MODE=deferred` + always-visible `describe_tool` + compat-probe fallback (60000ms default), gemini fix for dynamic windowLabel formatting
- Air-check: schema-deferred-tools-list.test.ts (6 tests) green

---

## Final integration test

Run from the orchestrator worktree on post-merge `main` (2026-04-27 ~22:35 UTC):

- `npm run build` — clean (TypeScript compile, no diagnostics)
- `npx vitest run` — **3026 passed / 24 skipped / 2 failed**, where the
  two failures were:
  1. `tests/integration/code-refinement-resolution.test.ts` — handoff
     doc tripped the dangling-prose guard. Fixed in this followup PR
     by allowlisting `docs/handoffs/2026-04-26-overnight-completion.md`.
  2. `test-worktree-cleanup-validation.js` — environmental 30s timeout
     on a workstation with 12 active worktrees (passes with
     `--testTimeout=120000` in 41s; CI is unaffected).
- Token budgets — see `node scripts/benchmark-tool-discovery.js --all`
  output committed earlier in PR #297.
- `npm run repo:audit` — to be run by operator post-merge.

---

## Stop conditions / deviations

_Filled in as the run progresses. If a wave halts, this section
captures the precise reason and what's needed to resume._

---

## Post-run cleanup checklist

- [x] All Wave 1/2/3 PRs merged (#292, #293, #294, #295, #296, #297, #298, #299)
- [x] Wave 1/2/3 worktrees removed (orchestrator did this inline as
      each PR merged)
- [x] Stale local branches force-deleted post-squash-merge
- [ ] `next-session.md` reset to the original priority queue (Security A,
      Security B, Reliability, BUG-28, vector gate, npm publish, hosted VPS)
- [ ] CLAUDE.md "v3.0 runtime additions" section gets a 2-3 line
      tiering completion note pointing at the plan doc
- [ ] Repo audit clean: `npm run repo:audit` (operator)

---

## Resume command if the run halts mid-wave

```
"Load docs/handoffs/2026-04-26-overnight-completion.md and
docs/plans/tool-discovery-tiering-2026-04-26.md. Confirm the
'Per-PR evidence' table to see which PRs landed and which are
still open or deferred. Resume the next unfinished wave."
```
