# EVOKORE-MCP Usage Guide

This guide covers how to install, configure, and use EVOKORE-MCP with your favorite AI assistants.

## 1. Connecting to an AI Assistant

EVOKORE-MCP uses the standard Model Context Protocol via `stdio`. You must point your AI client to the compiled `index.js` file.

### For Gemini CLI
To register this server globally so it's available in any project:
```bash
gemini mcp add evokore-mcp node /absolute/path/to/EVOKORE-MCP/dist/index.js --scope user
```
After running this, type `/mcp` in your interactive session to confirm it is `CONNECTED`.

### For Claude Desktop
Add the following to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "evokore-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/EVOKORE-MCP/dist/index.js"]
    }
  }
}
```

### For Cursor IDE
1. Open Cursor Settings.
2. Go to **Features > MCP Servers**.
3. Add a new server. Name it `evokore-mcp`.
4. Command: `node /absolute/path/to/EVOKORE-MCP/dist/index.js`.

## 2. Using the Built-In Tools

Once connected, your AI assistant will automatically have access to the following tools:

- **`search_skills`**: Ask the AI to find a specific workflow. (e.g., *"Search the MCP for React styling skills."*)
- **`get_skill_help`**: If you want to know what a specific skill does, ask the AI to explain it. (e.g., *"What does the 'arch-aep-runner' skill do? Show me some examples."*)

When `get_skill_help` is invoked, EVOKORE-MCP returns the raw Markdown instructions to the LLM, enabling the LLM to understand exactly what the skill is capable of and explain it to you in plain English.

### 2.1 HITL approval token (`_evokore_approval_token`)

For tools configured as `require_approval`, EVOKORE returns a security-intercept error first, then includes a `_evokore_approval_token` for the retry.

- Tokens are **one-time use**. A replayed token is rejected.
- Tokens are bound to the **exact same tool arguments**. If any argument changes, the token is rejected.
- Tokens are **short-lived** (current implementation target: about 5 minutes). If you wait too long, expect expiry and request a fresh token.
- Retry workflow: ask for explicit approval -> rerun the same tool call -> include `_evokore_approval_token` exactly as returned.

## 3. Adopting a Workflow

EVOKORE-MCP exposes skills through tools like `search_skills`, `get_skill_help`, and `resolve_workflow`.
*"Adopt the `session-wrap` workflow."* -> The AI can discover the skill and load its canonical instructions through these tools before executing the workflow.

When EVOKORE proxies child MCP servers, tool names use the prefixed tool name format `${serverId}_${tool.name}`. If the same prefixed name appears more than once, EVOKORE keeps the first registration, skips later duplicates, and logs a warning.

Child server env values in `mcp.config.json` can reference placeholders like `${ELEVENLABS_API_KEY}`. If any placeholder is unresolved at startup, EVOKORE fails fast for that child server and logs an explicit error instead of silently substituting an empty value. Other child servers continue booting.

## 4. Voice Integration

EVOKORE-MCP supports voice input/output through two complementary systems:

### ElevenLabs MCP (TTS - Voice Output)

ElevenLabs is proxied as a child server through EVOKORE-MCP, giving all connected AI clients access to high-quality text-to-speech, voice cloning, and audio tools.

**Setup:**

1. Get your API key from https://elevenlabs.io/app/developers/api-keys (10k free credits/month)
2. Add it to your `.env` file:
   ```
   ELEVENLABS_API_KEY=your_key_here
   ```
3. Install `uv` if not already installed: https://docs.astral.sh/uv/getting-started/installation/
4. Restart EVOKORE-MCP. The `elevenlabs_*` tools will appear automatically.

**Available tools** (prefixed with `elevenlabs_`): text-to-speech generation, voice cloning, audio transcription, voice design, audio isolation, and soundscape creation.

**Output modes** (set via `ELEVENLABS_MCP_OUTPUT_MODE` in `mcp.config.json`):
- `files` - saves audio to disk (default: ~/Desktop)
- `resources` - returns base64-encoded audio in MCP responses
- `both` - saves to disk and returns base64

### VoiceMode (STT + TTS - Bidirectional Voice)

VoiceMode adds voice conversations directly to Claude Code via MCP. Speak naturally and hear responses.

**Setup:**

```bash
# Add to Claude Code (user scope - already done if using EVOKORE-MCP setup)
claude mcp add --scope user voicemode -- uvx --refresh voice-mode

# Set your OpenAI API key for Whisper STT + TTS
export OPENAI_API_KEY="sk-your-key-here"
```

**Windows setup notes (PowerShell):**

```powershell
# Persist for future terminals
setx OPENAI_API_KEY "sk-your-key-here"

# Also set for the current session before launching Claude Code
$env:OPENAI_API_KEY = "sk-your-key-here"
```

If `uvx` is not on PATH in Windows shells, retry the registration command from a shell where `uvx --version` succeeds.

**Usage:** Type `converse` in Claude Code to start a voice conversation.

**Configuration (environment variables):**
- `VOICEMODE_TTS_SPEED=1.2` - Adjust speech speed
- `VOICEMODE_VOICES=nova,shimmer` - Choose TTS voices

**Local/offline mode:** Install Whisper.cpp (STT) and Kokoro (TTS) for fully local voice with no cloud dependencies. VoiceMode auto-detects local services.

### Voice Sidecar (Auto-Speak Responses)

The Voice Sidecar is a standalone WebSocket server that auto-speaks AI responses through ElevenLabs TTS. It runs independently from the MCP router, so custom clients can publish speech payloads directly to the sidecar without routing through MCP tools.

**Setup:**

1. Ensure `ELEVENLABS_API_KEY` is set in your `.env` file
2. Compile: `npx tsc`
3. Start the sidecar: `npm run voice` (or `npm run voice:dev` for development)
4. Register the voice hook in `~/.claude/settings.json`:
   ```json
   {
      "hooks": {
        "Stop": [
          { "command": "node /path/to/EVOKORE-MCP/scripts/voice-hook.js" }
        ]
      }
   }
   ```

The sidecar listens on `ws://localhost:8888` (override with `VOICE_SIDECAR_PORT` env var). This `ws://localhost:<VOICE_SIDECAR_PORT>` endpoint is the standalone sidecar protocol endpoint for any custom producer. When Claude Code finishes a response, the hook forwards the text to that endpoint, which streams it to ElevenLabs and plays the audio.

