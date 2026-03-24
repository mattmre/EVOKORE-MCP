import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import fs from "fs";
import path from "path";
import os from "os";
import { spawn, execSync } from "child_process";
import type { STTProvider, STTResult } from "./STTProvider";

// --- Types ---

interface VoiceConfig {
  voiceId: string;
  voiceName: string;
  model: string;
  stability: number;
  similarityBoost: number;
  speed: number;
  outputFormat: string;
  postProcessTempo?: number;
}

interface VoicesFile {
  default: VoiceConfig;
  personas: Record<string, Partial<VoiceConfig>>;
}

interface ClientMessage {
  text: string;
  persona?: string;
  flush?: boolean;
}

/** STT request message from a client. */
interface STTClientMessage {
  type: "transcribe";
  /** Base64-encoded audio data. */
  audio: string;
  /** Optional language hint (BCP-47). */
  language?: string;
  /** Optional model override. */
  model?: string;
}

/** STT response sent back to the client. */
interface STTResponse {
  type: "stt_result";
  text: string;
  confidence?: number;
  language?: string;
  duration?: number;
}

/** Error response for STT failures. */
interface STTErrorResponse {
  type: "stt_error";
  error: string;
}

interface HealthResponse {
  type: "health";
  status: "ok";
  connections: number;
  uptime: number;
  sttEnabled: boolean;
  sttProvider: string | null;
}

// --- Config ---

const PORT = parseInt(process.env.VOICE_SIDECAR_PORT || "8888", 10);
const VOICES_PATH = path.resolve(__dirname, "../voices.json");
const PLAYBACK_DISABLED = process.env.VOICE_SIDECAR_DISABLE_PLAYBACK === "1";
const ARTIFACT_DIR = process.env.VOICE_SIDECAR_ARTIFACT_DIR
  ? path.resolve(process.env.VOICE_SIDECAR_ARTIFACT_DIR)
  : null;
const MAX_CONNECTIONS = parseInt(process.env.VOICE_SIDECAR_MAX_CONNECTIONS || "5", 10);
const MAX_TEXT_LENGTH = 10000;
const HEARTBEAT_INTERVAL_MS = 30000;
const CONNECT_TIMEOUT_MS = 10000;
const CONNECT_MAX_RETRIES = 2;
const FLUSH_TIMEOUT_MS = 30000;
const SHUTDOWN_DRAIN_MS = 2000;
const MAX_PAYLOAD_BYTES = 1 * 1024 * 1024; // 1 MB

const STT_ENABLED = process.env.EVOKORE_STT_ENABLED === "true";
const STT_PROVIDER_NAME = process.env.EVOKORE_STT_PROVIDER || "whisper-api";
const STT_MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB (Whisper API limit)

const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function loadVoicesConfig(): VoicesFile {
  const raw = fs.readFileSync(VOICES_PATH, "utf-8");
  return JSON.parse(raw) as VoicesFile;
}

function resolvePersona(role?: string): VoiceConfig {
  const config = loadVoicesConfig();
  if (!role || !config.personas[role]) {
    return config.default;
  }
  return { ...config.default, ...config.personas[role] };
}

function saveAudioArtifact(filePath: string): string | null {
  if (!ARTIFACT_DIR) {
    return null;
  }

  try {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

    const extension = path.extname(filePath) || ".mp3";
    const artifactPath = path.join(ARTIFACT_DIR, `evokore-voice-${Date.now()}${extension}`);
    fs.copyFileSync(filePath, artifactPath);

    return artifactPath;
  } catch (err: any) {
    console.error("[VoiceSidecar] Failed to save audio artifact:", err.message);
    return null;
  }
}

// --- Startup Temp File Cleanup ---

function cleanupStaleTempFiles(): void {
  try {
    const tmpDir = os.tmpdir();
    const entries = fs.readdirSync(tmpDir);
    let cleaned = 0;

    for (const entry of entries) {
      if (entry.startsWith("evokore-voice-") && entry.endsWith(".mp3")) {
        try {
          fs.unlinkSync(path.join(tmpDir, entry));
          cleaned++;
        } catch {
          // File may be in use by another process
        }
      }
    }

    if (cleaned > 0) {
      console.error(`[VoiceSidecar] Cleaned up ${cleaned} stale temp file(s)`);
    }
  } catch (err: any) {
    console.error("[VoiceSidecar] Temp cleanup warning:", err.message);
  }
}

