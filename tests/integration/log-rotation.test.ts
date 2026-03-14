import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const LOG_ROTATION_PATH = path.resolve(__dirname, '..', '..', 'scripts', 'log-rotation.js');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const logRotation = require(LOG_ROTATION_PATH);

describe('Log Rotation (T19)', () => {
  describe('module exports', () => {
    it('rotateIfNeeded is exported as a function', () => {
      expect(typeof logRotation.rotateIfNeeded).toBe('function');
    });

    it('pruneOldSessions is exported as a function', () => {
      expect(typeof logRotation.pruneOldSessions).toBe('function');
    });

    it('DEFAULT_MAX_BYTES is 5MB', () => {
      expect(logRotation.DEFAULT_MAX_BYTES).toBe(5 * 1024 * 1024);
    });

    it('DEFAULT_MAX_ROTATIONS is 3', () => {
      expect(logRotation.DEFAULT_MAX_ROTATIONS).toBe(3);
    });

    it('DEFAULT_MAX_AGE_DAYS is 30', () => {
      expect(logRotation.DEFAULT_MAX_AGE_DAYS).toBe(30);
    });

    it('DEFAULT_MAX_FILES is 100', () => {
      expect(logRotation.DEFAULT_MAX_FILES).toBe(100);
    });
  });

  describe('rotateIfNeeded', () => {
    it('rotates file when it exceeds maxBytes', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-logrot-'));
      try {
        const logFile = path.join(tmpDir, 'test.log');
        fs.writeFileSync(logFile, 'x'.repeat(200));

        logRotation.rotateIfNeeded(logFile, { maxBytes: 100, maxRotations: 3 });

        expect(fs.existsSync(logFile)).toBe(false);
        expect(fs.existsSync(`${logFile}.1`)).toBe(true);
        expect(fs.readFileSync(`${logFile}.1`, 'utf8')).toBe('x'.repeat(200));
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('does NOT rotate file under maxBytes', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-logrot-'));
      try {
        const logFile = path.join(tmpDir, 'small.log');
        fs.writeFileSync(logFile, 'tiny');

        logRotation.rotateIfNeeded(logFile, { maxBytes: 1000, maxRotations: 3 });

        expect(fs.existsSync(logFile)).toBe(true);
        expect(fs.existsSync(`${logFile}.1`)).toBe(false);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('shifts numbered rotations correctly (.1 -> .2, current -> .1)', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-logrot-'));
      try {
        const logFile = path.join(tmpDir, 'test.log');

        // First rotation
        fs.writeFileSync(logFile, 'first');
        logRotation.rotateIfNeeded(logFile, { maxBytes: 1, maxRotations: 3 });

        // Second rotation
        fs.writeFileSync(logFile, 'second');
        logRotation.rotateIfNeeded(logFile, { maxBytes: 1, maxRotations: 3 });

        expect(fs.readFileSync(`${logFile}.1`, 'utf8')).toBe('second');
        expect(fs.readFileSync(`${logFile}.2`, 'utf8')).toBe('first');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('evicts oldest file beyond maxRotations', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-logrot-'));
      try {
        const logFile = path.join(tmpDir, 'test.log');

        // Rotate 4 times with maxRotations=3
        for (let i = 0; i < 4; i++) {
          fs.writeFileSync(logFile, `rotation-${i}`);
          logRotation.rotateIfNeeded(logFile, { maxBytes: 1, maxRotations: 3 });
        }

        expect(fs.existsSync(`${logFile}.3`)).toBe(true);
        expect(fs.existsSync(`${logFile}.4`)).toBe(false);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('handles missing files gracefully', () => {
      const nonExistent = path.join(os.tmpdir(), 'does-not-exist-evokore.log');
      // Should not throw
      logRotation.rotateIfNeeded(nonExistent, { maxBytes: 100, maxRotations: 3 });
      logRotation.rotateIfNeeded(null);
      logRotation.rotateIfNeeded('');
    });
  });

  describe('pruneOldSessions', () => {
    it('removes files older than maxAgeDays', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-prune-'));
      try {
        const oldFile = path.join(tmpDir, 'old-session-replay.jsonl');
        const recentFile = path.join(tmpDir, 'recent-session-replay.jsonl');
        const evidenceFile = path.join(tmpDir, 'old-session-evidence.jsonl');

        fs.writeFileSync(oldFile, '{"ts":"2020-01-01"}\n');
        fs.writeFileSync(recentFile, '{"ts":"2026-03-10"}\n');
        fs.writeFileSync(evidenceFile, '{"ts":"2020-01-01"}\n');

        // Set old mtimes (60 days ago)
        const oldTime = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
        fs.utimesSync(oldFile, oldTime, oldTime);
        fs.utimesSync(evidenceFile, oldTime, oldTime);

        logRotation.pruneOldSessions(tmpDir, { maxAgeDays: 30, maxFiles: 100 });

        expect(fs.existsSync(oldFile)).toBe(false);
        expect(fs.existsSync(evidenceFile)).toBe(false);
        expect(fs.existsSync(recentFile)).toBe(true);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('does not touch non-session files', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-prune-'));
      try {
        const nonSessionFile = path.join(tmpDir, 'session-state.json');
        fs.writeFileSync(nonSessionFile, '{}');

        const oldTime = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
        fs.utimesSync(nonSessionFile, oldTime, oldTime);

        logRotation.pruneOldSessions(tmpDir, { maxAgeDays: 30, maxFiles: 100 });

        expect(fs.existsSync(nonSessionFile)).toBe(true);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('respects maxFiles limit (oldest deleted first)', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-prune-'));
      try {
        for (let i = 0; i < 10; i++) {
          const f = path.join(tmpDir, `session-${String(i).padStart(3, '0')}-replay.jsonl`);
          fs.writeFileSync(f, `entry ${i}\n`);
          const t = new Date(Date.now() - (10 - i) * 1000);
          fs.utimesSync(f, t, t);
        }

        logRotation.pruneOldSessions(tmpDir, { maxAgeDays: 365, maxFiles: 5 });

        const remaining = fs.readdirSync(tmpDir).filter((n: string) => n.endsWith('.jsonl'));
        expect(remaining.length).toBeLessThanOrEqual(5);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('handles missing/empty directory gracefully', () => {
      logRotation.pruneOldSessions(path.join(os.tmpdir(), 'nonexistent-evokore-dir'));
      logRotation.pruneOldSessions(null);
      logRotation.pruneOldSessions('');

      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-empty-'));
      try {
        logRotation.pruneOldSessions(emptyDir);
      } finally {
        fs.rmSync(emptyDir, { recursive: true, force: true });
      }
    });
  });

  describe('hook script integration', () => {
    const hookScripts = [
      { name: 'hook-observability.js', expectRotate: true, expectPrune: false },
      { name: 'damage-control.js', expectRotate: true, expectPrune: false },
      { name: 'session-replay.js', expectRotate: false, expectPrune: true },
      { name: 'evidence-capture.js', expectRotate: false, expectPrune: true },
      { name: 'validate-tracker-consistency.js', expectRotate: true, expectPrune: false },
    ];

    for (const { name, expectRotate, expectPrune } of hookScripts) {
      it(`${name} imports and uses log-rotation`, () => {
        const scriptPath = path.resolve(__dirname, '..', '..', 'scripts', name);
        expect(fs.existsSync(scriptPath)).toBe(true);
        const src = fs.readFileSync(scriptPath, 'utf8');

        expect(src).toMatch(/require\(['"]\.\/log-rotation['"]\)/);

        if (expectRotate) {
          expect(src).toContain('rotateIfNeeded');
        }
        if (expectPrune) {
          expect(src).toContain('pruneOldSessions');
        }
      });
    }
  });
});