**Protocol contract (for custom integrations):**

Each WebSocket message is a JSON object with these fields:

- `text` (`string`): Text chunk to append to the current utterance buffer. Use `""` when sending a flush-only frame.
- `persona` (`string`, optional): Persona key from `voices.json` (`personas.<name>`). If omitted, the `default` voice config is used.
- `flush` (`boolean`, optional): When `true`, finalize buffered chunks and trigger synthesis/playback for the current utterance.

```json
{"text": "Hello world.", "persona": "orchestrator", "flush": true}
```

Or stream in chunks:
```json
{"text": "First part. ", "persona": "orchestrator"}
{"text": "Second part. "}
{"text": "", "flush": true}
```

Contract notes:

- `flush: true` can be sent with or without additional `text` in the same frame.
- `persona` may be sent on the first chunk, or repeated on each chunk for explicitness.
- Unknown personas fall back to `default` voice settings.

### Persona Configuration

Edit `voices.json` in the project root to map agent roles to ElevenLabs voices. Each persona overrides fields from the `default` config:

```json
{
  "default": { "voiceId": "...", "model": "eleven_turbo_v2_5", "speed": 1.0, ... },
  "personas": {
    "orchestrator": { "voiceId": "...", "stability": 0.6 },
    "researcher": { "voiceId": "...", "speed": 1.1 }
  }
}
```

The sidecar re-reads `voices.json` on each new WebSocket connection (hot-reload), so persona/voice changes apply without restarting the sidecar process. Available default personas: `orchestrator`, `researcher`, `architect`, `implementer`, `tester`, `reviewer`.

### Speed and Prosody Tuning

Three layers of speed control, each stacking on the others:

| Layer | Method | Range | Notes |
|-------|--------|-------|-------|
| 1. API speed | `speed` in `voices.json` | 0.5 - 2.0 | Prosody-aware, best quality |
| 2. Model selection | `model` in `voices.json` | N/A | `eleven_turbo_v2_5` generates 3x faster |
| 3. Post-processing | `postProcessTempo` in `voices.json` | 1.0 - 4.0 | Requires `ffmpeg` on PATH; chains `atempo` filters |

Example for fast playback:
```json
{
  "speed": 1.2,
  "model": "eleven_turbo_v2_5",
  "postProcessTempo": 1.5
}
```

For natural-sounding fast speech, prefer Layer 1 (API speed) over Layer 3 (ffmpeg). Only use `postProcessTempo` for speeds beyond what the API supports.

Validation checks for this path:
- `node test-voice-e2e-validation.js`
- `node test-voice-refinement-validation.js`

### Release Workflow

Safe npm publish is handled in GitHub Actions via `.github/workflows/release.yml`.

- Triggers: `v*.*.*` tags and `workflow_dispatch`
- Gates: `npm ci`, `npm test`, `npm run build`
- Publish guard: requires `NPM_TOKEN` secret
- Validation: `node test-npm-release-flow-validation.js`

See [docs/RELEASE_FLOW.md](./RELEASE_FLOW.md) for the operator checklist.

### Cross-CLI Config Sync

Sync your EVOKORE-MCP registration across all supported AI CLIs:

```bash
# Preview what would change (recommended first)
npm run sync:dry

# Apply changes (writes files)
npm run sync

# Direct script usage defaults to DRY RUN
node scripts/sync-configs.js

# Explicitly write changes when running script directly
node scripts/sync-configs.js --apply

# Preserve existing evokore-mcp entries explicitly (default behavior)
node scripts/sync-configs.js --apply --preserve-existing

# Force overwrite existing evokore-mcp entries
node scripts/sync-configs.js --apply --force
```

**Supported CLIs:** Claude Code, Claude Desktop (Win/Mac/Linux), Cursor, Gemini CLI (prints manual command).

The sync script:
- Auto-detects installed CLIs
- Uses DRY RUN by default (or `--apply` to write changes)
- Preserves existing `evokore-mcp` entries by default (or `--force` to overwrite)
- Rejects conflicting flag pairs (`--dry-run` + `--apply`, `--force` + `--preserve-existing`)
- Only adds/updates the `evokore-mcp` server entry (never overwrites other servers)
- Target specific CLIs: `node scripts/sync-configs.js claude-code cursor` (dry run) or `node scripts/sync-configs.js --apply claude-code cursor` (write)

## 5. Hook Observability

EVOKORE hook scripts emit structured JSONL events to:

- `~/.evokore/logs/hooks.jsonl`

Use this when validating hook behavior (damage-control, purpose-gate, session-replay, tilldone) without changing normal hook UX.

PowerShell quick checks:

```powershell
# Tail recent hook events
Get-Content "$HOME\.evokore\logs\hooks.jsonl" -Tail 30

# Filter a specific hook with parsed JSON
Get-Content "$HOME\.evokore\logs\hooks.jsonl" |
  ForEach-Object { $_ | ConvertFrom-Json } |
  Where-Object { $_.hook -eq "damage-control" }
```
