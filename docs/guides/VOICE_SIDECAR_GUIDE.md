# Voice Sidecar End-to-End Guide

**Date:** 2026-03-14

This guide walks through setting up the EVOKORE-MCP Voice Sidecar from scratch, configuring personas, integrating with Claude Code hooks, and troubleshooting common issues.

---

## 1. Prerequisites

### Required

- **Node.js** v18 or later
- **ElevenLabs API key** -- sign up at [elevenlabs.io](https://elevenlabs.io/) (free tier: 10,000 credits/month)
- **EVOKORE-MCP** repository cloned and built (`npm install && npx tsc`)

### Optional

- **ffmpeg** -- required only if you use `postProcessTempo` for speed adjustment
- **mpv** or **aplay** -- Linux audio playback (macOS uses `afplay`, Windows uses PowerShell)

### Environment Setup

Add your ElevenLabs API key to `.env` in the repository root:

```
ELEVENLABS_API_KEY=sk-your-elevenlabs-api-key-here
```

The sidecar loads `.env` automatically via dotenv on startup.

---

## 2. voices.json Configuration

The sidecar reads `voices.json` from the repository root. It defines a default voice and named personas.

### Structure

```json
{
  "default": {
    "voiceId": "21m00Tcm4TlvDq8ikWAM",
    "voiceName": "Rachel",
    "model": "eleven_turbo_v2_5",
    "stability": 0.5,
    "similarityBoost": 0.75,
    "speed": 1.0,
    "outputFormat": "mp3_44100_128"
  },
  "personas": {
    "orchestrator": {
      "voiceId": "21m00Tcm4TlvDq8ikWAM",
      "voiceName": "Rachel",
      "stability": 0.6,
      "similarityBoost": 0.8
    },
    "researcher": {
      "voiceId": "AZnzlk1XvdvUeBnXmlld",
      "voiceName": "Domi",
      "stability": 0.4,
      "speed": 1.1
    }
  }
}
```

### Field Reference

| Field | Type | Description |
|---|---|---|
| `voiceId` | string | ElevenLabs voice identifier |
| `voiceName` | string | Human-readable name (used in logs) |
| `model` | string | ElevenLabs model (e.g., `eleven_turbo_v2_5`) |
| `stability` | number | Voice stability 0.0-1.0 (lower = more expressive) |
| `similarityBoost` | number | Voice clarity 0.0-1.0 |
| `speed` | number | Playback speed multiplier (1.0 = normal) |
| `outputFormat` | string | Audio format (e.g., `mp3_44100_128`) |
| `postProcessTempo` | number | Optional ffmpeg tempo adjustment after generation |

Persona entries inherit all fields from `default` and override only the fields they specify.

### Hot-Reload Behavior

The sidecar re-reads `voices.json` from disk on every new WebSocket connection. This means:

- You can edit `voices.json` while the sidecar is running
- The next connection will pick up the changes immediately
- No restart is required
- Existing connections continue using the voice config they started with

---

## 3. Starting the Voice Sidecar

### Build First

```bash
npx tsc
```

### Start the Server

```bash
node dist/VoiceSidecar.js
```

You should see:

```
[VoiceSidecar] Listening on ws://127.0.0.1:8888
[VoiceSidecar] voices.json: /path/to/voices.json
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VOICE_SIDECAR_PORT` | `8888` | WebSocket server port |
| `VOICE_SIDECAR_DISABLE_PLAYBACK` | `0` | Set to `1` to skip audio playback |
| `VOICE_SIDECAR_ARTIFACT_DIR` | (none) | If set, saves copies of audio files |
| `VOICE_SIDECAR_MAX_CONNECTIONS` | `5` | Maximum simultaneous WebSocket connections |
| `ELEVENLABS_API_KEY` | (required) | Your ElevenLabs API key |

---

## 4. Hook Integration

The voice sidecar integrates with Claude Code through a stop hook (`scripts/voice-hook.js`). When Claude finishes a response, the hook forwards the output text to the sidecar for text-to-speech playback.

### How It Works

1. Claude Code fires the stop hook with the response payload on stdin
2. `voice-hook.js` parses the JSON payload
3. It resolves the persona (see priority order below)
4. It opens a WebSocket to the sidecar, sends the text with `flush: true`, and closes

### Persona Routing Priority

The hook resolves the persona in this order (first non-empty wins):

1. `VOICE_SIDECAR_PERSONA` environment variable
2. `payload.persona` field
3. `payload.voice_persona` field
4. `payload.metadata.persona` field
5. `payload.metadata.voice_persona` field
6. `payload.session.persona` field
7. Falls back to `default` voice config

### Setting a Persistent Persona

To always use a specific persona for the current session:

```bash
export VOICE_SIDECAR_PERSONA=orchestrator
```

### Host Configuration

By default the hook connects to `127.0.0.1`. To override:

```bash
export VOICE_SIDECAR_HOST=192.168.1.100
```

### Wiring the Hook in Claude Code

Add to `.claude/settings.json` under the Stop hook array:

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "command": "node /path/to/scripts/voice-hook.js"
      }
    ]
  }
}
```

The hook silently fails if the sidecar is not running, so it is safe to leave wired even when the sidecar is offline.

---

## 5. Testing the Connection

### Health Check

You can send a health-check message to verify the sidecar is running:

```javascript
const WebSocket = require('ws');
const ws = new WebSocket('ws://127.0.0.1:8888');
ws.on('open', () => {
  ws.send(JSON.stringify({ text: '__health' }));
});
ws.on('message', (data) => {
  console.log(JSON.parse(data.toString()));
  // { type: "health", status: "ok", connections: 1, uptime: 42 }
  ws.close();
});
```

### Manual TTS Test

```javascript
const ws = new WebSocket('ws://127.0.0.1:8888');
ws.on('open', () => {
  ws.send(JSON.stringify({
    text: 'Hello from EVOKORE.',
    persona: 'orchestrator',
    flush: true
  }));
});
```

---

## 6. Security

The sidecar enforces several security measures:

- **Loopback-only binding**: Listens on `127.0.0.1`, not `0.0.0.0`
- **Client verification**: Rejects connections from non-loopback addresses
- **Payload size limit**: 1 MB maximum per WebSocket message
- **Text length limit**: 10,000 characters maximum per text field
- **Connection limit**: Configurable max simultaneous connections (default 5)
- **Heartbeat**: Terminates unresponsive clients after 30 seconds

---

## 7. Troubleshooting

### VoiceMode Windows Encoding Bug

The `uvx voice-mode-install` command crashes on Windows due to a Unicode encoding error (cp1252 codec). Skip the installer entirely and use:

```bash
claude mcp add --scope user voicemode -- uvx --refresh voice-mode
```

### Port Conflicts

If port 8888 is already in use:

```bash
# Check what is using the port
netstat -ano | findstr :8888    # Windows
lsof -i :8888                   # macOS/Linux

