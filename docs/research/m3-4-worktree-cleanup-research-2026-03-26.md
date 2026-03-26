# M3.4 Stale Worktree Cleanup Automation - Research

**Date:** 2026-03-26
**Milestone:** M3 - Developer Tooling
**Status:** Implementation

## Problem Statement

Agent worktrees accumulate over time as orchestrated sessions create disposable
worktrees that are not always cleaned up after task completion. Manual cleanup
via `git worktree list` and `git worktree remove` is tedious and error-prone.
The project has previously found 9+ abandoned worktrees requiring manual
intervention.

## Staleness Criteria

A worktree is considered stale if it matches any of the following conditions:

1. **Prunable** - Git itself reports the worktree as prunable (e.g., the
   directory no longer exists on disk).
2. **Branch gone upstream** - The worktree's branch has an upstream that no
   longer exists (`[gone]` in tracking info).
3. **Branch merged into main** - The worktree's branch is an ancestor of
   `origin/main` (already landed).
4. **Detached HEAD + old** - The worktree is in detached HEAD state and the
   commit is older than the age threshold.
5. **Aged** - The branch's latest commit is older than the age threshold
   (default: 7 days).

## Safety Checks

Before removing any worktree, the script verifies:

1. **Root worktree** - Never remove the root worktree (always skipped).
2. **Uncommitted changes** - `git -C <path> status --porcelain` is non-empty.
   Blocked unless `--force` is specified.
3. **Unpushed commits** - `git -C <path> log @{upstream}..HEAD --oneline` shows
   commits not yet pushed. Best-effort check (may fail for detached HEADs).
4. **Active sessions** - Checks `~/.evokore/sessions/` for session manifests
   whose `workspaceRoot` matches the worktree path.
5. **Open pull requests** - `gh pr list --head <branch>` shows open PRs for
   the branch. Best-effort (skipped if `gh` is unavailable).
6. **Lock files** - Checks for `.git/index.lock` or similar lock files in the
   worktree path.

## Design Decisions

- **Default dry-run** - Running without `--apply` shows what would be cleaned
  but performs no destructive operations. This is critical for safety.
- **Age threshold configurable** - `--max-age N` overrides the default 7-day
  threshold.
- **JSONL audit log** - Each action is logged to
  `~/.evokore/logs/worktree-cleanup.jsonl` for post-hoc review.
- **Reuses repo-state-audit helpers** - `parseWorktreePorcelain()` and
  `runCommand()`/`runCommandBestEffort()` are imported from
  `scripts/repo-state-audit.js` to avoid duplication.
- **No hook integration** - The script is standalone only. Hooks should never
  perform cleanup to avoid surprising side effects during normal sessions.
- **Force flag** - `--force` allows removal of worktrees with uncommitted
  changes (still skips root).

## CLI Interface

```
node scripts/worktree-cleanup.js [options]

Options:
  --dry-run     Show what would be cleaned (default)
  --apply       Actually perform cleanup
  --force       Also remove worktrees with uncommitted changes
  --max-age N   Override age threshold in days (default: 7)
  --json        Machine-readable output
```

## Output Schema (JSON mode)

```json
{
  "worktrees": [...],
  "stale": [...],
  "actions": [...],
  "summary": {
    "total": 5,
    "stale": 3,
    "removed": 2,
    "skipped": 1,
    "errors": 0,
    "dryRun": true
  }
}
```

## npm Scripts

```json
"worktree:cleanup": "node scripts/worktree-cleanup.js --dry-run",
"worktree:cleanup:apply": "node scripts/worktree-cleanup.js --apply"
```

## References

- `scripts/repo-state-audit.js` - Reusable git porcelain parsers
- `scripts/log-rotation.js` - Shared log rotation utilities
- CLAUDE.md "Git Worktree Cleanup" learning
- CLAUDE.md "Squash Merge Branch Cleanup" learning
