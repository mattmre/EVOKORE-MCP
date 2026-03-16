import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const sttProviderPath = path.join(ROOT, 'src', 'STTProvider.ts');
const whisperProviderPath = path.join(ROOT, 'src', 'stt', 'WhisperSTTProvider.ts');
const localProviderPath = path.join(ROOT, 'src', 'stt', 'LocalSTTProvider.ts');
const sidecarPath = path.join(ROOT, 'src', 'VoiceSidecar.ts');

// ---- STTProvider interface (source-level) ----

describe('STT Provider System', () => {

  describe('STTProvider interface definition', () => {
    it('STTProvider.ts source file exists', () => {
      expect(fs.existsSync(sttProviderPath)).toBe(true);
    });

    it('defines STTProvider interface with transcribe method', () => {
      const src = fs.readFileSync(sttProviderPath, 'utf8');
      expect(src).toContain('export interface STTProvider');
      expect(src).toContain('transcribe(audioBuffer: Buffer, options?: STTOptions): Promise<STTResult>');
    });

    it('defines STTOptions interface with language and model', () => {
      const src = fs.readFileSync(sttProviderPath, 'utf8');
      expect(src).toContain('export interface STTOptions');
      expect(src).toContain('language?: string');
      expect(src).toContain('model?: string');
    });

    it('defines STTResult interface with text and optional fields', () => {
      const src = fs.readFileSync(sttProviderPath, 'utf8');
      expect(src).toContain('export interface STTResult');
      expect(src).toContain('text: string');
      expect(src).toContain('confidence?: number');
      expect(src).toContain('language?: string');
      expect(src).toContain('duration?: number');
    });

    it('defines isAvailable method on STTProvider', () => {
      const src = fs.readFileSync(sttProviderPath, 'utf8');
      expect(src).toContain('isAvailable(): boolean');
    });

    it('defines name property on STTProvider', () => {
      const src = fs.readFileSync(sttProviderPath, 'utf8');
      expect(src).toContain('readonly name: string');
    });

    it('exports SUPPORTED_AUDIO_FORMATS array', () => {
      const src = fs.readFileSync(sttProviderPath, 'utf8');
      expect(src).toContain('export const SUPPORTED_AUDIO_FORMATS');
      expect(src).toContain('"audio/wav"');
      expect(src).toContain('"audio/mpeg"');
      expect(src).toContain('"audio/webm"');
      expect(src).toContain('"audio/mp4"');
    });

    it('exports EXTENSION_TO_MIME mapping', () => {
      const src = fs.readFileSync(sttProviderPath, 'utf8');
      expect(src).toContain('export const EXTENSION_TO_MIME');
      expect(src).toContain('".wav"');
      expect(src).toContain('".mp3"');
      expect(src).toContain('".webm"');
      expect(src).toContain('".m4a"');
    });

    it('exports mimeFromExtension helper function', () => {
      const src = fs.readFileSync(sttProviderPath, 'utf8');
      expect(src).toContain('export function mimeFromExtension');
    });
  });

  // ---- WhisperSTTProvider (source-level) ----

  describe('WhisperSTTProvider module', () => {
    it('WhisperSTTProvider.ts source file exists', () => {
      expect(fs.existsSync(whisperProviderPath)).toBe(true);
    });

    it('imports STTProvider interface', () => {
      const src = fs.readFileSync(whisperProviderPath, 'utf8');
      expect(src).toMatch(/import.*STTProvider.*from.*"\.\.\/STTProvider"/);
    });

    it('exports WhisperSTTProvider class', () => {
      const src = fs.readFileSync(whisperProviderPath, 'utf8');
      expect(src).toContain('export class WhisperSTTProvider');
    });

    it('implements STTProvider interface', () => {
      const src = fs.readFileSync(whisperProviderPath, 'utf8');
      expect(src).toContain('implements STTProvider');
    });

    it('has name set to whisper-api', () => {
      const src = fs.readFileSync(whisperProviderPath, 'utf8');
      expect(src).toMatch(/readonly name = "whisper-api"/);
    });

    it('reads OPENAI_API_KEY from environment', () => {
      const src = fs.readFileSync(whisperProviderPath, 'utf8');
      expect(src).toContain('process.env.OPENAI_API_KEY');
    });

    it('defaults to whisper-1 model', () => {
      const src = fs.readFileSync(whisperProviderPath, 'utf8');
      expect(src).toContain('"whisper-1"');
    });

    it('supports configurable model via EVOKORE_STT_MODEL', () => {
      const src = fs.readFileSync(whisperProviderPath, 'utf8');
      expect(src).toContain('process.env.EVOKORE_STT_MODEL');
    });

    it('calls OpenAI transcriptions endpoint', () => {
      const src = fs.readFileSync(whisperProviderPath, 'utf8');
      expect(src).toContain('/v1/audio/transcriptions');
    });

    it('uses fetch for HTTP calls (no added dependencies)', () => {
      const src = fs.readFileSync(whisperProviderPath, 'utf8');
      expect(src).toContain('await fetch(url');
      // Should not import axios, got, node-fetch, etc.
      expect(src).not.toMatch(/import.*from\s*["'](axios|got|node-fetch)/);
    });

    it('builds multipart/form-data manually', () => {
      const src = fs.readFileSync(whisperProviderPath, 'utf8');
      expect(src).toContain('multipart/form-data');
      expect(src).toContain('boundary');
    });

    it('sends Authorization Bearer header', () => {
      const src = fs.readFileSync(whisperProviderPath, 'utf8');
      expect(src).toMatch(/Authorization.*Bearer/);
    });

    it('requests verbose_json response format', () => {
      const src = fs.readFileSync(whisperProviderPath, 'utf8');
      expect(src).toContain('verbose_json');
    });

    it('isAvailable returns false when API key is empty', () => {
      const src = fs.readFileSync(whisperProviderPath, 'utf8');
      expect(src).toContain('isAvailable()');
      expect(src).toMatch(/this\.apiKey\.length > 0/);
    });

    it('throws on empty audio buffer', () => {
      const src = fs.readFileSync(whisperProviderPath, 'utf8');
      expect(src).toContain('audio buffer is empty');
    });

    it('handles API error responses', () => {
      const src = fs.readFileSync(whisperProviderPath, 'utf8');
      expect(src).toContain('response.ok');
      expect(src).toContain('response.status');
    });

    it('extracts confidence from segment log probabilities', () => {
      const src = fs.readFileSync(whisperProviderPath, 'utf8');
      expect(src).toContain('avg_logprob');
      expect(src).toContain('Math.exp');
    });

    it('passes optional language parameter', () => {
      const src = fs.readFileSync(whisperProviderPath, 'utf8');
      expect(src).toContain('options?.language');
    });
  });

  // ---- WhisperSTTProvider runtime behavior ----

  describe('WhisperSTTProvider runtime behavior', () => {
    let originalApiKey: string | undefined;
    let originalModel: string | undefined;

    beforeEach(() => {
      originalApiKey = process.env.OPENAI_API_KEY;
      originalModel = process.env.EVOKORE_STT_MODEL;
    });

    afterEach(() => {
      if (originalApiKey !== undefined) {
        process.env.OPENAI_API_KEY = originalApiKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
      if (originalModel !== undefined) {
        process.env.EVOKORE_STT_MODEL = originalModel;
      } else {
        delete process.env.EVOKORE_STT_MODEL;
      }
    });

    it('isAvailable returns false when OPENAI_API_KEY is not set', () => {
      delete process.env.OPENAI_API_KEY;
      const { WhisperSTTProvider } = require('../../dist/stt/WhisperSTTProvider.js');
      const provider = new WhisperSTTProvider();
      expect(provider.isAvailable()).toBe(false);
    });

    it('isAvailable returns true when OPENAI_API_KEY is set', () => {
      process.env.OPENAI_API_KEY = 'test-key-123';
      const { WhisperSTTProvider } = require('../../dist/stt/WhisperSTTProvider.js');
      const provider = new WhisperSTTProvider();
      expect(provider.isAvailable()).toBe(true);
    });

    it('name property returns whisper-api', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const { WhisperSTTProvider } = require('../../dist/stt/WhisperSTTProvider.js');
      const provider = new WhisperSTTProvider();
      expect(provider.name).toBe('whisper-api');
    });

    it('throws when transcribe is called without API key', async () => {
      delete process.env.OPENAI_API_KEY;
      const { WhisperSTTProvider } = require('../../dist/stt/WhisperSTTProvider.js');
      const provider = new WhisperSTTProvider();
      const audio = Buffer.from('fake audio data');

      await expect(provider.transcribe(audio)).rejects.toThrow('OPENAI_API_KEY is not set');
    });

    it('throws when transcribe is called with empty buffer', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const { WhisperSTTProvider } = require('../../dist/stt/WhisperSTTProvider.js');
      const provider = new WhisperSTTProvider();

      await expect(provider.transcribe(Buffer.alloc(0))).rejects.toThrow('audio buffer is empty');
    });
  });

  // ---- LocalSTTProvider (source-level) ----

  describe('LocalSTTProvider module', () => {
    it('LocalSTTProvider.ts source file exists', () => {
      expect(fs.existsSync(localProviderPath)).toBe(true);
    });

    it('imports STTProvider interface', () => {
      const src = fs.readFileSync(localProviderPath, 'utf8');
      expect(src).toMatch(/import.*STTProvider.*from.*"\.\.\/STTProvider"/);
    });

    it('exports LocalSTTProvider class', () => {
      const src = fs.readFileSync(localProviderPath, 'utf8');
      expect(src).toContain('export class LocalSTTProvider');
    });

    it('implements STTProvider interface', () => {
      const src = fs.readFileSync(localProviderPath, 'utf8');
      expect(src).toContain('implements STTProvider');
    });

    it('has name set to local-whisper', () => {
      const src = fs.readFileSync(localProviderPath, 'utf8');
      expect(src).toMatch(/readonly name = "local-whisper"/);
    });

    it('uses execFileSync from child_process', () => {
      const src = fs.readFileSync(localProviderPath, 'utf8');
      expect(src).toContain('execFileSync');
      expect(src).toMatch(/import.*execFileSync.*from.*"child_process"/);
    });

    it('does not import external HTTP libraries', () => {
      const src = fs.readFileSync(localProviderPath, 'utf8');
      expect(src).not.toMatch(/import.*from\s*["'](axios|got|node-fetch)/);
    });

    it('checks for whisper CLI availability via which/where', () => {
      const src = fs.readFileSync(localProviderPath, 'utf8');
      expect(src).toContain('"which"');
      expect(src).toContain('"where"');
    });

    it('supports configurable whisper path via EVOKORE_WHISPER_PATH', () => {
      const src = fs.readFileSync(localProviderPath, 'utf8');
      expect(src).toContain('process.env.EVOKORE_WHISPER_PATH');
    });

    it('defaults to base model', () => {
      const src = fs.readFileSync(localProviderPath, 'utf8');
      expect(src).toContain('"base"');
    });

    it('supports configurable model via EVOKORE_STT_LOCAL_MODEL', () => {
      const src = fs.readFileSync(localProviderPath, 'utf8');
      expect(src).toContain('process.env.EVOKORE_STT_LOCAL_MODEL');
    });

    it('writes audio to temp file before processing', () => {
      const src = fs.readFileSync(localProviderPath, 'utf8');
      expect(src).toContain('fs.writeFileSync(tmpInput');
    });

    it('cleans up temp files in finally block', () => {
      const src = fs.readFileSync(localProviderPath, 'utf8');
      expect(src).toContain('finally');
      expect(src).toContain('fs.unlinkSync(tmpInput');
    });

    it('has a 60-second timeout on whisper CLI execution', () => {
      const src = fs.readFileSync(localProviderPath, 'utf8');
      expect(src).toContain('timeout: 60000');
    });

    it('throws on empty audio buffer', () => {
      const src = fs.readFileSync(localProviderPath, 'utf8');
      expect(src).toContain('audio buffer is empty');
    });

    it('passes language option to whisper CLI', () => {
      const src = fs.readFileSync(localProviderPath, 'utf8');
      expect(src).toContain('"--language"');
    });

    it('falls back gracefully when whisper is not installed', () => {
      const src = fs.readFileSync(localProviderPath, 'utf8');
      // isAvailable catches the error and returns false
      expect(src).toMatch(/this\.available\s*=\s*false/);
    });
  });

  // ---- LocalSTTProvider runtime behavior ----

  describe('LocalSTTProvider runtime behavior', () => {
    it('name property returns local-whisper', () => {
      const { LocalSTTProvider } = require('../../dist/stt/LocalSTTProvider.js');
      const provider = new LocalSTTProvider();
      expect(provider.name).toBe('local-whisper');
    });

    it('throws when transcribe is called and whisper is unavailable', async () => {
      const { LocalSTTProvider } = require('../../dist/stt/LocalSTTProvider.js');
      // Set path to something that definitely does not exist
      const savedPath = process.env.EVOKORE_WHISPER_PATH;
      process.env.EVOKORE_WHISPER_PATH = 'nonexistent-whisper-binary-xyz';

      try {
        const provider = new LocalSTTProvider();
        const audio = Buffer.from('fake audio data');

        await expect(provider.transcribe(audio)).rejects.toThrow('whisper CLI is not installed');
      } finally {
        if (savedPath !== undefined) {
          process.env.EVOKORE_WHISPER_PATH = savedPath;
        } else {
          delete process.env.EVOKORE_WHISPER_PATH;
        }
      }
    });

    it('throws when transcribe is called with empty buffer', async () => {
      const { LocalSTTProvider } = require('../../dist/stt/LocalSTTProvider.js');
      const provider = new LocalSTTProvider();
      // Force available to true to test the empty buffer check
      (provider as any).available = true;

      await expect(provider.transcribe(Buffer.alloc(0))).rejects.toThrow('audio buffer is empty');
    });
  });

  // ---- VoiceSidecar STT integration (source-level) ----

  describe('VoiceSidecar STT integration', () => {
    const src = fs.readFileSync(sidecarPath, 'utf8');

    it('imports STTProvider type', () => {
      expect(src).toMatch(/import.*STTProvider.*from.*"\.\/STTProvider"/);
    });

    it('imports STTResult type', () => {
      expect(src).toMatch(/import.*STTResult.*from.*"\.\/STTProvider"/);
    });

    it('defines STTClientMessage interface with type transcribe', () => {
      expect(src).toContain('interface STTClientMessage');
      expect(src).toContain('type: "transcribe"');
      expect(src).toContain('audio: string');
    });

    it('defines STTResponse interface', () => {
      expect(src).toContain('interface STTResponse');
      expect(src).toContain('type: "stt_result"');
    });

    it('defines STTErrorResponse interface', () => {
      expect(src).toContain('interface STTErrorResponse');
      expect(src).toContain('type: "stt_error"');
    });

    it('respects EVOKORE_STT_ENABLED environment variable', () => {
      expect(src).toContain('EVOKORE_STT_ENABLED');
      expect(src).toMatch(/process\.env\.EVOKORE_STT_ENABLED\s*===\s*"true"/);
    });

    it('respects EVOKORE_STT_PROVIDER environment variable', () => {
      expect(src).toContain('EVOKORE_STT_PROVIDER');
    });

    it('defaults STT provider to whisper-api', () => {
      expect(src).toMatch(/process\.env\.EVOKORE_STT_PROVIDER\s*\|\|\s*"whisper-api"/);
    });

    it('defines initSTTProvider function', () => {
      expect(src).toContain('function initSTTProvider()');
    });

    it('initSTTProvider returns null when STT is disabled', () => {
      expect(src).toMatch(/if\s*\(!STT_ENABLED\)\s*\{[\s\S]*?return null/);
    });

    it('handles transcribe message type in WebSocket handler', () => {
      expect(src).toMatch(/\(msg as any\)\.type\s*===\s*"transcribe"/);
    });

    it('validates audio field in transcribe messages', () => {
      expect(src).toContain('typeof sttMsg.audio !== "string"');
    });

    it('decodes base64 audio before transcription', () => {
      expect(src).toContain("Buffer.from(sttMsg.audio, \"base64\")");
    });

    it('enforces maximum audio size limit', () => {
      expect(src).toContain('STT_MAX_AUDIO_BYTES');
      expect(src).toContain('audioBuffer.length > STT_MAX_AUDIO_BYTES');
    });

    it('sends STT result with type stt_result', () => {
      expect(src).toContain('type: "stt_result"');
    });

    it('sends STT error with type stt_error', () => {
      expect(src).toContain('type: "stt_error"');
    });

    it('returns STT not enabled error when provider is null', () => {
      expect(src).toContain('STT is not enabled');
    });

    it('logs STT audio size to stderr', () => {
      expect(src).toMatch(/console\.error.*STT.*transcribing/);
    });

    it('catches and logs STT errors', () => {
      expect(src).toMatch(/console\.error.*STT error/);
    });

    it('health response includes sttEnabled and sttProvider fields', () => {
      expect(src).toContain('sttEnabled:');
      expect(src).toContain('sttProvider:');
    });

    it('supports local-whisper provider name', () => {
      expect(src).toContain('"local-whisper"');
    });

    it('supports local as alias for local-whisper provider', () => {
      expect(src).toContain('"local"');
    });

    it('existing TTS functionality is unchanged', () => {
      // Verify all original TTS constructs still exist
      expect(src).toContain('class ElevenLabsStreamer');
      expect(src).toContain('ELEVENLABS_API_KEY');
      expect(src).toContain('function resolvePersona(');
      expect(src).toContain('function playAudio(');
      expect(src).toContain('function postProcessSpeed(');
      expect(src).toContain('interface ClientMessage');
      expect(src).toContain('text: string');
      expect(src).toContain('persona?: string');
      expect(src).toContain('flush?: boolean');
    });

    it('still requires ELEVENLABS_API_KEY for TTS (backward compatible)', () => {
      expect(src).toContain('ELEVENLABS_API_KEY not set');
      expect(src).toMatch(/process\.exit\(1\)/);
    });

    it('VoiceSidecar remains standalone (no exports)', () => {
      expect(src).not.toMatch(/^export\s+(default\s+)?function/m);
      expect(src).toContain('startServer()');
    });
  });

  // ---- STTProvider compiled module validation ----

  describe('STTProvider compiled module exports', () => {
    it('exports SUPPORTED_AUDIO_FORMATS', () => {
      const mod = require('../../dist/STTProvider.js');
      expect(Array.isArray(mod.SUPPORTED_AUDIO_FORMATS)).toBe(true);
      expect(mod.SUPPORTED_AUDIO_FORMATS).toContain('audio/wav');
      expect(mod.SUPPORTED_AUDIO_FORMATS).toContain('audio/mpeg');
    });

    it('exports EXTENSION_TO_MIME', () => {
      const mod = require('../../dist/STTProvider.js');
      expect(mod.EXTENSION_TO_MIME).toBeDefined();
      expect(mod.EXTENSION_TO_MIME['.wav']).toBe('audio/wav');
      expect(mod.EXTENSION_TO_MIME['.mp3']).toBe('audio/mpeg');
    });

    it('exports mimeFromExtension function', () => {
      const mod = require('../../dist/STTProvider.js');
      expect(typeof mod.mimeFromExtension).toBe('function');
      expect(mod.mimeFromExtension('.wav')).toBe('audio/wav');
      expect(mod.mimeFromExtension('.mp3')).toBe('audio/mpeg');
      expect(mod.mimeFromExtension('.webm')).toBe('audio/webm');
      expect(mod.mimeFromExtension('.m4a')).toBe('audio/mp4');
      expect(mod.mimeFromExtension('.unknown')).toBe('audio/wav'); // default fallback
    });
  });
});
