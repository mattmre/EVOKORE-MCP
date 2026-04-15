import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

const ROOT = path.resolve(__dirname, '../..');
const fleetJsPath = path.join(ROOT, 'dist', 'FleetManager.js');

/**
 * Build a fake ChildProcess-ish object so spawn() returns it without
 * launching a real program.
 */
function makeFakeChild(pid: number) {
  const ee: any = new EventEmitter();
  ee.pid = pid;
  ee.unref = vi.fn();
  ee.kill = vi.fn();
  ee.stdio = [null, null, null];
  return ee;
}

describe('FleetManager', () => {
  let fleetModule: any;
  let childProcessMock: {
    spawn: ReturnType<typeof vi.fn>;
    execFileSync: ReturnType<typeof vi.fn>;
  };
  let nextFakePid: number;
  let processKillSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Fresh module registry so our child_process mock binds cleanly.
    vi.resetModules();
    nextFakePid = 10_000;

    childProcessMock = {
      spawn: vi.fn(() => makeFakeChild(nextFakePid++)),
      execFileSync: vi.fn(() => Buffer.from('')),
    };

    // Monkey-patch the cached child_process module that dist/FleetManager.js
    // will require(). This is simpler than vi.mock for CommonJS dist code
    // and works regardless of require cache state.
    const cpMod = require('child_process');
    cpMod.__origSpawn = cpMod.__origSpawn ?? cpMod.spawn;
    cpMod.__origExecFileSync = cpMod.__origExecFileSync ?? cpMod.execFileSync;
    cpMod.spawn = childProcessMock.spawn;
    cpMod.execFileSync = childProcessMock.execFileSync;

    // process.kill is used both to kill (SIGKILL) and to probe liveness (sig 0).
    // Default: treat every probe as alive, and do nothing for actual kills.
    processKillSpy = vi.spyOn(process, 'kill').mockImplementation(() => true as any);

    // Re-require FleetManager after patching so it picks up the fresh state.
    delete require.cache[require.resolve(fleetJsPath)];
    fleetModule = require(fleetJsPath);
  });

  afterEach(() => {
    const cpMod = require('child_process');
    if (cpMod.__origSpawn) cpMod.spawn = cpMod.__origSpawn;
    if (cpMod.__origExecFileSync) cpMod.execFileSync = cpMod.__origExecFileSync;
    processKillSpy.mockRestore();
    vi.restoreAllMocks();
  });

  describe('module exists and exports', () => {
    it('has compiled JavaScript file', () => {
      expect(fs.existsSync(fleetJsPath)).toBe(true);
    });

    it('exports FleetManager class', () => {
      expect(fleetModule.FleetManager).toBeDefined();
      expect(typeof fleetModule.FleetManager).toBe('function');
    });
  });

  describe('getTools', () => {
    it('returns 4 tools with correct names', () => {
      const mgr = new fleetModule.FleetManager();
      const tools = mgr.getTools();
      expect(tools.length).toBe(4);
      const names = tools.map((t: any) => t.name).sort();
      expect(names).toEqual([
        'fleet_claim',
        'fleet_release',
        'fleet_spawn',
        'fleet_status',
      ]);
    });

    it('annotates fleet_status as read-only and fleet_release as destructive', () => {
      const mgr = new fleetModule.FleetManager();
      const tools = mgr.getTools();
      const status = tools.find((t: any) => t.name === 'fleet_status');
      const release = tools.find((t: any) => t.name === 'fleet_release');
      expect(status.annotations.readOnlyHint).toBe(true);
      expect(release.annotations.destructiveHint).toBe(true);
    });
  });

  describe('isFleetTool', () => {
    it('returns true for all 4 fleet tool names', () => {
      const mgr = new fleetModule.FleetManager();
      expect(mgr.isFleetTool('fleet_spawn')).toBe(true);
      expect(mgr.isFleetTool('fleet_claim')).toBe(true);
      expect(mgr.isFleetTool('fleet_release')).toBe(true);
      expect(mgr.isFleetTool('fleet_status')).toBe(true);
    });

    it('returns false for unknown names', () => {
      const mgr = new fleetModule.FleetManager();
      expect(mgr.isFleetTool('memory_store')).toBe(false);
      expect(mgr.isFleetTool('fleet_nope')).toBe(false);
      expect(mgr.isFleetTool('')).toBe(false);
    });
  });

  describe('fleet_spawn', () => {
    it('returns { agentId, pid } and stores an entry in the map', async () => {
      const mgr = new fleetModule.FleetManager();
      const result = await mgr.handleTool('fleet_spawn', {
        command: 'node',
        args: ['--version'],
      });
      expect(result.isError).toBeFalsy();
      const payload = JSON.parse(result.content[0].text);
      expect(payload.agentId).toMatch(/^FA-\d{3}$/);
      expect(typeof payload.pid).toBe('number');
      expect(payload.resource).toBeNull();

      const agents = mgr.getAgents();
      expect(agents.size).toBe(1);
      const entry = agents.get(payload.agentId);
      expect(entry).toBeDefined();
      expect(entry.pid).toBe(payload.pid);
      expect(entry.status).toBe('running');
      expect(childProcessMock.spawn).toHaveBeenCalledOnce();
    });

    it('with command + resource auto-sets resource and marks entry claimed', async () => {
      const mgr = new fleetModule.FleetManager();
      const result = await mgr.handleTool('fleet_spawn', {
        command: 'node',
        args: [],
        resource: 'file:/tmp/A',
      });
      const payload = JSON.parse(result.content[0].text);
      const entry = mgr.getAgents().get(payload.agentId);
      expect(entry.resource).toBe('file:/tmp/A');
      expect(entry.status).toBe('claimed');
      expect(payload.resource).toBe('file:/tmp/A');
      expect(payload.status).toBe('claimed');
    });

    it('returns error content when command is missing', async () => {
      const mgr = new fleetModule.FleetManager();
      const result = await mgr.handleTool('fleet_spawn', {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/command/);
    });
  });

  describe('fleet_claim', () => {
    it('on existing agentId returns { status: claimed }', async () => {
      const mgr = new fleetModule.FleetManager();
      const spawned = JSON.parse(
        (await mgr.handleTool('fleet_spawn', { command: 'node' })).content[0].text
      );
      const result = await mgr.handleTool('fleet_claim', {
        agentId: spawned.agentId,
        resource: 'db:session-1',
      });
      const payload = JSON.parse(result.content[0].text);
      expect(payload.status).toBe('claimed');
      expect(payload.resource).toBe('db:session-1');
      expect(payload.agentId).toBe(spawned.agentId);
      expect(mgr.getAgents().get(spawned.agentId).resource).toBe('db:session-1');
    });

    it('on unknown agentId returns error content', async () => {
      const mgr = new fleetModule.FleetManager();
      const result = await mgr.handleTool('fleet_claim', {
        agentId: 'FA-999',
        resource: 'db:whatever',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/Unknown agentId/);
    });
  });

  describe('fleet_release', () => {
    it('on existing agentId calls kill path and marks released', async () => {
      const mgr = new fleetModule.FleetManager();
      const spawned = JSON.parse(
        (await mgr.handleTool('fleet_spawn', { command: 'node' })).content[0].text
      );

      const result = await mgr.handleTool('fleet_release', {
        agentId: spawned.agentId,
      });
      const payload = JSON.parse(result.content[0].text);
      expect(payload.status).toBe('released');
      expect(payload.agentId).toBe(spawned.agentId);

      // At least one of the platform kill paths must have been exercised.
      const killTreeUsed =
        childProcessMock.execFileSync.mock.calls.some((c) => c[0] === 'taskkill') ||
        processKillSpy.mock.calls.some(
          (c) => c[1] === 'SIGKILL' || c[1] === 9
        );
      expect(killTreeUsed).toBe(true);

      expect(mgr.getAgents().get(spawned.agentId).status).toBe('released');
    });

    it('on unknown agentId returns error content', async () => {
      const mgr = new fleetModule.FleetManager();
      const result = await mgr.handleTool('fleet_release', {
        agentId: 'FA-404',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/Unknown agentId/);
    });
  });

  describe('fleet_status', () => {
    it('with no agentId returns array of all entries', async () => {
      const mgr = new fleetModule.FleetManager();
      await mgr.handleTool('fleet_spawn', { command: 'node' });
      await mgr.handleTool('fleet_spawn', { command: 'node', resource: 'r1' });

      const result = await mgr.handleTool('fleet_status', {});
      const payload = JSON.parse(result.content[0].text);
      expect(payload.count).toBe(2);
      expect(Array.isArray(payload.agents)).toBe(true);
      expect(payload.agents[0].alive).toBe(true);
      expect(payload.agents.every((a: any) => typeof a.agentId === 'string')).toBe(true);
    });

    it('with specific agentId returns that entry plus alive flag', async () => {
      const mgr = new fleetModule.FleetManager();
      const spawned = JSON.parse(
        (await mgr.handleTool('fleet_spawn', { command: 'node' })).content[0].text
      );

      const result = await mgr.handleTool('fleet_status', {
        agentId: spawned.agentId,
      });
      const payload = JSON.parse(result.content[0].text);
      expect(payload.agentId).toBe(spawned.agentId);
      expect(payload.pid).toBe(spawned.pid);
      expect(payload.status).toBe('running');
      expect(payload.alive).toBe(true);
    });

    it('liveness reflects ESRCH from process.kill(pid, 0)', async () => {
      const mgr = new fleetModule.FleetManager();
      const spawned = JSON.parse(
        (await mgr.handleTool('fleet_spawn', { command: 'node' })).content[0].text
      );

      // Flip process.kill to report ESRCH (dead) for liveness probe.
      processKillSpy.mockImplementation(() => {
        const err: any = new Error('no such process');
        err.code = 'ESRCH';
        throw err;
      });

      const result = await mgr.handleTool('fleet_status', {
        agentId: spawned.agentId,
      });
      const payload = JSON.parse(result.content[0].text);
      expect(payload.alive).toBe(false);
    });
  });

  describe('stop()', () => {
    it('releases all running/claimed entries and clears the map', async () => {
      const mgr = new fleetModule.FleetManager();
      await mgr.handleTool('fleet_spawn', { command: 'node' });
      await mgr.handleTool('fleet_spawn', { command: 'node', resource: 'r1' });
      expect(mgr.getAgents().size).toBe(2);

      mgr.stop();

      expect(mgr.getAgents().size).toBe(0);
      // Kill path must have been attempted for both.
      const killInvocations =
        childProcessMock.execFileSync.mock.calls.filter((c) => c[0] === 'taskkill').length +
        processKillSpy.mock.calls.filter((c) => c[1] === 'SIGKILL' || c[1] === 9).length;
      expect(killInvocations).toBeGreaterThanOrEqual(2);
    });
  });
});
