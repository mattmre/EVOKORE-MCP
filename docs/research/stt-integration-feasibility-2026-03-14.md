# STT Integration Feasibility Research

**Date:** 2026-03-14
**Status:** Feasibility study -- no commitments made

This document evaluates speech-to-text (STT) options for integrating voice input into the EVOKORE-MCP voice sidecar architecture.

---

## 1. Current Architecture Context

The existing voice pipeline is output-only (TTS):

```
Claude response -> voice-hook.js -> VoiceSidecar -> ElevenLabs TTS -> audio playback
```

Adding STT would create the reverse path:

```
microphone -> STT engine -> transcribed text -> Claude Code input
```

The key challenge is that Claude Code runs in a terminal, and microphone capture plus real-time streaming require capabilities that are non-trivial in a CLI environment.

---

## 2. STT Provider Evaluation

### 2.1 OpenAI Whisper API

| Attribute | Detail |
|---|---|
| **API** | `POST https://api.openai.com/v1/audio/transcriptions` |
| **Cost** | $0.006 per minute |
| **Latency** | Batch only (no streaming). Typical: 1-3 seconds for short clips |
| **Accuracy** | Excellent for English, good for 50+ languages |
| **Streaming** | Not supported (file upload only) |
| **Node.js SDK** | `openai` npm package (official, well-maintained) |
| **Max file size** | 25 MB |
| **Local option** | Whisper.cpp (C++ port) or whisper-node for local inference |

**Pros:** Low cost, high accuracy, simple API, familiar SDK.
**Cons:** No streaming -- must record a full clip then transcribe. Adds latency for conversational use.

### 2.2 Google Cloud Speech-to-Text

| Attribute | Detail |
|---|---|
| **API** | gRPC and REST |
| **Cost** | $0.006/15 seconds (standard), $0.009/15 seconds (enhanced) |
| **Latency** | Sub-second for streaming mode |
| **Accuracy** | Very high, especially with domain adaptation |
| **Streaming** | Yes, full duplex gRPC streaming |
| **Node.js SDK** | `@google-cloud/speech` (official) |
| **Free tier** | 60 minutes/month |

**Pros:** Real-time streaming, high accuracy, mature SDK, interim results.
**Cons:** Requires GCP project setup, service account credentials, heavier SDK dependency.

### 2.3 Azure Speech Services

| Attribute | Detail |
|---|---|
| **API** | REST and WebSocket |
| **Cost** | $1.00 per audio hour (standard) |
| **Latency** | Real-time streaming with interim results |
| **Accuracy** | Comparable to Google, strong custom model support |
| **Streaming** | Yes, WebSocket-based |
| **Node.js SDK** | `microsoft-cognitiveservices-speech-sdk` |
| **Free tier** | 5 hours/month |

**Pros:** Real-time streaming, good Windows integration, custom models.
**Cons:** SDK is large (~50MB), Azure account required, more complex setup.

### 2.4 Deepgram

| Attribute | Detail |
|---|---|
| **API** | REST and WebSocket |
| **Cost** | $0.0043/minute (Nova-2), $0.0059/minute (Enhanced) |
| **Latency** | Sub-300ms for streaming |
| **Accuracy** | Very high for English, competitive with Whisper |
| **Streaming** | Yes, WebSocket-based with interim results |
| **Node.js SDK** | `@deepgram/sdk` (official, well-maintained) |
| **Free tier** | $200 credit on signup |

**Pros:** Lowest latency, competitive pricing, clean WebSocket SDK, streaming with interim results.
**Cons:** Smaller ecosystem than Google/Azure, fewer languages.

### 2.5 AssemblyAI

| Attribute | Detail |
|---|---|
| **API** | REST and WebSocket |
| **Cost** | $0.0062/minute (Best Tier) |
| **Latency** | Real-time streaming with ~300ms latency |
| **Accuracy** | High, strong speaker diarization |
| **Streaming** | Yes, WebSocket-based |
| **Node.js SDK** | `assemblyai` (official) |
| **Free tier** | Limited trial hours |

**Pros:** Good streaming support, speaker diarization, clean SDK.
**Cons:** Higher cost than Deepgram, smaller community than Google/OpenAI.

---

## 3. Comparison Summary

| Provider | Streaming | Cost/min | Latency | SDK Quality | Setup Complexity |
|---|---|---|---|---|---|
| OpenAI Whisper | No | $0.006 | 1-3s (batch) | Excellent | Low |
| Google Cloud | Yes | ~$0.024 | Sub-second | Good | Medium |
| Azure Speech | Yes | ~$0.017 | Sub-second | Good | Medium-High |
| Deepgram | Yes | $0.0043 | Sub-300ms | Good | Low |
| AssemblyAI | Yes | $0.0062 | ~300ms | Good | Low |

---

## 4. Integration Architecture

### Proposed Design

The STT system would run as an extension to the existing voice sidecar, adding an input path alongside the existing TTS output path.

```
Terminal microphone capture
  |
  v
STT Client (Node.js)
  |  streams raw audio via WebSocket to STT provider
  |  receives transcribed text (interim + final)
  |
  v
VoiceSidecar STT Handler
  |  buffers interim results
  |  emits final transcription
  |
  v
Claude Code input injection
  |  (mechanism TBD -- see blockers)
```

### Key Components

