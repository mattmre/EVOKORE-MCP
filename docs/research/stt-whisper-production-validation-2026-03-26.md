# STT Whisper Production Validation

**Date:** 2026-03-26
**Status:** Validation complete
**Predecessor:** stt-integration-feasibility-2026-03-14.md
**Test file:** tests/integration/stt-whisper-validation.test.ts

## 1. Current STT Implementation Status

The STT (Speech-to-Text) subsystem is fully implemented and integrated into the VoiceSidecar. It follows the provider pattern established by the TTS system, offering both cloud and local backends.

### Implementation Inventory

| File | Purpose | Status |
|---|---|---|
| `src/STTProvider.ts` | Interface contract (`STTProvider`, `STTOptions`, `STTResult`) + audio format constants | Complete |
| `src/stt/WhisperSTTProvider.ts` | OpenAI Whisper API cloud provider | Complete |
| `src/stt/LocalSTTProvider.ts` | Local whisper CLI provider (openai-whisper Python package) | Complete |
| `src/VoiceSidecar.ts` | WebSocket integration: factory, message handling, health reporting | Complete |

### Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `EVOKORE_STT_ENABLED` | `false` | Opt-in STT activation |
| `EVOKORE_STT_PROVIDER` | `whisper-api` | Provider selection (`whisper-api`, `local-whisper`, `local`) |
| `EVOKORE_STT_MODEL` | `whisper-1` | Whisper API model identifier |
| `EVOKORE_STT_LOCAL_MODEL` | `base` | Local whisper model size (`tiny`, `base`, `small`, `medium`, `large`) |
| `EVOKORE_WHISPER_PATH` | `whisper` | Path to local whisper CLI binary |
| `OPENAI_API_KEY` | (required for cloud) | OpenAI API authentication |
| `OPENAI_API_BASE_URL` | `https://api.openai.com` | Custom OpenAI-compatible endpoint |

All variables are documented in `.env.example`.

---

## 2. Provider Architecture

The STT system mirrors the TTS provider pattern exactly:

```
src/STTProvider.ts          <-->  src/TTSProvider.ts
  |                                  |
  +-- stt/WhisperSTTProvider.ts      +-- tts/ElevenLabsTTSProvider.ts
  +-- stt/LocalSTTProvider.ts        +-- tts/OpenAICompatTTSProvider.ts
```

### STTProvider Interface

```typescript
interface STTProvider {
  readonly name: string;
  transcribe(audioBuffer: Buffer, options?: STTOptions): Promise<STTResult>;
  isAvailable(): boolean;
}

interface STTOptions {
  language?: string;  // BCP-47 code
  model?: string;     // Provider-specific model
}

interface STTResult {
  text: string;
  confidence?: number;  // 0.0 - 1.0
  language?: string;
  duration?: number;    // seconds
}
```

### Provider Selection Flow (VoiceSidecar.initSTTProvider)

1. If `EVOKORE_STT_ENABLED !== "true"`, return null (STT disabled).
2. If `EVOKORE_STT_PROVIDER` is `"local-whisper"` or `"local"`, construct `LocalSTTProvider`.
   - If `isAvailable()` returns false (whisper CLI not found), return null.
3. Otherwise, construct `WhisperSTTProvider` (default).
   - If `isAvailable()` returns false (no API key), return null.
4. On any construction error, log and return null.

### Supported Audio Formats

The `SUPPORTED_AUDIO_FORMATS` constant and `EXTENSION_TO_MIME` mapping cover:

| Extension | MIME Type |
|---|---|
| `.wav` | `audio/wav` |
| `.mp3` | `audio/mpeg` |
| `.webm` | `audio/webm` |
| `.m4a` | `audio/mp4` |
| `.mp4` | `audio/mp4` |

Unknown extensions default to `audio/wav` via `mimeFromExtension()`.

---

## 3. Whisper API Contract

### Endpoint

`POST {baseUrl}/v1/audio/transcriptions`

Default base URL: `https://api.openai.com`

### Request Format

The implementation builds `multipart/form-data` manually (no FormData dependency) with a custom boundary:

| Field | Type | Required | Description |
|---|---|---|---|
| `file` | binary | Yes | Audio data with `filename="audio.wav"` and appropriate MIME type |
| `model` | string | Yes | Model identifier (default: `whisper-1`) |
| `response_format` | string | Yes | Always `verbose_json` (provides segments, duration, language) |
| `language` | string | No | BCP-47 language hint |

### Headers

- `Authorization: Bearer {OPENAI_API_KEY}`
- `Content-Type: multipart/form-data; boundary={boundary}`

### Response (verbose_json)

```json
{
  "text": "Transcribed text here",
  "language": "en",
  "duration": 3.42,
  "segments": [
    {
      "avg_logprob": -0.234
    }
  ]
}
```

### Confidence Calculation

The provider derives a 0-1 confidence score from segment `avg_logprob` values:

1. Collect all `avg_logprob` values from segments.
2. Compute the arithmetic mean.
3. Apply `Math.exp(meanLogProb)` to convert log-probability to probability.
4. Clamp to `[0, 1]` with `Math.max(0, Math.min(1, value))`.

### Error Handling

- Non-OK HTTP responses throw `"WhisperSTTProvider: API returned {status}: {body}"`.
- Body read failures degrade to `"unknown error"`.
- Empty API key throws before any network call.
- Empty audio buffer throws before any network call.

### Size Limits

- OpenAI Whisper API max file size: 25 MB.
- VoiceSidecar enforces this as `STT_MAX_AUDIO_BYTES = 25 * 1024 * 1024`.
- WebSocket `MAX_PAYLOAD_BYTES` is 1 MB (separate from audio size limit; base64 encoding inflates).

