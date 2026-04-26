# Overnight Autonomous Run — Handoff (2026-04-26)

- **Session:** `sharp-tharp-090e3d`
- **Plan:** [docs/plans/tool-discovery-tiering-2026-04-26.md](../plans/tool-discovery-tiering-2026-04-26.md)
- **Run started (UTC):** 2026-04-26 (operator asleep)
- **Run ended (UTC):** _filled in at sprint stop_
- **Operator action required:** review and merge PRs in the order below

---

## TL;DR for the operator

You went to sleep with a P0 sprint queued. The orchestrator (Claude
Code, session `sharp-tharp-090e3d`) ran autonomously overnight and
opened up to 3 PRs against `main`. **Nothing was self-merged.** Your
job in the morning is to:

1. Read the "PR status snapshot" table below
2. Review and merge in the listed order, rebasing as noted
3. Decide whether to greenlight the next session for the deferred work

---

## PR status snapshot

_The orchestrator updates this table as each PR ships. Empty rows mean
the PR was not opened (deferred, blocked, or context-budget hit)._

| Order | PR # | URL | Title | State | CI status | Notes |
|-------|------|-----|-------|-------|-----------|-------|
| 1 | 289 | https://github.com/mattmre/EVOKORE-MCP/pull/289 | fix(session): namespace stdio activation Map by per-instance id | open | pending | targeted vitest 35+79 passed locally; build clean |
| 2 | 288 | https://github.com/mattmre/EVOKORE-MCP/pull/288 | docs: tool discovery tiering phased plan + next-session sync | open | pending | docs-only; safe to merge anytime |
| 3 | _TBD_ | _TBD_ | feat(discovery): named profiles in mcp.config.json + ProfileResolver | _TBD_ | _TBD_ | _TBD_ |

---

## Recommended merge order

1. **PR 1 (Phase 0 fix)** — merge first. Pure session-isolation bug
   fix, no strategic dependency. Independently revertable.
2. **PR 2 (docs)** — merge anytime; docs only.
3. **PR 3 (Sprint 1.1 — feature)** — only after PR 1 lands. The branch
   was created from PR 1's branch. **Rebase onto post-PR-1 `main`
   before merging.** If GitHub's "Update branch" button is available,
   click it; otherwise:
   ```bash
   git fetch origin
   git checkout feat/discovery-profile-config
   git rebase origin/main
   git push --force-with-lease
   ```

---

## Air-check evidence

_The orchestrator pastes per-PR evidence here as each PR is verified.
At minimum: file diff stats, vitest scoped-run summary, tsc clean,
build clean._

### PR 1

- Opened: https://github.com/mattmre/EVOKORE-MCP/pull/289
- Branch: `fix/stdio-activation-singleton` (from `origin/main` @ `fdac565`)
- Diff stats: 3 files, 62 insertions, 6 deletions (commit `55ea376`)
- Files:
  - `src/index.ts` — drops shared `DEFAULT_SESSION_ID` literal, adds
    per-instance `defaultSessionId = stdio:${randomUUID()}`
  - `tests/integration/stdio-default-session-isolation.test.ts` (new)
  - `tests/integration/session-isolation-httpserver-wiring.test.ts`
    (regex updated to match `this.defaultSessionId`)
- Air-check:
  - `npx vitest run tests/integration/stdio-default-session-isolation.test.ts
    tests/integration/session-isolation-httpserver-wiring.test.ts`
    -> 35 passed
  - `npx vitest run tests/integration/rate-limiting-per-session.test.ts
    tests/integration/rbac-httpserver-per-session.test.ts
    tests/integration/rbac-session-gaps.test.ts
    tests/integration/session-counter-cleanup.test.ts`
    -> 79 passed
  - `npm run build` clean (tsc, no errors)

### PR 2

- Opened: https://github.com/mattmre/EVOKORE-MCP/pull/288
- Branch: `docs/tool-discovery-tiering-plan` (from `origin/main` @ `fdac565`)
- Diff stats: 3 files, 829 insertions, 5 deletions (commit `c38e731`)
- Files:
  - `docs/plans/tool-discovery-tiering-2026-04-26.md` (new)
  - `docs/handoffs/2026-04-26-overnight.md` (new — this file)
  - `next-session.md` (modified — existing content preserved)
- Air-check: docs-only, no test/build impact

### PR 3
_TBD — replaced when PR opens_

---

## Deviations from the plan

_Filled in if the orchestrator had to deviate from
`docs/plans/tool-discovery-tiering-2026-04-26.md` for any reason._

_TBD_

---

## Deferred to next session

In rank order of priority for the next session:

1. **Sprint 1.2 — Cursor pagination on `tools/list`**
   - Plan: §7 of `docs/plans/tool-discovery-tiering-2026-04-26.md`
   - Default page size: 35 (under Cursor IDE 40-tool cap)
   - Tests required: cursor round-trip, invalidation on
     `tools/list_changed`, opt-out env

2. **Sprint 1.3 — Determinism + Fuse pin**
   - Plan: §8
   - Replace Fuse-only ranking with `alias-exact > prefix > Fuse`
   - Pin Fuse version exact (drop `^`)
   - Snapshot test for `default` profile byte-identical to legacy

3. **Sprint 1.4 — Profile presets + deprecation shim + tests + benchmark**
   - Plan: §9
   - Add `coding`, `research`, `voice`, `legacy-full`, `legacy-dynamic`
     profiles
   - Use a real tokenizer (tiktoken / @dqbd/tiktoken) for budget
     enforcement, OR label budgets as approximate and reduce by 30 %

4. **Sprint 2 — Auto-derived skill composition graph**
   - Plan: §10
   - 5–8 day sprint, separate from tiering work
   - **Verified blocker:** `code-refinement` skill does not exist as
     an executable skill (only as a panel definition under
     `SKILLS/ORCHESTRATION FRAMEWORK/panel-of-experts/panels/code-refinement.md`).
     Sprint 2 must either build it or remove the dangling reference
     in `pr-manager`.

5. **Sprint 3 — Schema-deferred `tools/list`**
   - Plan: §10
   - Highest-leverage technique per peer scan (96–100× reduction in
     benchmarks). Requires client-compat matrix research first.

6. **Parked — Code Mode tier-0**
   - Research only; revisit if Sprint 3 deferral benchmark insufficient

After all of the above complete, return to the original
`next-session.md` queue (Security A, Security B, Reliability, BUG-28
test conversion, vector gate instrumentation, npm publish v3.1.0, and
the long-term hosted-VPS track).

---

## How to resume in the next session

```
"Load docs/plans/tool-discovery-tiering-2026-04-26.md and
docs/handoffs/2026-04-26-overnight.md. Confirm which PRs from the
overnight run merged. Then pick up at Sprint 1.2 (cursor pagination)
on a fresh branch from main. Plan §7 has the design."
```

If Sprint 1.1 (PR 3 in the overnight run) did NOT merge or was not
opened:

```
"Load docs/plans/tool-discovery-tiering-2026-04-26.md and
docs/handoffs/2026-04-26-overnight.md. The Sprint 1.1 work
(ProfileResolver + named profiles) was deferred from the overnight
run. Pick it up first per plan §6, then proceed to Sprint 1.2."
```

---

## Stop reasons

_Filled in by the orchestrator when the run ends. One of:_

- _Sprint complete (3/3 PRs opened, all checks green)_
- _Air-check failure quota reached (specific PR + failure)_
- _GitHub Actions quota below 200 minutes_
- _90-minute wall-clock cap_
- _Orchestrator context pressure_
- _Hard error / unrecoverable state — operator intervention required_

_TBD_
