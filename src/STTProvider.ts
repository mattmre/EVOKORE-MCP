// --- STT Provider Interface ---

/**
 * Options for speech-to-text transcription.
 */
export interface STTOptions {
  /** BCP-47 language code (e.g., "en", "es", "fr"). */
  language?: string;
  /** Provider-specific model identifier. */
  model?: string;
}

/**
 * Result of a speech-to-text transcription.
 */
export interface STTResult {
  /** The transcribed text. */
  text: string;
  /** Confidence score (0.0 - 1.0), if available. */
  confidence?: number;
  /** Detected language, if available. */
  language?: string;
  /** Duration of the audio in seconds, if available. */
  duration?: number;
}

/**
 * Abstract STT provider interface.
 * Implementations convert audio buffers to text using various backends.
 */
export interface STTProvider {
  /** Human-readable name of this provider. */
  readonly name: string;

  /**
   * Transcribe an audio buffer to text.
   * @param audioBuffer - Raw audio data (wav, mp3, webm, m4a).
   * @param options - Optional transcription parameters.
   * @returns Transcription result.
   */
  transcribe(audioBuffer: Buffer, options?: STTOptions): Promise<STTResult>;

  /**
   * Check whether this provider is available and properly configured.
   * @returns true if the provider can accept transcription requests.
   */
  isAvailable(): boolean;
}

/** Supported audio MIME types for STT. */
export const SUPPORTED_AUDIO_FORMATS: ReadonlyArray<string> = [
  "audio/wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/webm",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
];

/** File extension to MIME type mapping. */
export const EXTENSION_TO_MIME: Readonly<Record<string, string>> = {
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".webm": "audio/webm",
  ".m4a": "audio/mp4",
  ".mp4": "audio/mp4",
};

/**
 * Resolve a MIME type from a file extension.
 * @returns MIME type string, or "audio/wav" as default.
 */
export function mimeFromExtension(ext: string): string {
  return EXTENSION_TO_MIME[ext.toLowerCase()] || "audio/wav";
}
