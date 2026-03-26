---
title: TTS Local Production Validation
date: 2026-03-26
status: complete
---

# TTS Local (OpenAI-compatible) Production Validation

## Summary

Production validation test suite for the `OpenAICompatTTSProvider` (`src/tts/OpenAICompatTTSProvider.ts`), verifying construction, text buffering, HTTP request formation, error handling, voice/model config resolution, and VoiceSidecar factory integration.

## Test Coverage Added

File: `tests/integration/tts-openai-compat-validation.test.ts`

### Test categories (10 describe blocks)

1. **Construction / baseUrl normalization** (5 tests) -- Trailing slash stripping (single, multiple, none), apiKey storage (present vs omitted).

2. **Text buffer accumulation** (4 tests) -- Single sendText, multiple in order, empty string ignored, whitespace-only string preserved in buffer.

3. **HTTP request format (mock fetch)** (10 tests) -- URL target (`/v1/audio/speech`), POST method, JSON body fields (`model`, `voice`, `input`, `response_format`, `speed`), multi-chunk join, `Content-Type` header, `Authorization` Bearer header presence/absence, Buffer return, buffer clearing after flush, default speed fallback.

4. **Error handling** (8 tests) -- Empty buffer returns null, whitespace-only buffer returns null, HTTP 500 returns null, HTTP 404 returns null, network error (ECONNREFUSED) returns null, DNS error returns null, empty response body returns null, real unreachable port returns null.

5. **Voice and model config resolution** (9 tests) -- `openaiVoice` from config, fallback to `EVOKORE_TTS_VOICE` env, fallback to `"nova"` default. Same three-tier chain for `openaiModel` -> `EVOKORE_TTS_MODEL` -> `"tts-1"`. Priority verification (config wins over env).

6. **Provider identity and interface compliance** (7 tests) -- `name` is `"openai-compat"`, `isAvailable()` always true, `connect()` resets buffer and resolves, method existence checks.

7. **VoiceSidecar factory integration** (6 tests) -- Source-level verification that `createTTSProvider` switches on `EVOKORE_TTS_PROVIDER`, passes `TTS_BASE_URL` and `TTS_API_KEY`, defaults are correct, logs endpoint URL.

8. **voices.json persona coverage** (3 tests) -- Every persona has `openaiVoice`, default voice has `openaiVoice`, file exists.

9. **Full lifecycle flush cycle** (3 tests) -- connect->sendText->flush returns audio, second flush returns null, multiple independent cycles work.

10. **Env var documentation** (5 tests) -- All five `EVOKORE_TTS_*` vars confirmed in `.env.example`.

**Total: ~60 tests.**

## Known Limitations

- **No live endpoint testing.** All HTTP interactions use mocked `globalThis.fetch` or unreachable-port assertions. A real Kokoro-FastAPI or OpenAI-compatible server is not started during CI.
- **No audio content validation.** Tests verify that a Buffer is returned with non-zero length, but do not validate that the bytes are valid MP3/WAV audio.
- **No latency or throughput benchmarks.** The provider's performance characteristics under load are not measured.
- **No TLS/HTTPS certificate validation testing.** The provider trusts Node.js default certificate handling.
- **VoiceSidecar factory tests are source-level.** They read the TypeScript source to verify wiring, not runtime behavior of the factory function (which requires `startServer()`).

## Manual Validation: Kokoro-FastAPI Docker Setup

For live end-to-end validation with a real local TTS server, use [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI):

### Prerequisites

- Docker and Docker Compose installed
- NVIDIA GPU with CUDA drivers (for GPU acceleration; CPU mode also works)

### Quick start

```bash
# Clone the Kokoro-FastAPI repo
git clone https://github.com/remsky/Kokoro-FastAPI.git
cd Kokoro-FastAPI

# Start with GPU support (recommended)
docker compose -f docker-compose.gpu.yml up -d

# Or start with CPU only
docker compose -f docker-compose.cpu.yml up -d

# Verify the server is running
curl http://127.0.0.1:8880/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"model": "kokoro", "input": "Hello from EVOKORE.", "voice": "af_nova"}' \
  --output test.mp3

# Play the output
# Windows: start test.mp3
# macOS:   afplay test.mp3
# Linux:   mpv test.mp3 || aplay test.mp3
```

### EVOKORE-MCP configuration

Set these in your `.env` or environment:

```bash
EVOKORE_TTS_PROVIDER=openai-compat
EVOKORE_TTS_BASE_URL=http://127.0.0.1:8880
EVOKORE_TTS_VOICE=af_nova
EVOKORE_TTS_MODEL=kokoro
# EVOKORE_TTS_API_KEY=  # Not needed for local Kokoro-FastAPI
```

Then start the VoiceSidecar normally. It will route all TTS through the local Kokoro server.

### Verify via VoiceSidecar health check

```bash
# With wscat or similar WebSocket client:
wscat -c ws://127.0.0.1:8888
> {"type":"health"}
# Should show: { "ttsProvider": "openai-compat", ... }
```

## Expected API Contract

The OpenAI-compatible TTS contract (`POST /v1/audio/speech`):

### Request

```
POST {baseUrl}/v1/audio/speech
Content-Type: application/json
Authorization: Bearer {apiKey}  (optional, omitted for local servers)

{
  "model": "tts-1",        // or "kokoro", "tts-1-hd", etc.
  "input": "Text to speak",
  "voice": "nova",          // or "alloy", "shimmer", "af_nova", etc.
  "response_format": "mp3",
  "speed": 1.0
}
```

### Response

- **200 OK**: Binary audio body (MP3 by default). `Content-Type: audio/mpeg`.
- **4xx/5xx**: Error text body. The provider logs the error and returns `null` to the caller.

### Supported servers

| Server | URL | Notes |
|--------|-----|-------|
| Kokoro-FastAPI | `http://127.0.0.1:8880` | Local GPU/CPU, open-source voices |
| Chatterbox TTS API | `http://127.0.0.1:8880` | Local, emotion-controllable |
| OpenAI TTS | `https://api.openai.com` | Cloud, requires API key |

## References

- Provider source: `src/tts/OpenAICompatTTSProvider.ts`
- Interface definition: `src/TTSProvider.ts`
- Existing TTS tests: `tests/integration/tts-provider.test.ts`
- New validation tests: `tests/integration/tts-openai-compat-validation.test.ts`
- Phase 1 research: `docs/research/tts-provider-abstraction-2026-03-25.md`
- `.env.example` TTS section: lines 86-100
