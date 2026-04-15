import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';

const ROOT = path.resolve(__dirname, '../..');
const schedulerJsPath = path.join(ROOT, 'dist', 'WorkerScheduler.js');

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-worker-scheduler-test-'));
}

async function rimraf(dir: string): Promise<void> {
  try {
    await fsp.rm(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

function freshEnv(key: string, value: string | undefined) {
  const prev = process.env[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
  return () => {
    if (prev === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = prev;
    }
  };
}

describe('WorkerScheduler', () => {
  let tmpDir: string;
  let dlqPath: string;
  let restoreEnv: (() => void) | undefined;

  beforeEach(() => {
    tmpDir = makeTempDir();
    dlqPath = path.join(tmpDir, 'dead-letter.jsonl');
  });

  afterEach(async () => {
    if (restoreEnv) {
      restoreEnv();
      restoreEnv = undefined;
    }
    vi.useRealTimers();
    await rimraf(tmpDir);
  });

  describe('module shape', () => {
    it('has compiled JavaScript file', () => {
      expect(fs.existsSync(schedulerJsPath)).toBe(true);
    });

    it('exports WorkerScheduler class', () => {
      const mod = require(schedulerJsPath);
      expect(mod.WorkerScheduler).toBeDefined();
      expect(typeof mod.WorkerScheduler).toBe('function');
    });
  });

  describe('kill switch', () => {
    it('does not create intervals when EVOKORE_WORKERS_ENABLED=false', () => {
      restoreEnv = freshEnv('EVOKORE_WORKERS_ENABLED', 'false');
      const { WorkerScheduler } = require(schedulerJsPath);
      const scheduler = new WorkerScheduler(undefined, dlqPath);
      scheduler.start();
      expect(scheduler.isEnabled()).toBe(false);
      expect(scheduler.getIntervalCount()).toBe(0);
      scheduler.stop();
    });

    it('is enabled by default when env var unset', () => {
      restoreEnv = freshEnv('EVOKORE_WORKERS_ENABLED', undefined);
      const { WorkerScheduler } = require(schedulerJsPath);
      const scheduler = new WorkerScheduler(undefined, dlqPath);
      expect(scheduler.isEnabled()).toBe(true);
      scheduler.start();
      expect(scheduler.getIntervalCount()).toBeGreaterThan(0);
      scheduler.stop();
    });
  });

  describe('start/stop lifecycle', () => {
    it('start() creates intervals and stop() clears them', () => {
      restoreEnv = freshEnv('EVOKORE_WORKERS_ENABLED', 'true');
      const { WorkerScheduler } = require(schedulerJsPath);
      const scheduler = new WorkerScheduler(undefined, dlqPath);
      scheduler.start();
      expect(scheduler.getIntervalCount()).toBeGreaterThan(0);
      scheduler.stop();
      expect(scheduler.getIntervalCount()).toBe(0);
    });

    it('start() -> stop() -> start() works (intervals reset)', () => {
      restoreEnv = freshEnv('EVOKORE_WORKERS_ENABLED', 'true');
      const { WorkerScheduler } = require(schedulerJsPath);
      const scheduler = new WorkerScheduler(undefined, dlqPath);
      scheduler.start();
      const firstCount = scheduler.getIntervalCount();
      expect(firstCount).toBeGreaterThan(0);
      scheduler.stop();
      expect(scheduler.getIntervalCount()).toBe(0);
      scheduler.start();
      expect(scheduler.getIntervalCount()).toBe(firstCount);
      scheduler.stop();
    });

    it('double start does not leak additional intervals', () => {
      restoreEnv = freshEnv('EVOKORE_WORKERS_ENABLED', 'true');
      const { WorkerScheduler } = require(schedulerJsPath);
      const scheduler = new WorkerScheduler(undefined, dlqPath);
      scheduler.start();
      const firstCount = scheduler.getIntervalCount();
      scheduler.start();
      expect(scheduler.getIntervalCount()).toBe(firstCount);
      scheduler.stop();
    });
  });

  describe('claims janitor tick -> DLQ', () => {
    it('writes a DLQ entry when sweep() throws', async () => {
      restoreEnv = freshEnv('EVOKORE_WORKERS_ENABLED', 'true');
      const { WorkerScheduler } = require(schedulerJsPath);
      const fakeClaims = {
        sweep: vi.fn().mockRejectedValue(new Error('boom')),
      };
      const scheduler = new WorkerScheduler(fakeClaims as any, dlqPath);
      await scheduler.runClaimsJanitorTick();

      expect(fakeClaims.sweep).toHaveBeenCalledTimes(1);
      expect(fs.existsSync(dlqPath)).toBe(true);
      const contents = fs.readFileSync(dlqPath, 'utf8').trim();
      const lines = contents.split('\n');
      expect(lines.length).toBe(1);
      const entry = JSON.parse(lines[0]);
      expect(entry).toMatchObject({
        workerName: 'claims-janitor',
        error: 'boom',
        attempt: 1,
      });
      expect(typeof entry.ts).toBe('string');
      expect(new Date(entry.ts).toString()).not.toBe('Invalid Date');
      expect(typeof entry.stack).toBe('string');
    });

    it('appends multiple lines on repeated failures with incrementing attempts', async () => {
      restoreEnv = freshEnv('EVOKORE_WORKERS_ENABLED', 'true');
      const { WorkerScheduler } = require(schedulerJsPath);
      const fakeClaims = {
        sweep: vi.fn().mockRejectedValue(new Error('still broken')),
      };
      const scheduler = new WorkerScheduler(fakeClaims as any, dlqPath);
      await scheduler.runClaimsJanitorTick();
      await scheduler.runClaimsJanitorTick();
      await scheduler.runClaimsJanitorTick();

      const lines = fs.readFileSync(dlqPath, 'utf8').trim().split('\n');
      expect(lines.length).toBe(3);
      const attempts = lines.map((l) => JSON.parse(l).attempt);
      expect(attempts).toEqual([1, 2, 3]);
    });

    it('resets attempt count to 0 on successful tick after failures', async () => {
      restoreEnv = freshEnv('EVOKORE_WORKERS_ENABLED', 'true');
      const { WorkerScheduler } = require(schedulerJsPath);
      const sweep = vi
        .fn()
        .mockRejectedValueOnce(new Error('err1'))
        .mockRejectedValueOnce(new Error('err2'))
        .mockResolvedValueOnce({ swept: 0, alive: 0 });
      const fakeClaims = { sweep };
      const scheduler = new WorkerScheduler(fakeClaims as any, dlqPath);

      await scheduler.runClaimsJanitorTick();
      expect(scheduler.getAttemptCount('claims-janitor')).toBe(1);
      await scheduler.runClaimsJanitorTick();
      expect(scheduler.getAttemptCount('claims-janitor')).toBe(2);
      await scheduler.runClaimsJanitorTick();
      expect(scheduler.getAttemptCount('claims-janitor')).toBe(0);

      const lines = fs.readFileSync(dlqPath, 'utf8').trim().split('\n');
      expect(lines.length).toBe(2);
    });

    it('fires via the real setInterval at the 5-minute cadence', async () => {
      restoreEnv = freshEnv('EVOKORE_WORKERS_ENABLED', 'true');
      const { WorkerScheduler } = require(schedulerJsPath);
      const fakeClaims = {
        sweep: vi.fn().mockRejectedValue(new Error('ticked')),
      };

      vi.useFakeTimers();
      const scheduler = new WorkerScheduler(fakeClaims as any, dlqPath);
      scheduler.start();
      try {
        expect(fakeClaims.sweep).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(300_001);
        // Let any microtasks kicked off by the async interval callback run.
        await Promise.resolve();
        await Promise.resolve();
        expect(fakeClaims.sweep).toHaveBeenCalled();
      } finally {
        scheduler.stop();
        vi.useRealTimers();
      }
      // DLQ file should have been written by the async handler.
      // Allow a microtask flush in real time after switching back.
      await new Promise((r) => setImmediate(r));
      expect(fs.existsSync(dlqPath)).toBe(true);
    });
  });

  describe('writeDLQ safety', () => {
    it('never throws when dlq path is unwritable', async () => {
      restoreEnv = freshEnv('EVOKORE_WORKERS_ENABLED', 'true');
      const { WorkerScheduler } = require(schedulerJsPath);

      // Create a file where the DLQ *directory* should be. mkdirSync will fail
      // because the parent is a file, not a dir. writeDLQ must swallow that.
      const collidingFile = path.join(tmpDir, 'collision');
      fs.writeFileSync(collidingFile, 'blocker');
      const unwritableDlq = path.join(collidingFile, 'dead-letter.jsonl');

      const fakeClaims = {
        sweep: vi.fn().mockRejectedValue(new Error('boom')),
      };
      const scheduler = new WorkerScheduler(fakeClaims as any, unwritableDlq);
      await expect(scheduler.runClaimsJanitorTick()).resolves.toBeUndefined();
      // No crash, no file created at the unwritable path.
      expect(fs.existsSync(unwritableDlq)).toBe(false);
      // Attempt counter still increments so caller can detect repeated failures.
      expect(scheduler.getAttemptCount('claims-janitor')).toBe(1);
    });
  });

  describe('no claims manager', () => {
    it('tick with no claimsManager is a no-op success', async () => {
      restoreEnv = freshEnv('EVOKORE_WORKERS_ENABLED', 'true');
      const { WorkerScheduler } = require(schedulerJsPath);
      const scheduler = new WorkerScheduler(undefined, dlqPath);
      await scheduler.runClaimsJanitorTick();
      expect(scheduler.getAttemptCount('claims-janitor')).toBe(0);
      expect(fs.existsSync(dlqPath)).toBe(false);
    });
  });
});