---

## 4. Local Whisper Setup

### Prerequisites

The `LocalSTTProvider` wraps the `whisper` CLI from the `openai-whisper` Python package.

```bash
pip install openai-whisper
```

Or for faster inference with GPU support, use `faster-whisper`:

```bash
pip install faster-whisper
```

The `whisper.cpp` C++ port is also compatible when installed as a CLI tool.

### Configuration

Set `EVOKORE_WHISPER_PATH` to the binary path if not on `PATH`:

```bash
EVOKORE_STT_ENABLED=true
EVOKORE_STT_PROVIDER=local-whisper
EVOKORE_WHISPER_PATH=/usr/local/bin/whisper
EVOKORE_STT_LOCAL_MODEL=base
```

### CLI Invocation

The provider runs:

```bash
whisper <tmp_input.wav> --model <model> --output_format txt --output_dir <tmpdir> [--language <lang>]
```

- Input: Audio buffer written to a temp `.wav` file.
- Output: Text file read from `<input_basename>.txt` in the output directory.
- Timeout: 60 seconds.
- Cleanup: Both input and output temp files are deleted in a `finally` block.

### Availability Detection

The provider checks for the whisper binary using `which` (Unix) or `where` (Windows) via `execFileSync`. The result is cached after the first check.

### Limitations vs Cloud Provider

| Feature | WhisperSTTProvider (cloud) | LocalSTTProvider (local) |
|---|---|---|
| Confidence score | Yes (from segment logprobs) | No |
| Detected language | Yes | No |
| Audio duration | Yes | No |
| Internet required | Yes | No |
| GPU acceleration | N/A (cloud) | Optional (whisper.cpp, faster-whisper) |
| Cost | $0.006/minute | Free |

---

## 5. WebSocket Protocol for STT

### Request Message

```json
{
  "type": "transcribe",
  "audio": "<base64-encoded audio>",
  "language": "en",
  "model": "whisper-1"
}
```

### Success Response

```json
{
  "type": "stt_result",
  "text": "Hello world",
  "confidence": 0.92,
  "language": "en",
  "duration": 1.5
}
```

### Error Response

```json
{
  "type": "stt_error",
  "error": "Error description"
}
```

### Validation Sequence

1. Check `sttProvider` is not null (STT enabled).
2. Validate `audio` field is present and is a string.
3. Decode base64, check buffer is not empty.
4. Check buffer does not exceed 25 MB.
5. Call `provider.transcribe()`.
6. Return result or catch and return error.

---

## 6. Test Coverage Added

The `tests/integration/stt-whisper-validation.test.ts` file provides production validation across 20 test sections:

| Section | Description | Tests |
|---|---|---|
| 1 | STTProvider interface contract completeness | 10 |
| 2 | Audio format support (runtime + source) | 7 |
| 3 | WhisperSTTProvider construction and configuration | 7 |
| 4 | Whisper API request format validation | 14 |
| 5 | Whisper API response parsing | 12 |
| 6 | WhisperSTTProvider error handling paths | 5 |
| 7 | LocalSTTProvider construction and configuration | 7 |
| 8 | LocalSTTProvider temp file and CLI handling | 13 |
| 9 | LocalSTTProvider error handling paths | 4 |
| 10 | VoiceSidecar STT factory integration | 9 |
| 11 | VoiceSidecar STT WebSocket message handling | 13 |
| 12 | Health check STT status reporting | 5 |
| 13 | STT environment variable configuration | 10 |
| 14 | STTClientMessage interface validation | 5 |
| 15 | STTResponse and STTErrorResponse interfaces | 7 |
| 16 | Cross-module type import validation | 5 |
| 17 | Compiled module runtime validation | 8 |
| 18 | Provider name consistency | 3 |
| 19 | Security and safety validation | 6 |
| 20 | STT/TTS provider mirror pattern | 6 |

**Total: ~156 tests**

### Test Strategy

- **Source-level validation:** Regex/string matching against TypeScript source to verify structural contracts without requiring live API keys or audio hardware.
- **Runtime validation:** Loading compiled `dist/` modules to verify exports, prototypes, and constructor behavior.
- **Error path testing:** Exercising error conditions (missing API key, empty buffer, missing CLI) with real module instances.
- **Cross-module consistency:** Verifying that provider names, env var defaults, and import paths align across all three modules.
- **Security audit:** Confirming loopback binding, size limits, `execFileSync` (not `execSync`), temp file cleanup, and no API key leakage.

---

## 7. Relationship to Prior Research

This validation builds on the feasibility study from 2026-03-14, which recommended the phased approach:

- **Phase 1 (Prototype):** Whisper batch mode -- **Implemented** (WhisperSTTProvider)
- **Phase 2 (Streaming):** Deepgram WebSocket -- Not yet implemented
- **Phase 3 (Offline):** whisper.cpp local fallback -- **Implemented** (LocalSTTProvider)

The current implementation covers Phases 1 and 3. Phase 2 (streaming) remains a future enhancement that would add a third provider implementation.

---

## 8. References

- [OpenAI Whisper API](https://platform.openai.com/docs/guides/speech-to-text)
- [openai-whisper Python package](https://github.com/openai/whisper)
- [whisper.cpp](https://github.com/ggerganov/whisper.cpp)
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper)
- Prior research: `docs/research/stt-integration-feasibility-2026-03-14.md`
- TTS mirror pattern: `docs/research/tts-provider-abstraction-2026-03-25.md`