// --- Audio Playback ---

function playAudio(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const platform = process.platform;
    let proc;

    if (platform === "win32") {
      proc = spawn("powershell", [
        "-NoProfile", "-c",
        `Start-Process -Wait '${filePath}'`
      ], { stdio: "ignore" });
    } else if (platform === "darwin") {
      proc = spawn("afplay", [filePath], { stdio: "ignore" });
    } else {
      // Linux: try mpv first
      try {
        execSync("which mpv", { stdio: "ignore" });
        proc = spawn("mpv", ["--no-terminal", filePath], { stdio: "ignore" });
      } catch {
        proc = spawn("aplay", [filePath], { stdio: "ignore" });
      }
    }

    proc.on("close", () => resolve());
    proc.on("error", (err) => {
      console.error("[VoiceSidecar] Playback error:", err.message);
      resolve(); // Don't crash on playback failure
    });
  });
}

// --- Playback Queue ---
// Serialises all audio playback across connections so that two CLI sessions
// finishing simultaneously speak one after the other rather than overlapping.

const playbackQueue: Array<() => Promise<void>> = [];
let queueDraining = false;

async function drainPlaybackQueue(): Promise<void> {
  if (queueDraining) return;
  queueDraining = true;
  while (playbackQueue.length > 0) {
    const task = playbackQueue.shift()!;
    try {
      await task();
    } catch (err: any) {
      console.error("[VoiceSidecar] Playback queue error:", err.message);
    }
  }
  queueDraining = false;
}

function enqueuePlayback(task: () => Promise<void>): void {
  playbackQueue.push(task);
  if (playbackQueue.length > 1) {
    console.error(`[VoiceSidecar] Queued playback (position ${playbackQueue.length} in queue)`);
  }
  drainPlaybackQueue().catch((err) => {
    console.error("[VoiceSidecar] Queue drain error:", err.message);
  });
}

// --- Post-Process Speed (ffmpeg) ---

function postProcessSpeed(input: string, output: string, tempo: number): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      // Check if ffmpeg is available
      execSync(process.platform === "win32" ? "where ffmpeg" : "which ffmpeg", { stdio: "ignore" });
    } catch {
      resolve(false);
      return;
    }

    // Chain atempo filters for speeds > 2.0 (atempo max is 2.0 per pass)
    const filters: string[] = [];
    let remaining = tempo;
    while (remaining > 2.0) {
      filters.push("atempo=2.0");
      remaining /= 2.0;
    }
    filters.push(`atempo=${remaining.toFixed(4)}`);

    const filterStr = filters.join(",");
    const proc = spawn("ffmpeg", ["-y", "-i", input, "-filter:a", filterStr, output], { stdio: "ignore" });

    proc.on("close", (code) => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });
}

// --- ElevenLabs Streamer ---

class ElevenLabsStreamer {
  private ws: WebSocket | null = null;
  private audioChunks: Buffer[] = [];
  private voice: VoiceConfig;
  private apiKey: string;
  private resolveFinished: (() => void) | null = null;

  constructor(voice: VoiceConfig, apiKey: string) {
    this.voice = voice;
    this.apiKey = apiKey;
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
            this.finalize();
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

  flush(): Promise<void> {
    return new Promise((resolve) => {
      const flushTimer = setTimeout(() => {
        console.error("[VoiceSidecar] Flush timed out, forcing resolution");
        this.resolveFinished = null;
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.close();
        }
        resolve();
      }, FLUSH_TIMEOUT_MS);

      this.resolveFinished = () => {
        clearTimeout(flushTimer);
        resolve();
      };

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ text: "" }));
      } else {
        clearTimeout(flushTimer);
        resolve();
      }
    });
  }

  private async finalize(): Promise<void> {
    if (this.audioChunks.length === 0) return;

    const combined = Buffer.concat(this.audioChunks);
    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, `evokore-voice-${Date.now()}.mp3`);

    fs.writeFileSync(tmpFile, combined);

    let playFile = tmpFile;

    // Apply post-process tempo if configured
    if (this.voice.postProcessTempo && this.voice.postProcessTempo !== 1.0) {
      const processedFile = path.join(tmpDir, `evokore-voice-${Date.now()}-fast.mp3`);
      const ok = await postProcessSpeed(tmpFile, processedFile, this.voice.postProcessTempo);
      if (ok) {
        playFile = processedFile;
      }
    }

    const artifactPath = saveAudioArtifact(playFile);
    if (artifactPath) {
      console.error(`[VoiceSidecar] Saved audio artifact: ${artifactPath}`);
    }

    const sizeKB = (combined.length / 1024).toFixed(1);
    const capturedTmpFile = tmpFile;
    const capturedPlayFile = playFile;

    enqueuePlayback(async () => {
      if (PLAYBACK_DISABLED) {
        console.error("[VoiceSidecar] Playback disabled by VOICE_SIDECAR_DISABLE_PLAYBACK=1");
      } else {
        console.error(`[VoiceSidecar] Playing audio (${sizeKB}KB)`);
        await playAudio(capturedPlayFile);
      }

      // Cleanup temp files after playback completes
      try { fs.unlinkSync(capturedTmpFile); } catch {}
      if (capturedPlayFile !== capturedTmpFile) {
        try { fs.unlinkSync(capturedPlayFile); } catch {}
      }
    });
  }
}

