// --- TTS Provider Interface ---

/**
 * Voice configuration passed to TTS providers.
 * Providers read only the fields they need; unknown fields are ignored.
 */
export interface TTSVoiceConfig {
  /** ElevenLabs voice ID. */
  voiceId: string;
  /** Human-readable voice name. */
  voiceName: string;
  /** Provider-specific model identifier (e.g., "eleven_turbo_v2_5"). */
  model: string;
  /** Voice stability (ElevenLabs-specific). */
  stability: number;
  /** Similarity boost (ElevenLabs-specific). */
  similarityBoost: number;
  /** API-level speed multiplier. */
  speed: number;
  /** Output audio format (e.g., "mp3_44100_128"). */
  outputFormat: string;
  /** Post-process tempo via ffmpeg (provider-agnostic). */
  postProcessTempo?: number;
  /** Voice name for OpenAI-compatible TTS endpoints (e.g., "nova", "alloy"). */
  openaiVoice?: string;
  /** Model identifier for OpenAI-compatible TTS endpoints (e.g., "tts-1", "kokoro"). */
  openaiModel?: string;
}

/**
 * Abstract TTS provider interface.
 * Implementations convert text to audio using various backends.
 */
export interface TTSProvider {
  /** Human-readable name of this provider. */
  readonly name: string;

  /**
   * Check whether this provider is available and properly configured.
   * @returns true if the provider can accept synthesis requests.
   */
  isAvailable(): boolean;

  /**
   * Prepare for a new utterance. Called once before sendText/flush.
   * For streaming providers (ElevenLabs), this opens the connection.
   * For batch providers (OpenAI-compat), this may be a no-op.
   */
  connect(): Promise<void>;

  /**
   * Send a text chunk for synthesis.
   * For streaming providers, sends immediately over the connection.
   * For batch providers, buffers internally.
   */
  sendText(chunk: string): void;

  /**
   * Signal end of text input and retrieve synthesized audio.
   * For streaming providers, sends EOS and waits for final audio.
   * For batch providers, makes the synthesis request with buffered text.
   * @returns Audio buffer (mp3/wav/etc), or null if no audio produced.
   */
  flush(): Promise<Buffer | null>;
}
