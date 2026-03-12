# Use Cases and Walkthroughs

This guide turns the runtime contracts into practical operator flows.

## Walkthrough 1: Adopt a workflow from the skill library

Use this when you want EVOKORE to retrieve process guidance before the model starts acting.

### Goal

Find and adopt an existing workflow such as `session-wrap`.

### Steps

1. Ask the client to search skills:

   ```text
   Search the MCP for a workflow about session wrap-up and continuity.
   ```

2. EVOKORE uses `search_skills` and returns matching skills.
3. Ask for a specific skill:

   ```text
   Show me help for the session-wrap skill.
   ```

4. EVOKORE uses `get_skill_help` and returns the skill’s internal instructions.
5. For broader task matching, ask:

   ```text
   Resolve a workflow for wrapping this session, documenting open risks, and preparing the next handoff.
   ```

6. EVOKORE uses `resolve_workflow` and injects the top 1-3 relevant workflows directly into the tool response.

### Why this matters

- keeps the model grounded in repo-specific process
- reduces prompt drift
- makes handoff and governance behavior repeatable

## Walkthrough 2: Use a proxied tool that requires HITL approval

Use this when the tool is configured as `require_approval` in `permissions.yml`.

### Goal

Allow a protected proxied tool call such as `fs_write_file` or `github_create_issue`.

### Steps

1. Attempt the tool call normally.
2. EVOKORE intercepts it and returns an error-like tool response with `_evokore_approval_token`.
3. Read the message carefully and ask the human user for explicit approval.
4. Retry the **same tool call with the exact same arguments** plus the token.

### Contract reminders

- `_evokore_approval_token` is **one-time use**
- it is bound to the **exact same arguments**
- it is **short-lived**
- if the retry changes arguments or happens too late, request a fresh token by repeating the original call

### Example flow

Initial blocked call:

```text
Call fs_write_file with path=/repo/notes.md and content=...
```

Intercept response conceptually:

```text
ACTION REQUIRES HUMAN APPROVAL...
retry this exact same tool call with _evokore_approval_token=...
```

Approved retry:

```json
{
  "path": "/repo/notes.md",
  "content": "...",
  "_evokore_approval_token": "returned-token-here"
}
```

## Walkthrough 3: Use dynamic tool discovery during a focused session

Use this when you want a smaller initial tool list but still need proxied tools on demand.

### Goal

Start in `dynamic` mode and activate only the tools needed for the current task.

### Setup

```bash
EVOKORE_TOOL_DISCOVERY_MODE=dynamic
```

### Steps

1. Connect your MCP client.
2. Notice that `tools/list` initially shows the native EVOKORE tools.
3. Ask EVOKORE to find relevant tools:

   ```text
   Discover tools for reading files and comparing markdown changes.
   ```

4. EVOKORE runs `discover_tools`.
5. Matching proxied tools are activated for the current session.
6. Re-run `tools/list` if your client does not auto-refresh after `tools/list_changed`.

### Exact-name compatibility

Even if a proxied tool is not currently listed, you can still call it directly by exact prefixed name when you already know it exists.

Example:

```text
Call fs_read_file directly.
```

That compatibility behavior helps older workflows survive the move to dynamic discovery.

### When to choose dynamic mode

- focused sessions
- clients sensitive to tool-list size
- flows that can intentionally call `discover_tools`

## Walkthrough 4: Use the VoiceSidecar with Claude hooks

Use this when you want Claude responses to be spoken automatically.

### Goal

Run the standalone sidecar and forward response text to it with the included hook.

### Steps

1. Ensure `ELEVENLABS_API_KEY` is set.
2. Build the project:

   ```bash
   npm run build
   ```

3. Start the sidecar:

   ```bash
   npm run voice
   ```

4. Configure the Claude hook:

   ```json
   {
     "hooks": {
       "Stop": [
         {
           "command": "node /path/to/EVOKORE-MCP/scripts/voice-hook.js",
           "env": {
             "VOICE_SIDECAR_PERSONA": "orchestrator"
           }
         }
       ]
     }
   }
   ```

   Or set `VOICE_SIDECAR_PERSONA=orchestrator` in the shell that launches Claude Code if you want the bundled hook to use a non-default voice persona without editing the payload shape.
5. When Claude completes a response, the hook sends text to `ws://127.0.0.1:8888`.
6. The sidecar resolves the persona config from `voices.json`, synthesizes speech, and plays audio unless playback is disabled.

### Useful flags

```bash
VOICE_SIDECAR_DISABLE_PLAYBACK=1
VOICE_SIDECAR_ARTIFACT_DIR=artifacts/voice-sidecar
VOICE_SIDECAR_PERSONA=orchestrator
VOICE_SIDECAR_HOST=127.0.0.1
```

Use them when:

- validating sidecar behavior quietly
- preserving `.mp3` artifacts for inspection
- forcing the bundled hook to use a specific persona
- overriding the sidecar host explicitly

## Walkthrough 5: Verify hook observability and replay data

Use this when you need to confirm hook behavior without changing normal UX.

### Goal

Inspect logs for `damage-control`, `purpose-gate`, `session-replay`, or `tilldone`.

### Steps

1. Run the relevant hook-enabled workflow.
2. Inspect JSONL logs:

   ```bash
   npm run hooks:view
   ```

3. Filter by hook:

   ```bash
   npm run hooks:view -- --hook tilldone
   ```

4. Inspect recent replay data:

   ```bash
   npm run replay
   ```

### Stored data locations

- hook logs: `~/.evokore/logs/hooks.jsonl`
- replay logs: `~/.evokore/sessions/*-replay.jsonl`
- tilldone task state: `~/.evokore/sessions/*-tasks.json`

## Walkthrough 6: Start a new repo-maintenance session safely

Use this when you are resuming a branch, triaging repo state, or starting a multi-slice implementation session.

### Goal

Re-enter the repo with low context drift and without guessing at branch, worktree, or handoff state.

### Steps

1. Run the repo preflight:

   ```bash
   npm run repo:audit
   ```

2. If you need machine-readable output:

   ```bash
   npm run repo:audit -- --json
   ```

3. Read the active handoff files:
   - `next-session.md`
   - `task_plan.md`
   - `findings.md`
   - `progress.md`

4. Read the latest session log if the work is a continuation rather than a fresh slice.
5. Only after that, decide whether to:
   - continue on the handoff branch
   - branch from `main`
   - clean up stale branches or worktrees

### Why this matters

- surfaces branch divergence before you stack work on stale history
- catches disposable worktrees and stale local branches early
- keeps control-plane docs aligned with the actual repo state

## Suggested operator path

If you are new to the repo, use the docs in this order:

1. [SETUP.md](./SETUP.md)
2. [USAGE.md](./USAGE.md)
3. [TOOLS_AND_DISCOVERY.md](./TOOLS_AND_DISCOVERY.md)
4. [VOICE_AND_HOOKS.md](./VOICE_AND_HOOKS.md)
5. [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
