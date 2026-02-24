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

## 3. Adopting a Workflow

EVOKORE-MCP exposes skills through tools like `search_skills`, `get_skill_help`, and `resolve_workflow`.
*"Adopt the `session-wrap` workflow."* -> The AI can discover the skill and load its canonical instructions through these tools before executing the workflow.

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

**Usage:** Type `converse` in Claude Code to start a voice conversation.

**Configuration (environment variables):**
- `VOICEMODE_TTS_SPEED=1.2` - Adjust speech speed
- `VOICEMODE_VOICES=nova,shimmer` - Choose TTS voices

**Local/offline mode:** Install Whisper.cpp (STT) and Kokoro (TTS) for fully local voice with no cloud dependencies. VoiceMode auto-detects local services.

### Voice Sidecar (Auto-Speak Responses)

The Voice Sidecar is a standalone WebSocket server that auto-speaks AI responses through ElevenLabs TTS. It runs independently from the MCP router.

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

The sidecar listens on `ws://localhost:8888` (override with `VOICE_SIDECAR_PORT` env var). When Claude Code finishes a response, the hook forwards the text to the sidecar, which streams it to ElevenLabs and plays the audio.

**Protocol (for custom integrations):**

```json
{"text": "Hello world.", "persona": "orchestrator", "flush": true}
```

Or stream in chunks:
```json
{"text": "First part. ", "persona": "orchestrator"}
{"text": "Second part. "}
{"text": "", "flush": true}
```

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

The sidecar re-reads `voices.json` on each new connection (hot-reload). Available default personas: `orchestrator`, `researcher`, `architect`, `implementer`, `tester`, `reviewer`.

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
# Safe default mode (dry-run): preview what would change
npm run sync:dry

# Also dry-run (default when no mode flag is provided)
node scripts/sync-configs.js

# Apply changes explicitly
npm run sync

# Or directly:
node scripts/sync-configs.js --apply
```

**Supported CLIs:** Claude Code, Claude Desktop (Win/Mac/Linux), Cursor, Gemini CLI (prints manual command).

**Mode behavior:**
- `--dry-run`: never writes config files; prints what would be changed.
- `--apply`: writes detected config files.
- If no mode flag is provided, sync runs in **dry-run** mode for safety.
- Invalid combination `--dry-run --apply` exits non-zero with a clear error.

The sync script:
- Auto-detects installed CLIs
- Only adds/updates the `evokore-mcp` server entry (never overwrites other servers)
- Target specific CLIs: `node scripts/sync-configs.js claude-code cursor`
