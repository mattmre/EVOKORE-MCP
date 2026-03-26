/**
 * Production validation tests for the OpenAI-compatible TTS provider.
 *
 * These tests exercise construction, buffer accumulation, HTTP request
 * formation, error handling, voice/model config resolution, and
 * integration with the VoiceSidecar factory without requiring a live
 * TTS server.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');

// ---------------------------------------------------------------------------
// Source-level assertions (source file present and structurally correct)
// ---------------------------------------------------------------------------

describe('OpenAICompatTTSProvider — production validation', () => {
  const srcPath = path.join(ROOT, 'src', 'tts', 'OpenAICompatTTSProvider.ts');
  const sidecarPath = path.join(ROOT, 'src', 'VoiceSidecar.ts');
  const { OpenAICompatTTSProvider } = require('../../dist/tts/OpenAICompatTTSProvider.js');

  // -----------------------------------------------------------------------
  // 1. Provider construction with various config combinations
  // -----------------------------------------------------------------------

  describe('construction — baseUrl normalization', () => {
    it('strips single trailing slash from baseUrl', () => {
      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://localhost:8880/',
      );
      // After construction the stored baseUrl should have no trailing slash
      expect((p as any).baseUrl).toBe('http://localhost:8880');
    });

    it('strips multiple trailing slashes from baseUrl', () => {
      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://localhost:8880///',
      );
      expect((p as any).baseUrl).toBe('http://localhost:8880');
    });

    it('preserves baseUrl without trailing slash', () => {
      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://localhost:8880',
      );
      expect((p as any).baseUrl).toBe('http://localhost:8880');
    });

    it('stores empty string when apiKey is omitted', () => {
      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://localhost:8880',
      );
      expect((p as any).apiKey).toBe('');
    });

    it('stores apiKey when provided', () => {
      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://localhost:8880',
        'sk-test-key-12345',
      );
      expect((p as any).apiKey).toBe('sk-test-key-12345');
    });
  });

  // -----------------------------------------------------------------------
  // 2. Text buffer accumulation
  // -----------------------------------------------------------------------

  describe('text buffer accumulation', () => {
    it('buffers a single sendText call', () => {
      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://localhost:8880',
      );
      p.sendText('hello');
      expect((p as any).textBuffer).toEqual(['hello']);
    });

    it('buffers multiple sendText calls in order', () => {
      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://localhost:8880',
      );
      p.sendText('first ');
      p.sendText('second ');
      p.sendText('third');
      expect((p as any).textBuffer).toEqual(['first ', 'second ', 'third']);
    });

    it('ignores empty string in sendText', () => {
      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://localhost:8880',
      );
      p.sendText('');
      expect((p as any).textBuffer).toEqual([]);
    });

    it('ignores falsy values in sendText but keeps whitespace-only strings', () => {
      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://localhost:8880',
      );
      p.sendText('');
      p.sendText('  ');
      expect((p as any).textBuffer).toEqual(['  ']);
    });
  });

  // -----------------------------------------------------------------------
  // 3. HTTP request format validation (mock fetch)
  // -----------------------------------------------------------------------

  describe('HTTP request format — mock fetch', () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('sends POST to {baseUrl}/v1/audio/speech', async () => {
      let capturedUrl = '';
      let capturedInit: any = {};

      globalThis.fetch = vi.fn(async (url: any, init: any) => {
        capturedUrl = String(url);
        capturedInit = init;
        return new Response(new Uint8Array([0xff, 0xfb, 0x90, 0x00]), { status: 200 });
      }) as any;

      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3', openaiVoice: 'alloy', openaiModel: 'kokoro' },
        'http://127.0.0.1:8880',
      );
      p.sendText('Hello world');
      await p.flush();

      expect(capturedUrl).toBe('http://127.0.0.1:8880/v1/audio/speech');
      expect(capturedInit.method).toBe('POST');
    });

    it('sends correct JSON body fields', async () => {
      let capturedBody: any = {};

      globalThis.fetch = vi.fn(async (_url: any, init: any) => {
        capturedBody = JSON.parse(init.body);
        return new Response(new Uint8Array([0xff, 0xfb, 0x90, 0x00]), { status: 200 });
      }) as any;

      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1.2, outputFormat: 'mp3', openaiVoice: 'alloy', openaiModel: 'kokoro' },
        'http://127.0.0.1:8880',
      );
      p.sendText('Test input');
      await p.flush();

      expect(capturedBody.model).toBe('kokoro');
      expect(capturedBody.voice).toBe('alloy');
      expect(capturedBody.input).toBe('Test input');
      expect(capturedBody.response_format).toBe('mp3');
      expect(capturedBody.speed).toBe(1.2);
    });

    it('joins multiple text chunks in the request body', async () => {
      let capturedBody: any = {};

      globalThis.fetch = vi.fn(async (_url: any, init: any) => {
        capturedBody = JSON.parse(init.body);
        return new Response(new Uint8Array([0xff, 0xfb, 0x90, 0x00]), { status: 200 });
      }) as any;

      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3', openaiVoice: 'nova' },
        'http://127.0.0.1:8880',
      );
      p.sendText('Hello ');
      p.sendText('world');
      await p.flush();

      expect(capturedBody.input).toBe('Hello world');
    });

    it('sends Content-Type application/json header', async () => {
      let capturedHeaders: Record<string, string> = {};

      globalThis.fetch = vi.fn(async (_url: any, init: any) => {
        capturedHeaders = init.headers;
        return new Response(new Uint8Array([0xff, 0xfb, 0x90, 0x00]), { status: 200 });
      }) as any;

      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://127.0.0.1:8880',
      );
      p.sendText('test');
      await p.flush();

      expect(capturedHeaders['Content-Type']).toBe('application/json');
    });

    it('includes Authorization Bearer header when apiKey provided', async () => {
      let capturedHeaders: Record<string, string> = {};

      globalThis.fetch = vi.fn(async (_url: any, init: any) => {
        capturedHeaders = init.headers;
        return new Response(new Uint8Array([0xff, 0xfb, 0x90, 0x00]), { status: 200 });
      }) as any;

      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://127.0.0.1:8880',
        'sk-my-secret-key',
      );
      p.sendText('test');
      await p.flush();

      expect(capturedHeaders['Authorization']).toBe('Bearer sk-my-secret-key');
    });

    it('omits Authorization header when no apiKey', async () => {
      let capturedHeaders: Record<string, string> = {};

      globalThis.fetch = vi.fn(async (_url: any, init: any) => {
        capturedHeaders = init.headers;
        return new Response(new Uint8Array([0xff, 0xfb, 0x90, 0x00]), { status: 200 });
      }) as any;

      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://127.0.0.1:8880',
      );
      p.sendText('test');
      await p.flush();

      expect(capturedHeaders['Authorization']).toBeUndefined();
    });

    it('returns Buffer on successful response', async () => {
      const audioBytes = new Uint8Array([0xff, 0xfb, 0x90, 0x00, 0x01, 0x02]);

      globalThis.fetch = vi.fn(async () => {
        return new Response(audioBytes, { status: 200 });
      }) as any;

      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://127.0.0.1:8880',
      );
      p.sendText('test');
      const result = await p.flush();

      expect(result).toBeInstanceOf(Buffer);
      expect(result!.length).toBe(6);
    });

    it('clears the text buffer after flush', async () => {
      globalThis.fetch = vi.fn(async () => {
        return new Response(new Uint8Array([0xff]), { status: 200 });
      }) as any;

      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://127.0.0.1:8880',
      );
      p.sendText('test');
      await p.flush();

      expect((p as any).textBuffer).toEqual([]);
    });

    it('uses default speed of 1.0 when voice config has no speed', async () => {
      let capturedBody: any = {};

      globalThis.fetch = vi.fn(async (_url: any, init: any) => {
        capturedBody = JSON.parse(init.body);
        return new Response(new Uint8Array([0xff]), { status: 200 });
      }) as any;

      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 0, outputFormat: 'mp3' },
        'http://127.0.0.1:8880',
      );
      p.sendText('test');
      await p.flush();

      // speed: 0 is falsy, so the provider falls back to 1.0
      expect(capturedBody.speed).toBe(1.0);
    });
  });

  // -----------------------------------------------------------------------
  // 4. Error handling paths
  // -----------------------------------------------------------------------

  describe('error handling', () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('returns null when text buffer is empty (no sendText calls)', async () => {
      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://127.0.0.1:8880',
      );
      const result = await p.flush();
      expect(result).toBeNull();
    });

    it('returns null when text buffer contains only whitespace', async () => {
      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://127.0.0.1:8880',
      );
      p.sendText('   ');
      p.sendText('\n');
      const result = await p.flush();
      expect(result).toBeNull();
    });

    it('returns null on HTTP error status (non-ok response)', async () => {
      globalThis.fetch = vi.fn(async () => {
        return new Response('Internal Server Error', { status: 500 });
      }) as any;

      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://127.0.0.1:8880',
      );
      p.sendText('test');
      const result = await p.flush();
      expect(result).toBeNull();
    });

    it('returns null on HTTP 404 error', async () => {
      globalThis.fetch = vi.fn(async () => {
        return new Response('Not Found', { status: 404 });
      }) as any;

      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://127.0.0.1:8880',
      );
      p.sendText('test');
      const result = await p.flush();
      expect(result).toBeNull();
    });

    it('returns null when fetch throws a network error', async () => {
      globalThis.fetch = vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }) as any;

      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://127.0.0.1:8880',
      );
      p.sendText('test');
      const result = await p.flush();
      expect(result).toBeNull();
    });

    it('returns null when fetch throws a DNS resolution error', async () => {
      globalThis.fetch = vi.fn(async () => {
        throw new Error('getaddrinfo ENOTFOUND nonexistent.local');
      }) as any;

      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://nonexistent.local:8880',
      );
      p.sendText('test');
      const result = await p.flush();
      expect(result).toBeNull();
    });

    it('returns null when response body is empty (zero-length audio)', async () => {
      globalThis.fetch = vi.fn(async () => {
        return new Response(new Uint8Array([]), { status: 200 });
      }) as any;

      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://127.0.0.1:8880',
      );
      p.sendText('test');
      const result = await p.flush();
      expect(result).toBeNull();
    });

    it('returns null on real unreachable port (no mock)', async () => {
      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://127.0.0.1:19998',
      );
      p.sendText('test');
      const result = await p.flush();
      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // 5. Voice config resolution (openaiVoice / openaiModel fallbacks)
  // -----------------------------------------------------------------------

  describe('voice and model config resolution', () => {
    const savedEnvVoice = process.env.EVOKORE_TTS_VOICE;
    const savedEnvModel = process.env.EVOKORE_TTS_MODEL;

    afterEach(() => {
      // Restore env
      if (savedEnvVoice !== undefined) process.env.EVOKORE_TTS_VOICE = savedEnvVoice;
      else delete process.env.EVOKORE_TTS_VOICE;
      if (savedEnvModel !== undefined) process.env.EVOKORE_TTS_MODEL = savedEnvModel;
      else delete process.env.EVOKORE_TTS_MODEL;
    });

    it('uses openaiVoice from voice config when present', () => {
      delete process.env.EVOKORE_TTS_VOICE;
      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3', openaiVoice: 'shimmer' },
        'http://127.0.0.1:8880',
      );
      expect((p as any).defaultVoice).toBe('shimmer');
    });

    it('falls back to EVOKORE_TTS_VOICE env var when openaiVoice absent', () => {
      process.env.EVOKORE_TTS_VOICE = 'echo';
      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://127.0.0.1:8880',
      );
      expect((p as any).defaultVoice).toBe('echo');
    });

    it('falls back to "nova" when neither openaiVoice nor env var set', () => {
      delete process.env.EVOKORE_TTS_VOICE;
      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://127.0.0.1:8880',
      );
      expect((p as any).defaultVoice).toBe('nova');
    });

    it('uses openaiModel from voice config when present', () => {
      delete process.env.EVOKORE_TTS_MODEL;
      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3', openaiModel: 'kokoro' },
        'http://127.0.0.1:8880',
      );
      expect((p as any).defaultModel).toBe('kokoro');
    });

    it('falls back to EVOKORE_TTS_MODEL env var when openaiModel absent', () => {
      process.env.EVOKORE_TTS_MODEL = 'tts-1-hd';
      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://127.0.0.1:8880',
      );
      expect((p as any).defaultModel).toBe('tts-1-hd');
    });

    it('falls back to "tts-1" when neither openaiModel nor env var set', () => {
      delete process.env.EVOKORE_TTS_MODEL;
      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://127.0.0.1:8880',
      );
      expect((p as any).defaultModel).toBe('tts-1');
    });

    it('openaiVoice takes priority over EVOKORE_TTS_VOICE env var', () => {
      process.env.EVOKORE_TTS_VOICE = 'env-voice';
      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3', openaiVoice: 'config-voice' },
        'http://127.0.0.1:8880',
      );
      expect((p as any).defaultVoice).toBe('config-voice');
    });

    it('openaiModel takes priority over EVOKORE_TTS_MODEL env var', () => {
      process.env.EVOKORE_TTS_MODEL = 'env-model';
      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3', openaiModel: 'config-model' },
        'http://127.0.0.1:8880',
      );
      expect((p as any).defaultModel).toBe('config-model');
    });
  });

  // -----------------------------------------------------------------------
  // 6. Provider identity and interface compliance
  // -----------------------------------------------------------------------

  describe('provider identity and interface compliance', () => {
    it('name is "openai-compat"', () => {
      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://127.0.0.1:8880',
      );
      expect(p.name).toBe('openai-compat');
    });

    it('isAvailable always returns true', () => {
      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://127.0.0.1:8880',
      );
      expect(p.isAvailable()).toBe(true);
    });

    it('isAvailable returns true even with no apiKey', () => {
      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://localhost:8880',
      );
      expect(p.isAvailable()).toBe(true);
    });

    it('connect is async and resets the text buffer', async () => {
      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://127.0.0.1:8880',
      );
      p.sendText('leftover');
      expect((p as any).textBuffer.length).toBe(1);

      await p.connect();
      expect((p as any).textBuffer).toEqual([]);
    });

    it('connect returns a resolved promise (no-op)', async () => {
      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://127.0.0.1:8880',
      );
      const result = p.connect();
      expect(result).toBeInstanceOf(Promise);
      await expect(result).resolves.toBeUndefined();
    });

    it('has sendText, flush, connect, isAvailable as callable methods', () => {
      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://127.0.0.1:8880',
      );
      expect(typeof p.sendText).toBe('function');
      expect(typeof p.flush).toBe('function');
      expect(typeof p.connect).toBe('function');
      expect(typeof p.isAvailable).toBe('function');
    });
  });

  // -----------------------------------------------------------------------
  // 7. Integration with VoiceSidecar factory
  // -----------------------------------------------------------------------

  describe('VoiceSidecar createTTSProvider factory integration', () => {
    it('VoiceSidecar references EVOKORE_TTS_PROVIDER for provider switching', () => {
      const src = fs.readFileSync(sidecarPath, 'utf8');
      expect(src).toContain('EVOKORE_TTS_PROVIDER');
      expect(src).toMatch(/process\.env\.EVOKORE_TTS_PROVIDER\s*\|\|\s*"elevenlabs"/);
    });

    it('VoiceSidecar createTTSProvider selects openai-compat on "openai-compat" or "openai"', () => {
      const src = fs.readFileSync(sidecarPath, 'utf8');
      expect(src).toMatch(/TTS_PROVIDER_NAME\s*===\s*"openai-compat"/);
      expect(src).toMatch(/TTS_PROVIDER_NAME\s*===\s*"openai"/);
    });

    it('VoiceSidecar passes TTS_BASE_URL and TTS_API_KEY to OpenAICompatTTSProvider', () => {
      const src = fs.readFileSync(sidecarPath, 'utf8');
      expect(src).toContain('new OpenAICompatTTSProvider(voice, TTS_BASE_URL, TTS_API_KEY)');
    });

    it('VoiceSidecar defaults TTS_BASE_URL to http://127.0.0.1:8880', () => {
      const src = fs.readFileSync(sidecarPath, 'utf8');
      expect(src).toMatch(/EVOKORE_TTS_BASE_URL\s*\|\|\s*"http:\/\/127\.0\.0\.1:8880"/);
    });

    it('VoiceSidecar defaults TTS_API_KEY to empty string', () => {
      const src = fs.readFileSync(sidecarPath, 'utf8');
      expect(src).toMatch(/EVOKORE_TTS_API_KEY\s*\|\|\s*""/);
    });

    it('VoiceSidecar logs TTS endpoint URL when openai-compat is active', () => {
      const src = fs.readFileSync(sidecarPath, 'utf8');
      expect(src).toMatch(/console\.error\(`\[VoiceSidecar\] TTS endpoint: \${TTS_BASE_URL}\/v1\/audio\/speech`\)/);
    });
  });

  // -----------------------------------------------------------------------
  // 8. voices.json persona openaiVoice coverage
  // -----------------------------------------------------------------------

  describe('voices.json persona openaiVoice fields', () => {
    const voicesPath = path.join(ROOT, 'voices.json');

    it('voices.json file exists', () => {
      expect(fs.existsSync(voicesPath)).toBe(true);
    });

    it('every persona has an openaiVoice field', () => {
      const raw = fs.readFileSync(voicesPath, 'utf8');
      const data = JSON.parse(raw);
      // data.default is the default voice; data.personas is the map
      const personas = data.personas || {};
      for (const [name, cfg] of Object.entries(personas)) {
        expect((cfg as any).openaiVoice, `persona "${name}" missing openaiVoice`).toBeDefined();
        expect(typeof (cfg as any).openaiVoice).toBe('string');
      }
    });

    it('default voice config has an openaiVoice field', () => {
      const raw = fs.readFileSync(voicesPath, 'utf8');
      const data = JSON.parse(raw);
      expect(data.default).toBeDefined();
      expect(data.default.openaiVoice).toBeDefined();
      expect(typeof data.default.openaiVoice).toBe('string');
    });
  });

  // -----------------------------------------------------------------------
  // 9. End-to-end flush cycle (mock fetch, full lifecycle)
  // -----------------------------------------------------------------------

  describe('full lifecycle flush cycle', () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('connect -> sendText -> flush -> returns audio buffer', async () => {
      const fakeAudio = new Uint8Array([0x49, 0x44, 0x33]); // ID3 tag start

      globalThis.fetch = vi.fn(async () => {
        return new Response(fakeAudio, { status: 200 });
      }) as any;

      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3', openaiVoice: 'nova', openaiModel: 'tts-1' },
        'http://127.0.0.1:8880',
      );

      await p.connect();
      p.sendText('Hello from the full lifecycle test.');
      const result = await p.flush();

      expect(result).toBeInstanceOf(Buffer);
      expect(result!.length).toBe(3);
    });

    it('second flush after first returns null (buffer cleared)', async () => {
      globalThis.fetch = vi.fn(async () => {
        return new Response(new Uint8Array([0xff]), { status: 200 });
      }) as any;

      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://127.0.0.1:8880',
      );
      p.sendText('test');
      await p.flush();

      // Second flush with no new text
      const result = await p.flush();
      expect(result).toBeNull();
    });

    it('multiple connect/sendText/flush cycles work independently', async () => {
      let callCount = 0;

      globalThis.fetch = vi.fn(async (_url: any, init: any) => {
        callCount++;
        const body = JSON.parse(init.body);
        // Return different audio bytes per call to verify independence
        return new Response(new Uint8Array([callCount, callCount]), { status: 200 });
      }) as any;

      const p = new OpenAICompatTTSProvider(
        { voiceId: 'v', voiceName: 'V', model: 'm', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://127.0.0.1:8880',
      );

      // Cycle 1
      await p.connect();
      p.sendText('cycle one');
      const r1 = await p.flush();
      expect(r1).toBeInstanceOf(Buffer);
      expect(r1![0]).toBe(1);

      // Cycle 2
      await p.connect();
      p.sendText('cycle two');
      const r2 = await p.flush();
      expect(r2).toBeInstanceOf(Buffer);
      expect(r2![0]).toBe(2);

      expect(callCount).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // 10. Env var documentation check
  // -----------------------------------------------------------------------

  describe('env var documentation in .env.example', () => {
    const envExample = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');

    it('EVOKORE_TTS_PROVIDER is documented', () => {
      expect(envExample).toContain('EVOKORE_TTS_PROVIDER');
    });

    it('EVOKORE_TTS_BASE_URL is documented', () => {
      expect(envExample).toContain('EVOKORE_TTS_BASE_URL');
    });

    it('EVOKORE_TTS_API_KEY is documented', () => {
      expect(envExample).toContain('EVOKORE_TTS_API_KEY');
    });

    it('EVOKORE_TTS_VOICE is documented', () => {
      expect(envExample).toContain('EVOKORE_TTS_VOICE');
    });

    it('EVOKORE_TTS_MODEL is documented', () => {
      expect(envExample).toContain('EVOKORE_TTS_MODEL');
    });
  });
});