1. **Microphone Capture Module**: Captures audio from the default input device, emits PCM buffers.
2. **STT WebSocket Client**: Streams audio to the chosen provider, receives text back.
3. **Transcription Buffer**: Holds interim results, emits final text on silence detection.
4. **Input Injection**: Pipes transcribed text into Claude Code's stdin or uses an MCP tool.

---

## 5. Blockers and Challenges

### 5.1 Microphone Access from CLI

The largest blocker. Terminal applications do not have native microphone access. Options:

- **node-microphone / mic**: npm packages that wrap system audio capture (SoX, arecord, or RecordRTC). Requires SoX installed on the system.
- **naudiodon**: Native Node.js audio I/O using PortAudio. Cross-platform but requires native compilation.
- **Web Audio API via Electron**: Would require shipping a minimal Electron shell just for mic access -- heavy.
- **VoiceMode approach**: The existing VoiceMode MCP server already solves this with `uvx voice-mode`, which runs a Python process that handles mic capture. Could be reused.

**Recommendation:** Reuse VoiceMode's microphone capture approach or require SoX as a system dependency for `node-microphone`.

### 5.2 Claude Code Input Injection

Transcribed text needs to reach Claude Code as if the user typed it. Options:

- **MCP tool**: An `stt_listen` tool that blocks while recording and returns transcribed text. Claude can then process the text as a tool result. This is the cleanest integration but requires Claude to call the tool first.
- **Stdin pipe**: Directly inject text into Claude Code's stdin. Fragile and platform-dependent.
- **VoiceMode pattern**: VoiceMode uses MCP tool calls (`listen` and `converse`), which is the established pattern.

**Recommendation:** Implement as an MCP tool (`voice_listen`) that records and transcribes, returning text as the tool result.

### 5.3 Real-Time Streaming vs. Batch

For a conversational experience, streaming STT is strongly preferred. Batch mode (Whisper) adds 1-3 seconds of latency after speaking, which feels unresponsive.

However, batch mode is simpler to implement and may be acceptable for the initial version.

### 5.4 Platform Audio Dependencies

| Platform | Mic Capture Tool | Status |
|---|---|---|
| Windows | SoX or naudiodon | SoX needs manual install |
| macOS | SoX or naudiodon | `brew install sox` |
| Linux | arecord (ALSA) or SoX | Usually available |

### 5.5 Silence Detection

Knowing when the user has stopped speaking requires Voice Activity Detection (VAD). Options:

- **@ricky0123/vad-node**: WebRTC VAD ported to Node.js. Well-maintained.
- **Simple energy threshold**: Crude but functional for initial implementation.
- **Provider-side**: Deepgram and Google both support endpointing (server-side silence detection).

---

## 6. Recommendations

### Top 3 Options (Ranked)

#### 1. Deepgram (Recommended for production)

- Best latency-to-cost ratio
- Clean WebSocket streaming API maps naturally to the sidecar's existing WebSocket architecture
- Interim results allow UI feedback
- Simple Node.js SDK with minimal dependencies
- $200 free credit is generous for development

#### 2. OpenAI Whisper (Recommended for simplicity / initial prototype)

- Simplest integration (single HTTP POST)
- Uses the same `openai` SDK many projects already have
- High accuracy with zero configuration
- No streaming, but acceptable for a v1 "push-to-talk" style interaction
- Whisper.cpp available for fully offline operation

#### 3. Google Cloud Speech (Recommended for enterprise / multi-language)

- Best streaming quality and language coverage
- Mature SDK with strong documentation
- Good for production deployments that need reliability guarantees
- More setup overhead (GCP project, service account)

### Recommended Phased Approach

**Phase 1 (Prototype):** Implement with OpenAI Whisper in batch mode. Add a `voice_listen` MCP tool that records via SoX, transcribes via Whisper, and returns text. Simple, no streaming complexity.

**Phase 2 (Streaming):** Switch to Deepgram WebSocket streaming for real-time transcription. Add VAD for automatic endpoint detection. Wire into the sidecar as a bidirectional WebSocket handler.

**Phase 3 (Offline):** Add Whisper.cpp as a local fallback for environments without cloud API access.

---

## 7. Cost Projections

Assuming 30 minutes of voice input per day, 20 working days per month:

| Provider | Monthly Cost |
|---|---|
| OpenAI Whisper | $3.60 |
| Deepgram Nova-2 | $2.58 |
| Google Cloud | ~$14.40 |
| Azure | ~$10.00 |
| AssemblyAI | $3.72 |
| Whisper.cpp (local) | $0.00 |

All options are affordable for individual developer use. Combined with ElevenLabs TTS (free tier: 10,000 credits/month), the total voice pipeline cost stays under $5/month for moderate use with Deepgram or Whisper.

---

## 8. References

- [Deepgram Node.js SDK](https://github.com/deepgram/deepgram-node-sdk)
- [OpenAI Whisper API](https://platform.openai.com/docs/guides/speech-to-text)
- [Google Cloud Speech Node.js](https://cloud.google.com/speech-to-text/docs/libraries#client-libraries-install-nodejs)
- [Azure Speech SDK](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/quickstarts/setup-platform?pivots=programming-language-javascript)
- [AssemblyAI Node.js SDK](https://github.com/AssemblyAI/assemblyai-node-sdk)
- [VoiceMode (existing MCP STT)](https://github.com/mbailey/voicemode)
- [node-microphone](https://www.npmjs.com/package/node-microphone)
- [@ricky0123/vad-node](https://github.com/ricky0123/vad)
- [Whisper.cpp](https://github.com/ggerganov/whisper.cpp)
