# Harness Initializer + Clean-State Protocol

## Initializer Checklist (with command examples)
1) Confirm repo state and location.
   - `git status -sb`
   - `pwd`
2) Load handoff context.
   - Read `STATUS.md`
   - Read `PLAN.md`
   - Read `TASKS.md`
3) Validate inputs and required files.
   - `rg --files`
   - `ls -la`
4) Capture baseline evidence.
   - `git diff --stat`
   - `rg -n "TODO|FIXME" -S .`

## Clean-State Protocol
### Reset (non-destructive)
- Record baseline status: `git status -sb`
- Capture diff before changes: `git diff --stat`
- Log current session files in session log.

### Rollback (only with approval)
- Revert a single file: `git checkout -- <file>`
- Revert staged changes: `git reset <file>`
- Avoid `git reset --hard` unless explicitly requested.

### Artifact Capture
- Update session log with commands + outputs.
- Link updated docs/files in the log.
- Record verification evidence.
