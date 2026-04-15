import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';

const ROOT = path.resolve(__dirname, '../..');
const dispatcherPath = path.join(ROOT, 'scripts', 'workers', 'worker-dispatcher.js');
const storePath = path.join(ROOT, 'scripts', 'workers', 'worker-store.js');
const workerManagerJsPath = path.join(ROOT, 'dist', 'WorkerManager.js');

function makeTempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-worker-test-'));
}

async function rimraf(dir: string): Promise<void> {
  try { await fsp.rm(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function withHome(home: string, fn: () => Promise<void>): Promise<void> {
  const prev = process.env.HOME;
  const prevUserprofile = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  return fn().finally(() => {
    if (prev === undefined) delete process.env.HOME; else process.env.HOME = prev;
    if (prevUserprofile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prevUserprofile;
  });
}

function clearRequireCache() {
  delete require.cache[require.resolve(dispatcherPath)];
  delete require.cache[require.resolve(storePath)];
  if (fs.existsSync(workerManagerJsPath)) {
    delete require.cache[require.resolve(workerManagerJsPath)];
  }
}

async function waitFor(predicate: () => boolean, timeoutMs = 15_000, pollMs = 100): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return false;
}

describe('worker dispatch (Phase 2.5-B)', () => {
  let home: string;

  beforeEach(() => {
    home = makeTempHome();
    clearRequireCache();
  });

  afterEach(async () => {
    await rimraf(home);
  });

  it('worker_dispatch creates a workerId and pending status file', async () => {
    await withHome(home, async () => {
      clearRequireCache();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const dispatcher = require(dispatcherPath);
      const { workerId } = dispatcher.dispatchWorker('test-session-1', 'benchmark', { iterations: 10 });
      expect(workerId).toMatch(/^benchmark-\d+-[0-9a-f]+$/);
      const stateFile = path.join(home, '.evokore', 'workers', 'test-session-1', `${workerId}.json`);
      expect(fs.existsSync(stateFile)).toBe(true);
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      expect(state.workerId).toBe(workerId);
      expect(state.workerScript).toBe('benchmark');
      expect(['pending', 'running', 'complete']).toContain(state.status);
    });
  });

  it('worker_context returns pending or running immediately after dispatch', async () => {
    await withHome(home, async () => {
      clearRequireCache();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const dispatcher = require(dispatcherPath);
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const store = require(storePath);
      const { workerId } = dispatcher.dispatchWorker('test-session-2', 'benchmark', { iterations: 10 });
      const state = store.readWorkerState('test-session-2', workerId);
      expect(state).not.toBeNull();
      expect(['pending', 'running', 'complete']).toContain(state.status);
    });
  });

  it('repo_analysis worker completes and result can be read', async () => {
    await withHome(home, async () => {
      clearRequireCache();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const dispatcher = require(dispatcherPath);
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const store = require(storePath);
      const { workerId } = dispatcher.dispatchWorker('test-session-3', 'repo_analysis', { cwd: ROOT });
      const completed = await waitFor(() => {
        const s = store.readWorkerState('test-session-3', workerId);
        return s && (s.status === 'complete' || s.status === 'error');
      }, 20_000);
      expect(completed).toBe(true);
      const final = store.readWorkerState('test-session-3', workerId);
      expect(final.status).toBe('complete');
      expect(final.result).toBeTruthy();
      expect(typeof final.result.uncommittedFiles).toBe('number');
      expect(Array.isArray(final.result.recentCommits)).toBe(true);
    });
  });

  it('worker_context returns complete with result after benchmark fork finishes', async () => {
    await withHome(home, async () => {
      clearRequireCache();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const dispatcher = require(dispatcherPath);
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const store = require(storePath);
      const { workerId } = dispatcher.dispatchWorker('test-session-4', 'benchmark', { iterations: 100 });
      const completed = await waitFor(() => {
        const s = store.readWorkerState('test-session-4', workerId);
        return s && s.status === 'complete';
      }, 15_000);
      expect(completed).toBe(true);
      const final = store.readWorkerState('test-session-4', workerId);
      expect(final.status).toBe('complete');
      expect(final.result).toBeTruthy();
      expect(typeof final.result.startupMs).toBe('number');
      expect(final.result.nodeVersion).toBe(process.version);
    });
  });

  it('WorkerManager.handleToolCall worker_dispatch round-trip', async () => {
    await withHome(home, async () => {
      clearRequireCache();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { WorkerManager } = require(workerManagerJsPath);
      const mgr = new WorkerManager();
      const result = await mgr.handleToolCall('worker_dispatch', {
        session_id: 'mcp-session-A',
        worker_type: 'benchmark',
        options: { iterations: 100 },
      });
      expect(result.isError).toBeFalsy();
      const text = result.content[0].text;
      const parsed = JSON.parse(text);
      expect(parsed.workerId).toMatch(/^benchmark-/);
      expect(parsed.status).toBe('pending');
      expect(parsed.workerType).toBe('benchmark');
    });
  });

  it('WorkerManager.handleToolCall worker_context round-trip', async () => {
    await withHome(home, async () => {
      clearRequireCache();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { WorkerManager } = require(workerManagerJsPath);
      const mgr = new WorkerManager();
      const dispatch = await mgr.handleToolCall('worker_dispatch', {
        session_id: 'mcp-session-B',
        worker_type: 'benchmark',
        options: { iterations: 100 },
      });
      const dispatchPayload = JSON.parse(dispatch.content[0].text);
      const workerId = dispatchPayload.workerId;
      // Poll context until complete
      let ctxPayload: any = null;
      const completed = await waitFor(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ctxResultSync = mgr.handleToolCall('worker_context', {
          session_id: 'mcp-session-B',
          worker_id: workerId,
        });
        // handleToolCall returns a promise; resolve synchronously by checking store directly
        return false; // fallback to outer waitFor with store
      }, 0);
      void completed;
      // Use store-based wait instead
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const store = require(storePath);
      const done = await waitFor(() => {
        const s = store.readWorkerState('mcp-session-B', workerId);
        return s && s.status === 'complete';
      }, 15_000);
      expect(done).toBe(true);
      const ctxResult = await mgr.handleToolCall('worker_context', {
        session_id: 'mcp-session-B',
        worker_id: workerId,
      });
      expect(ctxResult.isError).toBeFalsy();
      ctxPayload = JSON.parse(ctxResult.content[0].text);
      expect(ctxPayload.workerId).toBe(workerId);
      expect(ctxPayload.status).toBe('complete');
      expect(ctxPayload.result).toBeTruthy();
    });
  });

  it('WorkerManager rejects unknown worker_type', async () => {
    await withHome(home, async () => {
      clearRequireCache();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { WorkerManager } = require(workerManagerJsPath);
      const mgr = new WorkerManager();
      const result = await mgr.handleToolCall('worker_dispatch', {
        session_id: 'mcp-session-X',
        worker_type: 'nonexistent_worker',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown worker_type');
    });
  });

  it('WorkerManager.getTools exposes worker_dispatch and worker_context', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { WorkerManager } = require(workerManagerJsPath);
    const mgr = new WorkerManager();
    const tools = mgr.getTools();
    expect(tools).toHaveLength(2);
    const names = tools.map((t: any) => t.name).sort();
    expect(names).toEqual(['worker_context', 'worker_dispatch']);
    expect(mgr.isWorkerTool('worker_dispatch')).toBe(true);
    expect(mgr.isWorkerTool('worker_context')).toBe(true);
    expect(mgr.isWorkerTool('something_else')).toBe(false);
  });

  it('purpose-gate detects keyword triggers and dispatches workers', async () => {
    await withHome(home, async () => {
      clearRequireCache();
      delete require.cache[require.resolve(path.join(ROOT, 'scripts', 'purpose-gate.js'))];
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const purposeGate = require(path.join(ROOT, 'scripts', 'purpose-gate.js'));

      expect(purposeGate.detectAutoDispatchTriggers('please run the failing tests')).toContain('test_run');
      expect(purposeGate.detectAutoDispatchTriggers('check security of the auth flow')).toContain('security_scan');
      expect(purposeGate.detectAutoDispatchTriggers('benchmark startup performance')).toContain('benchmark');
      expect(purposeGate.detectAutoDispatchTriggers('unrelated prompt')).toEqual([]);

      const dispatched = purposeGate.maybeAutoDispatchWorkers('autodispatch-session', 'please benchmark startup');
      expect(dispatched.length).toBeGreaterThan(0);
      expect(dispatched.some((d: any) => d.workerType === 'benchmark')).toBe(true);
    });
  });

  it('purpose-gate debounces re-dispatch within 30 minutes', async () => {
    await withHome(home, async () => {
      clearRequireCache();
      delete require.cache[require.resolve(path.join(ROOT, 'scripts', 'purpose-gate.js'))];
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const purposeGate = require(path.join(ROOT, 'scripts', 'purpose-gate.js'));
      const first = purposeGate.maybeAutoDispatchWorkers('debounce-session', 'benchmark this');
      expect(first.length).toBe(1);
      const second = purposeGate.maybeAutoDispatchWorkers('debounce-session', 'benchmark again');
      // Second call within window should not re-dispatch the same worker.
      expect(second.find((d: any) => d.workerType === 'benchmark')).toBeUndefined();
    });
  });
});
