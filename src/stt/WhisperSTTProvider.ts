import { STTProvider, STTOptions, STTResult, mimeFromExtension } from "../STTProvider";

/**
 * OpenAI Whisper API-based STT provider.
 *
 * Requires `OPENAI_API_KEY` environment variable.
 * Calls the OpenAI /v1/audio/transcriptions endpoint using built-in fetch.
 */
export class WhisperSTTProvider implements STTProvider {
  readonly name = "whisper-api";

  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || "";
    this.baseUrl = process.env.OPENAI_API_BASE_URL || "https://api.openai.com";
    this.defaultModel = process.env.EVOKORE_STT_MODEL || "whisper-1";
  }

  isAvailable(): boolean {
    return this.apiKey.length > 0;
  }

  async transcribe(audioBuffer: Buffer, options?: STTOptions): Promise<STTResult> {
    if (!this.isAvailable()) {
      throw new Error("WhisperSTTProvider: OPENAI_API_KEY is not set");
    }

    if (audioBuffer.length === 0) {
      throw new Error("WhisperSTTProvider: audio buffer is empty");
    }

    const model = options?.model || this.defaultModel;
    const extension = ".wav"; // Default extension for the form upload
    const mime = mimeFromExtension(extension);

    // Build multipart/form-data manually to avoid adding dependencies.
    // Node 18+ fetch supports FormData-like bodies, but we use a boundary approach
    // for maximum compatibility.
    const boundary = `----EVOKOREBoundary${Date.now()}${Math.random().toString(36).slice(2)}`;

    const parts: Buffer[] = [];

    // file field
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="audio${extension}"\r\n` +
      `Content-Type: ${mime}\r\n\r\n`
    ));
    parts.push(audioBuffer);
    parts.push(Buffer.from("\r\n"));

    // model field
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="model"\r\n\r\n` +
      `${model}\r\n`
    ));

    // response_format field (verbose_json gives us confidence and duration)
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="response_format"\r\n\r\n` +
      `verbose_json\r\n`
    ));

    // language field (optional)
    if (options?.language) {
      parts.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="language"\r\n\r\n` +
        `${options.language}\r\n`
      ));
    }

    // closing boundary
    parts.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(parts);
    const url = `${this.baseUrl}/v1/audio/transcriptions`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body: body,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown error");
      throw new Error(`WhisperSTTProvider: API returned ${response.status}: ${errorText}`);
    }

    const data = await response.json() as {
      text?: string;
      language?: string;
      duration?: number;
      segments?: Array<{ avg_logprob?: number }>;
    };

    // Extract average confidence from segment log probabilities if available
    let confidence: number | undefined;
    if (data.segments && data.segments.length > 0) {
      const avgLogProbs = data.segments
        .filter((s) => s.avg_logprob !== undefined)
        .map((s) => s.avg_logprob as number);
      if (avgLogProbs.length > 0) {
        const meanLogProb = avgLogProbs.reduce((a, b) => a + b, 0) / avgLogProbs.length;
        // Convert log probability to a 0-1 confidence score
        confidence = Math.exp(meanLogProb);
        confidence = Math.max(0, Math.min(1, confidence));
      }
    }

    return {
      text: data.text || "",
      language: data.language,
      duration: data.duration,
      confidence,
    };
  }
}
