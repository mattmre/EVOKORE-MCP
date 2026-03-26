import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SIDECAR_SOURCE_PATH = path.resolve(__dirname, '..', '..', 'src', 'VoiceSidecar.ts');

/**
 * Helper: read VoiceSidecar.ts source once per describe block.
 * We intentionally read the source fresh in each test to match the existing
 * pattern in voice-sidecar.test.ts (source-inspection style).
 */
function readSource(): string {
  return fs.readFileSync(SIDECAR_SOURCE_PATH, 'utf8');
}

function extractBlockFromMarker(src: string, marker: string): string {
  const start = src.indexOf(marker);
  expect(start).toBeGreaterThan(-1);

  const openBrace = src.indexOf('{', start);
  expect(openBrace).toBeGreaterThan(-1);

  let depth = 0;
  for (let index = openBrace; index < src.length; index++) {
    const char = src[index];
    if (char === '{') depth++;
    else if (char === '}') depth--;

    if (depth === 0) {
      return src.slice(start, index + 1);
    }
  }

  throw new Error(`Failed to extract block for ${marker}`);
}

// ---------------------------------------------------------------------------
// Playback Queue Serialization — source-level validation
// ---------------------------------------------------------------------------

describe('VoiceSidecar Playback Queue Validation', () => {
  describe('queue data structure', () => {
    it('declares playbackQueue as an array of async task functions', () => {
      const src = readSource();
      expect(src).toMatch(/const playbackQueue:\s*Array<\(\)\s*=>\s*Promise<void>>\s*=\s*\[\]/);
    });

    it('declares queueDraining boolean flag initialized to false', () => {
      const src = readSource();
      expect(src).toMatch(/let queueDraining\s*=\s*false/);
    });

    it('playbackQueue is module-scoped (not inside startServer)', () => {
      const src = readSource();
      // playbackQueue declaration must appear before startServer function
      const queueIndex = src.indexOf('const playbackQueue:');
      const startServerIndex = src.indexOf('function startServer()');
      expect(queueIndex).toBeGreaterThan(-1);
      expect(startServerIndex).toBeGreaterThan(-1);
      expect(queueIndex).toBeLessThan(startServerIndex);
    });
  });

  describe('drainPlaybackQueue serialization logic', () => {
    it('defines drainPlaybackQueue as an async function', () => {
      const src = readSource();
      expect(src).toMatch(/async function drainPlaybackQueue\(\):\s*Promise<void>/);
    });

    it('returns early if already draining (re-entrant guard)', () => {
      const src = readSource();
      // Extract the drainPlaybackQueue function body
      const bodySlice = extractBlockFromMarker(src, 'async function drainPlaybackQueue');
      expect(bodySlice).toMatch(/if\s*\(queueDraining\)\s*return/);
    });

    it('sets queueDraining to true before processing', () => {
      const src = readSource();
      const fnBody = extractBlockFromMarker(src, 'async function drainPlaybackQueue');
      // queueDraining = true should appear after the guard and before the while loop
      const guardIndex = fnBody.indexOf('if (queueDraining) return');
      const setTrueIndex = fnBody.indexOf('queueDraining = true');
      const whileIndex = fnBody.indexOf('while (playbackQueue.length > 0)');
      expect(setTrueIndex).toBeGreaterThan(guardIndex);
      expect(setTrueIndex).toBeLessThan(whileIndex);
    });

    it('processes tasks sequentially via while loop with shift()', () => {
      const src = readSource();
      const fnBody = extractBlockFromMarker(src, 'async function drainPlaybackQueue');
      // While loop drains the queue one-at-a-time
      expect(fnBody).toMatch(/while\s*\(playbackQueue\.length\s*>\s*0\)/);
      // Removes first task from queue
      expect(fnBody).toMatch(/const task\s*=\s*playbackQueue\.shift\(\)!/);
      // Awaits the task (not fire-and-forget) - this is the key serialization guarantee
      expect(fnBody).toMatch(/await task\(\)/);
    });

    it('resets queueDraining to false after all tasks complete', () => {
      const src = readSource();
      const fnBody = extractBlockFromMarker(src, 'async function drainPlaybackQueue');
      // queueDraining = false should appear after the while loop
      const whileIndex = fnBody.indexOf('while (playbackQueue.length > 0)');
      const setFalseIndex = fnBody.indexOf('queueDraining = false');
      expect(setFalseIndex).toBeGreaterThan(whileIndex);
    });

    it('uses await (not Promise.all) for sequential execution guarantee', () => {
      const src = readSource();
      const fnBody = extractBlockFromMarker(src, 'async function drainPlaybackQueue');
      // Must NOT use Promise.all (which would run tasks concurrently)
      expect(fnBody).not.toContain('Promise.all');
      // Must NOT use Promise.race
      expect(fnBody).not.toContain('Promise.race');
      // Must use sequential await inside the loop
      expect(fnBody).toContain('await task()');
    });
  });

  describe('error isolation in drainPlaybackQueue', () => {
    it('wraps each task in try/catch for error isolation', () => {
      const src = readSource();
      const fnBody = extractBlockFromMarker(src, 'async function drainPlaybackQueue');
      // The await task() must be inside a try block
      expect(fnBody).toMatch(/try\s*\{[\s\S]*?await task\(\)/);
      // There must be a catch block that handles the error
      expect(fnBody).toMatch(/catch\s*\(err:\s*any\)/);
    });

    it('logs error but continues processing remaining tasks', () => {
      const src = readSource();
      const fnBody = extractBlockFromMarker(src, 'async function drainPlaybackQueue');
      // Error is logged to stderr
      expect(fnBody).toContain('console.error("[VoiceSidecar] Playback queue error:"');
      // The catch block does NOT re-throw or return — so the while loop continues
      // Verify: no 'throw' or 'return' in the catch block
      const catchStart = fnBody.indexOf('catch (err: any)');
      const catchBody = fnBody.slice(catchStart);
      expect(catchBody).not.toMatch(/\bthrow\b/);
      // 'return' within the catch body would abort remaining tasks
      // Only console.error should be in the catch block
      expect(catchBody).toContain('console.error');
    });

    it('always resets queueDraining even after errors', () => {
      const src = readSource();
      const fnBody = extractBlockFromMarker(src, 'async function drainPlaybackQueue');
      // queueDraining = false must be OUTSIDE the try/catch,
      // after the while loop ends (whether normally or after errors)
      const whileEnd = fnBody.lastIndexOf('}', fnBody.indexOf('queueDraining = false'));
      const setFalse = fnBody.indexOf('queueDraining = false');
      expect(setFalse).toBeGreaterThan(-1);
      // It appears after the while loop's closing brace
      expect(setFalse).toBeGreaterThan(whileEnd);
    });
  });

  describe('enqueuePlayback function', () => {
    it('defines enqueuePlayback that accepts a task function', () => {
      const src = readSource();
      expect(src).toMatch(/function enqueuePlayback\(task:\s*\(\)\s*=>\s*Promise<void>\):\s*void/);
    });

    it('pushes task onto playbackQueue', () => {
      const src = readSource();
      const fnBody = extractBlockFromMarker(src, 'function enqueuePlayback');
      expect(fnBody).toContain('playbackQueue.push(task)');
    });

    it('logs queue position when more than one item is queued', () => {
      const src = readSource();
      const fnBody = extractBlockFromMarker(src, 'function enqueuePlayback');
      // Only logs when there are already items in the queue
      expect(fnBody).toMatch(/if\s*\(playbackQueue\.length\s*>\s*1\)/);
      expect(fnBody).toContain('Queued playback (position');
    });

    it('triggers drainPlaybackQueue after enqueuing', () => {
      const src = readSource();
      const fnBody = extractBlockFromMarker(src, 'function enqueuePlayback');
      // Calls drainPlaybackQueue which will process the queue
      expect(fnBody).toContain('drainPlaybackQueue()');
    });

    it('catches drain errors to prevent unhandled rejections', () => {
      const src = readSource();
      const fnBody = extractBlockFromMarker(src, 'function enqueuePlayback');
      // drainPlaybackQueue().catch(...)
      expect(fnBody).toMatch(/drainPlaybackQueue\(\)\.catch\(/);
      expect(fnBody).toContain('Queue drain error');
    });
  });

  describe('concurrent session handling (serialization guarantee)', () => {
    it('all connections share the same module-scoped playbackQueue', () => {
      const src = readSource();
      // playbackQueue is declared at module scope (top level), not per-connection
      const queueDecl = src.indexOf('const playbackQueue:');
      const connectionHandler = src.indexOf("wss.on(\"connection\"");
      expect(queueDecl).toBeGreaterThan(-1);
      expect(connectionHandler).toBeGreaterThan(-1);
      // Queue is declared before the connection handler
      expect(queueDecl).toBeLessThan(connectionHandler);
      // Queue is NOT declared inside the connection handler
      const connectionBlock = src.slice(connectionHandler);
      expect(connectionBlock).not.toMatch(/const playbackQueue/);
    });

    it('drainPlaybackQueue re-entrant guard prevents concurrent drain loops', () => {
      const src = readSource();
      // Two concurrent enqueuePlayback calls should not create two drain loops
      // The guard "if (queueDraining) return" ensures only one loop runs
      const fnBody = extractBlockFromMarker(src, 'async function drainPlaybackQueue');
      // First line of logic must be the guard
      const lines = fnBody.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      // Find the first statement after the function signature
      const guardLine = lines.find(l => l.includes('queueDraining'));
      expect(guardLine).toContain('if (queueDraining) return');
    });

    it('shift() removes task from queue before await to prevent double-execution', () => {
      const src = readSource();
      const fnBody = extractBlockFromMarker(src, 'async function drainPlaybackQueue');
      // shift() removes the task from the queue BEFORE awaiting it
      // This prevents a second drain (if re-entrant guard somehow fails) from
      // re-processing the same task
      const shiftIndex = fnBody.indexOf('playbackQueue.shift()');
      const awaitIndex = fnBody.indexOf('await task()');
      expect(shiftIndex).toBeGreaterThan(-1);
      expect(awaitIndex).toBeGreaterThan(-1);
      expect(shiftIndex).toBeLessThan(awaitIndex);
    });

    it('enqueuePlayback does not await drainPlaybackQueue (non-blocking enqueue)', () => {
      const src = readSource();
      const fnBody = extractBlockFromMarker(src, 'function enqueuePlayback');
      // enqueuePlayback is sync (returns void, not Promise<void>)
      expect(fnBody).toContain('): void {');
      expect(fnBody).not.toContain('): Promise<void>');
      // Does NOT await the drain call (fire-and-forget with .catch)
      expect(fnBody).not.toMatch(/await\s+drainPlaybackQueue/);
    });
  });

  describe('temp file cleanup in playback task', () => {
    it('finalizeAudio writes audio to temp file with evokore-voice- prefix', () => {
      const src = readSource();
      expect(src).toMatch(/`evokore-voice-\$\{Date\.now\(\)\}\.mp3`/);
    });

    it('temp file uses os.tmpdir() as base directory', () => {
      const src = readSource();
      const fnBody = extractBlockFromMarker(src, 'async function finalizeAudio');
      expect(fnBody).toContain('os.tmpdir()');
      expect(fnBody).toMatch(/path\.join\(tmpDir,\s*`evokore-voice-/);
    });

    it('enqueued task cleans up primary temp file after playback', () => {
      const src = readSource();
      // Within the enqueuePlayback callback in finalizeAudio,
      // the temp file is cleaned up after playback
      const finalizeBody = extractBlockFromMarker(src, 'async function finalizeAudio');
      // Cleanup with fs.unlinkSync wrapped in try/catch
      expect(finalizeBody).toMatch(/fs\.unlinkSync\(capturedTmpFile\)/);
    });

    it('enqueued task cleans up post-processed file if different from source', () => {
      const src = readSource();
      const finalizeBody = extractBlockFromMarker(src, 'async function finalizeAudio');
      // Conditional cleanup: only remove processedFile if it differs from tmpFile
      expect(finalizeBody).toMatch(/capturedPlayFile\s*!==\s*capturedTmpFile/);
      expect(finalizeBody).toMatch(/fs\.unlinkSync\(capturedPlayFile\)/);
    });

    it('temp file cleanup is silent (empty catch blocks)', () => {
      const src = readSource();
      const finalizeBody = extractBlockFromMarker(src, 'async function finalizeAudio');
      const cleanupIndex = finalizeBody.indexOf('fs.unlinkSync(capturedTmpFile)');
      const tryIndex = finalizeBody.lastIndexOf('try', cleanupIndex);
      const catchIndex = finalizeBody.indexOf('catch', cleanupIndex);
      expect(cleanupIndex).toBeGreaterThan(-1);
      expect(tryIndex).toBeGreaterThan(-1);
      expect(catchIndex).toBeGreaterThan(cleanupIndex);
    });

    it('startup cleanupStaleTempFiles removes orphaned temp files', () => {
      const src = readSource();
      expect(src).toContain('function cleanupStaleTempFiles()');
      // Scans tmpdir for evokore-voice-*.mp3 files
      expect(src).toMatch(/entry\.startsWith\("evokore-voice-"\)/);
      expect(src).toMatch(/entry\.endsWith\("\.mp3"\)/);
      // Deletes them
      expect(src).toContain('fs.unlinkSync(path.join(tmpDir, entry))');
    });

    it('cleanupStaleTempFiles is called during server startup', () => {
      const src = readSource();
      const startServerStart = src.indexOf('function startServer()');
      const startServerBody = src.slice(startServerStart);
      expect(startServerBody).toContain('cleanupStaleTempFiles()');
    });
  });

  describe('finalizeAudio pipeline integration', () => {
    it('defines finalizeAudio as async function taking Buffer and voice config', () => {
      const src = readSource();
      expect(src).toMatch(/async function finalizeAudio\(audio:\s*Buffer\s*\|\s*null,\s*voice:\s*TTSVoiceConfig\)/);
    });

    it('returns early if audio is null or empty', () => {
      const src = readSource();
      const fnBody = extractBlockFromMarker(src, 'async function finalizeAudio');
      expect(fnBody).toMatch(/if\s*\(!audio\s*\|\|\s*audio\.length\s*===\s*0\)\s*return/);
    });

    it('writes audio buffer to temp file with writeFileSync', () => {
      const src = readSource();
      const fnBody = extractBlockFromMarker(src, 'async function finalizeAudio');
      expect(fnBody).toContain('fs.writeFileSync(tmpFile, audio)');
    });

    it('applies post-process tempo if configured and not 1.0', () => {
      const src = readSource();
      const fnBody = extractBlockFromMarker(src, 'async function finalizeAudio');
      expect(fnBody).toMatch(/voice\.postProcessTempo\s*&&\s*voice\.postProcessTempo\s*!==\s*1\.0/);
      expect(fnBody).toContain('postProcessSpeed');
    });

    it('saves audio artifact if ARTIFACT_DIR is configured', () => {
      const src = readSource();
      const fnBody = extractBlockFromMarker(src, 'async function finalizeAudio');
      expect(fnBody).toContain('saveAudioArtifact(playFile)');
    });

    it('calls enqueuePlayback (not playAudio directly) for serialized playback', () => {
      const src = readSource();
      const fnBody = extractBlockFromMarker(src, 'async function finalizeAudio');
      // Must use enqueuePlayback (the serialization entry point)
      expect(fnBody).toContain('enqueuePlayback(');
      // Must NOT call playAudio directly from finalizeAudio scope
      // playAudio should only be called inside the enqueued task
      const beforeEnqueue = fnBody.slice(0, fnBody.indexOf('enqueuePlayback('));
      expect(beforeEnqueue).not.toContain('playAudio(');
    });

    it('enqueued task respects PLAYBACK_DISABLED flag', () => {
      const src = readSource();
      const finalizeBody = extractBlockFromMarker(src, 'async function finalizeAudio');
      expect(finalizeBody).toContain('PLAYBACK_DISABLED');
      expect(finalizeBody).toContain('Playback disabled by VOICE_SIDECAR_DISABLE_PLAYBACK=1');
    });

    it('flush triggers finalizeAudio with provider audio output', () => {
      const src = readSource();
      // In the message handler, flush: true triggers the pipeline
      expect(src).toMatch(/if\s*\(msg\.flush\s*&&\s*ttsProvider\)/);
      expect(src).toContain('await ttsProvider.flush()');
      expect(src).toContain('await finalizeAudio(audio, currentVoice!)');
    });

    it('resets ttsProvider after flush to allow next session', () => {
      const src = readSource();
      // After finalizeAudio, the provider is reset
      const flushBlock = src.slice(src.indexOf('if (msg.flush && ttsProvider)'));
      expect(flushBlock).toContain('ttsProvider = null');
      expect(flushBlock).toContain('currentVoice = null');
    });
  });

  describe('platform player detection', () => {
    it('defines playAudio function returning a Promise', () => {
      const src = readSource();
      expect(src).toMatch(/function playAudio\(filePath:\s*string\):\s*Promise<void>/);
    });

    it('uses powershell Start-Process on win32', () => {
      const src = readSource();
      const fnBody = extractBlockFromMarker(src, 'function playAudio');
      expect(fnBody).toMatch(/platform\s*===\s*"win32"/);
      expect(fnBody).toContain('spawn("powershell"');
      expect(fnBody).toContain('Start-Process');
      expect(fnBody).toContain('-Wait');
    });

    it('uses afplay on darwin (macOS)', () => {
      const src = readSource();
      const fnBody = extractBlockFromMarker(src, 'function playAudio');
      expect(fnBody).toMatch(/platform\s*===\s*"darwin"/);
      expect(fnBody).toContain('spawn("afplay"');
    });

    it('tries mpv first on Linux, falls back to aplay', () => {
      const src = readSource();
      const fnBody = extractBlockFromMarker(src, 'function playAudio');
      // Linux: tries mpv via which check
      expect(fnBody).toContain('which mpv');
      expect(fnBody).toContain('spawn("mpv"');
      expect(fnBody).toContain('--no-terminal');
      // Falls back to aplay if mpv not found (in catch block)
      expect(fnBody).toContain('spawn("aplay"');
    });

    it('resolves (not rejects) on playback error to avoid crashing', () => {
      const src = readSource();
      const fnBody = extractBlockFromMarker(src, 'function playAudio');
      // Error handler calls resolve(), not reject()
      expect(fnBody).toContain('proc.on("error"');
      // After the error log, it resolves the promise (not reject)
      expect(fnBody).toContain("resolve(); // Don't crash on playback failure");
      expect(fnBody).not.toContain("reject(); // Don't crash");
    });

    it('resolves on close event', () => {
      const src = readSource();
      const fnBody = extractBlockFromMarker(src, 'function playAudio');
      expect(fnBody).toContain('proc.on("close"');
      expect(fnBody).toContain('resolve()');
    });

    it('uses stdio: "ignore" for all player spawns', () => {
      const src = readSource();
      const fnBody = extractBlockFromMarker(src, 'function playAudio');
      // All spawn invocations in playAudio include stdio: "ignore"
      // There are 4 spawn calls (powershell, afplay, mpv, aplay) and 1 execSync
      // At least 4 uses of stdio: "ignore" (spawn calls) + 1 from execSync
      const stdioIgnoreCount = (fnBody.match(/stdio:\s*"ignore"/g) || []).length;
      expect(stdioIgnoreCount).toBeGreaterThanOrEqual(4);
    });
  });

  describe('postProcessSpeed integration', () => {
    it('defines postProcessSpeed function', () => {
      const src = readSource();
      expect(src).toMatch(/function postProcessSpeed\(input:\s*string,\s*output:\s*string,\s*tempo:\s*number\):\s*Promise<boolean>/);
    });

    it('chains atempo filters for speeds exceeding 2.0', () => {
      const src = readSource();
      const fnBody = extractBlockFromMarker(src, 'function postProcessSpeed');
      // atempo max is 2.0 per pass; multiple passes needed for higher speeds
      expect(fnBody).toContain('while (remaining > 2.0)');
      expect(fnBody).toContain('atempo=2.0');
      expect(fnBody).toContain('remaining /= 2.0');
    });

    it('checks ffmpeg availability before processing', () => {
      const src = readSource();
      const fnBody = extractBlockFromMarker(src, 'function postProcessSpeed');
      // Platform-aware ffmpeg detection
      expect(fnBody).toContain('which ffmpeg');
      expect(fnBody).toContain('where ffmpeg');
    });

    it('returns false if ffmpeg is not available', () => {
      const src = readSource();
      const fnBody = extractBlockFromMarker(src, 'function postProcessSpeed');
      // In the catch block for the ffmpeg check
      expect(fnBody).toMatch(/catch\s*\{\s*\n?\s*resolve\(false\)/);
    });
  });

  describe('queue behavioral properties (structural proof)', () => {
    it('only one execution path can enter the drain loop at a time', () => {
      // The combination of queueDraining flag + early return guarantees
      // mutual exclusion on the drain loop
      const src = readSource();
      const fnBody = extractBlockFromMarker(src, 'async function drainPlaybackQueue');

      // 1. Guard: if queueDraining, bail out
      expect(fnBody).toContain('if (queueDraining) return');
      // 2. Set flag before entering loop
      expect(fnBody).toContain('queueDraining = true');
      // 3. Loop until empty
      expect(fnBody).toContain('while (playbackQueue.length > 0)');
      // 4. Clear flag after loop completes
      expect(fnBody).toContain('queueDraining = false');

      // Verify the order: guard -> set true -> while loop -> set false
      const guardIdx = fnBody.indexOf('if (queueDraining) return');
      const setTrueIdx = fnBody.indexOf('queueDraining = true');
      const whileIdx = fnBody.indexOf('while (playbackQueue.length > 0)');
      const setFalseIdx = fnBody.indexOf('queueDraining = false');

      expect(guardIdx).toBeLessThan(setTrueIdx);
      expect(setTrueIdx).toBeLessThan(whileIdx);
      expect(whileIdx).toBeLessThan(setFalseIdx);
    });

    it('queue drains completely (while loop condition checks length each iteration)', () => {
      const src = readSource();
      const fnBody = extractBlockFromMarker(src, 'async function drainPlaybackQueue');
      // The while loop checks playbackQueue.length > 0, which means
      // items added during drain execution will also be processed
      expect(fnBody).toMatch(/while\s*\(playbackQueue\.length\s*>\s*0\)/);
    });

    it('newly enqueued items during drain are picked up by the active drain loop', () => {
      // Since drainPlaybackQueue loops while length > 0, and enqueuePlayback
      // pushes to the same array, any item added while a drain is active
      // will be consumed by the same loop iteration -- no items can be orphaned
      const src = readSource();

      // enqueuePlayback pushes to the shared array
      const enqueueBody = extractBlockFromMarker(src, 'function enqueuePlayback');
      expect(enqueueBody).toContain('playbackQueue.push(task)');

      // drainPlaybackQueue loops until array is empty
      const drainBody = extractBlockFromMarker(src, 'async function drainPlaybackQueue');
      expect(drainBody).toMatch(/while\s*\(playbackQueue\.length\s*>\s*0\)/);

      // Re-entrant call from enqueuePlayback will return immediately (noop)
      // but the already-running loop will pick up the newly pushed item
      expect(drainBody).toContain('if (queueDraining) return');
    });

    it('finalizeAudio captures tmpFile and playFile in closure for correct cleanup', () => {
      const src = readSource();
      const fnBody = extractBlockFromMarker(src, 'async function finalizeAudio');
      // Variables are captured before the async enqueue to prevent race conditions
      expect(fnBody).toContain('const capturedTmpFile = tmpFile');
      expect(fnBody).toContain('const capturedPlayFile = playFile');
      // The enqueued callback uses the captured values, not the outer variables
      expect(fnBody).toContain('capturedTmpFile');
      expect(fnBody).toContain('capturedPlayFile');
    });
  });

  describe('VOICE_SIDECAR_DISABLE_PLAYBACK configuration', () => {
    it('reads VOICE_SIDECAR_DISABLE_PLAYBACK from environment', () => {
      const src = readSource();
      expect(src).toMatch(/process\.env\.VOICE_SIDECAR_DISABLE_PLAYBACK\s*===\s*"1"/);
    });

    it('PLAYBACK_DISABLED is a module-level constant', () => {
      const src = readSource();
      expect(src).toMatch(/const PLAYBACK_DISABLED\s*=/);
    });

    it('skips playAudio call when PLAYBACK_DISABLED is true', () => {
      const src = readSource();
      const finalizeBody = extractBlockFromMarker(src, 'async function finalizeAudio');
      // Inside the enqueued task, PLAYBACK_DISABLED gates playAudio
      expect(finalizeBody).toContain('if (PLAYBACK_DISABLED)');
      // When disabled, logs message instead of playing
      expect(finalizeBody).toContain('Playback disabled by VOICE_SIDECAR_DISABLE_PLAYBACK=1');
    });

    it('temp file cleanup still runs even when playback is disabled', () => {
      const src = readSource();
      const finalizeBody = extractBlockFromMarker(src, 'async function finalizeAudio');
      // The cleanup code is outside the PLAYBACK_DISABLED conditional
      // It runs after the if/else block
      const disabledCheck = finalizeBody.indexOf('if (PLAYBACK_DISABLED)');
      const cleanup = finalizeBody.indexOf('fs.unlinkSync(capturedTmpFile)');
      expect(disabledCheck).toBeGreaterThan(-1);
      expect(cleanup).toBeGreaterThan(-1);
      // Cleanup comes after the playback decision
      expect(cleanup).toBeGreaterThan(disabledCheck);
    });
  });

  describe('artifact saving integration', () => {
    it('defines saveAudioArtifact function', () => {
      const src = readSource();
      expect(src).toContain('function saveAudioArtifact(filePath: string)');
    });

    it('returns null when ARTIFACT_DIR is not configured', () => {
      const src = readSource();
      const fnBody = extractBlockFromMarker(src, 'function saveAudioArtifact');
      expect(fnBody).toMatch(/if\s*\(!ARTIFACT_DIR\)/);
      expect(fnBody).toContain('return null');
    });

    it('creates artifact directory recursively', () => {
      const src = readSource();
      const fnBody = extractBlockFromMarker(src, 'function saveAudioArtifact');
      expect(fnBody).toContain("fs.mkdirSync(ARTIFACT_DIR, { recursive: true })");
    });

    it('copies audio file to artifact directory with timestamped name', () => {
      const src = readSource();
      const fnBody = extractBlockFromMarker(src, 'function saveAudioArtifact');
      expect(fnBody).toContain('fs.copyFileSync(filePath, artifactPath)');
      expect(fnBody).toMatch(/evokore-voice-\$\{Date\.now\(\)\}/);
    });

    it('saveAudioArtifact is called before enqueuePlayback in finalizeAudio', () => {
      const src = readSource();
      const fnBody = extractBlockFromMarker(src, 'async function finalizeAudio');
      const saveIdx = fnBody.indexOf('saveAudioArtifact(');
      const enqueueIdx = fnBody.indexOf('enqueuePlayback(');
      expect(saveIdx).toBeGreaterThan(-1);
      expect(enqueueIdx).toBeGreaterThan(-1);
      // Artifact is saved synchronously before the async playback queue
      expect(saveIdx).toBeLessThan(enqueueIdx);
    });
  });
});
