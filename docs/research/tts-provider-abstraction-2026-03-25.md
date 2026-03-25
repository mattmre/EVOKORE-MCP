# TTS Provider Abstraction Research

**Date:** 2026-03-25
**Status:** Implementation approved
**Related PRs:** TBD (PR 1: interface extraction, PR 2: openai-compat provider)

## Problem Statement

VoiceSidecar (`src/VoiceSidecar.ts`) currently hardcodes ElevenLabs as its only TTS provider via the `ElevenLabsStreamer` class and requires `ELEVENLABS_API_KEY` at startup. This creates a hard dependency on a cloud service with no local/offline fallback, unlike the STT side which already has a pluggable `STTProvider` interface with cloud (`WhisperSTTProvider`) and local (`LocalSTTProvider`) implementations.

## Landscape Assessment

### Evaluated Solutions

| Project | Stars | License | Local | OpenAI-compat API | Docker | Voice Clone | Languages | Model Size |
|---|---|---|---|---|---|---|---|---|
| Kokoro-FastAPI | 4.6k | Open | Yes | Yes | Yes | No (mixing) | 9 | 82M |
| Chatterbox TTS API | 557 | MIT | Yes | Yes | Yes | Yes (10s clip) | 23 | 350M-500M |
| Coqui TTS | 44.9k | MPL 2.0 | Yes | No (custom) | Yes | Yes (6s) | 1100+ | Various |
| LocalAI | 44.4k | MIT | Yes | Yes (OpenAI + ElevenLabs) | Yes | Varies | Varies | Multi-backend |
| Kokoro-Web | 587 | MIT | Yes | Yes | Yes | No | 9 | 82M |

### Key Finding: OpenAI `/v1/audio/speech` as Universal Contract

All top contenders (Kokoro-FastAPI, Chatterbox TTS API, LocalAI, Kokoro-Web) implement the OpenAI-compatible TTS endpoint. This is the de facto standard for local TTS APIs. By targeting this contract, EVOKORE-MCP can support all of them without per-engine coupling.

### LocalAI Assessment

LocalAI (44.4k stars) was evaluated as a potential all-in-one replacement. **Conclusion: wrong layer.** LocalAI is an inference engine (Go monorepo) that *consumes* MCP servers. EVOKORE-MCP is an MCP server that AI clients connect *to*. They sit on opposite sides of the stack. Using LocalAI just for TTS would mean running a ~5GB+ container designed for LLMs. Rejected for TTS-only use.

### Recommended Integration Path

1. **Kokoro-FastAPI** — best lightweight bolt-in (82M params, Docker, 35-100x realtime, streaming support)
2. **Chatterbox TTS API** — best when voice cloning is needed (350M params, 23 languages, sub-200ms turbo)
3. **Provider-agnostic architecture** — target the OpenAI `/v1/audio/speech` contract to decouple from any specific engine

## Architectural Design

### Design Principle: Mirror STT Provider Pattern

The STT side already established the pattern:
- `src/STTProvider.ts` — interface with `name`, `isAvailable()`, `transcribe()`
- `src/stt/WhisperSTTProvider.ts` — cloud provider (OpenAI API)
- `src/stt/LocalSTTProvider.ts` — local provider (whisper CLI)
- `EVOKORE_STT_PROVIDER` env var selects provider

The TTS side will follow identically:
- `src/TTSProvider.ts` — interface with `name`, `isAvailable()`, `connect()`, `sendText()`, `flush()`
- `src/tts/ElevenLabsTTSProvider.ts` — cloud provider (extracted from VoiceSidecar)
- `src/tts/OpenAICompatTTSProvider.ts` — local provider (HTTP POST to any OpenAI-compat endpoint)
- `EVOKORE_TTS_PROVIDER` env var selects provider

### TTSProvider Interface

```typescript
export interface TTSProvider {
  readonly name: string;
  isAvailable(): boolean;
  connect(): Promise<void>;
  sendText(chunk: string): void;
  flush(): Promise<Buffer | null>;
}
```

Key design decisions:
- `flush()` returns `Buffer | null` — audio bytes, not files. The shared finalize pipeline (temp file, ffmpeg tempo, artifact save, playback queue) stays in VoiceSidecar and applies to all providers.
- `connect()` is a no-op for HTTP-based providers but required for WebSocket-based ones (ElevenLabs).
- `sendText()` streams for ElevenLabs, buffers for OpenAI-compat.

### OpenAI-compat Provider Contract

POST `${EVOKORE_TTS_BASE_URL}/v1/audio/speech`:
```json
{
  "model": "tts-1",
  "input": "accumulated text",
  "voice": "nova",
  "response_format": "mp3",
  "speed": 1.0
}
```
Response: raw audio bytes (mp3/wav/opus).

### Environment Variables

| Var | Default | Purpose |
|---|---|---|
| `EVOKORE_TTS_PROVIDER` | `elevenlabs` | `elevenlabs` or `openai-compat` |
| `EVOKORE_TTS_BASE_URL` | `http://127.0.0.1:8880` | Endpoint for openai-compat |
| `EVOKORE_TTS_API_KEY` | *(empty)* | Optional auth for openai-compat |
| `EVOKORE_TTS_VOICE` | `nova` | Default voice for openai-compat |
| `EVOKORE_TTS_MODEL` | `tts-1` | Default model for openai-compat |

### Voice Persona Mapping

`voices.json` gains optional `openaiVoice` and `openaiModel` fields per persona. Each provider reads the fields it needs; unknown fields are ignored.

## Implementation Plan

### PR 1: Extract + Interface (pure refactor)
- Create `TTSProvider` interface
- Extract `ElevenLabsStreamer` → `ElevenLabsTTSProvider`
- Refactor VoiceSidecar to use extracted provider
- Add `ttsProvider` to HealthResponse
- Update and add tests
- Zero behavior change

### PR 2: OpenAI-compat provider + docs
- Create `OpenAICompatTTSProvider`
- Add env var switching in VoiceSidecar startup
- Conditional `ELEVENLABS_API_KEY` requirement
- Update `voices.json`, `.env.example`, `docs/USAGE.md`
- Expand tests

## References

- Kokoro-FastAPI: https://github.com/remsky/Kokoro-FastAPI
- Chatterbox TTS: https://github.com/resemble-ai/chatterbox
- Chatterbox TTS API: https://github.com/travisvn/chatterbox-tts-api
- Coqui TTS: https://github.com/coqui-ai/TTS
- LocalAI: https://github.com/mudler/LocalAI
- MCP TTS Server (Kokoro + OpenAI): https://github.com/kristofferv98/MCP_tts_server
- Existing STT pattern: `src/STTProvider.ts`, `src/stt/`
