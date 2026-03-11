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
const PLAYBACK_DISABLED = process.env.VOICE_SIDECAR_DISABLE_PLAYBACK === "1";
const ARTIFACT_DIR = process.env.VOICE_SIDECAR_ARTIFACT_DIR
    ? path_1.default.resolve(process.env.VOICE_SIDECAR_ARTIFACT_DIR)
    : null;
const MAX_CONNECTIONS = parseInt(process.env.VOICE_SIDECAR_MAX_CONNECTIONS || "5", 10);
const MAX_TEXT_LENGTH = 10000;
const HEARTBEAT_INTERVAL_MS = 30000;
const CONNECT_TIMEOUT_MS = 10000;
const CONNECT_MAX_RETRIES = 2;
const FLUSH_TIMEOUT_MS = 30000;
const SHUTDOWN_DRAIN_MS = 2000;
const MAX_PAYLOAD_BYTES = 1 * 1024 * 1024; // 1 MB
const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
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
function saveAudioArtifact(filePath) {
    if (!ARTIFACT_DIR) {
        return null;
    }
    try {
        fs_1.default.mkdirSync(ARTIFACT_DIR, { recursive: true });
        const extension = path_1.default.extname(filePath) || ".mp3";
        const artifactPath = path_1.default.join(ARTIFACT_DIR, `evokore-voice-${Date.now()}${extension}`);
        fs_1.default.copyFileSync(filePath, artifactPath);
        return artifactPath;
    }
    catch (err) {
        console.error("[VoiceSidecar] Failed to save audio artifact:", err.message);
        return null;
    }
}
// --- Startup Temp File Cleanup ---
function cleanupStaleTempFiles() {
    try {
        const tmpDir = os_1.default.tmpdir();
        const entries = fs_1.default.readdirSync(tmpDir);
        let cleaned = 0;
        for (const entry of entries) {
            if (entry.startsWith("evokore-voice-") && entry.endsWith(".mp3")) {
                try {
                    fs_1.default.unlinkSync(path_1.default.join(tmpDir, entry));
                    cleaned++;
                }
                catch {
                    // File may be in use by another process
                }
            }
        }
        if (cleaned > 0) {
            console.error(`[VoiceSidecar] Cleaned up ${cleaned} stale temp file(s)`);
        }
    }
    catch (err) {
        console.error("[VoiceSidecar] Temp cleanup warning:", err.message);
    }
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
    async connect() {
        let lastError = null;
        for (let attempt = 0; attempt <= CONNECT_MAX_RETRIES; attempt++) {
            try {
                await this.attemptConnect();
                return;
            }
            catch (err) {
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
    attemptConnect() {
        return new Promise((resolve, reject) => {
            const url = `wss://api.elevenlabs.io/v1/text-to-speech/${this.voice.voiceId}/stream-input?model_id=${this.voice.model}&output_format=${this.voice.outputFormat}`;
            this.ws = new ws_1.WebSocket(url);
            const connectTimer = setTimeout(() => {
                if (this.ws) {
                    this.ws.terminate();
                }
                reject(new Error("ElevenLabs connection timed out"));
            }, CONNECT_TIMEOUT_MS);
            this.ws.on("open", () => {
                clearTimeout(connectTimer);
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
            const flushTimer = setTimeout(() => {
                console.error("[VoiceSidecar] Flush timed out, forcing resolution");
                this.resolveFinished = null;
                if (this.ws && this.ws.readyState === ws_1.WebSocket.OPEN) {
                    this.ws.close();
                }
                resolve();
            }, FLUSH_TIMEOUT_MS);
            this.resolveFinished = () => {
                clearTimeout(flushTimer);
                resolve();
            };
            if (this.ws && this.ws.readyState === ws_1.WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ text: "" }));
            }
            else {
                clearTimeout(flushTimer);
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
        const artifactPath = saveAudioArtifact(playFile);
        if (artifactPath) {
            console.error(`[VoiceSidecar] Saved audio artifact: ${artifactPath}`);
        }
        if (PLAYBACK_DISABLED) {
            console.error("[VoiceSidecar] Playback disabled by VOICE_SIDECAR_DISABLE_PLAYBACK=1");
        }
        else {
            console.error(`[VoiceSidecar] Playing audio (${(combined.length / 1024).toFixed(1)}KB)`);
            await playAudio(playFile);
        }
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
    const startTime = Date.now();
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
        console.error("[VoiceSidecar] ELEVENLABS_API_KEY not set. Load via .env or export.");
        process.exit(1);
    }
    // Cleanup stale temp files from prior runs
    cleanupStaleTempFiles();
    const wss = new ws_1.WebSocketServer({
        port: PORT,
        host: "127.0.0.1",
        maxPayload: MAX_PAYLOAD_BYTES,
        verifyClient: (info) => {
            const origin = info.req.socket.remoteAddress || "";
            return LOOPBACK_ADDRESSES.has(origin);
        },
    });
    console.error(`[VoiceSidecar] Listening on ws://127.0.0.1:${PORT}`);
    console.error(`[VoiceSidecar] voices.json: ${VOICES_PATH}`);
    // --- Ping/pong heartbeat ---
    const heartbeatInterval = setInterval(() => {
        for (const client of wss.clients) {
            if (client.__alive === false) {
                console.error("[VoiceSidecar] Terminating unresponsive client");
                client.terminate();
                continue;
            }
            client.__alive = false;
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
        client.__alive = true;
        client.on("pong", () => {
            client.__alive = true;
        });
        let streamer = null;
        let currentPersona;
        console.error("[VoiceSidecar] Client connected");
        client.on("message", async (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                // --- Health check ---
                if (msg.text === "__health") {
                    const response = {
                        type: "health",
                        status: "ok",
                        connections: wss.clients.size,
                        uptime: Math.floor((Date.now() - startTime) / 1000),
                    };
                    client.send(JSON.stringify(response));
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
    // --- Graceful shutdown ---
    function gracefulShutdown() {
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
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, "../.env"), quiet: true });
startServer();
