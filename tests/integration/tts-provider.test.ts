import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const ttsProviderPath = path.join(ROOT, 'src', 'TTSProvider.ts');
const elevenLabsProviderPath = path.join(ROOT, 'src', 'tts', 'ElevenLabsTTSProvider.ts');
const openaiCompatProviderPath = path.join(ROOT, 'src', 'tts', 'OpenAICompatTTSProvider.ts');
const sidecarPath = path.join(ROOT, 'src', 'VoiceSidecar.ts');

describe('TTS Provider System', () => {

  describe('TTSProvider interface definition', () => {
    it('TTSProvider.ts source file exists', () => {
      expect(fs.existsSync(ttsProviderPath)).toBe(true);
    });

    it('defines TTSProvider interface with required methods', () => {
      const src = fs.readFileSync(ttsProviderPath, 'utf8');
      expect(src).toContain('export interface TTSProvider');
      expect(src).toContain('connect(): Promise<void>');
      expect(src).toContain('sendText(chunk: string): void');
      expect(src).toContain('flush(): Promise<Buffer | null>');
    });

    it('defines isAvailable method on TTSProvider', () => {
      const src = fs.readFileSync(ttsProviderPath, 'utf8');
      expect(src).toContain('isAvailable(): boolean');
    });

    it('defines name property on TTSProvider', () => {
      const src = fs.readFileSync(ttsProviderPath, 'utf8');
      expect(src).toContain('readonly name: string');
    });

    it('defines TTSVoiceConfig interface', () => {
      const src = fs.readFileSync(ttsProviderPath, 'utf8');
      expect(src).toContain('export interface TTSVoiceConfig');
      expect(src).toContain('voiceId: string');
      expect(src).toContain('voiceName: string');
      expect(src).toContain('speed: number');
    });

    it('TTSVoiceConfig includes openaiVoice and openaiModel optional fields', () => {
      const src = fs.readFileSync(ttsProviderPath, 'utf8');
      expect(src).toContain('openaiVoice?: string');
      expect(src).toContain('openaiModel?: string');
    });
  });

  describe('ElevenLabsTTSProvider module', () => {
    it('ElevenLabsTTSProvider.ts source file exists', () => {
      expect(fs.existsSync(elevenLabsProviderPath)).toBe(true);
    });

    it('imports TTSProvider interface', () => {
      const src = fs.readFileSync(elevenLabsProviderPath, 'utf8');
      expect(src).toMatch(/import.*TTSProvider.*from.*"\.\.\/TTSProvider"/);
    });

    it('exports ElevenLabsTTSProvider class', () => {
      const src = fs.readFileSync(elevenLabsProviderPath, 'utf8');
      expect(src).toContain('export class ElevenLabsTTSProvider');
    });

    it('implements TTSProvider interface', () => {
      const src = fs.readFileSync(elevenLabsProviderPath, 'utf8');
      expect(src).toContain('implements TTSProvider');
    });

    it('has name set to elevenlabs', () => {
      const src = fs.readFileSync(elevenLabsProviderPath, 'utf8');
      expect(src).toMatch(/readonly name = "elevenlabs"/);
    });

    it('connects to ElevenLabs WebSocket API', () => {
      const src = fs.readFileSync(elevenLabsProviderPath, 'utf8');
      expect(src).toContain('wss://api.elevenlabs.io');
    });

    it('has retry logic for connection', () => {
      const src = fs.readFileSync(elevenLabsProviderPath, 'utf8');
      expect(src).toContain('CONNECT_MAX_RETRIES');
    });

    it('flush returns Promise<Buffer | null>', () => {
      const src = fs.readFileSync(elevenLabsProviderPath, 'utf8');
      expect(src).toMatch(/flush\(\):\s*Promise<Buffer \| null>/);
    });

    it('does not call finalize internally (shared pipeline)', () => {
      const src = fs.readFileSync(elevenLabsProviderPath, 'utf8');
      expect(src).not.toContain('finalize()');
      expect(src).not.toContain('playAudio');
      expect(src).not.toContain('enqueuePlayback');
    });

    it('does not import fs or os (no file operations)', () => {
      const src = fs.readFileSync(elevenLabsProviderPath, 'utf8');
      expect(src).not.toMatch(/import.*from\s*["']fs["']/);
      expect(src).not.toMatch(/import.*from\s*["']os["']/);
    });

    it('uses fetch-free approach (WebSocket only, no HTTP deps)', () => {
      const src = fs.readFileSync(elevenLabsProviderPath, 'utf8');
      expect(src).not.toMatch(/import.*from\s*["'](axios|got|node-fetch)/);
    });
  });

  describe('ElevenLabsTTSProvider runtime behavior', () => {
    it('name property returns elevenlabs', () => {
      const { ElevenLabsTTSProvider } = require('../../dist/tts/ElevenLabsTTSProvider.js');
      const provider = new ElevenLabsTTSProvider(
        { voiceId: 'test', voiceName: 'Test', model: 'test', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3_44100_128' },
        'fake-key'
      );
      expect(provider.name).toBe('elevenlabs');
    });

    it('isAvailable returns false when no API key', () => {
      const { ElevenLabsTTSProvider } = require('../../dist/tts/ElevenLabsTTSProvider.js');
      const provider = new ElevenLabsTTSProvider(
        { voiceId: 'test', voiceName: 'Test', model: 'test', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3_44100_128' },
        ''
      );
      expect(provider.isAvailable()).toBe(false);
    });

    it('isAvailable returns true when API key provided', () => {
      const { ElevenLabsTTSProvider } = require('../../dist/tts/ElevenLabsTTSProvider.js');
      const provider = new ElevenLabsTTSProvider(
        { voiceId: 'test', voiceName: 'Test', model: 'test', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3_44100_128' },
        'test-key-123'
      );
      expect(provider.isAvailable()).toBe(true);
    });
  });

  describe('OpenAICompatTTSProvider module', () => {
    it('OpenAICompatTTSProvider.ts source file exists', () => {
      expect(fs.existsSync(openaiCompatProviderPath)).toBe(true);
    });

    it('imports TTSProvider interface', () => {
      const src = fs.readFileSync(openaiCompatProviderPath, 'utf8');
      expect(src).toMatch(/import.*TTSProvider.*from.*"\.\.\/TTSProvider"/);
    });

    it('exports OpenAICompatTTSProvider class', () => {
      const src = fs.readFileSync(openaiCompatProviderPath, 'utf8');
      expect(src).toContain('export class OpenAICompatTTSProvider');
    });

    it('implements TTSProvider interface', () => {
      const src = fs.readFileSync(openaiCompatProviderPath, 'utf8');
      expect(src).toContain('implements TTSProvider');
    });

    it('has name set to openai-compat', () => {
      const src = fs.readFileSync(openaiCompatProviderPath, 'utf8');
      expect(src).toMatch(/readonly name = "openai-compat"/);
    });

    it('posts to /v1/audio/speech endpoint', () => {
      const src = fs.readFileSync(openaiCompatProviderPath, 'utf8');
      expect(src).toContain('/v1/audio/speech');
    });

    it('uses native fetch (no external HTTP deps)', () => {
      const src = fs.readFileSync(openaiCompatProviderPath, 'utf8');
      expect(src).toContain('await fetch(url');
      expect(src).not.toMatch(/import.*from\s*["'](axios|got|node-fetch)/);
    });

    it('buffers text from sendText calls', () => {
      const src = fs.readFileSync(openaiCompatProviderPath, 'utf8');
      expect(src).toContain('this.textBuffer.push(chunk)');
    });

    it('joins buffered text on flush', () => {
      const src = fs.readFileSync(openaiCompatProviderPath, 'utf8');
      expect(src).toContain('this.textBuffer.join');
    });

    it('returns null when text buffer is empty', () => {
      const src = fs.readFileSync(openaiCompatProviderPath, 'utf8');
      expect(src).toMatch(/if\s*\(!fullText\)/);
      expect(src).toContain('return null');
    });

    it('sends model, input, voice, response_format, and speed in request body', () => {
      const src = fs.readFileSync(openaiCompatProviderPath, 'utf8');
      expect(src).toContain('model:');
      expect(src).toContain('input: fullText');
      expect(src).toContain('voice:');
      expect(src).toContain('response_format:');
      expect(src).toContain('speed:');
    });

    it('sends Authorization Bearer header when API key is provided', () => {
      const src = fs.readFileSync(openaiCompatProviderPath, 'utf8');
      expect(src).toMatch(/Authorization.*Bearer/);
    });

    it('handles HTTP error responses gracefully (returns null)', () => {
      const src = fs.readFileSync(openaiCompatProviderPath, 'utf8');
      expect(src).toContain('response.ok');
      expect(src).toContain('return null');
    });

    it('handles network errors gracefully (returns null)', () => {
      const src = fs.readFileSync(openaiCompatProviderPath, 'utf8');
      expect(src).toMatch(/catch.*err/);
      expect(src).toContain('request failed');
    });

    it('strips trailing slashes from baseUrl', () => {
      const src = fs.readFileSync(openaiCompatProviderPath, 'utf8');
      expect(src).toContain('replace(/\\/+$/, "")');
    });

    it('connect is a no-op (resets buffer)', () => {
      const src = fs.readFileSync(openaiCompatProviderPath, 'utf8');
      expect(src).toMatch(/async connect\(\).*\{[\s\S]*?this\.textBuffer = \[\]/);
    });

    it('isAvailable always returns true (local endpoints assumed available)', () => {
      const src = fs.readFileSync(openaiCompatProviderPath, 'utf8');
      expect(src).toMatch(/isAvailable\(\).*\{[\s\S]*?return true/);
    });
  });

  describe('OpenAICompatTTSProvider runtime behavior', () => {
    it('name property returns openai-compat', () => {
      const { OpenAICompatTTSProvider } = require('../../dist/tts/OpenAICompatTTSProvider.js');
      const provider = new OpenAICompatTTSProvider(
        { voiceId: 'test', voiceName: 'Test', model: 'test', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3', openaiVoice: 'nova' },
        'http://localhost:8880'
      );
      expect(provider.name).toBe('openai-compat');
    });

    it('isAvailable returns true (always)', () => {
      const { OpenAICompatTTSProvider } = require('../../dist/tts/OpenAICompatTTSProvider.js');
      const provider = new OpenAICompatTTSProvider(
        { voiceId: 'test', voiceName: 'Test', model: 'test', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://localhost:8880'
      );
      expect(provider.isAvailable()).toBe(true);
    });

    it('sendText buffers text', () => {
      const { OpenAICompatTTSProvider } = require('../../dist/tts/OpenAICompatTTSProvider.js');
      const provider = new OpenAICompatTTSProvider(
        { voiceId: 'test', voiceName: 'Test', model: 'test', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://localhost:8880'
      );
      provider.sendText('hello ');
      provider.sendText('world');
      // Access internal state to verify buffering
      expect((provider as any).textBuffer).toEqual(['hello ', 'world']);
    });

    it('flush returns null when no text buffered', async () => {
      const { OpenAICompatTTSProvider } = require('../../dist/tts/OpenAICompatTTSProvider.js');
      const provider = new OpenAICompatTTSProvider(
        { voiceId: 'test', voiceName: 'Test', model: 'test', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://localhost:8880'
      );
      const result = await provider.flush();
      expect(result).toBeNull();
    });

    it('flush returns null on network error (no server running)', async () => {
      const { OpenAICompatTTSProvider } = require('../../dist/tts/OpenAICompatTTSProvider.js');
      const provider = new OpenAICompatTTSProvider(
        { voiceId: 'test', voiceName: 'Test', model: 'test', stability: 0.5, similarityBoost: 0.5, speed: 1, outputFormat: 'mp3' },
        'http://127.0.0.1:19999' // port that definitely has nothing running
      );
      provider.sendText('test text');
      const result = await provider.flush();
      expect(result).toBeNull();
    });
  });

  describe('VoiceSidecar TTS integration (post-extraction)', () => {
    const src = fs.readFileSync(sidecarPath, 'utf8');

    it('imports TTSProvider type from TTSProvider module', () => {
      expect(src).toMatch(/import.*TTSProvider.*from.*["']\.\/TTSProvider["']/);
    });

    it('imports ElevenLabsTTSProvider from tts directory', () => {
      expect(src).toMatch(/import.*ElevenLabsTTSProvider.*from.*["']\.\/tts\/ElevenLabsTTSProvider["']/);
    });

    it('imports OpenAICompatTTSProvider from tts directory', () => {
      expect(src).toMatch(/import.*OpenAICompatTTSProvider.*from.*["']\.\/tts\/OpenAICompatTTSProvider["']/);
    });

    it('no longer defines ElevenLabsStreamer inline', () => {
      expect(src).not.toContain('class ElevenLabsStreamer');
    });

    it('defines finalizeAudio shared pipeline function', () => {
      expect(src).toContain('function finalizeAudio(');
    });

    it('health response includes ttsProvider field', () => {
      expect(src).toContain('ttsProvider:');
    });

    it('references EVOKORE_TTS_PROVIDER env var', () => {
      expect(src).toContain('EVOKORE_TTS_PROVIDER');
    });

    it('references EVOKORE_TTS_BASE_URL env var', () => {
      expect(src).toContain('EVOKORE_TTS_BASE_URL');
    });

    it('defaults TTS provider to elevenlabs', () => {
      expect(src).toMatch(/process\.env\.EVOKORE_TTS_PROVIDER\s*\|\|\s*"elevenlabs"/);
    });

    it('defines createTTSProvider factory function', () => {
      expect(src).toContain('function createTTSProvider(');
    });

    it('conditionally requires ELEVENLABS_API_KEY (only for elevenlabs provider)', () => {
      expect(src).toContain('ELEVENLABS_API_KEY not set');
      expect(src).toMatch(/process\.exit\(1\)/);
      // But only when provider is elevenlabs
      expect(src).toMatch(/TTS_PROVIDER_NAME\s*===\s*"elevenlabs"\s*&&\s*!apiKey/);
    });

    it('logs TTS provider name on startup', () => {
      expect(src).toMatch(/console\.error.*TTS provider/);
    });

    it('still has all shared infrastructure', () => {
      expect(src).toContain('function resolvePersona(');
      expect(src).toContain('function playAudio(');
      expect(src).toContain('function postProcessSpeed(');
      expect(src).toContain('function enqueuePlayback(');
      expect(src).toContain('function saveAudioArtifact(');
    });

    it('VoiceSidecar remains standalone (no exports)', () => {
      expect(src).not.toMatch(/^export\s+(default\s+)?function/m);
      expect(src).toContain('startServer()');
    });
  });
});
