import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const LOG_ROTATION_PATH = path.resolve(__dirname, '..', '..', 'scripts', 'log-rotation.js');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const logRotation = require(LOG_ROTATION_PATH);

describe('Log Rotation Boundary Conditions', () => {
  describe('rotateIfNeeded at exact MAX_BYTES boundary', () => {
    it('does NOT rotate when file size is exactly one byte below maxBytes', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-logrot-boundary-'));
      try {
        const logFile = path.join(tmpDir, 'exact-below.log');
        const maxBytes = 100;
        // Write exactly maxBytes - 1 bytes
        fs.writeFileSync(logFile, 'x'.repeat(maxBytes - 1));

        logRotation.rotateIfNeeded(logFile, { maxBytes, maxRotations: 3 });

        // File should still exist (size < maxBytes, so no rotation)
        expect(fs.existsSync(logFile)).toBe(true);
        expect(fs.existsSync(`${logFile}.1`)).toBe(false);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('rotates when file size is exactly maxBytes (uses strict less-than check)', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-logrot-boundary-'));
      try {
        const logFile = path.join(tmpDir, 'exact.log');
        const maxBytes = 100;
        // Write exactly maxBytes bytes
        fs.writeFileSync(logFile, 'x'.repeat(maxBytes));

        logRotation.rotateIfNeeded(logFile, { maxBytes, maxRotations: 3 });

        // The code checks `stat.size < maxBytes` for early return.
        // When size == maxBytes, the condition is false, so rotation proceeds.
        expect(fs.existsSync(logFile)).toBe(false);
        expect(fs.existsSync(`${logFile}.1`)).toBe(true);
        expect(fs.readFileSync(`${logFile}.1`, 'utf8').length).toBe(maxBytes);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('rotates when file size is exactly one byte above maxBytes', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-logrot-boundary-'));
      try {
        const logFile = path.join(tmpDir, 'exact-above.log');
        const maxBytes = 100;
        // Write exactly maxBytes + 1 bytes
        fs.writeFileSync(logFile, 'x'.repeat(maxBytes + 1));

        logRotation.rotateIfNeeded(logFile, { maxBytes, maxRotations: 3 });

        // Should have rotated
        expect(fs.existsSync(logFile)).toBe(false);
        expect(fs.existsSync(`${logFile}.1`)).toBe(true);
        expect(fs.readFileSync(`${logFile}.1`, 'utf8').length).toBe(maxBytes + 1);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('rotateIfNeeded with 0-byte files', () => {
    it('does not rotate an empty file (0 bytes)', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-logrot-zero-'));
      try {
        const logFile = path.join(tmpDir, 'empty.log');
        fs.writeFileSync(logFile, '');

        logRotation.rotateIfNeeded(logFile, { maxBytes: 100, maxRotations: 3 });

        expect(fs.existsSync(logFile)).toBe(true);
        expect(fs.statSync(logFile).size).toBe(0);
        expect(fs.existsSync(`${logFile}.1`)).toBe(false);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('rotates a 0-byte file when maxBytes is 0 (size not strictly less than threshold)', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-logrot-zero-'));
      try {
        const logFile = path.join(tmpDir, 'empty-zero-max.log');
        fs.writeFileSync(logFile, '');

        // With maxBytes=0, size (0) is NOT < maxBytes (0), so rotation proceeds.
        // This is a consequence of the strict less-than check in rotateIfNeeded.
        logRotation.rotateIfNeeded(logFile, { maxBytes: 0, maxRotations: 3 });

        expect(fs.existsSync(logFile)).toBe(false);
        expect(fs.existsSync(`${logFile}.1`)).toBe(true);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('rotates a non-empty file when maxBytes is 0', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-logrot-zero-'));
      try {
        const logFile = path.join(tmpDir, 'notempty-zero-max.log');
        fs.writeFileSync(logFile, 'some content');

        // With maxBytes=0, any non-empty file should rotate (size > 0 = maxBytes)
        logRotation.rotateIfNeeded(logFile, { maxBytes: 0, maxRotations: 3 });

        expect(fs.existsSync(logFile)).toBe(false);
        expect(fs.existsSync(`${logFile}.1`)).toBe(true);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('pruneOldSessions at exact MAX_AGE_DAYS boundary', () => {
    it('does NOT prune a file that is well within maxAgeDays', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-prune-boundary-'));
      try {
        const file = path.join(tmpDir, 'boundary-session-replay.jsonl');
        fs.writeFileSync(file, '{"ts":"test"}\n');

        // Set mtime to 5 seconds inside the boundary (not old enough to prune).
        // We use a margin to avoid clock drift between setting mtime and the
        // cutoff computation inside pruneOldSessions.
        const maxAgeDays = 30;
        const safelyInsideBoundary = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000 + 5000);
        fs.utimesSync(file, safelyInsideBoundary, safelyInsideBoundary);

        logRotation.pruneOldSessions(tmpDir, { maxAgeDays, maxFiles: 100 });

        // The file's mtimeMs is greater than the cutoff, so it should be kept
        expect(fs.existsSync(file)).toBe(true);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('prunes a file that is one millisecond past maxAgeDays', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-prune-boundary-'));
      try {
        const file = path.join(tmpDir, 'past-boundary-session-replay.jsonl');
        fs.writeFileSync(file, '{"ts":"test"}\n');

        const maxAgeDays = 30;
        // 1 second past the boundary (filesystem resolution is typically 1s)
        const pastBoundary = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000 - 1000);
        fs.utimesSync(file, pastBoundary, pastBoundary);

        logRotation.pruneOldSessions(tmpDir, { maxAgeDays, maxFiles: 100 });

        expect(fs.existsSync(file)).toBe(false);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('keeps a file that is one second before maxAgeDays', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-prune-boundary-'));
      try {
        const file = path.join(tmpDir, 'before-boundary-session-replay.jsonl');
        fs.writeFileSync(file, '{"ts":"test"}\n');

        const maxAgeDays = 30;
        // 1 second before the boundary
        const beforeBoundary = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000 + 1000);
        fs.utimesSync(file, beforeBoundary, beforeBoundary);

        logRotation.pruneOldSessions(tmpDir, { maxAgeDays, maxFiles: 100 });

        expect(fs.existsSync(file)).toBe(true);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('concurrent rotation calls (race condition safety)', () => {
    it('handles multiple concurrent rotateIfNeeded calls on the same file without throwing', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-logrot-concurrent-'));
      try {
        const logFile = path.join(tmpDir, 'concurrent.log');

        // Run multiple rotations in rapid succession (sync, but simulates race)
        const errors: Error[] = [];
        for (let i = 0; i < 10; i++) {
          fs.writeFileSync(logFile, 'x'.repeat(200));
          try {
            logRotation.rotateIfNeeded(logFile, { maxBytes: 100, maxRotations: 3 });
          } catch (err: unknown) {
            errors.push(err as Error);
          }
        }

        // No errors should have been thrown (fail-safe try/catch in implementation)
        expect(errors.length).toBe(0);

        // At most maxRotations rotated copies should exist
        const rotatedFiles = fs.readdirSync(tmpDir).filter((f: string) => f.startsWith('concurrent.log.'));
        expect(rotatedFiles.length).toBeLessThanOrEqual(3);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('handles concurrent rotateIfNeeded when file disappears between exists check and stat', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-logrot-race-'));
      try {
        const logFile = path.join(tmpDir, 'race.log');
        fs.writeFileSync(logFile, 'x'.repeat(200));

        // Delete the file to simulate a race where another process rotated it first
        fs.unlinkSync(logFile);

        // Should not throw thanks to fail-safe try/catch
        logRotation.rotateIfNeeded(logFile, { maxBytes: 100, maxRotations: 3 });
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('handles concurrent pruneOldSessions where files are deleted mid-iteration', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-prune-concurrent-'));
      try {
        // Create files, then delete some before pruning
        for (let i = 0; i < 5; i++) {
          const f = path.join(tmpDir, `session-${i}-replay.jsonl`);
          fs.writeFileSync(f, 'data\n');
          const oldTime = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
          fs.utimesSync(f, oldTime, oldTime);
        }

        // Delete a couple files to simulate concurrent cleanup
        fs.unlinkSync(path.join(tmpDir, 'session-1-replay.jsonl'));
        fs.unlinkSync(path.join(tmpDir, 'session-3-replay.jsonl'));

        // Should not throw - the implementation has try/catch around unlinkSync
        logRotation.pruneOldSessions(tmpDir, { maxAgeDays: 30, maxFiles: 100 });

        // The remaining old files should also have been pruned
        const remaining = fs.readdirSync(tmpDir).filter((n: string) => n.endsWith('.jsonl'));
        expect(remaining.length).toBe(0);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('rotation with readonly filesystem (graceful degradation)', () => {
    it('does not throw when rotation target directory is readonly', () => {
      // On Windows, fs.chmodSync has limited effect, so we simulate the readonly
      // scenario by pointing at a path inside a non-existent directory, which
      // will cause the rename to fail.
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-logrot-readonly-'));
      try {
        // Create a file that exceeds maxBytes but lives in a directory we
        // cannot write rotated copies to (by making the dir readonly)
        const logFile = path.join(tmpDir, 'readonly.log');
        fs.writeFileSync(logFile, 'x'.repeat(200));

        // Make the directory readonly
        const originalMode = fs.statSync(tmpDir).mode;
        try {
          fs.chmodSync(tmpDir, 0o444);

          // Should not throw (fail-safe try/catch)
          logRotation.rotateIfNeeded(logFile, { maxBytes: 100, maxRotations: 3 });
        } finally {
          // Restore permissions so cleanup works
          fs.chmodSync(tmpDir, originalMode);
        }
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('does not throw when pruning a readonly sessions directory', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-prune-readonly-'));
      try {
        const file = path.join(tmpDir, 'session-old-replay.jsonl');
        fs.writeFileSync(file, 'data\n');
        const oldTime = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
        fs.utimesSync(file, oldTime, oldTime);

        const originalMode = fs.statSync(tmpDir).mode;
        try {
          fs.chmodSync(tmpDir, 0o444);

          // Should not throw (fail-safe try/catch in pruneOldSessions)
          logRotation.pruneOldSessions(tmpDir, { maxAgeDays: 30, maxFiles: 100 });
        } finally {
          fs.chmodSync(tmpDir, originalMode);
        }
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('handles rotation when log file path is inside a non-existent parent directory', () => {
      const nonExistentDir = path.join(os.tmpdir(), 'evokore-nonexistent-' + Date.now());
      const logFile = path.join(nonExistentDir, 'test.log');

      // Should not throw
      logRotation.rotateIfNeeded(logFile, { maxBytes: 100, maxRotations: 3 });
    });
  });

  describe('rotateIfNeeded with maxRotations edge cases', () => {
    it('handles maxRotations of 1 (only one backup kept)', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-logrot-maxrot1-'));
      try {
        const logFile = path.join(tmpDir, 'test.log');

        // First rotation
        fs.writeFileSync(logFile, 'first');
        logRotation.rotateIfNeeded(logFile, { maxBytes: 1, maxRotations: 1 });
        expect(fs.existsSync(`${logFile}.1`)).toBe(true);
        expect(fs.readFileSync(`${logFile}.1`, 'utf8')).toBe('first');

        // Second rotation should overwrite the only backup
        fs.writeFileSync(logFile, 'second');
        logRotation.rotateIfNeeded(logFile, { maxBytes: 1, maxRotations: 1 });
        expect(fs.existsSync(`${logFile}.1`)).toBe(true);
        expect(fs.readFileSync(`${logFile}.1`, 'utf8')).toBe('second');
        expect(fs.existsSync(`${logFile}.2`)).toBe(false);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('handles maxRotations of 0 (deletes old, rotates current)', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-logrot-maxrot0-'));
      try {
        const logFile = path.join(tmpDir, 'test.log');
        fs.writeFileSync(logFile, 'data');

        // maxRotations=0 means the loop body for shifting never runs,
        // and the current file is renamed to .1
        logRotation.rotateIfNeeded(logFile, { maxBytes: 1, maxRotations: 0 });

        // File is moved to .1 because the rename always executes
        expect(fs.existsSync(logFile)).toBe(false);
        expect(fs.existsSync(`${logFile}.1`)).toBe(true);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
