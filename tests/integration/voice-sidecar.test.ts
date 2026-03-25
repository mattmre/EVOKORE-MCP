import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SIDECAR_SOURCE_PATH = path.resolve(__dirname, '..', '..', 'src', 'VoiceSidecar.ts');
const VOICE_HOOK_PATH = path.resolve(__dirname, '..', '..', 'scripts', 'voice-hook.js');
const VOICES_JSON_PATH = path.resolve(__dirname, '..', '..', 'voices.json');

describe('Voice Sidecar (T23)', () => {
  describe('VoiceSidecar module structure', () => {
    it('VoiceSidecar.ts source file exists', () => {
      expect(fs.existsSync(SIDECAR_SOURCE_PATH)).toBe(true);
    });

    it('imports WebSocketServer from ws', () => {
      const src = fs.readFileSync(SIDECAR_SOURCE_PATH, 'utf8');
      expect(src).toMatch(/import\s*\{[^}]*WebSocketServer[^}]*\}\s*from\s*["']ws["']/);
    });

    it('exports no functions (standalone entry point)', () => {
      const src = fs.readFileSync(SIDECAR_SOURCE_PATH, 'utf8');
      // VoiceSidecar is standalone -- it calls startServer() directly, not export
      expect(src).not.toMatch(/^export\s+(default\s+)?function/m);
      expect(src).toMatch(/startServer\(\)/);
    });

    it('imports TTSVoiceConfig from TTSProvider module', () => {
      const src = fs.readFileSync(SIDECAR_SOURCE_PATH, 'utf8');
      expect(src).toMatch(/import.*TTSVoiceConfig.*from.*["']\.\/TTSProvider["']/);
    });

    it('defines ClientMessage interface', () => {
      const src = fs.readFileSync(SIDECAR_SOURCE_PATH, 'utf8');
      expect(src).toContain('interface ClientMessage');
      expect(src).toContain('text: string');
      expect(src).toContain('persona?: string');
      expect(src).toContain('flush?: boolean');
    });

    it('defines HealthResponse interface', () => {
      const src = fs.readFileSync(SIDECAR_SOURCE_PATH, 'utf8');
      expect(src).toContain('interface HealthResponse');
      expect(src).toMatch(/type:\s*"health"/);
      expect(src).toMatch(/status:\s*"ok"/);
    });

    it('binds WebSocket server to loopback only', () => {
      const src = fs.readFileSync(SIDECAR_SOURCE_PATH, 'utf8');
      expect(src).toMatch(/host:\s*"127\.0\.0\.1"/);
    });

    it('requires ELEVENLABS_API_KEY or exits', () => {
      const src = fs.readFileSync(SIDECAR_SOURCE_PATH, 'utf8');
      expect(src).toContain('ELEVENLABS_API_KEY');
      expect(src).toMatch(/process\.exit\(1\)/);
    });

    it('supports configurable port via VOICE_SIDECAR_PORT', () => {
      const src = fs.readFileSync(SIDECAR_SOURCE_PATH, 'utf8');
      expect(src).toMatch(/process\.env\.VOICE_SIDECAR_PORT\s*\|\|\s*"8888"/);
    });

    it('uses ElevenLabsTTSProvider for TTS (extracted to separate module)', () => {
      const src = fs.readFileSync(SIDECAR_SOURCE_PATH, 'utf8');
      expect(src).toContain('ElevenLabsTTSProvider');
      expect(src).not.toContain('class ElevenLabsStreamer');
    });

    it('implements graceful shutdown with SIGINT and SIGTERM', () => {
      const src = fs.readFileSync(SIDECAR_SOURCE_PATH, 'utf8');
      expect(src).toContain('gracefulShutdown');
      expect(src).toMatch(/process\.on\("SIGINT"/);
      expect(src).toMatch(/process\.on\("SIGTERM"/);
    });
  });

  describe('voices.json format and hot-reload contract', () => {
    it('voices.json exists at repository root', () => {
      expect(fs.existsSync(VOICES_JSON_PATH)).toBe(true);
    });

    it('parses as valid JSON', () => {
      const raw = fs.readFileSync(VOICES_JSON_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      expect(parsed).toBeDefined();
    });

    it('has a default voice config with required fields', () => {
      const config = JSON.parse(fs.readFileSync(VOICES_JSON_PATH, 'utf8'));
      expect(config.default).toBeDefined();
      expect(typeof config.default.voiceId).toBe('string');
      expect(typeof config.default.voiceName).toBe('string');
      expect(typeof config.default.model).toBe('string');
      expect(typeof config.default.stability).toBe('number');
      expect(typeof config.default.similarityBoost).toBe('number');
      expect(typeof config.default.speed).toBe('number');
      expect(typeof config.default.outputFormat).toBe('string');
    });

    it('has a personas object with at least one entry', () => {
      const config = JSON.parse(fs.readFileSync(VOICES_JSON_PATH, 'utf8'));
      expect(config.personas).toBeDefined();
      expect(typeof config.personas).toBe('object');
      const personaNames = Object.keys(config.personas);
      expect(personaNames.length).toBeGreaterThanOrEqual(1);
    });

    it('each persona has at least one override field', () => {
      const config = JSON.parse(fs.readFileSync(VOICES_JSON_PATH, 'utf8'));
      for (const [name, persona] of Object.entries(config.personas)) {
        const keys = Object.keys(persona as object);
        expect(keys.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('persona values are valid types (string or number)', () => {
      const config = JSON.parse(fs.readFileSync(VOICES_JSON_PATH, 'utf8'));
      const allowedStringKeys = new Set(['voiceId', 'voiceName', 'model', 'outputFormat', 'openaiVoice', 'openaiModel']);
      const allowedNumberKeys = new Set(['stability', 'similarityBoost', 'speed', 'postProcessTempo']);

      for (const [, persona] of Object.entries(config.personas)) {
        for (const [key, value] of Object.entries(persona as Record<string, unknown>)) {
          if (allowedStringKeys.has(key)) {
            expect(typeof value).toBe('string');
          } else if (allowedNumberKeys.has(key)) {
            expect(typeof value).toBe('number');
          }
        }
      }
    });

    it('hot-reload reads voices.json per connection via loadVoicesConfig()', () => {
      const src = fs.readFileSync(SIDECAR_SOURCE_PATH, 'utf8');
      // loadVoicesConfig reads from disk each time (no caching)
      expect(src).toContain('function loadVoicesConfig()');
      expect(src).toMatch(/fs\.readFileSync\(VOICES_PATH/);
      // resolvePersona calls loadVoicesConfig, which re-reads from disk
      expect(src).toContain('function resolvePersona(');
      expect(src).toMatch(/const config = loadVoicesConfig\(\)/);
    });
  });

  describe('persona routing logic', () => {
    it('resolvePersona returns default when no role is provided', () => {
      const src = fs.readFileSync(SIDECAR_SOURCE_PATH, 'utf8');
      // When role is undefined/null/not found, return config.default
      expect(src).toMatch(/if\s*\(!role\s*\|\|\s*!config\.personas\[role\]\)/);
      expect(src).toMatch(/return config\.default/);
    });

    it('resolvePersona merges persona over default', () => {
      const src = fs.readFileSync(SIDECAR_SOURCE_PATH, 'utf8');
      // Spread: default first, then persona overrides
      expect(src).toMatch(/\{\s*\.\.\.config\.default,\s*\.\.\.config\.personas\[role\]\s*\}/);
    });

    it('sidecar initializes streamer with persona from first message', () => {
      const src = fs.readFileSync(SIDECAR_SOURCE_PATH, 'utf8');
      expect(src).toContain('currentPersona = msg.persona');
      expect(src).toContain('resolvePersona(msg.persona)');
    });
  });

  describe('voice-hook.js forwarding behavior', () => {
    it('voice-hook.js exists', () => {
      expect(fs.existsSync(VOICE_HOOK_PATH)).toBe(true);
    });

    it('reads from stdin and parses JSON', () => {
      const src = fs.readFileSync(VOICE_HOOK_PATH, 'utf8');
      expect(src).toContain("process.stdin.on('data'");
      expect(src).toContain("process.stdin.on('end'");
      expect(src).toContain('JSON.parse(input)');
    });

    it('extracts text from payload.response.text or payload.message', () => {
      const src = fs.readFileSync(VOICE_HOOK_PATH, 'utf8');
      expect(src).toMatch(/payload\?\.response\?\.text/);
      expect(src).toMatch(/payload\?\.message/);
    });

    it('sends message with flush: true', () => {
      const src = fs.readFileSync(VOICE_HOOK_PATH, 'utf8');
      expect(src).toContain('flush: true');
    });

    it('resolves persona with env var as highest priority', () => {
      const src = fs.readFileSync(VOICE_HOOK_PATH, 'utf8');
      // firstString is called with VOICE_SIDECAR_PERSONA first
      expect(src).toContain('process.env.VOICE_SIDECAR_PERSONA');
      // The resolvePersona function uses firstString which returns first non-empty value
      expect(src).toContain('function resolvePersona(');
      expect(src).toContain('function firstString(');
    });

    it('persona cascade: env > payload.persona > metadata.persona > session.persona', () => {
      const src = fs.readFileSync(VOICE_HOOK_PATH, 'utf8');
      // Check the order of arguments to firstString in resolvePersona
      const resolveBody = src.slice(
        src.indexOf('function resolvePersona('),
        src.indexOf('}', src.indexOf('function resolvePersona(') + 50) + 1
      );
      const envIdx = resolveBody.indexOf('VOICE_SIDECAR_PERSONA');
      const payloadPersonaIdx = resolveBody.indexOf('payload && payload.persona');
      const metadataIdx = resolveBody.indexOf('payload.metadata.persona');
      const sessionIdx = resolveBody.indexOf('payload.session.persona');

      expect(envIdx).toBeGreaterThan(-1);
      expect(payloadPersonaIdx).toBeGreaterThan(envIdx);
      expect(metadataIdx).toBeGreaterThan(payloadPersonaIdx);
      expect(sessionIdx).toBeGreaterThan(metadataIdx);
    });

    it('silently fails on WebSocket errors (sidecar offline)', () => {
      const src = fs.readFileSync(VOICE_HOOK_PATH, 'utf8');
      // ws.on('error', () => {}) -- empty error handler
      expect(src).toMatch(/ws\.on\('error',\s*\(\)\s*=>\s*\{\s*\}\)/);
    });

    it('silently fails on JSON parse errors', () => {
      const src = fs.readFileSync(VOICE_HOOK_PATH, 'utf8');
      expect(src).toMatch(/catch\s*\{/);
    });
  });

  describe('VOICE_SIDECAR_HOST configuration', () => {
    it('voice-hook.js uses VOICE_SIDECAR_HOST env var with 127.0.0.1 default', () => {
      const src = fs.readFileSync(VOICE_HOOK_PATH, 'utf8');
      expect(src).toMatch(/process\.env\.VOICE_SIDECAR_HOST\s*\|\|\s*'127\.0\.0\.1'/);
    });

    it('voice-hook.js uses VOICE_SIDECAR_PORT env var with 8888 default', () => {
      const src = fs.readFileSync(VOICE_HOOK_PATH, 'utf8');
      expect(src).toMatch(/process\.env\.VOICE_SIDECAR_PORT\s*\|\|\s*8888/);
    });

    it('voice-hook.js constructs WebSocket URL from HOST and PORT', () => {
      const src = fs.readFileSync(VOICE_HOOK_PATH, 'utf8');
      expect(src).toMatch(/ws:\/\/\$\{HOST\}:\$\{PORT\}/);
    });

    it('VoiceSidecar.ts binds to 127.0.0.1 (not configurable host for security)', () => {
      const src = fs.readFileSync(SIDECAR_SOURCE_PATH, 'utf8');
      // Server always binds to 127.0.0.1 for security, even if port is configurable
      expect(src).toMatch(/host:\s*"127\.0\.0\.1"/);
    });
  });
});
