# `.claude/agents/` Triage — 2026-04-24

**Context:** Week-1 audit remediation, issue [#282](https://github.com/mattmre/EVOKORE-MCP/issues/282) item #12. The user's Claude Code setup has 9 agent definitions at `~/.claude/agents/*.md` — all dated 2026-01-09 and all hardcoded to `model: opus`. The audit flagged them as likely degraded against the current model lineup (Theme D).

> **Scope note:** These agent files live at `C:/Users/mattm/.claude/agents/` (user home), not at `.claude/agents/` inside this repo. The EVOKORE-MCP repo has never contained a `.claude/agents/` directory (confirmed via `git log --all --name-only`). Moving or deleting files in the user's home directory is outside the scope of a repo PR and is a user decision. This document records the in-repo reference audit so the user can make an informed call.

## Per-agent repo-reference audit

Search method: `grep` across the whole EVOKORE-MCP working tree (excluding `.claude/worktrees/` which mirrors main) for (a) `subagent_type: '<name>'` literals, (b) `@<name>` mentions, (c) `<name>.md` filename references. Plain-English occurrences of the noun (e.g. "the architect decided") were excluded.

| Agent | File | In-repo references | Verdict |
|---|---|---|---|
| `architect` | `~/.claude/agents/architect.md` | 0 | Unreferenced |
| `debugger` | `~/.claude/agents/debugger.md` | 0 | Unreferenced |
| `documentation` | `~/.claude/agents/documentation.md` | 0 | Unreferenced |
| `implementer` | `~/.claude/agents/implementer.md` | **2** (in `tests/integration/hook-migration-wave2.test.ts` lines 329, 340 — hard-coded `subagent_type: 'implementer'`) | **Referenced** — needs user decision on model refresh |
| `orchestrator` | `~/.claude/agents/orchestrator.md` | 0 | Unreferenced |
| `refactorer` | `~/.claude/agents/refactorer.md` | 0 | Unreferenced |
| `researcher` | `~/.claude/agents/researcher.md` | 0 | Unreferenced |
| `reviewer` | `~/.claude/agents/reviewer.md` | 0 | Unreferenced |
| `tester` | `~/.claude/agents/tester.md` | 0 | Unreferenced |

## Agents still referenced — needs user decision on model refresh

- **`implementer`** — referenced by `tests/integration/hook-migration-wave2.test.ts` via `subagent_type: 'implementer'`. The test asserts the hook migration system correctly preserves the subagent type field; it does not invoke the agent, but the string *name* is load-bearing for the test. The user should decide whether to refresh `implementer.md`'s `model: opus` (from 2026-01-09) against the current model lineup.

## Recommendation for unreferenced agents (8 of 9)

If the user confirms these are truly unused in their day-to-day Claude Code workflows (not just the EVOKORE-MCP repo), the safest action is:

```bash
mkdir -p ~/.claude/agents/_archive
mv ~/.claude/agents/{architect,debugger,documentation,orchestrator,refactorer,researcher,reviewer,tester}.md \
   ~/.claude/agents/_archive/
printf 'Archived 2026-04-24 per audit #282 item #12 — no references found in EVOKORE-MCP repo. Delete after 2026-06-01 if still unreferenced.\n' \
   > ~/.claude/agents/_archive/README.md
```

This is **not** done as part of PR #285 because:
1. The files are in the user's home directory, not in the repo.
2. Archiving affects every project on the machine, not just EVOKORE-MCP, and the repo-only audit cannot prove the agents are unused elsewhere.
3. Per the audit directive, `model:` fields and agent lifecycle are explicit user decisions.

## Related

- Audit doc: `docs/research/workflow-audit-2026-04-24.md` section 2, Theme D
- Tracking issue: [#282](https://github.com/mattmre/EVOKORE-MCP/issues/282)
- PR: [#285](https://github.com/mattmre/EVOKORE-MCP/pull/285)
