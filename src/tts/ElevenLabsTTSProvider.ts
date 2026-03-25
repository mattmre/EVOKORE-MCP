import { WebSocket } from "ws";
import type { TTSProvider, TTSVoiceConfig } from "../TTSProvider";

const CONNECT_TIMEOUT_MS = 10000;
const CONNECT_MAX_RETRIES = 2;
const FLUSH_TIMEOUT_MS = 30000;

export class ElevenLabsTTSProvider implements TTSProvider {
  readonly name = "elevenlabs";

  private ws: WebSocket | null = null;
  private audioChunks: Buffer[] = [];
  private voice: TTSVoiceConfig;
  private apiKey: string;
  private resolveFinished: (() => void) | null = null;

  constructor(voice: TTSVoiceConfig, apiKey: string) {
    this.voice = voice;
    this.apiKey = apiKey;
  }

  isAvailable(): boolean {
    return this.apiKey.length > 0;
  }

  async connect(): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= CONNECT_MAX_RETRIES; attempt++) {
      try {
        await this.attemptConnect();
        return;
      } catch (err: any) {
        lastError = err;
        if (attempt < CONNECT_MAX_RETRIES) {
          const delay = Math.pow(2, attempt) * 500; // 500ms, 1000ms
          console.error(`[VoiceSidecar] ElevenLabs connect attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    throw lastError || new Error("ElevenLabs connection failed after retries");
  }

  private attemptConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `wss://api.elevenlabs.io/v1/text-to-speech/${this.voice.voiceId}/stream-input?model_id=${this.voice.model}&output_format=${this.voice.outputFormat}`;

      this.ws = new WebSocket(url);

      const connectTimer = setTimeout(() => {
        if (this.ws) {
          this.ws.terminate();
        }
        reject(new Error("ElevenLabs connection timed out"));
      }, CONNECT_TIMEOUT_MS);

      this.ws.on("open", () => {
        clearTimeout(connectTimer);
        // Send initial config message
        this.ws!.send(JSON.stringify({
          text: " ",
          voice_settings: {
            stability: this.voice.stability,
            similarity_boost: this.voice.similarityBoost,
            speed: this.voice.speed,
          },
          xi_api_key: this.apiKey,
        }));
        resolve();
      });

      this.ws.on("message", (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.audio) {
            this.audioChunks.push(Buffer.from(msg.audio, "base64"));
          }
          if (msg.isFinal) {
            if (this.resolveFinished) {
              this.resolveFinished();
              this.resolveFinished = null;
            }
          }
        } catch {
          // Ignore non-JSON messages
        }
      });

      this.ws.on("error", (err) => {
        clearTimeout(connectTimer);
        console.error("[VoiceSidecar] ElevenLabs WS error:", err.message);
        reject(err);
      });

      this.ws.on("close", () => {
        clearTimeout(connectTimer);
        if (this.resolveFinished) {
          this.resolveFinished();
          this.resolveFinished = null;
        }
      });
    });
  }

  sendText(chunk: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        text: chunk,
        try_trigger_generation: true,
      }));
    }
  }

  flush(): Promise<Buffer | null> {
    return new Promise((resolve) => {
      const flushTimer = setTimeout(() => {
        console.error("[VoiceSidecar] Flush timed out, forcing resolution");
        this.resolveFinished = null;
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.close();
        }
        // Return whatever audio we have
        resolve(this.audioChunks.length > 0 ? Buffer.concat(this.audioChunks) : null);
      }, FLUSH_TIMEOUT_MS);

      this.resolveFinished = () => {
        clearTimeout(flushTimer);
        const audio = this.audioChunks.length > 0 ? Buffer.concat(this.audioChunks) : null;
        resolve(audio);
      };

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ text: "" }));
      } else {
        clearTimeout(flushTimer);
        resolve(this.audioChunks.length > 0 ? Buffer.concat(this.audioChunks) : null);
      }
    });
  }
}
