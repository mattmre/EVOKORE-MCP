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

