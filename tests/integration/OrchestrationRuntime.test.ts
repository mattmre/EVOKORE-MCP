import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';

const ROOT = path.resolve(__dirname, '../..');
const orchJsPath = path.join(ROOT, 'dist', 'OrchestrationRuntime.js');
const fleetJsPath = path.join(ROOT, 'dist', 'FleetManager.js');
const claimsJsPath = path.join(ROOT, 'dist', 'ClaimsManager.js');

function makeFakeChild(pid: number) {
  const ee: any = new EventEmitter();
  ee.pid = pid;
  ee.unref = vi.fn();
  ee.kill = vi.fn();
  ee.stdio = [null, null, null];
  return ee;
}

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-orch-test-'));
}

async function rimraf(dir: string): Promise<void> {
  try {
    await fsp.rm(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

describe('OrchestrationRuntime', () => {
  let orchModule: any;
  let fleetModule: any;
  let claimsModule: any;
  let childProcessMock: {
    spawn: ReturnType<typeof vi.fn>;
    execFileSync: ReturnType<typeof vi.fn>;
  };
  let nextFakePid: number;
  let processKillSpy: ReturnType<typeof vi.spyOn>;
  let tmpDir: string;

  beforeEach(() => {
    vi.resetModules();
    nextFakePid = 20_000;
    tmpDir = makeTempDir();

    childProcessMock = {
      spawn: vi.fn(() => makeFakeChild(nextFakePid++)),
      execFileSync: vi.fn(() => Buffer.from('')),
    };

    const cpMod = require('child_process');
    cpMod.__origSpawn = cpMod.__origSpawn ?? cpMod.spawn;
    cpMod.__origExecFileSync = cpMod.__origExecFileSync ?? cpMod.execFileSync;
    cpMod.spawn = childProcessMock.spawn;
    cpMod.execFileSync = childProcessMock.execFileSync;

    processKillSpy = vi.spyOn(process, 'kill').mockImplementation(() => true as any);

    delete require.cache[require.resolve(fleetJsPath)];
    delete require.cache[require.resolve(claimsJsPath)];
    delete require.cache[require.resolve(orchJsPath)];
    fleetModule = require(fleetJsPath);
    claimsModule = require(claimsJsPath);
    orchModule = require(orchJsPath);
  });

  afterEach(async () => {
    const cpMod = require('child_process');
    if (cpMod.__origSpawn) cpMod.spawn = cpMod.__origSpawn;
    if (cpMod.__origExecFileSync) cpMod.execFileSync = cpMod.__origExecFileSync;
    processKillSpy.mockRestore();
    vi.restoreAllMocks();
    await rimraf(tmpDir);
  });

  function build(options?: any) {
    const fleet = new fleetModule.FleetManager();
    const claims = new claimsModule.ClaimsManager(tmpDir);
    const runtime = new orchModule.OrchestrationRuntime(fleet, claims, options);
    return { runtime, fleet, claims };
  }

  describe('module exists and exports', () => {
    it('has compiled JavaScript file', () => {
      expect(fs.existsSync(orchJsPath)).toBe(true);
    });

    it('exports OrchestrationRuntime class', () => {
      expect(orchModule.OrchestrationRuntime).toBeDefined();
      expect(typeof orchModule.OrchestrationRuntime).toBe('function');
    });
  });

  describe('getTools', () => {
    it('returns 3 tools with correct names', () => {
      const { runtime } = build();
      const tools = runtime.getTools();
      expect(tools.length).toBe(3);
      const names = tools.map((t: any) => t.name).sort();
      expect(names).toEqual([
        'orchestration_start',
        'orchestration_status',
        'orchestration_stop',
      ]);
    });

    it('annotates orchestration_status as read-only and orchestration_stop as destructive', () => {
      const { runtime } = build();
      const tools = runtime.getTools();
      const status = tools.find((t: any) => t.name === 'orchestration_status');
      const stop = tools.find((t: any) => t.name === 'orchestration_stop');
      expect(status.annotations.readOnlyHint).toBe(true);
      expect(stop.annotations.destructiveHint).toBe(true);
    });
  });

  describe('isOrchestrationTool', () => {
    it('matches correct names', () => {
      const { runtime } = build();
      expect(runtime.isOrchestrationTool('orchestration_start')).toBe(true);
      expect(runtime.isOrchestrationTool('orchestration_stop')).toBe(true);
      expect(runtime.isOrchestrationTool('orchestration_status')).toBe(true);
    });

    it('rejects unrelated names', () => {
      const { runtime } = build();
      expect(runtime.isOrchestrationTool('fleet_spawn')).toBe(false);
      expect(runtime.isOrchestrationTool('claim_acquire')).toBe(false);
      expect(runtime.isOrchestrationTool('')).toBe(false);
    });
  });

  describe('orchestration_start single agent no resource', () => {
    it('returns ORCH-001 + FA-NNN + status running', async () => {
      const { runtime } = build();
      const result = await runtime.handleTool('orchestration_start', {
        name: 'single-agent',
        agents: [{ command: 'node', args: ['--version'] }],
      });
      expect(result.isError).toBeFalsy();
      const payload = JSON.parse(result.content[0].text);
      expect(payload.runId).toBe('ORCH-001');
      expect(payload.status).toBe('running');
      expect(payload.agents.length).toBe(1);
      expect(payload.agents[0].agentId).toMatch(/^FA-\d{3}$/);
      expect(payload.agents[0].claimedResource).toBeNull();
    });
  });

  describe('orchestration_start with resource', () => {
    it('creates a claim lockfile in the claims dir', async () => {
      const { runtime } = build();
      const result = await runtime.handleTool('orchestration_start', {
        name: 'with-resource',
        agents: [{ command: 'node', resource: 'file:/tmp/locked' }],
      });
      expect(result.isError).toBeFalsy();
      const payload = JSON.parse(result.content[0].text);
      expect(payload.agents[0].claimedResource).toBe('file:/tmp/locked');

      const entries = fs.readdirSync(tmpDir);
      const locks = entries.filter((e) => e.endsWith('.lock'));
      expect(locks.length).toBe(1);
    });
  });

  describe('orchestration_start rollback on second claim failure', () => {
    it('leaves no leaked fleet agents or claims when 2nd claim_acquire fails', async () => {
      const { runtime, fleet, claims } = build();
      // Pre-acquire the second resource under a different agent so the
      // run's second claim_acquire call fails with EEXIST.
      await claims.acquire('file:/taken', 'OTHER-AGENT', 60_000);

      await expect(
        runtime.startRun('rollback-test', [
          { command: 'node', resource: 'file:/ok' },
          { command: 'node', resource: 'file:/taken' },
        ])
      ).rejects.toThrow(/claim acquire failed/);

      // Run should be registered but stopped.
      const runs = Array.from(runtime.getRuns().values()) as any[];
      expect(runs.length).toBe(1);
      expect(runs[0].status).toBe('stopped');

      // Fleet must have only released entries (the pre-spawned first agent +
      // the second agent that failed post-claim).
      const fleetAgents = fleet.getAgents();
      for (const entry of fleetAgents.values()) {
        expect(entry.status).toBe('released');
      }

      // Only the pre-existing OTHER-AGENT claim should remain.
      const remaining = await claims.list();
      const ours = remaining.filter((c: any) => c.resource === 'file:/ok');
      expect(ours.length).toBe(0);
    });
  });

  describe('orchestration_stop', () => {
    it('releases claims + fleet entries and is idempotent', async () => {
      const { runtime, fleet, claims } = build();
      const startResult = await runtime.handleTool('orchestration_start', {
        name: 'stop-test',
        agents: [{ command: 'node', resource: 'file:/stopme' }],
      });
      const startPayload = JSON.parse(startResult.content[0].text);
      const runId = startPayload.runId;

      const stopResult = await runtime.handleTool('orchestration_stop', { runId });
      expect(stopResult.isError).toBeFalsy();
      const stopPayload = JSON.parse(stopResult.content[0].text);
      expect(stopPayload.status).toBe('stopped');
      expect(stopPayload.stoppedAt).toBeTruthy();

      // Fleet entry should be marked released.
      const agentEntries = Array.from(fleet.getAgents().values()) as any[];
      expect(agentEntries.every((e) => e.status === 'released')).toBe(true);

      // Claim file should have been removed.
      const remaining = await claims.list();
      expect(remaining.filter((c: any) => c.resource === 'file:/stopme')).toEqual([]);

      // Second stop call should still succeed (idempotent).
      const stopResult2 = await runtime.handleTool('orchestration_stop', { runId });
      expect(stopResult2.isError).toBeFalsy();
      const payload2 = JSON.parse(stopResult2.content[0].text);
      expect(payload2.status).toBe('stopped');
    });
  });

  describe('orchestration_status without runId', () => {
    it('returns all runs', async () => {
      const { runtime } = build();
      await runtime.handleTool('orchestration_start', {
        name: 'a',
        agents: [{ command: 'node' }],
      });
      await runtime.handleTool('orchestration_start', {
        name: 'b',
        agents: [{ command: 'node' }],
      });
      const result = await runtime.handleTool('orchestration_status', {});
      expect(result.isError).toBeFalsy();
      const payload = JSON.parse(result.content[0].text);
      expect(Array.isArray(payload.runs)).toBe(true);
      expect(payload.runs.length).toBe(2);
      const ids = payload.runs.map((r: any) => r.runId).sort();
      expect(ids).toEqual(['ORCH-001', 'ORCH-002']);
    });
  });

  describe('AGT-013 loop detection', () => {
    it('flips status to degraded when liveness stalls past threshold', async () => {
      const { runtime } = build({ loopThresholdMs: 1000 });
      const startResult = await runtime.handleTool('orchestration_start', {
        name: 'loop-test',
        agents: [{ command: 'node' }],
      });
      const startPayload = JSON.parse(startResult.content[0].text);
      const runId = startPayload.runId;

      // Rewind lastAliveAt so the delta exceeds the threshold.
      const run = runtime.getRuns().get(runId);
      run.agents[0].lastAliveAt = Date.now() - 5_000;

      // Mock process.kill to simulate a dead PID (ESRCH) so FleetManager's
      // `isAlive` returns false, which feeds the loop detector.
      processKillSpy.mockImplementation(() => {
        const err: any = new Error('no such process');
        err.code = 'ESRCH';
        throw err;
      });

      const statusResult = await runtime.handleTool('orchestration_status', { runId });
      expect(statusResult.isError).toBeFalsy();
      const payload = JSON.parse(statusResult.content[0].text);
      expect(payload.status).toBe('degraded');
      expect(payload.degradedReasons.length).toBeGreaterThanOrEqual(1);
      expect(payload.degradedReasons[0]).toMatch(/loop suspected/);
    });
  });

  describe('error cases', () => {
    it('unknown runId returns isError: true', async () => {
      const { runtime } = build();
      const result = await runtime.handleTool('orchestration_stop', {
        runId: 'ORCH-999',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/Unknown runId/);
    });

    it('orchestration_start with empty name is an error', async () => {
      const { runtime } = build();
      const result = await runtime.handleTool('orchestration_start', {
        name: '',
        agents: [{ command: 'node' }],
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/name/);
    });

    it('orchestration_start with empty agents list is an error', async () => {
      const { runtime } = build();
      const result = await runtime.handleTool('orchestration_start', {
        name: 'x',
        agents: [],
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/agents/);
    });
  });
});
