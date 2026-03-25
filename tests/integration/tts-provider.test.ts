import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const ttsProviderPath = path.join(ROOT, 'src', 'TTSProvider.ts');
const elevenLabsProviderPath = path.join(ROOT, 'src', 'tts', 'ElevenLabsTTSProvider.ts');
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

  describe('VoiceSidecar TTS integration (post-extraction)', () => {
    const src = fs.readFileSync(sidecarPath, 'utf8');

    it('imports TTSProvider type from TTSProvider module', () => {
      expect(src).toMatch(/import.*TTSProvider.*from.*["']\.\/TTSProvider["']/);
    });

    it('imports ElevenLabsTTSProvider from tts directory', () => {
      expect(src).toMatch(/import.*ElevenLabsTTSProvider.*from.*["']\.\/tts\/ElevenLabsTTSProvider["']/);
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

    it('still requires ELEVENLABS_API_KEY (PR 1 keeps backward compat)', () => {
      expect(src).toContain('ELEVENLABS_API_KEY');
      expect(src).toMatch(/process\.exit\(1\)/);
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
