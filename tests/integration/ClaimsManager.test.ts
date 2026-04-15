import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const ROOT = path.resolve(__dirname, '../..');
const claimsJsPath = path.join(ROOT, 'dist', 'ClaimsManager.js');

function sha1(s: string): string {
  return crypto.createHash('sha1').update(s).digest('hex');
}

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-claims-test-'));
}

async function rimraf(dir: string): Promise<void> {
  try {
    await fsp.rm(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

describe('ClaimsManager', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(async () => {
    await rimraf(tmpDir);
  });

  describe('module exists and exports', () => {
    it('has compiled JavaScript file', () => {
      expect(fs.existsSync(claimsJsPath)).toBe(true);
    });

    it('exports ClaimsManager class', () => {
      const mod = require(claimsJsPath);
      expect(mod.ClaimsManager).toBeDefined();
      expect(typeof mod.ClaimsManager).toBe('function');
    });
  });

  describe('acquire', () => {
    it('creates a .lock file with correct JSON content', async () => {
      const { ClaimsManager } = require(claimsJsPath);
      const mgr = new ClaimsManager(tmpDir);
      const resource = 'file:/tmp/test-A';
      const claim = await mgr.acquire(resource, 'agent-1', 10_000);

      expect(claim.resource).toBe(resource);
      expect(claim.agentId).toBe('agent-1');
      expect(claim.pid).toBe(process.pid);
      expect(claim.ttlMs).toBe(10_000);
      expect(new Date(claim.expiresAt).getTime()).toBeGreaterThan(Date.now());

      const lockPath = path.join(tmpDir, `${sha1(resource)}.lock`);
      expect(fs.existsSync(lockPath)).toBe(true);
      const raw = await fsp.readFile(lockPath, 'utf8');
      const parsed = JSON.parse(raw);
      expect(parsed.resource).toBe(resource);
      expect(parsed.agentId).toBe('agent-1');
    });

    it('throws when the resource is already claimed by another live agent', async () => {
      const { ClaimsManager } = require(claimsJsPath);
      const mgr = new ClaimsManager(tmpDir);
      const resource = 'file:/tmp/test-B';
      await mgr.acquire(resource, 'agent-1', 60_000);

      await expect(mgr.acquire(resource, 'agent-2', 60_000)).rejects.toThrow(/already claimed/);
    });

    it('succeeds when the existing claim is expired (stale auto-clean)', async () => {
      const { ClaimsManager } = require(claimsJsPath);
      const mgr = new ClaimsManager(tmpDir);
      const resource = 'file:/tmp/test-C';

      // Hand-write an expired claim file directly.
      const lockPath = path.join(tmpDir, `${sha1(resource)}.lock`);
      await fsp.mkdir(tmpDir, { recursive: true });
      const past = new Date(Date.now() - 60_000).toISOString();
      const stale = {
        resource,
        agentId: 'agent-old',
        pid: process.pid,
        acquired: new Date(Date.now() - 120_000).toISOString(),
        ttlMs: 1_000,
        expiresAt: past,
      };
      await fsp.writeFile(lockPath, JSON.stringify(stale), 'utf8');

      const claim = await mgr.acquire(resource, 'agent-new', 30_000);
      expect(claim.agentId).toBe('agent-new');
      expect(claim.pid).toBe(process.pid);
    });

    it('succeeds when the existing claim holds a dead PID (stale auto-clean)', async () => {
      const { ClaimsManager } = require(claimsJsPath);
      const mgr = new ClaimsManager(tmpDir);
      const resource = 'file:/tmp/test-D';

      const lockPath = path.join(tmpDir, `${sha1(resource)}.lock`);
      await fsp.mkdir(tmpDir, { recursive: true });
      // PID 999999 is virtually guaranteed not to exist. TTL is still in the future
      // so only the dead-PID check can clear it.
      const deadClaim = {
        resource,
        agentId: 'agent-ghost',
        pid: 999_999,
        acquired: new Date().toISOString(),
        ttlMs: 60_000,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      };
      await fsp.writeFile(lockPath, JSON.stringify(deadClaim), 'utf8');

      const claim = await mgr.acquire(resource, 'agent-new', 30_000);
      expect(claim.agentId).toBe('agent-new');
    });
  });

  describe('release', () => {
    it('removes the .lock file when owned by the caller', async () => {
      const { ClaimsManager } = require(claimsJsPath);
      const mgr = new ClaimsManager(tmpDir);
      const resource = 'file:/tmp/test-E';
      await mgr.acquire(resource, 'agent-1', 60_000);

      const lockPath = path.join(tmpDir, `${sha1(resource)}.lock`);
      expect(fs.existsSync(lockPath)).toBe(true);

      const released = await mgr.release(resource, 'agent-1');
      expect(released).toBe(true);
      expect(fs.existsSync(lockPath)).toBe(false);
    });

    it('returns false when called with a different agentId on a live claim', async () => {
      const { ClaimsManager } = require(claimsJsPath);
      const mgr = new ClaimsManager(tmpDir);
      const resource = 'file:/tmp/test-F';
      await mgr.acquire(resource, 'agent-1', 60_000);

      const released = await mgr.release(resource, 'agent-2');
      expect(released).toBe(false);

      const lockPath = path.join(tmpDir, `${sha1(resource)}.lock`);
      expect(fs.existsSync(lockPath)).toBe(true);
    });

    it('returns false when claim does not exist', async () => {
      const { ClaimsManager } = require(claimsJsPath);
      const mgr = new ClaimsManager(tmpDir);
      const released = await mgr.release('file:/tmp/never-claimed', 'agent-1');
      expect(released).toBe(false);
    });
  });

  describe('sweep', () => {
    it('removes expired claims but keeps live ones', async () => {
      const { ClaimsManager } = require(claimsJsPath);
      const mgr = new ClaimsManager(tmpDir);

      // Live claim
      await mgr.acquire('file:/tmp/live', 'agent-live', 60_000);

      // Expired claim written directly
      await fsp.mkdir(tmpDir, { recursive: true });
      const expiredPath = path.join(tmpDir, `${sha1('file:/tmp/expired')}.lock`);
      await fsp.writeFile(
        expiredPath,
        JSON.stringify({
          resource: 'file:/tmp/expired',
          agentId: 'agent-old',
          pid: process.pid,
          acquired: new Date(Date.now() - 120_000).toISOString(),
          ttlMs: 1_000,
          expiresAt: new Date(Date.now() - 60_000).toISOString(),
        }),
        'utf8'
      );

      const result = await mgr.sweep();
      expect(result.swept).toBe(1);
      expect(result.alive).toBe(1);
      expect(fs.existsSync(expiredPath)).toBe(false);
    });

    it('removes dead-PID claims', async () => {
      const { ClaimsManager } = require(claimsJsPath);
      const mgr = new ClaimsManager(tmpDir);

      await fsp.mkdir(tmpDir, { recursive: true });
      const deadPath = path.join(tmpDir, `${sha1('file:/tmp/dead')}.lock`);
      await fsp.writeFile(
        deadPath,
        JSON.stringify({
          resource: 'file:/tmp/dead',
          agentId: 'agent-ghost',
          pid: 999_999,
          acquired: new Date().toISOString(),
          ttlMs: 60_000,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        }),
        'utf8'
      );

      const result = await mgr.sweep();
      expect(result.swept).toBe(1);
      expect(result.alive).toBe(0);
      expect(fs.existsSync(deadPath)).toBe(false);
    });
  });

  describe('list', () => {
    it('returns all current claims with staleness metadata', async () => {
      const { ClaimsManager } = require(claimsJsPath);
      const mgr = new ClaimsManager(tmpDir);

      await mgr.acquire('file:/tmp/live', 'agent-live', 60_000);

      await fsp.mkdir(tmpDir, { recursive: true });
      await fsp.writeFile(
        path.join(tmpDir, `${sha1('file:/tmp/expired')}.lock`),
        JSON.stringify({
          resource: 'file:/tmp/expired',
          agentId: 'agent-old',
          pid: process.pid,
          acquired: new Date(Date.now() - 120_000).toISOString(),
          ttlMs: 1_000,
          expiresAt: new Date(Date.now() - 60_000).toISOString(),
        }),
        'utf8'
      );
      await fsp.writeFile(
        path.join(tmpDir, `${sha1('file:/tmp/dead')}.lock`),
        JSON.stringify({
          resource: 'file:/tmp/dead',
          agentId: 'agent-ghost',
          pid: 999_999,
          acquired: new Date().toISOString(),
          ttlMs: 60_000,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        }),
        'utf8'
      );

      const claims = await mgr.list();
      expect(claims.length).toBe(3);

      const live = claims.find((c: any) => c.resource === 'file:/tmp/live');
      expect(live).toBeDefined();
      expect(live.expired).toBe(false);
      expect(live.processDead).toBe(false);

      const expired = claims.find((c: any) => c.resource === 'file:/tmp/expired');
      expect(expired.expired).toBe(true);

      const dead = claims.find((c: any) => c.resource === 'file:/tmp/dead');
      expect(dead.processDead).toBe(true);

      // list() must not mutate the filesystem
      const entriesAfter = await fsp.readdir(tmpDir);
      expect(entriesAfter.length).toBe(3);
    });
  });

  describe('MCP tool dispatch', () => {
    it('claim_acquire returns JSON result via handleToolCall', async () => {
      const { ClaimsManager } = require(claimsJsPath);
      const mgr = new ClaimsManager(tmpDir);
      const result = await mgr.handleToolCall('claim_acquire', {
        resource: 'agent:task-1',
        agentId: 'worker-1',
        ttlMs: 5_000,
      });
      expect(result.content).toBeDefined();
      const payload = JSON.parse(result.content[0].text);
      expect(payload.resource).toBe('agent:task-1');
      expect(payload.agentId).toBe('worker-1');
    });

    it('claim_release returns JSON result via handleToolCall', async () => {
      const { ClaimsManager } = require(claimsJsPath);
      const mgr = new ClaimsManager(tmpDir);
      await mgr.acquire('agent:task-2', 'worker-2', 5_000);
      const result = await mgr.handleToolCall('claim_release', {
        resource: 'agent:task-2',
        agentId: 'worker-2',
      });
      const payload = JSON.parse(result.content[0].text);
      expect(payload.released).toBe(true);
    });

    it('claim_list returns JSON result via handleToolCall', async () => {
      const { ClaimsManager } = require(claimsJsPath);
      const mgr = new ClaimsManager(tmpDir);
      await mgr.acquire('agent:task-3', 'worker-3', 5_000);
      const result = await mgr.handleToolCall('claim_list', {});
      const payload = JSON.parse(result.content[0].text);
      expect(Array.isArray(payload.claims)).toBe(true);
      expect(payload.claims.length).toBe(1);
      expect(payload.claims[0].resource).toBe('agent:task-3');
    });

    it('claim_sweep returns JSON result via handleToolCall', async () => {
      const { ClaimsManager } = require(claimsJsPath);
      const mgr = new ClaimsManager(tmpDir);
      await mgr.acquire('agent:task-4', 'worker-4', 60_000);
      const result = await mgr.handleToolCall('claim_sweep', {});
      const payload = JSON.parse(result.content[0].text);
      expect(typeof payload.swept).toBe('number');
      expect(typeof payload.alive).toBe('number');
      expect(payload.alive).toBeGreaterThanOrEqual(1);
    });

    it('isClaimTool identifies claim tools correctly', () => {
      const { ClaimsManager } = require(claimsJsPath);
      const mgr = new ClaimsManager(tmpDir);
      expect(mgr.isClaimTool('claim_acquire')).toBe(true);
      expect(mgr.isClaimTool('claim_release')).toBe(true);
      expect(mgr.isClaimTool('claim_list')).toBe(true);
      expect(mgr.isClaimTool('claim_sweep')).toBe(true);
      expect(mgr.isClaimTool('nav_get_map')).toBe(false);
      expect(mgr.isClaimTool('get_telemetry')).toBe(false);
    });

    it('getTools returns 4 tools with correct annotations', () => {
      const { ClaimsManager } = require(claimsJsPath);
      const mgr = new ClaimsManager(tmpDir);
      const tools = mgr.getTools();
      expect(tools.length).toBe(4);

      const acquire = tools.find((t: any) => t.name === 'claim_acquire');
      expect(acquire.annotations.readOnlyHint).toBe(false);
      expect(acquire.annotations.destructiveHint).toBe(false);
      expect(acquire.annotations.idempotentHint).toBe(false);

      const release = tools.find((t: any) => t.name === 'claim_release');
      expect(release.annotations.idempotentHint).toBe(true);

      const list = tools.find((t: any) => t.name === 'claim_list');
      expect(list.annotations.readOnlyHint).toBe(true);
      expect(list.annotations.idempotentHint).toBe(true);

      const sweep = tools.find((t: any) => t.name === 'claim_sweep');
      expect(sweep.annotations.destructiveHint).toBe(true);
      expect(sweep.annotations.idempotentHint).toBe(true);
    });
  });

  describe('concurrency', () => {
    it('only one of many concurrent acquires of the same resource succeeds', async () => {
      const { ClaimsManager } = require(claimsJsPath);
      const mgr = new ClaimsManager(tmpDir);
      const resource = 'file:/tmp/race';
      const results = await Promise.allSettled([
        mgr.acquire(resource, 'agent-a', 60_000),
        mgr.acquire(resource, 'agent-b', 60_000),
        mgr.acquire(resource, 'agent-c', 60_000),
        mgr.acquire(resource, 'agent-d', 60_000),
        mgr.acquire(resource, 'agent-e', 60_000),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(4);

      const winner = (fulfilled[0] as PromiseFulfilledResult<any>).value;
      expect(winner.resource).toBe(resource);
    });
  });
});
