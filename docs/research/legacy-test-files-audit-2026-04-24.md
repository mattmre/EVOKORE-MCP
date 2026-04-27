# Root-level `test-*.js` Files — Audit Note, 2026-04-24

**Context:** Week-1 audit remediation, issue [#282](https://github.com/mattmre/EVOKORE-MCP/issues/282) item #11. The audit doc (`docs/research/workflow-audit-2026-04-24.md` section 2, Theme E) stated:

> "60+ root-level `test-*.js` files predate vitest migration"

and prescribed `git rm test-*.js` at the repo root as a cleanup.

## Finding: the premise is wrong — these ARE the vitest suite

Before deleting anything, this implementer ran the prescribed safety checks:

1. **`vitest.config.ts` include pattern** (line 5):

   ```ts
   include: ['test-*.{js,ts}', 'e2e-test.js', 'hook-test-suite.js', 'hook-e2e-validation.js', 'tests/**/*.test.{js,ts}'],
   ```

   The **first entry** in the include glob is `test-*.{js,ts}` at the repo root. Every one of the 75 `test-*.js` files at the root is picked up by `npm test` via this pattern.

2. **Content shape of every file.** A spot-check across the 75 files, plus `grep -L "test(\|describe(\|it("` returning zero hits, confirms every file uses vitest's `test()` / `describe()` / `it()` globals. They are first-class vitest specs, not legacy Node scripts.

3. **`package.json` direct references.** Four scripts reference specific root-level test files by name:
   - `docs:check` → `test-docs-canonical-links.js`, `test-ops-docs-validation.js`
   - `test:voice:live` → `test-voice-sidecar-live-validation.js`
   - `release:check` → `test-npm-release-flow-validation.js`, `test-release-doc-freshness-validation.js`

4. **`.github/workflows/ci.yml`** line 139 directly invokes `test-windows-exec-validation.js` via `npx vitest run`.

## Decision: SKIP deletion

Per the audit directive's own safety clause —

> "Confirm none are referenced by `package.json` scripts, `vitest.config.*`, any `.github/workflows/*.yml`, or `tsconfig*.json`. Use Grep. If clear: `git rm test-*.js`..."

— the files ARE referenced by both `vitest.config.ts` (as the primary test include) and `package.json` + `ci.yml` (as individually-named specs). Therefore the cleanup is **not** clear and must be skipped. `git rm test-*.js` would delete the active production test suite and break CI on the next run.

The audit doc's claim that these "predate vitest migration" appears to be inverted — the **tests** migrated to vitest; the **file naming convention** (`test-*.js` at repo root, single test per file) is the current convention, not the old one. No commit today deletes test files.

## Suggested follow-up (not done here)

If the goal is to clean up root-directory clutter rather than remove tests, a separate PR could:

1. Move `test-*.{js,ts}` into `tests/legacy-root/` or simply `tests/`.
2. Update `vitest.config.ts` include, `package.json` scripts, and the `ci.yml` path accordingly.
3. Batch-rename to the `*.test.{js,ts}` convention so they match the rest of `tests/**/*.test.{js,ts}`.

That's a ~300-line mechanical refactor with clear test-suite preservation semantics — appropriate for its own PR, not a Week-1 hygiene item.

## `.claude/worktrees/` sub-item

The same item #11 also prescribed deleting 9 stale `.claude/worktrees/`. Inspection via `git worktree list` shows:

```
D:/GITHUB/EVOKORE-MCP/.claude/worktrees/agent-a1eca534         [feat/plugin-manifest]
D:/GITHUB/EVOKORE-MCP/.claude/worktrees/agent-a5fd7f40         [fix/telemetry-flush-json]
D:/GITHUB/EVOKORE-MCP/.claude/worktrees/agent-a8100678         [feat/cicd]
D:/GITHUB/EVOKORE-MCP/.claude/worktrees/agent-a8307f4d         [feat/compliance-codemods]
D:/GITHUB/EVOKORE-MCP/.claude/worktrees/agent-acaefa52         [feat/skills-import-wave2]
D:/GITHUB/EVOKORE-MCP/.claude/worktrees/agent-adbf765c         [feat/skills-import-wave3]
D:/GITHUB/EVOKORE-MCP/.claude/worktrees/great-chatelet-02183b  [claude/great-chatelet-02183b]
D:/GITHUB/EVOKORE-MCP/.claude/worktrees/laughing-neumann       [claude/laughing-neumann]
D:/GITHUB/EVOKORE-MCP/.claude/worktrees/vigorous-meitner       [claude/vigorous-meitner]
```

All 9 are **live, registered git worktrees** tied to existing branches. Deleting them via `rm -rf` would corrupt `.git/worktrees/*` metadata and leave dangling refs. The correct cleanup tool is `git worktree remove <path>` or the repo's own `npm run worktree:cleanup:apply` (per `package.json` line 48) — not a raw `rm -rf`.

A tenth subdirectory, `.claude/worktrees/romantic-bhabha/`, is empty (no `.git` file inside) but its corresponding branch `claude/romantic-bhabha` still exists locally — so the worktree was presumably removed cleanly at some point and only the empty dir remains. It's the only candidate for deletion, but `.claude/worktrees/` is in `.gitignore` (shown as untracked in `git status`), so deleting an untracked empty directory via `rm -rf` produces zero PR-visible change and no "restored trust at clone time" benefit.

**Decision:** skip the worktree-deletion sub-item and escalate to user. The right follow-up is a separate task that invokes `git worktree remove` selectively after confirming with the user which agent worktrees are finished with.

## Related

- Audit doc: `docs/research/workflow-audit-2026-04-24.md` section 2, Theme E
- Tracking issue: [#282](https://github.com/mattmre/EVOKORE-MCP/issues/282)
- PR: [#285](https://github.com/mattmre/EVOKORE-MCP/pull/285)