# Use an alternative port
VOICE_SIDECAR_PORT=9999 node dist/VoiceSidecar.js
```

Remember to also set `VOICE_SIDECAR_PORT=9999` in the hook environment.

### No Audio Playback

- **Windows**: Requires PowerShell. Audio plays via `Start-Process -Wait`.
- **macOS**: Uses built-in `afplay`.
- **Linux**: Tries `mpv` first, falls back to `aplay`. Install one of them:
  ```bash
  sudo apt install mpv   # or: sudo apt install alsa-utils
  ```

### Sidecar Exits Immediately

Check that `ELEVENLABS_API_KEY` is set. The sidecar exits with an error if the key is missing:

```
[VoiceSidecar] ELEVENLABS_API_KEY not set. Load via .env or export.
```

### Stale Temp Files

The sidecar cleans up `evokore-voice-*.mp3` temp files on startup. If temp files accumulate (e.g., after a crash), they are cleaned on the next launch.

### Connection Refused from Hook

Verify the sidecar is running and the host/port match:

```bash
# Default
curl -s http://127.0.0.1:8888 2>&1 || echo "Sidecar not reachable"
```

The hook fails silently by design. Check the sidecar stderr output for connection logs.

---

## 8. Architecture Summary

```
Claude Code (Stop hook)
  |
  v
scripts/voice-hook.js
  |  reads stdin JSON payload
  |  resolves persona (env > payload > default)
  |
  v  WebSocket ws://HOST:PORT
VoiceSidecar.ts
  |  reads voices.json (hot-reload per connection)
  |  resolves VoiceConfig for persona
  |
  v  WebSocket wss://api.elevenlabs.io
ElevenLabs Streaming TTS API
  |  returns audio chunks (base64)
  |
  v
VoiceSidecar finalize()
  |  writes temp .mp3 file
  |  optional ffmpeg postProcessTempo
  |  optional artifact save
  |  plays via platform player
  |  cleans up temp file
```

The sidecar is completely standalone -- it is never imported by `index.ts` and runs as a separate process. This keeps the MCP server startup clean and allows the voice system to be independently started, stopped, and configured.
