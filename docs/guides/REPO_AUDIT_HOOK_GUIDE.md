# Repo Audit Hook Guide

The Repo Audit Hook is an optional Claude Code hook that runs at session startup and warns about branch drift, stale worktrees, and control-plane drift. It helps operators stay aware of repo hygiene issues before they cause problems during a session.

## Overview

- **Hook type:** `UserPromptSubmit` (runs when the user submits a prompt)
- **Entrypoint:** `scripts/hooks/repo-audit-hook.js`
- **Runtime:** `scripts/repo-audit-hook-runtime.js`
- **Audit engine:** `scripts/repo-state-audit.js`
- **Default state:** Disabled (opt-in only)
- **Frequency:** Runs once per session (marker file prevents re-runs)

## How to Enable

Set the environment variable before starting Claude Code:

```bash
# In your .env file or shell profile
export EVOKORE_REPO_AUDIT_HOOK=true
```

Or in a `.env` file at the project root:

```
EVOKORE_REPO_AUDIT_HOOK=true
```

When the variable is not set or set to anything other than `true`, the hook exits immediately without running any audit.

## What It Checks

The hook calls `collectAudit()` from `scripts/repo-state-audit.js` and inspects these areas:

### 1. Branch Divergence from Main

Detects when the current branch is behind `origin/main`.

```
Branch is 3 commit(s) behind main.
```

### 2. Stale Local Branches

Identifies local branches whose upstream is gone or that are already merged into `origin/main`.

```
2 stale local branch(es) found.
```

### 3. Control-Plane Drift

Checks for uncommitted changes to handoff files like `CLAUDE.md`, `next-session.md`, `task_plan.md`, `findings.md`, `progress.md`, and files under `docs/session-logs/`.

```
3 control-plane file(s) have local drift.
```

### 4. Active Worktrees

Reports when multiple worktrees are active (which may indicate abandoned agent worktrees).

```
4 worktrees active.
```

## Output Format

When warnings are found, the hook injects them into the session as `additionalContext`:

```json
{
  "additionalContext": "[EVOKORE Repo Audit] Branch is 2 commit(s) behind main. 3 stale local branch(es) found."
}
```

This context is visible to the AI at the start of the session, helping it understand the repo state before making changes.

When no warnings are found, the hook exits silently (no output, no context injection).

## Session Marker

The hook writes a marker file to prevent re-running on subsequent prompts in the same session:

```
~/.evokore/sessions/{sessionId}-audit-done
```

This file contains the timestamp of when the audit ran. It is created even when no warnings are found.

## Sample Output

### Clean repo state

No output (hook exits silently).

### Repo with issues

The AI sees this injected context at session start:

```
[EVOKORE Repo Audit] Branch is 5 commit(s) behind main. 2 stale local branch(es) found. 1 control-plane file(s) have local drift. 3 worktrees active.
```

## Standalone Audit

The audit engine can also be run directly from the command line:

```bash
# Human-readable output
node scripts/repo-state-audit.js

# JSON output (for scripting)
node scripts/repo-state-audit.js --json

# Via npm script
npm run repo:audit
```

### Standalone Output Example

```
EVOKORE Repo State Audit
Repo root: D:\GITHUB\EVOKORE-MCP
Current branch: feat/my-feature (behind main 2, ahead 5)
Worktrees: 3
Open PRs: 2
Control-plane drift: none
Stale local branch candidates:
- old-feature (upstream gone)
- merged-branch (merged into origin/main)
Merged remote branch candidates: none
Warnings:
- Current branch "feat/my-feature" is behind main by 2 commit(s).
- Found 2 stale local branch candidate(s).
```

### JSON Output Shape

```json
{
  "repoRoot": "D:\\GITHUB\\EVOKORE-MCP",
  "currentBranch": "feat/my-feature",
  "currentHead": "abc1234",
  "mainHead": "def5678",
  "divergenceFromMain": { "behind": 2, "ahead": 5 },
  "worktrees": [...],
  "staleLocalBranches": [...],
  "controlPlane": { "modified": [], "untracked": [] },
  "openPullRequests": { "available": true, "items": [...] },
  "staleRemoteBranches": [...],
  "warnings": [...]
}
```

## Integration with Session Startup

The hook fits into the EVOKORE session lifecycle:

1. User submits first prompt in Claude Code
2. **Purpose Gate** hook asks for session intent
3. **Repo Audit** hook (if enabled) checks repo state and injects warnings
4. Session proceeds with the AI aware of any repo hygiene issues

Both hooks run on `UserPromptSubmit`. The audit hook is designed to be non-blocking -- all error paths exit with code 0 and produce no output, so a failure in the audit never prevents the session from starting.

## Fail-Safe Design

- The hook loads via `fail-safe-loader.js`, so a missing or broken runtime module does not crash Claude Code.
- All code paths are wrapped in try/catch with silent fallback.
- The `EVOKORE_REPO_AUDIT_HOOK=true` gate ensures the hook only runs when explicitly opted in.
- If `git` commands fail (e.g., not in a git repo), the hook exits silently.

## Troubleshooting

### Hook not running

- Verify `EVOKORE_REPO_AUDIT_HOOK=true` is in your environment.
- Check that `.claude/settings.json` includes the hook in its `UserPromptSubmit` hooks list.
- The hook only runs once per session. Delete the marker file to re-trigger: `rm ~/.evokore/sessions/{sessionId}-audit-done`

### Warnings seem stale

- The audit runs at session start only. Changes made during the session are not re-checked.
- Run `node scripts/repo-state-audit.js` manually for a fresh audit.

### Hook errors

- Check `~/.evokore/logs/` for any hook error logs.
- The hook is designed to fail silently, so errors typically result in no output rather than error messages.

## Validation Test

```bash
npx vitest run test-repo-audit-hook-validation
```