// --- STT Provider Initialization ---

function initSTTProvider(): STTProvider | null {
  if (!STT_ENABLED) {
    return null;
  }

  try {
    if (STT_PROVIDER_NAME === "local-whisper" || STT_PROVIDER_NAME === "local") {
      const { LocalSTTProvider } = require("./stt/LocalSTTProvider");
      const provider = new LocalSTTProvider();
      if (!provider.isAvailable()) {
        console.error("[VoiceSidecar] STT: local whisper CLI not found, STT disabled");
        return null;
      }
      return provider;
    }

    // Default: whisper-api
    const { WhisperSTTProvider } = require("./stt/WhisperSTTProvider");
    const provider = new WhisperSTTProvider();
    if (!provider.isAvailable()) {
      console.error("[VoiceSidecar] STT: OPENAI_API_KEY not set, STT disabled");
      return null;
    }
    return provider;
  } catch (err: any) {
    console.error("[VoiceSidecar] STT: Failed to load provider:", err.message);
    return null;
  }
}

// --- WebSocket Server ---

function startServer(): void {
  const startTime = Date.now();
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("[VoiceSidecar] ELEVENLABS_API_KEY not set. Load via .env or export.");
    process.exit(1);
  }

  // Initialize STT provider (opt-in via EVOKORE_STT_ENABLED=true)
  const sttProvider = initSTTProvider();
  if (sttProvider) {
    console.error(`[VoiceSidecar] STT enabled: provider=${sttProvider.name}`);
  }

  // Cleanup stale temp files from prior runs
  cleanupStaleTempFiles();

  const wss = new WebSocketServer({
    port: PORT,
    host: "127.0.0.1",
    maxPayload: MAX_PAYLOAD_BYTES,
    verifyClient: (info: { origin: string; secure: boolean; req: IncomingMessage }) => {
      const origin = info.req.socket.remoteAddress || "";
      return LOOPBACK_ADDRESSES.has(origin);
    },
  });

  console.error(`[VoiceSidecar] Listening on ws://127.0.0.1:${PORT}`);
  console.error(`[VoiceSidecar] voices.json: ${VOICES_PATH}`);

  // --- Ping/pong heartbeat ---
  const heartbeatInterval = setInterval(() => {
    for (const client of wss.clients) {
      if ((client as any).__alive === false) {
        console.error("[VoiceSidecar] Terminating unresponsive client");
        client.terminate();
        continue;
      }
      (client as any).__alive = false;
      client.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  wss.on("connection", async (client, req) => {
    // --- Connection limit ---
    if (wss.clients.size > MAX_CONNECTIONS) {
      console.error(`[VoiceSidecar] Connection limit reached (${MAX_CONNECTIONS}), rejecting client`);
      client.close(1013, "Maximum connections reached");
      return;
    }

    (client as any).__alive = true;
    client.on("pong", () => {
      (client as any).__alive = true;
    });

    let streamer: ElevenLabsStreamer | null = null;
    let currentPersona: string | undefined;

    console.error("[VoiceSidecar] Client connected");

    client.on("message", async (raw: Buffer) => {
      try {
        const msg: ClientMessage = JSON.parse(raw.toString());

        // --- Health check ---
        if (msg.text === "__health") {
          const response: HealthResponse = {
            type: "health",
            status: "ok",
            connections: wss.clients.size,
            uptime: Math.floor((Date.now() - startTime) / 1000),
            sttEnabled: sttProvider !== null,
            sttProvider: sttProvider ? sttProvider.name : null,
          };
          client.send(JSON.stringify(response));
          return;
        }

        // --- STT transcription request ---
        if ((msg as any).type === "transcribe") {
          const sttMsg = msg as unknown as STTClientMessage;

          if (!sttProvider) {
            const errResp: STTErrorResponse = {
              type: "stt_error",
              error: "STT is not enabled. Set EVOKORE_STT_ENABLED=true and configure a provider.",
            };
            client.send(JSON.stringify(errResp));
            return;
          }

          if (!sttMsg.audio || typeof sttMsg.audio !== "string") {
            const errResp: STTErrorResponse = {
              type: "stt_error",
              error: "audio field is required and must be a base64-encoded string",
            };
            client.send(JSON.stringify(errResp));
            return;
          }

          try {
            const audioBuffer = Buffer.from(sttMsg.audio, "base64");

            if (audioBuffer.length === 0) {
              const errResp: STTErrorResponse = {
                type: "stt_error",
                error: "audio buffer is empty",
              };
              client.send(JSON.stringify(errResp));
              return;
            }

            if (audioBuffer.length > STT_MAX_AUDIO_BYTES) {
              const errResp: STTErrorResponse = {
                type: "stt_error",
                error: `audio exceeds maximum size of ${STT_MAX_AUDIO_BYTES} bytes`,
              };
              client.send(JSON.stringify(errResp));
              return;
            }

            console.error(`[VoiceSidecar] STT: transcribing ${(audioBuffer.length / 1024).toFixed(1)}KB audio`);

            const result: STTResult = await sttProvider.transcribe(audioBuffer, {
              language: sttMsg.language,
              model: sttMsg.model,
            });

            const response: STTResponse = {
              type: "stt_result",
              text: result.text,
              confidence: result.confidence,
              language: result.language,
              duration: result.duration,
            };
            client.send(JSON.stringify(response));
          } catch (sttErr: any) {
            console.error("[VoiceSidecar] STT error:", sttErr.message);
            const errResp: STTErrorResponse = {
              type: "stt_error",
              error: sttErr.message,
            };
            client.send(JSON.stringify(errResp));
          }
          return;
        }

        // --- Input validation ---
        if (msg.text !== undefined && typeof msg.text !== "string") {
          client.send(JSON.stringify({ error: "text must be a string" }));
          return;
        }
        if (typeof msg.text === "string" && msg.text.length > MAX_TEXT_LENGTH) {
          client.send(JSON.stringify({ error: `text exceeds maximum length of ${MAX_TEXT_LENGTH} characters` }));
          return;
        }
        if (msg.persona !== undefined && typeof msg.persona !== "string") {
          client.send(JSON.stringify({ error: "persona must be a string" }));
          return;
        }

        // Initialize streamer on first message with text
        if (!streamer && msg.text) {
          currentPersona = msg.persona;
          const voice = resolvePersona(msg.persona);
          console.error(`[VoiceSidecar] Persona: ${msg.persona || "default"} \u2192 ${voice.voiceName}`);
          streamer = new ElevenLabsStreamer(voice, apiKey);
          await streamer.connect();
        }

        // Send text chunk
        if (streamer && msg.text) {
          streamer.sendText(msg.text);
        }

        // Flush (end of stream)
        if (msg.flush && streamer) {
          await streamer.flush();
          streamer = null;
        }
      } catch (err: any) {
        console.error("[VoiceSidecar] Message error:", err.message);
        client.send(JSON.stringify({ error: err.message }));
      }
    });

    client.on("close", () => {
      console.error("[VoiceSidecar] Client disconnected");
    });
  });

  // --- Graceful shutdown ---
  function gracefulShutdown(): void {
    console.error("\n[VoiceSidecar] Shutting down...");
    clearInterval(heartbeatInterval);

    // Close all clients with 1001 (Going Away)
    for (const client of wss.clients) {
      client.close(1001, "Server shutting down");
    }

    // Drain period then exit
    setTimeout(() => {
      wss.close(() => {
        console.error("[VoiceSidecar] Shutdown complete");
        process.exit(0);
      });
    }, SHUTDOWN_DRAIN_MS);
  }

  process.on("SIGINT", gracefulShutdown);
  process.on("SIGTERM", gracefulShutdown);
}

// --- Load .env and start ---

import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../.env"), quiet: true });

startServer();
