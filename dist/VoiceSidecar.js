"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = require("ws");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const child_process_1 = require("child_process");
// --- Config ---
const PORT = parseInt(process.env.VOICE_SIDECAR_PORT || "8888", 10);
const VOICES_PATH = path_1.default.resolve(__dirname, "../voices.json");
function loadVoicesConfig() {
    const raw = fs_1.default.readFileSync(VOICES_PATH, "utf-8");
    return JSON.parse(raw);
}
function resolvePersona(role) {
    const config = loadVoicesConfig();
    if (!role || !config.personas[role]) {
        return config.default;
    }
    return { ...config.default, ...config.personas[role] };
}
// --- Audio Playback ---
function playAudio(filePath) {
    return new Promise((resolve, reject) => {
        const platform = process.platform;
        let proc;
        if (platform === "win32") {
            proc = (0, child_process_1.spawn)("powershell", [
                "-NoProfile", "-c",
                `Start-Process -Wait '${filePath}'`
            ], { stdio: "ignore" });
        }
        else if (platform === "darwin") {
            proc = (0, child_process_1.spawn)("afplay", [filePath], { stdio: "ignore" });
        }
        else {
            // Linux: try mpv first
            try {
                (0, child_process_1.execSync)("which mpv", { stdio: "ignore" });
                proc = (0, child_process_1.spawn)("mpv", ["--no-terminal", filePath], { stdio: "ignore" });
            }
            catch {
                proc = (0, child_process_1.spawn)("aplay", [filePath], { stdio: "ignore" });
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
function postProcessSpeed(input, output, tempo) {
    return new Promise((resolve) => {
        try {
            // Check if ffmpeg is available
            (0, child_process_1.execSync)(process.platform === "win32" ? "where ffmpeg" : "which ffmpeg", { stdio: "ignore" });
        }
        catch {
            resolve(false);
            return;
        }
        // Chain atempo filters for speeds > 2.0 (atempo max is 2.0 per pass)
        const filters = [];
        let remaining = tempo;
        while (remaining > 2.0) {
            filters.push("atempo=2.0");
            remaining /= 2.0;
        }
        filters.push(`atempo=${remaining.toFixed(4)}`);
        const filterStr = filters.join(",");
        const proc = (0, child_process_1.spawn)("ffmpeg", ["-y", "-i", input, "-filter:a", filterStr, output], { stdio: "ignore" });
        proc.on("close", (code) => resolve(code === 0));
        proc.on("error", () => resolve(false));
    });
}
// --- ElevenLabs Streamer ---
class ElevenLabsStreamer {
    ws = null;
    audioChunks = [];
    voice;
    apiKey;
    resolveFinished = null;
    constructor(voice, apiKey) {
        this.voice = voice;
        this.apiKey = apiKey;
    }
    connect() {
        return new Promise((resolve, reject) => {
            const url = `wss://api.elevenlabs.io/v1/text-to-speech/${this.voice.voiceId}/stream-input?model_id=${this.voice.model}&output_format=${this.voice.outputFormat}`;
            this.ws = new ws_1.WebSocket(url);
            this.ws.on("open", () => {
                // Send initial config message
                this.ws.send(JSON.stringify({
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
            this.ws.on("message", (data) => {
                try {
                    const msg = JSON.parse(data.toString());
                    if (msg.audio) {
                        this.audioChunks.push(Buffer.from(msg.audio, "base64"));
                    }
                    if (msg.isFinal) {
                        this.finalize();
                    }
                }
                catch {
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
    sendText(chunk) {
        if (this.ws && this.ws.readyState === ws_1.WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                text: chunk,
                try_trigger_generation: true,
            }));
        }
    }
    flush() {
        return new Promise((resolve) => {
            this.resolveFinished = resolve;
            if (this.ws && this.ws.readyState === ws_1.WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ text: "" }));
            }
            else {
                resolve();
            }
        });
    }
    async finalize() {
        if (this.audioChunks.length === 0)
            return;
        const combined = Buffer.concat(this.audioChunks);
        const tmpDir = os_1.default.tmpdir();
        const tmpFile = path_1.default.join(tmpDir, `evokore-voice-${Date.now()}.mp3`);
        fs_1.default.writeFileSync(tmpFile, combined);
        let playFile = tmpFile;
        // Apply post-process tempo if configured
        if (this.voice.postProcessTempo && this.voice.postProcessTempo !== 1.0) {
            const processedFile = path_1.default.join(tmpDir, `evokore-voice-${Date.now()}-fast.mp3`);
            const ok = await postProcessSpeed(tmpFile, processedFile, this.voice.postProcessTempo);
            if (ok) {
                playFile = processedFile;
            }
        }
        console.error(`[VoiceSidecar] Playing audio (${(combined.length / 1024).toFixed(1)}KB)`);
        await playAudio(playFile);
        // Cleanup temp files
        try {
            fs_1.default.unlinkSync(tmpFile);
        }
        catch { }
        if (playFile !== tmpFile) {
            try {
                fs_1.default.unlinkSync(playFile);
            }
            catch { }
        }
    }
}
// --- WebSocket Server ---
function startServer() {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
        console.error("[VoiceSidecar] ELEVENLABS_API_KEY not set. Load via .env or export.");
        process.exit(1);
    }
    const wss = new ws_1.WebSocketServer({ port: PORT });
    console.error(`[VoiceSidecar] Listening on ws://localhost:${PORT}`);
    console.error(`[VoiceSidecar] voices.json: ${VOICES_PATH}`);
    wss.on("connection", async (client) => {
        let streamer = null;
        let currentPersona;
        console.error("[VoiceSidecar] Client connected");
        client.on("message", async (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
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
            }
            catch (err) {
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
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, "../.env"), quiet: true });
startServer();
