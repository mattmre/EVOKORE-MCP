import { WebSocketServer, WebSocket } from "ws";
import fs from "fs";
import path from "path";
import os from "os";
import { spawn, execSync } from "child_process";

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

// --- Config ---

const PORT = parseInt(process.env.VOICE_SIDECAR_PORT || "8888", 10);
const VOICES_PATH = path.resolve(__dirname, "../voices.json");

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

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `wss://api.elevenlabs.io/v1/text-to-speech/${this.voice.voiceId}/stream-input?model_id=${this.voice.model}&output_format=${this.voice.outputFormat}`;

      this.ws = new WebSocket(url);

      this.ws.on("open", () => {
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
        console.error("[VoiceSidecar] ElevenLabs WS error:", err.message);
        reject(err);
      });

      this.ws.on("close", () => {
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
      this.resolveFinished = resolve;
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ text: "" }));
      } else {
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

    console.error(`[VoiceSidecar] Playing audio (${(combined.length / 1024).toFixed(1)}KB)`);
    await playAudio(playFile);

    // Cleanup temp files
    try { fs.unlinkSync(tmpFile); } catch {}
    if (playFile !== tmpFile) {
      try { fs.unlinkSync(playFile); } catch {}
    }
  }
}

// --- WebSocket Server ---

function startServer(): void {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("[VoiceSidecar] ELEVENLABS_API_KEY not set. Load via .env or export.");
    process.exit(1);
  }

  const wss = new WebSocketServer({ port: PORT });

  console.error(`[VoiceSidecar] Listening on ws://localhost:${PORT}`);
  console.error(`[VoiceSidecar] voices.json: ${VOICES_PATH}`);

  wss.on("connection", async (client) => {
    let streamer: ElevenLabsStreamer | null = null;
    let currentPersona: string | undefined;

    console.error("[VoiceSidecar] Client connected");

    client.on("message", async (raw: Buffer) => {
      try {
        const msg: ClientMessage = JSON.parse(raw.toString());

        // Initialize streamer on first message with text
        if (!streamer && msg.text) {
          currentPersona = msg.persona;
          const voice = resolvePersona(msg.persona);
          console.error(`[VoiceSidecar] Persona: ${msg.persona || "default"} → ${voice.voiceName}`);
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

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.error("\n[VoiceSidecar] Shutting down...");
    wss.close();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    wss.close();
    process.exit(0);
  });
}

// --- Load .env and start ---

import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

startServer();
