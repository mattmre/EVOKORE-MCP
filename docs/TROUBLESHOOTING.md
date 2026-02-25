# EVOKORE-MCP Troubleshooting Guide

If your MCP Server is failing to connect or crashing, consult these common issues.

## 1. Connection Closed Error (`MCP error -32000`)
**Symptoms:** You add the server via `gemini mcp add`, but when you check `/mcp ls`, the server displays a red dot with `Disconnected`.
**Cause:** The TypeScript compiler (`tsc`) outputs the compiled file to a location that your configuration is not expecting, or the Node script crashed on startup (e.g., trying to read a directory that doesn't exist).
**Solution:**
Ensure you are pointing the command to `dist/index.js` (the compiled runtime entrypoint).
```bash
# Correct
gemini mcp add evokore-mcp node /path/to/EVOKORE-MCP/dist/index.js
```

## 2. "ENOENT: no such file or directory, scandir '.../SKILLS'"
**Symptoms:** The Node process crashes immediately with an `ENOENT` error targeting the `SKILLS` folder.
**Cause:** The script used `process.cwd()` instead of `__dirname` to resolve the `SKILLS` path, so it looked for the folder in the terminal's active directory instead of the repository's directory.
**Solution:**
This has been fixed in `v1.1.0`. Ensure you have pulled the latest `main` branch. The code must use `path.resolve(__dirname, "../SKILLS")`.

## 3. Skills Not Showing in `search_skills`
**Symptoms:** The MCP server connects, but when you ask the AI to search for a skill, it returns "No skills found."
**Cause:** The YAML frontmatter inside the `.md` file is missing or malformed, causing the parser to fail.
**Solution:**
Run the normalization script:
```bash
node scripts/clean_skills.js
```
This script traverses the `SKILLS/` directory and auto-repairs any broken Markdown headers. Restart your MCP connection (`/mcp refresh`) after running the script.

## 4. Debugging the Connection
If the server still won't connect, launch your AI assistant in debug mode to see the `stderr` output.
- **Gemini CLI:** Launch the CLI with `gemini --debug`, or press `F12` during an interactive session to open the debug console.
- **Claude Desktop:** Check the `mcp.log` file (Location varies by OS; on Windows it is usually `%APPDATA%\Claude\logs\mcp.log`).

## 5. Voice Sidecar Not Speaking
**Symptoms:** Claude hook runs, but no audio is played.
**Checks:**
- Ensure the sidecar is running: `npm run voice`
- Verify your `ELEVENLABS_API_KEY` is set
- Validate hook and payload behavior with:
  - `node test-voice-e2e-validation.js`
  - `node test-voice-refinement-validation.js`

## 6. Release Workflow Did Not Publish
**Symptoms:** Release workflow runs but package is not published.
**Cause:** `NPM_TOKEN` secret is missing or invalid.
**Solution:**
- Add/update `NPM_TOKEN` in repository secrets.
- Re-run via `workflow_dispatch`.
- Confirm workflow checks with `node test-npm-release-flow-validation.js`.
- Reference the full process in [RELEASE_FLOW.md](./RELEASE_FLOW.md).

## 7. VoiceMode Fails to Start on Windows
**Symptoms:** `converse` fails immediately, or VoiceMode does not detect your API key.
**Common causes:**
- `OPENAI_API_KEY` was set in one shell, but Claude Code was started from another shell/session.
- `uvx` is not available in the shell PATH used to register/run VoiceMode.

**Solution (PowerShell):**
```powershell
# Persist for future terminals
setx OPENAI_API_KEY "sk-your-key-here"

# Set for current shell before starting Claude Code
$env:OPENAI_API_KEY = "sk-your-key-here"

# Confirm uvx is available
uvx --version
```

Then restart Claude Code and retry `converse`.

## 8. Duplicate Proxied Tool Name Warning
**Symptoms:** Startup logs include a warning like `Skipping duplicate proxied tool 'server_tool' from server 'server' (already registered).`
**Cause:** Two registrations produced the same prefixed name (`${serverId}_${tool.name}`).
**Solution:** EVOKORE keeps the first tool registration and skips duplicates by design. Rename one upstream tool or adjust server IDs if you need both tools exposed.

## 9. Child Server Fails with Unresolved Env Placeholder
**Symptoms:** Startup logs include an error like `Unresolved env placeholder(s) for child server 'elevenlabs' key 'ELEVENLABS_API_KEY': ${ELEVENLABS_API_KEY}` followed by `Failed to boot child server ...`.
**Cause:** A `${VAR_NAME}` placeholder in `mcp.config.json` referenced an environment variable that is not set in the process launching EVOKORE.
**Solution:**
- Set the missing environment variable(s) before starting EVOKORE (for example, `ELEVENLABS_API_KEY`).
- Confirm values are available in the same shell/session used to start your MCP host.
- Restart EVOKORE after updating env vars.

## 10. HITL Token Retry Keeps Failing (`_evokore_approval_token`)
**Symptoms:** You retry a `require_approval` tool call and still get the security interceptor error.

**Checks:**
- Use the token only once (replay attempts fail by design).
- Retry with the exact same arguments as the intercepted call.
- Retry promptly; tokens are short-lived (around 5 minutes) and can expire.

**Retry workflow:**
1. Run tool call without token and capture the returned `_evokore_approval_token`.
2. Ask for explicit user approval.
3. Retry the same tool call with unchanged arguments plus `_evokore_approval_token`.
4. If that retry fails, run the original call again to get a fresh token and repeat.

## 11. Inspecting Hook Observability Logs
**Symptoms:** You need to confirm whether hooks are allowing/blocking as expected without changing existing hook output behavior.

**Location:** `~/.evokore/logs/hooks.jsonl`

**Schema quick reference:**

- `ts` (ISO timestamp)
- `hook` (for example `damage-control`, `purpose-gate`, `session-replay`, `tilldone`)
- `event` (hook-specific event label)
- `session_id` (optional, sanitized)
- hook-specific fields (for example `tool`, `reason`, `mode`, `incomplete_count`)

**PowerShell checks:**
```powershell
# Last 50 events
Get-Content "$HOME\.evokore\logs\hooks.jsonl" -Tail 50

# Parse and inspect only tilldone hook events
Get-Content "$HOME\.evokore\logs\hooks.jsonl" |
  ForEach-Object { $_ | ConvertFrom-Json } |
  Where-Object { $_.hook -eq "tilldone" }
```

## 12. Windows Command Boot Fails for Child Servers
**Symptoms:** Child server boot fails on Windows when using `uv` or `uvx`, even though `npx`-based servers work.

**Cause:** EVOKORE remaps only `npx` to `npx.cmd` on Windows. It does not rewrite `uv` or `uvx` command names.

**Solution:**
- Verify `uv --version` and `uvx --version` in the same shell used to launch your MCP host.
- Ensure the configured command in `mcp.config.json` matches a command available on PATH.
- Use `npx`-based child configs only when that command is intentionally required.

## 13. CI Fails on Submodule Cleanliness Validation
**Symptoms:** CI fails on `node scripts/validate-submodule-cleanliness.js`.

**Common causes by marker/state:**
- `-` uninitialized submodule
- `+` submodule commit mismatch (worktree commit differs from parent gitlink)
- `U` submodule merge conflict
- non-empty submodule `git status --porcelain` output (dirty submodule worktree)

**Solution:**
1. Run `git submodule update --init --recursive`.
2. Run `git submodule status --recursive` and verify no unexpected mismatch/conflict states.
3. Commit inside the submodule first when needed.
4. Commit the updated submodule pointer in this parent repo.
5. Re-run `node scripts/validate-submodule-cleanliness.js` before pushing.

