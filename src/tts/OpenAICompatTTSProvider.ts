import type { TTSProvider, TTSVoiceConfig } from "../TTSProvider";

/**
 * OpenAI-compatible TTS provider.
 *
 * Sends accumulated text to any endpoint implementing the OpenAI
 * `/v1/audio/speech` contract (e.g., Kokoro-FastAPI, Chatterbox TTS API,
 * OpenAI TTS). Runs entirely locally when pointed at a local server.
 */
export class OpenAICompatTTSProvider implements TTSProvider {
  readonly name = "openai-compat";

  private baseUrl: string;
  private apiKey: string;
  private voice: TTSVoiceConfig;
  private defaultVoice: string;
  private defaultModel: string;
  private textBuffer: string[] = [];

  constructor(voice: TTSVoiceConfig, baseUrl: string, apiKey?: string) {
    this.voice = voice;
    this.baseUrl = baseUrl.replace(/\/+$/, ""); // strip trailing slashes
    this.apiKey = apiKey || "";
    this.defaultVoice = voice.openaiVoice || process.env.EVOKORE_TTS_VOICE || "nova";
    this.defaultModel = voice.openaiModel || process.env.EVOKORE_TTS_MODEL || "tts-1";
  }

  isAvailable(): boolean {
    // Local endpoints are assumed available; connection errors surface at flush time.
    return true;
  }

  async connect(): Promise<void> {
    // HTTP is stateless — no persistent connection needed.
    this.textBuffer = [];
  }

  sendText(chunk: string): void {
    if (chunk) {
      this.textBuffer.push(chunk);
    }
  }

  async flush(): Promise<Buffer | null> {
    const fullText = this.textBuffer.join("").trim();
    this.textBuffer = [];

    if (!fullText) {
      return null;
    }

    const url = `${this.baseUrl}/v1/audio/speech`;

    const body = JSON.stringify({
      model: this.defaultModel,
      input: fullText,
      voice: this.defaultVoice,
      response_format: "mp3",
      speed: this.voice.speed || 1.0,
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "unknown error");
        console.error(
          `[VoiceSidecar] OpenAI-compat TTS error: ${response.status} ${errorText}`
        );
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const audio = Buffer.from(arrayBuffer);

      if (audio.length === 0) {
        console.error("[VoiceSidecar] OpenAI-compat TTS returned empty audio");
        return null;
      }

      return audio;
    } catch (err: any) {
      console.error(`[VoiceSidecar] OpenAI-compat TTS request failed: ${err.message}`);
      return null;
    }
  }
}
