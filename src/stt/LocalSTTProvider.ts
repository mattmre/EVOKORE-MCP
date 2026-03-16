import { STTProvider, STTOptions, STTResult } from "../STTProvider";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

/**
 * Local Whisper CLI-based STT provider.
 *
 * Uses a locally installed `whisper` CLI (from openai-whisper Python package)
 * to transcribe audio without sending data to cloud APIs.
 *
 * Falls back gracefully if the whisper CLI is not installed.
 */
export class LocalSTTProvider implements STTProvider {
  readonly name = "local-whisper";

  private whisperPath: string;
  private defaultModel: string;
  private available: boolean | null = null;

  constructor() {
    this.whisperPath = process.env.EVOKORE_WHISPER_PATH || "whisper";
    this.defaultModel = process.env.EVOKORE_STT_LOCAL_MODEL || "base";
  }

  isAvailable(): boolean {
    if (this.available !== null) {
      return this.available;
    }

    try {
      const whichCmd = process.platform === "win32" ? "where" : "which";
      execFileSync(whichCmd, [this.whisperPath], { stdio: "ignore" });
      this.available = true;
    } catch {
      this.available = false;
    }

    return this.available;
  }

  async transcribe(audioBuffer: Buffer, options?: STTOptions): Promise<STTResult> {
    if (!this.isAvailable()) {
      throw new Error(
        "LocalSTTProvider: whisper CLI is not installed. " +
        "Install with: pip install openai-whisper"
      );
    }

    if (audioBuffer.length === 0) {
      throw new Error("LocalSTTProvider: audio buffer is empty");
    }

    const model = options?.model || this.defaultModel;
    const tmpDir = os.tmpdir();
    const tmpInput = path.join(tmpDir, `evokore-stt-input-${Date.now()}.wav`);
    const tmpOutputBase = path.join(tmpDir, `evokore-stt-output-${Date.now()}`);
    const tmpOutputTxt = `${tmpOutputBase}.txt`;

    try {
      // Write audio buffer to temp file
      fs.writeFileSync(tmpInput, audioBuffer);

      // Build whisper CLI arguments
      const args: string[] = [
        tmpInput,
        "--model", model,
        "--output_format", "txt",
        "--output_dir", tmpDir,
      ];

      // Rename output to our expected filename by using --output_dir
      // whisper outputs to <input_filename_without_ext>.txt in the output dir

      if (options?.language) {
        args.push("--language", options.language);
      }

      // Run whisper CLI with a 60-second timeout
      execFileSync(this.whisperPath, args, {
        stdio: "ignore",
        timeout: 60000,
      });

      // Read the output file
      // Whisper names output after the input file: evokore-stt-input-<timestamp>.txt
      const inputBaseName = path.basename(tmpInput, path.extname(tmpInput));
      const actualOutput = path.join(tmpDir, `${inputBaseName}.txt`);

      let text = "";
      if (fs.existsSync(actualOutput)) {
        text = fs.readFileSync(actualOutput, "utf-8").trim();
        // Clean up output file
        try { fs.unlinkSync(actualOutput); } catch { /* ignore */ }
      } else if (fs.existsSync(tmpOutputTxt)) {
        text = fs.readFileSync(tmpOutputTxt, "utf-8").trim();
        try { fs.unlinkSync(tmpOutputTxt); } catch { /* ignore */ }
      }

      return {
        text,
      };
    } finally {
      // Clean up temp input file
      try { fs.unlinkSync(tmpInput); } catch { /* ignore */ }
    }
  }
}
