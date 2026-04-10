# Phase Acceptance Criteria Template

**Usage:** Copy this template when creating a new phase document. Fill in all sections. Use AC-N.M IDs so later review docs can reference specific criteria.

---

# Phase N: <Name>

**Created:** YYYY-MM-DD
**Status:** Draft | In-Progress | Complete
**Type:** Feature | Bugfix | Docs | Research Spike | Refactor

---

## Scope

<One-paragraph description of what this phase delivers and why.>

---

## In Scope

- <Bullet: specific file or behavior delivered>
- <Bullet: specific test or validation added>
- <Bullet: specific doc updated or created>

---

## Non-Goals (explicitly out of scope)

- <Bullet: what this phase does NOT do — prevents scope creep>
- <Bullet: follow-up items explicitly deferred>

---

## Acceptance Criteria

| # | Criterion | Verification | Owner |
|---|---|---|---|
| AC-N.1 | <Testable, falsifiable claim> | `npx vitest run tests/.../foo.test.ts` or `grep` command or manual check | Implementer |
| AC-N.2 | <Another criterion> | <How to verify> | Implementer |
| AC-N.3 | `npm run build` produces zero TypeScript errors | `npm run build` | Implementer |
| AC-N.4 | Full test suite passes | `npx vitest run` -> 0 failed | Implementer |
| AC-N.5 | CLAUDE.md updated if new env vars or counts changed | Manual review of CLAUDE.md diff | Reviewer |

### Criteria guidance
- Write criteria so any engineer can determine pass/fail in < 5 minutes without ambiguity.
- For code changes: include at least one criterion per source file modified.
- For docs-only phases: include a criterion that verifies no broken links or stale references.
- For spike phases: include a kill criterion (when to abandon, see below).

---

## Dependencies

- **Requires:** Phase N-1 (or specific PR number)
- **Blocks:** Phase N+1

---

## Kill Criteria (for research spikes only)

If this is a time-boxed spike, define the condition that causes it to be abandoned:

- Abandon if: <measurable outcome indicating approach is infeasible>
- Fallback plan: <what to do instead>

---

## PR Slicing

1. **PR N.1** — <subset of scope, e.g. "core manager + unit tests">
2. **PR N.2** — <next subset, e.g. "integration tests + CLAUDE.md update">

---

## Post-Phase Review

After all PRs merge, create `docs/research/<phase-name>-post-review-YYYY-MM-DD.md` using:

| # | Criterion | Status | Notes |
|---|---|---|---|
| AC-N.1 | <criterion text> | Pass / Fail / Partial | |
| ... | | | |

---

## Example: Well-formed criterion vs. weak criterion

| Weak (avoid) | Strong (use) |
|---|---|
| "Session isolation works" | "AC-X.1: Two concurrent HTTP sessions each see independent `activatedTools` sets — verified by `tests/integration/session-isolation.test.ts`" |
| "Update docs" | "AC-X.2: CLAUDE.md native tool count reflects the new total — verified by grep for the count digit" |
| "Tests pass" | "AC-X.3: `npx vitest run tests/integration/nav-anchor-tools.test.ts` returns 0 failed" |
| "Performance is improved" | "AC-X.4: `getEntries(100, 0)` on a 5 MB audit log completes in < 100ms — verified by benchmark in the PR description" |
