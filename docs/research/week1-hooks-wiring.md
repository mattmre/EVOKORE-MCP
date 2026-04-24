# Week-1 Hooks Wiring — `~/.claude/settings.json`

Companion to audit-2026-04-24 Week-1 items **#7** (read-before-edit) and **#8** (bash-throttle). The hooks ship in this repo under `scripts/hooks/`; the user activates them by wiring two `PreToolUse` (and one `PostToolUse`) entries into their **global** `~/.claude/settings.json`.

**Do NOT auto-apply.** Claude Code reads `~/.claude/settings.json` at session start; a malformed entry silently disables hooks for every session on every project. The user is the final approver.

---

## What to add to `~/.claude/settings.json`

Locate the `"hooks"` object (create it if absent) and merge the entries below.

```jsonc
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write|NotebookEdit|MultiEdit",
        "hooks": [
          { "type": "command", "command": "node D:/github/EVOKORE-MCP/scripts/hooks/read-before-edit.js" }
        ]
      },
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "node D:/github/EVOKORE-MCP/scripts/hooks/bash-throttle.js" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "node D:/github/EVOKORE-MCP/scripts/hooks/bash-throttle.js" }
        ]
      }
    ]
  }
}
```

Notes:
- The matcher strings are Claude Code's stock hook matchers.
- `bash-throttle` is wired into both `PreToolUse` (increments + decides) and `PostToolUse` (decrements). Without the `PostToolUse` entry the counter leaks and you'll eventually hit the cap with zero active calls.
- `read-before-edit` is `PreToolUse` only.

## What to verify

After saving `settings.json`:

1. **Claude Code reloads hooks at next session start** — open a fresh session; check `/hooks` to confirm both entries appear with no errors.
2. **Provoke a block** — in a new session, try `Edit` on a file you haven't `Read`. It should block with `READ-BEFORE-EDIT BLOCKED: file has not been read in this session`.
3. **Audit log** — after a few minutes of work, check `~/.claude/logs/hooks/<today>.jsonl`. You should see `{"hook":"read-before-edit",...}` and `{"hook":"bash-throttle",...}` entries. If nothing, the hook is not being invoked.

## Environment-variable overrides (per-session escape hatches)

Both hooks fail-open on unexpected errors. If you need to bypass them intentionally:

| Variable | Hook | Effect |
|---|---|---|
| `CLAUDE_HOOK_SKIP_READ_CHECK=1` | read-before-edit | All `Edit`/`Write` allowed without prior `Read` |
| `CLAUDE_HOOK_SKIP_BASH_THROTTLE=1` | bash-throttle | All `Bash` calls allowed, no limit |
| `CLAUDE_BASH_MAX_CONCURRENT=N` | bash-throttle | Change the cap from default `2` (set to `0` to disable) |

## Rollback

If either hook misbehaves and the override flags aren't enough:

1. Open `~/.claude/settings.json`
2. Remove the offending entry from `hooks.PreToolUse` (and the matching `PostToolUse` for bash-throttle)
3. Save. New sessions pick up the change immediately.

Do NOT delete or rename the script files in the repo as a rollback — the loader (`scripts/hooks/*.js`) fail-safe-wraps errors, but a missing loader path causes every gated tool call to stall on `ENOENT`.

## Under-weighted risk the audit panel flagged

From `docs/research/workflow-audit-2026-04-24.md` section 5, risk #2:

> **Hooks compound silently.** Build hook observability before adding hooks.

Both of these hooks write to two places:

- `~/.evokore/hooks.jsonl` (legacy global stream via `writeHookEvent`)
- `~/.claude/logs/hooks/YYYY-MM-DD.jsonl` (daily-rotated, per-decision, via `writeAuditHookEvent`)

The daily rotation is what `scripts/hooks/hook-stats.js` (or future `evokore-doctor`) will use to answer *"how many blocks in the last 24h, and on which files?"* **Review those logs before adding hook #3.** If `bash-throttle` is blocking healthy calls at >5/day, adjust `CLAUDE_BASH_MAX_CONCURRENT` rather than disabling the hook.

---

**Tracking issue:** [#282](https://github.com/mattmre/EVOKORE-MCP/issues/282).
**Report:** [`docs/research/workflow-audit-2026-04-24.md`](./workflow-audit-2026-04-24.md).
