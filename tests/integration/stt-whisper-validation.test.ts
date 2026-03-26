import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const sttProviderPath = path.join(ROOT, 'src', 'STTProvider.ts');
const whisperProviderPath = path.join(ROOT, 'src', 'stt', 'WhisperSTTProvider.ts');
const localProviderPath = path.join(ROOT, 'src', 'stt', 'LocalSTTProvider.ts');
const sidecarPath = path.join(ROOT, 'src', 'VoiceSidecar.ts');
const envExamplePath = path.join(ROOT, '.env.example');

// ===================================================================
// Phase 4: Production Validation Tests for STT Whisper Integration
// ===================================================================

describe('STT Whisper Production Validation', () => {

  // ---- Section 1: STTProvider Interface Contract Validation ----

  describe('STTProvider interface contract completeness', () => {
    const src = fs.readFileSync(sttProviderPath, 'utf8');

    it('STTProvider interface requires readonly name property', () => {
      expect(src).toMatch(/readonly\s+name:\s*string/);
    });

    it('STTProvider interface requires transcribe method with correct signature', () => {
      expect(src).toContain('transcribe(audioBuffer: Buffer, options?: STTOptions): Promise<STTResult>');
    });

    it('STTProvider interface requires isAvailable method returning boolean', () => {
      expect(src).toContain('isAvailable(): boolean');
    });

    it('STTOptions has language as optional BCP-47 string field', () => {
      expect(src).toContain('language?: string');
      expect(src).toMatch(/BCP-47/);
    });

    it('STTOptions has model as optional string field', () => {
      expect(src).toContain('model?: string');
    });

    it('STTResult requires text as mandatory string', () => {
      expect(src).toMatch(/text:\s*string/);
    });

    it('STTResult includes optional confidence as number between 0 and 1', () => {
      expect(src).toContain('confidence?: number');
      expect(src).toMatch(/0\.0\s*-\s*1\.0/);
    });

    it('STTResult includes optional language', () => {
      expect(src).toContain('language?: string');
    });

    it('STTResult includes optional duration in seconds', () => {
      expect(src).toContain('duration?: number');
    });

    it('interface is exported for external use', () => {
      expect(src).toContain('export interface STTProvider');
      expect(src).toContain('export interface STTOptions');
      expect(src).toContain('export interface STTResult');
    });
  });

  // ---- Section 2: Audio Format Support Validation ----

  describe('audio format support', () => {
    it('SUPPORTED_AUDIO_FORMATS is a frozen/readonly array', () => {
      const src = fs.readFileSync(sttProviderPath, 'utf8');
      expect(src).toMatch(/ReadonlyArray<string>/);
    });

    it('SUPPORTED_AUDIO_FORMATS includes all required audio types', () => {
      const mod = require('../../dist/STTProvider.js');
      const formats = mod.SUPPORTED_AUDIO_FORMATS;
      expect(formats).toContain('audio/wav');
      expect(formats).toContain('audio/mpeg');
      expect(formats).toContain('audio/mp3');
      expect(formats).toContain('audio/webm');
      expect(formats).toContain('audio/mp4');
      expect(formats).toContain('audio/m4a');
      expect(formats).toContain('audio/x-m4a');
    });

    it('EXTENSION_TO_MIME is a frozen/readonly record', () => {
      const src = fs.readFileSync(sttProviderPath, 'utf8');
      expect(src).toMatch(/Readonly<Record<string,\s*string>>/);
    });

    it('EXTENSION_TO_MIME maps all common audio extensions', () => {
      const mod = require('../../dist/STTProvider.js');
      expect(mod.EXTENSION_TO_MIME['.wav']).toBe('audio/wav');
      expect(mod.EXTENSION_TO_MIME['.mp3']).toBe('audio/mpeg');
      expect(mod.EXTENSION_TO_MIME['.webm']).toBe('audio/webm');
      expect(mod.EXTENSION_TO_MIME['.m4a']).toBe('audio/mp4');
      expect(mod.EXTENSION_TO_MIME['.mp4']).toBe('audio/mp4');
    });

    it('mimeFromExtension returns correct MIME type for known extensions', () => {
      const mod = require('../../dist/STTProvider.js');
      expect(mod.mimeFromExtension('.wav')).toBe('audio/wav');
      expect(mod.mimeFromExtension('.mp3')).toBe('audio/mpeg');
      expect(mod.mimeFromExtension('.webm')).toBe('audio/webm');
      expect(mod.mimeFromExtension('.m4a')).toBe('audio/mp4');
    });

    it('mimeFromExtension falls back to audio/wav for unknown extensions', () => {
      const mod = require('../../dist/STTProvider.js');
      expect(mod.mimeFromExtension('.ogg')).toBe('audio/wav');
      expect(mod.mimeFromExtension('.flac')).toBe('audio/wav');
      expect(mod.mimeFromExtension('.xyz')).toBe('audio/wav');
    });

    it('mimeFromExtension is case-insensitive on extension', () => {
      const mod = require('../../dist/STTProvider.js');
      expect(mod.mimeFromExtension('.WAV')).toBe('audio/wav');
      expect(mod.mimeFromExtension('.Mp3')).toBe('audio/mpeg');
    });
  });

  // ---- Section 3: WhisperSTTProvider Construction and Config ----

  describe('WhisperSTTProvider construction and configuration', () => {
    let savedApiKey: string | undefined;
    let savedBaseUrl: string | undefined;
    let savedModel: string | undefined;

    beforeEach(() => {
      savedApiKey = process.env.OPENAI_API_KEY;
      savedBaseUrl = process.env.OPENAI_API_BASE_URL;
      savedModel = process.env.EVOKORE_STT_MODEL;
    });

    afterEach(() => {
      if (savedApiKey !== undefined) process.env.OPENAI_API_KEY = savedApiKey;
      else delete process.env.OPENAI_API_KEY;
      if (savedBaseUrl !== undefined) process.env.OPENAI_API_BASE_URL = savedBaseUrl;
      else delete process.env.OPENAI_API_BASE_URL;
      if (savedModel !== undefined) process.env.EVOKORE_STT_MODEL = savedModel;
      else delete process.env.EVOKORE_STT_MODEL;
    });

    it('constructor reads OPENAI_API_KEY from environment', () => {
      process.env.OPENAI_API_KEY = 'sk-test-validation-key';
      const { WhisperSTTProvider } = require('../../dist/stt/WhisperSTTProvider.js');
      const provider = new WhisperSTTProvider();
      expect(provider.isAvailable()).toBe(true);
    });

    it('constructor defaults to empty string when OPENAI_API_KEY is unset', () => {
      delete process.env.OPENAI_API_KEY;
      const { WhisperSTTProvider } = require('../../dist/stt/WhisperSTTProvider.js');
      const provider = new WhisperSTTProvider();
      expect(provider.isAvailable()).toBe(false);
    });

    it('constructor reads OPENAI_API_BASE_URL for custom endpoint', () => {
      const src = fs.readFileSync(whisperProviderPath, 'utf8');
      expect(src).toContain('process.env.OPENAI_API_BASE_URL');
      expect(src).toContain('https://api.openai.com');
    });

    it('constructor reads EVOKORE_STT_MODEL with whisper-1 default', () => {
      const src = fs.readFileSync(whisperProviderPath, 'utf8');
      expect(src).toContain('process.env.EVOKORE_STT_MODEL || "whisper-1"');
    });

    it('name property is whisper-api', () => {
      process.env.OPENAI_API_KEY = 'test';
      const { WhisperSTTProvider } = require('../../dist/stt/WhisperSTTProvider.js');
      const p = new WhisperSTTProvider();
      expect(p.name).toBe('whisper-api');
    });

    it('isAvailable returns false for empty string API key', () => {
      process.env.OPENAI_API_KEY = '';
      const { WhisperSTTProvider } = require('../../dist/stt/WhisperSTTProvider.js');
      const p = new WhisperSTTProvider();
      expect(p.isAvailable()).toBe(false);
    });

    it('isAvailable returns true for any non-empty API key', () => {
      process.env.OPENAI_API_KEY = 'any-key-value';
      const { WhisperSTTProvider } = require('../../dist/stt/WhisperSTTProvider.js');
      const p = new WhisperSTTProvider();
      expect(p.isAvailable()).toBe(true);
    });
  });

  // ---- Section 4: Whisper API Request Format Validation ----

  describe('Whisper API request format validation', () => {
    const src = fs.readFileSync(whisperProviderPath, 'utf8');

    it('targets correct OpenAI transcriptions endpoint', () => {
      expect(src).toContain('/v1/audio/transcriptions');
    });

    it('constructs full URL from baseUrl + /v1/audio/transcriptions', () => {
      expect(src).toMatch(/`\$\{this\.baseUrl\}\/v1\/audio\/transcriptions`/);
    });

    it('uses POST method', () => {
      expect(src).toContain('method: "POST"');
    });

    it('sets Authorization header with Bearer token', () => {
      expect(src).toMatch(/Authorization.*`Bearer \$\{this\.apiKey\}`/);
    });

    it('sets Content-Type to multipart/form-data with boundary', () => {
      expect(src).toMatch(/Content-Type.*multipart\/form-data.*boundary/);
    });

    it('generates unique boundary string using timestamp and random', () => {
      expect(src).toContain('Date.now()');
      expect(src).toContain('Math.random()');
      expect(src).toContain('EVOKOREBoundary');
    });

    it('includes file field with filename and Content-Type', () => {
      expect(src).toContain('name="file"');
      expect(src).toContain('filename="audio');
    });

    it('includes model field in multipart body', () => {
      expect(src).toContain('name="model"');
    });

    it('includes response_format field requesting verbose_json', () => {
      expect(src).toContain('name="response_format"');
      expect(src).toContain('verbose_json');
    });

    it('includes optional language field when provided', () => {
      expect(src).toContain('name="language"');
      expect(src).toContain('options?.language');
    });

    it('uses closing boundary marker', () => {
      expect(src).toMatch(/`--\$\{boundary\}--\\r\\n`/);
    });

    it('concatenates all parts into a single Buffer body', () => {
      expect(src).toContain('Buffer.concat(parts)');
    });

    it('uses native fetch (no external HTTP libraries)', () => {
      expect(src).toContain('await fetch(url');
      expect(src).not.toMatch(/import.*from\s*["'](axios|got|node-fetch|undici)/);
      expect(src).not.toMatch(/require\(["'](axios|got|node-fetch)/);
    });
  });

  // ---- Section 5: Whisper API Response Parsing ----

  describe('Whisper API response parsing', () => {
    const src = fs.readFileSync(whisperProviderPath, 'utf8');

    it('checks response.ok for HTTP success', () => {
      expect(src).toContain('response.ok');
    });

    it('throws error with HTTP status code on failure', () => {
      expect(src).toContain('response.status');
      expect(src).toMatch(/API returned \$\{response\.status\}/);
    });

    it('includes error body text in thrown error', () => {
      expect(src).toContain('response.text()');
      expect(src).toContain('errorText');
    });

    it('handles case where error text extraction fails', () => {
      // .catch(() => "unknown error") protects against body read failure
      expect(src).toContain('.catch(() => "unknown error")');
    });

    it('parses JSON response body', () => {
      expect(src).toContain('response.json()');
    });

    it('extracts text field from response', () => {
      expect(src).toContain('data.text');
    });

    it('extracts language field from response', () => {
      expect(src).toContain('data.language');
    });

    it('extracts duration field from response', () => {
      expect(src).toContain('data.duration');
    });

    it('extracts segments for confidence calculation', () => {
      expect(src).toContain('data.segments');
    });

    it('calculates confidence from segment avg_logprob values', () => {
      expect(src).toContain('avg_logprob');
      // Converts log prob to 0-1 scale using Math.exp
      expect(src).toContain('Math.exp(meanLogProb)');
    });

    it('clamps confidence to 0-1 range', () => {
      expect(src).toContain('Math.max(0, Math.min(1, confidence))');
    });

    it('returns empty string when text is undefined', () => {
      expect(src).toContain('data.text || ""');
    });
  });

  // ---- Section 6: WhisperSTTProvider Error Handling ----

  describe('WhisperSTTProvider error handling paths', () => {
    let savedApiKey: string | undefined;

    beforeEach(() => {
      savedApiKey = process.env.OPENAI_API_KEY;
    });

    afterEach(() => {
      if (savedApiKey !== undefined) process.env.OPENAI_API_KEY = savedApiKey;
      else delete process.env.OPENAI_API_KEY;
    });

    it('throws when transcribe called without API key set', async () => {
      delete process.env.OPENAI_API_KEY;
      const { WhisperSTTProvider } = require('../../dist/stt/WhisperSTTProvider.js');
      const provider = new WhisperSTTProvider();
      await expect(provider.transcribe(Buffer.from('data')))
        .rejects.toThrow('OPENAI_API_KEY is not set');
    });

    it('throws when transcribe called with zero-length buffer', async () => {
      process.env.OPENAI_API_KEY = 'sk-test';
      const { WhisperSTTProvider } = require('../../dist/stt/WhisperSTTProvider.js');
      const provider = new WhisperSTTProvider();
      await expect(provider.transcribe(Buffer.alloc(0)))
        .rejects.toThrow('audio buffer is empty');
    });

    it('checks isAvailable before attempting network call', () => {
      const src = fs.readFileSync(whisperProviderPath, 'utf8');
      // isAvailable check comes before the fetch call
      const isAvailableIndex = src.indexOf('if (!this.isAvailable())');
      const fetchIndex = src.indexOf('await fetch(url');
      expect(isAvailableIndex).toBeGreaterThan(-1);
      expect(fetchIndex).toBeGreaterThan(-1);
      expect(isAvailableIndex).toBeLessThan(fetchIndex);
    });

    it('checks buffer length before attempting network call', () => {
      const src = fs.readFileSync(whisperProviderPath, 'utf8');
      const bufferCheckIndex = src.indexOf('audioBuffer.length === 0');
      const fetchIndex = src.indexOf('await fetch(url');
      expect(bufferCheckIndex).toBeGreaterThan(-1);
      expect(fetchIndex).toBeGreaterThan(-1);
      expect(bufferCheckIndex).toBeLessThan(fetchIndex);
    });

    it('error message includes provider name for debugging', () => {
      const src = fs.readFileSync(whisperProviderPath, 'utf8');
      expect(src).toContain('WhisperSTTProvider:');
    });
  });

  // ---- Section 7: LocalSTTProvider Construction and Config ----

  describe('LocalSTTProvider construction and configuration', () => {
    it('constructor reads EVOKORE_WHISPER_PATH for CLI binary location', () => {
      const src = fs.readFileSync(localProviderPath, 'utf8');
      expect(src).toContain('process.env.EVOKORE_WHISPER_PATH || "whisper"');
    });

    it('constructor reads EVOKORE_STT_LOCAL_MODEL with base default', () => {
      const src = fs.readFileSync(localProviderPath, 'utf8');
      expect(src).toContain('process.env.EVOKORE_STT_LOCAL_MODEL || "base"');
    });

    it('name property is local-whisper', () => {
      const { LocalSTTProvider } = require('../../dist/stt/LocalSTTProvider.js');
      const p = new LocalSTTProvider();
      expect(p.name).toBe('local-whisper');
    });

    it('isAvailable caches result after first check', () => {
      const src = fs.readFileSync(localProviderPath, 'utf8');
      expect(src).toContain('this.available !== null');
      expect(src).toMatch(/private\s+available:\s*boolean\s*\|\s*null\s*=\s*null/);
    });

    it('uses which on Unix and where on Windows for CLI detection', () => {
      const src = fs.readFileSync(localProviderPath, 'utf8');
      expect(src).toContain('process.platform === "win32"');
      expect(src).toContain('"where"');
      expect(src).toContain('"which"');
    });

    it('uses execFileSync for CLI detection (not exec or execSync)', () => {
      const src = fs.readFileSync(localProviderPath, 'utf8');
      expect(src).toMatch(/import\s*\{[^}]*execFileSync[^}]*\}\s*from\s*"child_process"/);
    });

    it('returns false when whisper binary is not found', () => {
      const savedPath = process.env.EVOKORE_WHISPER_PATH;
      process.env.EVOKORE_WHISPER_PATH = 'nonexistent-binary-abc123xyz';
      try {
        const { LocalSTTProvider } = require('../../dist/stt/LocalSTTProvider.js');
        const p = new LocalSTTProvider();
        expect(p.isAvailable()).toBe(false);
      } finally {
        if (savedPath !== undefined) process.env.EVOKORE_WHISPER_PATH = savedPath;
        else delete process.env.EVOKORE_WHISPER_PATH;
      }
    });
  });

  // ---- Section 8: LocalSTTProvider Temp File and CLI Handling ----

  describe('LocalSTTProvider temp file management and CLI invocation', () => {
    const src = fs.readFileSync(localProviderPath, 'utf8');

    it('writes audio buffer to a temp file before whisper CLI runs', () => {
      expect(src).toContain('fs.writeFileSync(tmpInput, audioBuffer)');
    });

    it('temp input filename includes timestamp for uniqueness', () => {
      expect(src).toContain('evokore-stt-input-${Date.now()}');
    });

    it('temp files are created in os.tmpdir()', () => {
      expect(src).toContain('os.tmpdir()');
    });

    it('passes --model argument to whisper CLI', () => {
      expect(src).toContain('"--model", model');
    });

    it('passes --output_format txt to whisper CLI', () => {
      expect(src).toContain('"--output_format", "txt"');
    });

    it('passes --output_dir to whisper CLI', () => {
      expect(src).toContain('"--output_dir", tmpDir');
    });

    it('passes --language when language option is provided', () => {
      expect(src).toContain('"--language", options.language');
    });

    it('enforces 60-second timeout on CLI execution', () => {
      expect(src).toContain('timeout: 60000');
    });

    it('suppresses CLI stdout/stderr with stdio ignore', () => {
      expect(src).toContain('stdio: "ignore"');
    });

    it('cleans up temp input file in finally block', () => {
      expect(src).toContain('finally');
      expect(src).toContain('fs.unlinkSync(tmpInput)');
    });

    it('cleans up output file after reading result', () => {
      expect(src).toContain('fs.unlinkSync(actualOutput)');
    });

    it('handles missing output file gracefully', () => {
      expect(src).toContain('fs.existsSync(actualOutput)');
      expect(src).toContain('fs.existsSync(tmpOutputTxt)');
    });

    it('trims whitespace from transcription output', () => {
      expect(src).toContain('.trim()');
    });

    it('returns STTResult with text field only (no confidence from CLI)', () => {
      // LocalSTTProvider returns { text } without confidence, language, or duration
      // because the whisper CLI txt output does not include those
      expect(src).toMatch(/return\s*\{\s*text,?\s*\}/);
    });
  });

  // ---- Section 9: LocalSTTProvider Error Handling ----

  describe('LocalSTTProvider error handling paths', () => {
    it('throws descriptive error when whisper CLI is not installed', async () => {
      const savedPath = process.env.EVOKORE_WHISPER_PATH;
      process.env.EVOKORE_WHISPER_PATH = 'nonexistent-whisper-validation-test';
      try {
        const { LocalSTTProvider } = require('../../dist/stt/LocalSTTProvider.js');
        const provider = new LocalSTTProvider();
        await expect(provider.transcribe(Buffer.from('audio')))
          .rejects.toThrow('whisper CLI is not installed');
      } finally {
        if (savedPath !== undefined) process.env.EVOKORE_WHISPER_PATH = savedPath;
        else delete process.env.EVOKORE_WHISPER_PATH;
      }
    });

    it('error message includes pip install instructions', async () => {
      const src = fs.readFileSync(localProviderPath, 'utf8');
      expect(src).toContain('pip install openai-whisper');
    });

    it('throws when transcribe called with empty buffer even if available', async () => {
      const { LocalSTTProvider } = require('../../dist/stt/LocalSTTProvider.js');
      const provider = new LocalSTTProvider();
      // Force available to true to reach the buffer check
      (provider as any).available = true;
      await expect(provider.transcribe(Buffer.alloc(0)))
        .rejects.toThrow('audio buffer is empty');
    });

    it('error message includes provider name for debugging', () => {
      const src = fs.readFileSync(localProviderPath, 'utf8');
      expect(src).toContain('LocalSTTProvider:');
    });
  });

  // ---- Section 10: VoiceSidecar STT Factory Integration ----

  describe('VoiceSidecar STT provider factory (initSTTProvider)', () => {
    const src = fs.readFileSync(sidecarPath, 'utf8');

    it('defines initSTTProvider function', () => {
      expect(src).toContain('function initSTTProvider()');
    });

    it('returns STTProvider or null', () => {
      expect(src).toMatch(/function initSTTProvider\(\):\s*STTProvider\s*\|\s*null/);
    });

    it('returns null when EVOKORE_STT_ENABLED is not "true"', () => {
      expect(src).toContain('if (!STT_ENABLED)');
      expect(src).toMatch(/return null;\s*\}/);
    });

    it('selects LocalSTTProvider for "local-whisper" provider name', () => {
      expect(src).toContain('STT_PROVIDER_NAME === "local-whisper"');
      expect(src).toContain('new LocalSTTProvider()');
    });

    it('selects LocalSTTProvider for "local" alias', () => {
      expect(src).toContain('STT_PROVIDER_NAME === "local"');
    });

    it('defaults to WhisperSTTProvider when provider name is unrecognized', () => {
      // Default case after the local-whisper check
      expect(src).toContain('new WhisperSTTProvider()');
    });

    it('checks isAvailable after constructing local provider', () => {
      // Pattern: construct, then check isAvailable
      const localConstruct = src.indexOf('new LocalSTTProvider()');
      const localAvailCheck = src.indexOf('local whisper CLI not found');
      expect(localConstruct).toBeGreaterThan(-1);
      expect(localAvailCheck).toBeGreaterThan(-1);
      expect(localAvailCheck).toBeGreaterThan(localConstruct);
    });

    it('checks isAvailable after constructing whisper-api provider', () => {
      const whisperConstruct = src.indexOf('new WhisperSTTProvider()');
      const whisperAvailCheck = src.indexOf('OPENAI_API_KEY not set, STT disabled');
      expect(whisperConstruct).toBeGreaterThan(-1);
      expect(whisperAvailCheck).toBeGreaterThan(-1);
      expect(whisperAvailCheck).toBeGreaterThan(whisperConstruct);
    });

    it('catches and logs provider construction errors', () => {
      expect(src).toMatch(/catch\s*\(err:\s*any\)/);
      expect(src).toContain('Failed to load provider:');
    });

    it('returns null on provider construction error', () => {
      // Within the catch block, returns null
      const catchIndex = src.indexOf('Failed to load provider:');
      const returnNullAfter = src.indexOf('return null;', catchIndex);
      expect(returnNullAfter).toBeGreaterThan(catchIndex);
    });
  });

  // ---- Section 11: VoiceSidecar STT Message Handling ----

  describe('VoiceSidecar STT WebSocket message handling', () => {
    const src = fs.readFileSync(sidecarPath, 'utf8');

    it('detects transcribe messages by type field', () => {
      expect(src).toContain('(msg as any).type === "transcribe"');
    });

    it('returns stt_error when STT is not enabled', () => {
      expect(src).toContain('STT is not enabled');
      expect(src).toContain('Set EVOKORE_STT_ENABLED=true');
    });

    it('validates audio field is present and is a string', () => {
      expect(src).toContain('!sttMsg.audio');
      expect(src).toContain('typeof sttMsg.audio !== "string"');
    });

    it('returns stt_error for missing audio field', () => {
      expect(src).toContain('audio field is required and must be a base64-encoded string');
    });

    it('decodes base64 audio before processing', () => {
      expect(src).toContain('Buffer.from(sttMsg.audio, "base64")');
    });

    it('rejects empty audio buffer after base64 decode', () => {
      expect(src).toContain('audioBuffer.length === 0');
      expect(src).toMatch(/type:\s*"stt_error"[\s\S]*?audio buffer is empty/);
    });

    it('enforces 25 MB maximum audio size', () => {
      expect(src).toContain('25 * 1024 * 1024');
      expect(src).toContain('audioBuffer.length > STT_MAX_AUDIO_BYTES');
    });

    it('returns stt_error for oversized audio', () => {
      expect(src).toContain('audio exceeds maximum size');
    });

    it('passes language option from WebSocket message to provider', () => {
      expect(src).toContain('language: sttMsg.language');
    });

    it('passes model option from WebSocket message to provider', () => {
      expect(src).toContain('model: sttMsg.model');
    });

    it('returns stt_result with text, confidence, language, duration', () => {
      expect(src).toContain('type: "stt_result"');
      expect(src).toContain('text: result.text');
      expect(src).toContain('confidence: result.confidence');
      expect(src).toContain('language: result.language');
      expect(src).toContain('duration: result.duration');
    });

    it('catches transcription errors and returns stt_error', () => {
      expect(src).toMatch(/catch\s*\(sttErr:\s*any\)/);
      expect(src).toContain('error: sttErr.message');
    });

    it('logs STT audio size before transcribing', () => {
      expect(src).toMatch(/console\.error.*STT.*transcribing.*KB audio/);
    });

    it('logs STT errors to stderr', () => {
      expect(src).toMatch(/console\.error.*STT error/);
    });
  });

  // ---- Section 12: Health Check STT Status Reporting ----

  describe('health check STT status reporting', () => {
    const src = fs.readFileSync(sidecarPath, 'utf8');

    it('HealthResponse interface includes sttEnabled boolean field', () => {
      expect(src).toMatch(/sttEnabled:\s*boolean/);
    });

    it('HealthResponse interface includes sttProvider nullable string field', () => {
      expect(src).toMatch(/sttProvider:\s*string\s*\|\s*null/);
    });

    it('health check returns sttEnabled based on provider existence', () => {
      expect(src).toContain('sttEnabled: sttProvider !== null');
    });

    it('health check returns sttProvider name when available', () => {
      expect(src).toContain('sttProvider: sttProvider ? sttProvider.name : null');
    });

    it('health check also reports ttsProvider', () => {
      expect(src).toContain('ttsProvider: TTS_PROVIDER_NAME');
    });
  });

  // ---- Section 13: STT Environment Variable Configuration ----

  describe('STT environment variable configuration', () => {
    const envExample = fs.readFileSync(envExamplePath, 'utf8');

    it('.env.example documents EVOKORE_STT_ENABLED', () => {
      expect(envExample).toContain('EVOKORE_STT_ENABLED');
    });

    it('.env.example documents EVOKORE_STT_PROVIDER', () => {
      expect(envExample).toContain('EVOKORE_STT_PROVIDER');
    });

    it('.env.example documents EVOKORE_STT_MODEL', () => {
      expect(envExample).toContain('EVOKORE_STT_MODEL');
    });

    it('.env.example documents EVOKORE_STT_LOCAL_MODEL', () => {
      expect(envExample).toContain('EVOKORE_STT_LOCAL_MODEL');
    });

    it('.env.example documents EVOKORE_WHISPER_PATH', () => {
      expect(envExample).toContain('EVOKORE_WHISPER_PATH');
    });

    it('STT_ENABLED defaults to false (opt-in only)', () => {
      const src = fs.readFileSync(sidecarPath, 'utf8');
      expect(src).toContain('EVOKORE_STT_ENABLED === "true"');
      // If not "true", disabled
    });

    it('STT_PROVIDER defaults to whisper-api', () => {
      const src = fs.readFileSync(sidecarPath, 'utf8');
      expect(src).toMatch(/process\.env\.EVOKORE_STT_PROVIDER\s*\|\|\s*"whisper-api"/);
    });

    it('EVOKORE_STT_MODEL defaults to whisper-1 in WhisperSTTProvider', () => {
      const src = fs.readFileSync(whisperProviderPath, 'utf8');
      expect(src).toContain('process.env.EVOKORE_STT_MODEL || "whisper-1"');
    });

    it('EVOKORE_STT_LOCAL_MODEL defaults to base in LocalSTTProvider', () => {
      const src = fs.readFileSync(localProviderPath, 'utf8');
      expect(src).toContain('process.env.EVOKORE_STT_LOCAL_MODEL || "base"');
    });

    it('EVOKORE_WHISPER_PATH defaults to whisper in LocalSTTProvider', () => {
      const src = fs.readFileSync(localProviderPath, 'utf8');
      expect(src).toContain('process.env.EVOKORE_WHISPER_PATH || "whisper"');
    });

    it('.env.example lists provider options: whisper-api, local-whisper, local', () => {
      expect(envExample).toMatch(/whisper-api.*local-whisper.*local/);
    });

    it('.env.example lists local model options: tiny, base, small, medium, large', () => {
      expect(envExample).toMatch(/tiny.*base.*small.*medium.*large/);
    });
  });

  // ---- Section 14: STTClientMessage Interface Validation ----

  describe('STTClientMessage WebSocket protocol', () => {
    const src = fs.readFileSync(sidecarPath, 'utf8');

    it('defines STTClientMessage interface', () => {
      expect(src).toContain('interface STTClientMessage');
    });

    it('STTClientMessage has type field set to transcribe', () => {
      // Within the interface definition
      expect(src).toMatch(/interface STTClientMessage[\s\S]*?type:\s*"transcribe"/);
    });

    it('STTClientMessage has audio field as string (base64)', () => {
      expect(src).toMatch(/interface STTClientMessage[\s\S]*?audio:\s*string/);
    });

    it('STTClientMessage has optional language field', () => {
      expect(src).toMatch(/interface STTClientMessage[\s\S]*?language\?:\s*string/);
    });

    it('STTClientMessage has optional model field', () => {
      expect(src).toMatch(/interface STTClientMessage[\s\S]*?model\?:\s*string/);
    });
  });

  // ---- Section 15: STTResponse and STTErrorResponse Interfaces ----

  describe('STT response interfaces', () => {
    const src = fs.readFileSync(sidecarPath, 'utf8');

    it('STTResponse has type stt_result', () => {
      expect(src).toMatch(/interface STTResponse[\s\S]*?type:\s*"stt_result"/);
    });

    it('STTResponse has text field', () => {
      expect(src).toMatch(/interface STTResponse[\s\S]*?text:\s*string/);
    });

    it('STTResponse has optional confidence field', () => {
      expect(src).toMatch(/interface STTResponse[\s\S]*?confidence\?:\s*number/);
    });

    it('STTResponse has optional language field', () => {
      expect(src).toMatch(/interface STTResponse[\s\S]*?language\?:\s*string/);
    });

    it('STTResponse has optional duration field', () => {
      expect(src).toMatch(/interface STTResponse[\s\S]*?duration\?:\s*number/);
    });

    it('STTErrorResponse has type stt_error', () => {
      expect(src).toMatch(/interface STTErrorResponse[\s\S]*?type:\s*"stt_error"/);
    });

    it('STTErrorResponse has error string field', () => {
      expect(src).toMatch(/interface STTErrorResponse[\s\S]*?error:\s*string/);
    });
  });

  // ---- Section 16: Cross-Module Type Import Validation ----

  describe('cross-module type import validation', () => {
    it('WhisperSTTProvider imports STTProvider, STTOptions, STTResult, mimeFromExtension', () => {
      const src = fs.readFileSync(whisperProviderPath, 'utf8');
      expect(src).toMatch(/import\s*\{[^}]*STTProvider[^}]*\}\s*from/);
      expect(src).toMatch(/import\s*\{[^}]*STTOptions[^}]*\}\s*from/);
      expect(src).toMatch(/import\s*\{[^}]*STTResult[^}]*\}\s*from/);
      expect(src).toMatch(/import\s*\{[^}]*mimeFromExtension[^}]*\}\s*from/);
    });

    it('LocalSTTProvider imports STTProvider, STTOptions, STTResult', () => {
      const src = fs.readFileSync(localProviderPath, 'utf8');
      expect(src).toMatch(/import\s*\{[^}]*STTProvider[^}]*\}\s*from/);
      expect(src).toMatch(/import\s*\{[^}]*STTOptions[^}]*\}\s*from/);
      expect(src).toMatch(/import\s*\{[^}]*STTResult[^}]*\}\s*from/);
    });

    it('VoiceSidecar imports STTProvider type from STTProvider module', () => {
      const src = fs.readFileSync(sidecarPath, 'utf8');
      expect(src).toMatch(/import\s+type\s*\{[^}]*STTProvider[^}]*\}\s*from\s*["']\.\/STTProvider["']/);
    });

    it('VoiceSidecar imports STTResult type from STTProvider module', () => {
      const src = fs.readFileSync(sidecarPath, 'utf8');
      expect(src).toMatch(/import\s+type\s*\{[^}]*STTResult[^}]*\}\s*from\s*["']\.\/STTProvider["']/);
    });

    it('VoiceSidecar uses dynamic require for provider implementations', () => {
      const src = fs.readFileSync(sidecarPath, 'utf8');
      expect(src).toContain('require("./stt/LocalSTTProvider")');
      expect(src).toContain('require("./stt/WhisperSTTProvider")');
    });
  });

  // ---- Section 17: Compiled Module Runtime Validation ----

  describe('compiled module runtime validation', () => {
    it('dist/STTProvider.js exports SUPPORTED_AUDIO_FORMATS with 7 entries', () => {
      const mod = require('../../dist/STTProvider.js');
      expect(mod.SUPPORTED_AUDIO_FORMATS).toHaveLength(7);
    });

    it('dist/STTProvider.js exports EXTENSION_TO_MIME with 5 entries', () => {
      const mod = require('../../dist/STTProvider.js');
      expect(Object.keys(mod.EXTENSION_TO_MIME)).toHaveLength(5);
    });

    it('dist/stt/WhisperSTTProvider.js is loadable', () => {
      const mod = require('../../dist/stt/WhisperSTTProvider.js');
      expect(mod.WhisperSTTProvider).toBeDefined();
      expect(typeof mod.WhisperSTTProvider).toBe('function');
    });

    it('dist/stt/LocalSTTProvider.js is loadable', () => {
      const mod = require('../../dist/stt/LocalSTTProvider.js');
      expect(mod.LocalSTTProvider).toBeDefined();
      expect(typeof mod.LocalSTTProvider).toBe('function');
    });

    it('WhisperSTTProvider prototype has transcribe method', () => {
      const mod = require('../../dist/stt/WhisperSTTProvider.js');
      expect(typeof mod.WhisperSTTProvider.prototype.transcribe).toBe('function');
    });

    it('WhisperSTTProvider prototype has isAvailable method', () => {
      const mod = require('../../dist/stt/WhisperSTTProvider.js');
      expect(typeof mod.WhisperSTTProvider.prototype.isAvailable).toBe('function');
    });

    it('LocalSTTProvider prototype has transcribe method', () => {
      const mod = require('../../dist/stt/LocalSTTProvider.js');
      expect(typeof mod.LocalSTTProvider.prototype.transcribe).toBe('function');
    });

    it('LocalSTTProvider prototype has isAvailable method', () => {
      const mod = require('../../dist/stt/LocalSTTProvider.js');
      expect(typeof mod.LocalSTTProvider.prototype.isAvailable).toBe('function');
    });
  });

  // ---- Section 18: Provider Name Consistency ----

  describe('provider name consistency across modules', () => {
    it('WhisperSTTProvider.name matches provider selection string in VoiceSidecar', () => {
      const whisperSrc = fs.readFileSync(whisperProviderPath, 'utf8');
      const sidecarSrc = fs.readFileSync(sidecarPath, 'utf8');
      // WhisperSTTProvider sets name = "whisper-api"
      expect(whisperSrc).toContain('readonly name = "whisper-api"');
      // VoiceSidecar defaults to "whisper-api"
      expect(sidecarSrc).toContain('"whisper-api"');
    });

    it('LocalSTTProvider.name matches provider selection strings in VoiceSidecar', () => {
      const localSrc = fs.readFileSync(localProviderPath, 'utf8');
      const sidecarSrc = fs.readFileSync(sidecarPath, 'utf8');
      // LocalSTTProvider sets name = "local-whisper"
      expect(localSrc).toContain('readonly name = "local-whisper"');
      // VoiceSidecar checks for "local-whisper" and "local"
      expect(sidecarSrc).toContain('"local-whisper"');
      expect(sidecarSrc).toContain('"local"');
    });

    it('.env.example lists the same provider names as the code', () => {
      const envSrc = fs.readFileSync(envExamplePath, 'utf8');
      expect(envSrc).toContain('whisper-api');
      expect(envSrc).toContain('local-whisper');
      expect(envSrc).toContain('local');
    });
  });

  // ---- Section 19: Security and Safety Validation ----

  describe('STT security and safety', () => {
    it('VoiceSidecar enforces audio size limit to prevent memory abuse', () => {
      const src = fs.readFileSync(sidecarPath, 'utf8');
      expect(src).toContain('STT_MAX_AUDIO_BYTES');
      expect(src).toContain('25 * 1024 * 1024');
    });

    it('WebSocket server is bound to loopback only', () => {
      const src = fs.readFileSync(sidecarPath, 'utf8');
      expect(src).toMatch(/host:\s*"127\.0\.0\.1"/);
    });

    it('WebSocket server has maximum payload limit', () => {
      const src = fs.readFileSync(sidecarPath, 'utf8');
      expect(src).toContain('MAX_PAYLOAD_BYTES');
      expect(src).toContain('maxPayload: MAX_PAYLOAD_BYTES');
    });

    it('LocalSTTProvider uses execFileSync not execSync to avoid shell injection', () => {
      const src = fs.readFileSync(localProviderPath, 'utf8');
      expect(src).toContain('execFileSync');
      // Should NOT use execSync for CLI invocation (only imports execFileSync)
      const importLine = src.match(/import\s*\{([^}]*)\}\s*from\s*"child_process"/);
      expect(importLine).toBeTruthy();
      expect(importLine![1]).toContain('execFileSync');
    });

    it('LocalSTTProvider cleans up temp files even on error', () => {
      const src = fs.readFileSync(localProviderPath, 'utf8');
      // finally block ensures cleanup
      expect(src).toContain('finally');
      expect(src).toContain('fs.unlinkSync(tmpInput)');
    });

    it('WhisperSTTProvider does not log or expose API key', () => {
      const src = fs.readFileSync(whisperProviderPath, 'utf8');
      // Should not contain console.log/error with apiKey
      expect(src).not.toMatch(/console\.(log|error).*apiKey/);
      expect(src).not.toMatch(/console\.(log|error).*this\.apiKey/);
    });
  });

  // ---- Section 20: STT Provider Mirror Pattern Validation ----

  describe('STT/TTS provider architecture mirror pattern', () => {
    it('STTProvider.ts exists alongside TTSProvider.ts', () => {
      expect(fs.existsSync(path.join(ROOT, 'src', 'STTProvider.ts'))).toBe(true);
      expect(fs.existsSync(path.join(ROOT, 'src', 'TTSProvider.ts'))).toBe(true);
    });

    it('stt/ directory exists alongside tts/ directory', () => {
      expect(fs.existsSync(path.join(ROOT, 'src', 'stt'))).toBe(true);
      expect(fs.existsSync(path.join(ROOT, 'src', 'tts'))).toBe(true);
    });

    it('both provider interfaces define name, isAvailable, and a primary method', () => {
      const sttSrc = fs.readFileSync(path.join(ROOT, 'src', 'STTProvider.ts'), 'utf8');
      const ttsSrc = fs.readFileSync(path.join(ROOT, 'src', 'TTSProvider.ts'), 'utf8');
      // Both have name, isAvailable
      expect(sttSrc).toContain('readonly name: string');
      expect(ttsSrc).toContain('readonly name: string');
      expect(sttSrc).toContain('isAvailable(): boolean');
      expect(ttsSrc).toContain('isAvailable(): boolean');
    });

    it('VoiceSidecar imports both STT and TTS provider types', () => {
      const src = fs.readFileSync(sidecarPath, 'utf8');
      expect(src).toMatch(/import.*STTProvider.*from.*"\.\/STTProvider"/);
      expect(src).toMatch(/import.*TTSProvider.*from.*"\.\/TTSProvider"/);
    });

    it('VoiceSidecar factory function naming follows same pattern for STT and TTS', () => {
      const src = fs.readFileSync(sidecarPath, 'utf8');
      expect(src).toContain('function initSTTProvider()');
      expect(src).toContain('function createTTSProvider(');
    });

    it('both cloud providers use cloud APIs with env var API keys', () => {
      const whisperSrc = fs.readFileSync(whisperProviderPath, 'utf8');
      expect(whisperSrc).toContain('process.env.OPENAI_API_KEY');
      // ElevenLabs TTS uses ELEVENLABS_API_KEY
      const sidecarSrc = fs.readFileSync(sidecarPath, 'utf8');
      expect(sidecarSrc).toContain('ELEVENLABS_API_KEY');
    });
  });
});
