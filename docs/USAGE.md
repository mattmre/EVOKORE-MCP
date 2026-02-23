# EVOKORE-MCP Usage Guide

This guide covers how to install, configure, and use EVOKORE-MCP with your favorite AI assistants.

## 1. Connecting to an AI Assistant

EVOKORE-MCP uses the standard Model Context Protocol via `stdio`. You must point your AI client to the compiled `index.js` file.

### For Gemini CLI
To register this server globally so it's available in any project:
```bash
gemini mcp add evokore-mcp node /absolute/path/to/EVOKORE-MCP/src/index.js --scope user
```
After running this, type `/mcp` in your interactive session to confirm it is `CONNECTED`.

### For Claude Desktop
Add the following to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "evokore-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/EVOKORE-MCP/src/index.js"]
    }
  }
}
```

### For Cursor IDE
1. Open Cursor Settings.
2. Go to **Features > MCP Servers**.
3. Add a new server. Name it `evokore-mcp`.
4. Command: `node /absolute/path/to/EVOKORE-MCP/src/index.js`.

## 2. Using the Built-In Tools

Once connected, your AI assistant will automatically have access to the following tools:

- **`search_skills`**: Ask the AI to find a specific workflow. (e.g., *"Search the MCP for React styling skills."*)
- **`get_skill_help`**: If you want to know what a specific skill does, ask the AI to explain it. (e.g., *"What does the 'arch-aep-runner' skill do? Show me some examples."*)

When `get_skill_help` is invoked, EVOKORE-MCP returns the raw Markdown instructions to the LLM, enabling the LLM to understand exactly what the skill is capable of and explain it to you in plain English.

## 3. Adopting a Workflow

Because EVOKORE-MCP exposes its library as **MCP Prompts**, you can instruct the AI to adopt a workflow completely.
*"Adopt the `session-wrap` workflow."* -> The AI will fetch the prompt from EVOKORE-MCP and immediately execute the PR generation, logging, and next-session handoff protocols defined in that skill.

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

### Speed and Prosody Notes

- ElevenLabs agent platform supports 0.7x-1.2x speed range
- ElevenLabs raw TTS API allows broader speed via the `speed` parameter
- For 2-3x playback, use the TTS API directly or post-process with `ffmpeg -filter:a "atempo=2.0"`
- ElevenLabs Turbo v2.5 model (`eleven_turbo_v2_5`) generates 3x faster with good quality
- For natural-sounding fast speech, prosody-aware generation (ElevenLabs Expressive Mode) is preferred over naive speed multiplication
