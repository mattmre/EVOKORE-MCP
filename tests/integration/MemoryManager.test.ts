import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';

const ROOT = path.resolve(__dirname, '../..');
const memoryJsPath = path.join(ROOT, 'dist', 'MemoryManager.js');

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-memory-test-'));
}

async function rimraf(dir: string): Promise<void> {
  try {
    await fsp.rm(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

describe('MemoryManager', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(async () => {
    await rimraf(tmpDir);
  });

  describe('module exists and exports', () => {
    it('has compiled JavaScript file', () => {
      expect(fs.existsSync(memoryJsPath)).toBe(true);
    });

    it('exports MemoryManager class', () => {
      const mod = require(memoryJsPath);
      expect(mod.MemoryManager).toBeDefined();
      expect(typeof mod.MemoryManager).toBe('function');
    });

    it('reports backend name (node-sqlite or json-fallback)', () => {
      const { MemoryManager } = require(memoryJsPath);
      const mgr = new MemoryManager({ dir: tmpDir });
      const name = mgr.getBackendName();
      expect(['node-sqlite', 'json-fallback']).toContain(name);
    });
  });

  describe('memory_store', () => {
    it('stores a value and returns success', async () => {
      const { MemoryManager } = require(memoryJsPath);
      const mgr = new MemoryManager({ dir: tmpDir });
      const result = await mgr.handleToolCall('memory_store', {
        session_id: 'sess-1',
        key: 'hello',
        kind: 'knowledge',
        value: { greeting: 'hi' },
      });
      expect(result.isError).toBeUndefined();
      const payload = JSON.parse(result.content[0].text);
      expect(payload.stored).toBe(true);
      expect(payload.entry.key).toBe('hello');
      expect(payload.entry.kind).toBe('knowledge');
      expect(payload.entry.value).toEqual({ greeting: 'hi' });
    });

    it('rejects missing session_id, key, kind, or value', async () => {
      const { MemoryManager } = require(memoryJsPath);
      const mgr = new MemoryManager({ dir: tmpDir });

      const r1 = await mgr.handleToolCall('memory_store', { key: 'k', kind: 'knowledge', value: 1 });
      expect(r1.isError).toBe(true);

      const r2 = await mgr.handleToolCall('memory_store', { session_id: 's', kind: 'knowledge', value: 1 });
      expect(r2.isError).toBe(true);

      const r3 = await mgr.handleToolCall('memory_store', { session_id: 's', key: 'k', kind: 'bogus', value: 1 });
      expect(r3.isError).toBe(true);

      const r4 = await mgr.handleToolCall('memory_store', { session_id: 's', key: 'k', kind: 'knowledge' });
      expect(r4.isError).toBe(true);
    });
  });

  describe('memory_search', () => {
    it('finds an entry by key substring', async () => {
      const { MemoryManager } = require(memoryJsPath);
      const mgr = new MemoryManager({ dir: tmpDir });
      await mgr.handleToolCall('memory_store', {
        session_id: 's', key: 'user-profile', kind: 'knowledge', value: { name: 'Ana' },
      });
      await mgr.handleToolCall('memory_store', {
        session_id: 's', key: 'recent-query', kind: 'result', value: 'sql stmt',
      });

      const result = await mgr.handleToolCall('memory_search', {
        session_id: 's', query: 'profile',
      });
      const payload = JSON.parse(result.content[0].text);
      expect(payload.count).toBe(1);
      expect(payload.entries[0].key).toBe('user-profile');
    });

    it('filters by kind', async () => {
      const { MemoryManager } = require(memoryJsPath);
      const mgr = new MemoryManager({ dir: tmpDir });
      await mgr.handleToolCall('memory_store', {
        session_id: 's', key: 'k1', kind: 'knowledge', value: 1,
      });
      await mgr.handleToolCall('memory_store', {
        session_id: 's', key: 'e1', kind: 'error', value: 'oops',
      });
      await mgr.handleToolCall('memory_store', {
        session_id: 's', key: 'e2', kind: 'error', value: 'argh',
      });

      const result = await mgr.handleToolCall('memory_search', {
        session_id: 's', kind: 'error',
      });
      const payload = JSON.parse(result.content[0].text);
      expect(payload.count).toBe(2);
      expect(payload.entries.every((e: any) => e.kind === 'error')).toBe(true);
    });

    it('filters by tags (all tags must match)', async () => {
      const { MemoryManager } = require(memoryJsPath);
      const mgr = new MemoryManager({ dir: tmpDir });
      await mgr.handleToolCall('memory_store', {
        session_id: 's', key: 'a', kind: 'knowledge', value: 1, tags: ['red', 'big'],
      });
      await mgr.handleToolCall('memory_store', {
        session_id: 's', key: 'b', kind: 'knowledge', value: 2, tags: ['red'],
      });
      await mgr.handleToolCall('memory_store', {
        session_id: 's', key: 'c', kind: 'knowledge', value: 3, tags: ['big'],
      });

      const result = await mgr.handleToolCall('memory_search', {
        session_id: 's', tags: ['red', 'big'],
      });
      const payload = JSON.parse(result.content[0].text);
      expect(payload.count).toBe(1);
      expect(payload.entries[0].key).toBe('a');
    });

    it('honors limit', async () => {
      const { MemoryManager } = require(memoryJsPath);
      const mgr = new MemoryManager({ dir: tmpDir });
      for (let i = 0; i < 5; i++) {
        await mgr.handleToolCall('memory_store', {
          session_id: 's', key: `k${i}`, kind: 'knowledge', value: i,
        });
      }
      const result = await mgr.handleToolCall('memory_search', {
        session_id: 's', limit: 2,
      });
      const payload = JSON.parse(result.content[0].text);
      expect(payload.count).toBe(2);
    });
  });

  describe('memory_list', () => {
    it('lists all active entries for a session', async () => {
      const { MemoryManager } = require(memoryJsPath);
      const mgr = new MemoryManager({ dir: tmpDir });
      await mgr.handleToolCall('memory_store', {
        session_id: 's', key: 'a', kind: 'knowledge', value: 1,
      });
      await mgr.handleToolCall('memory_store', {
        session_id: 's', key: 'b', kind: 'result', value: 2,
      });

      const result = await mgr.handleToolCall('memory_list', { session_id: 's' });
      const payload = JSON.parse(result.content[0].text);
      expect(payload.count).toBe(2);
      const keys = payload.entries.map((e: any) => e.key).sort();
      expect(keys).toEqual(['a', 'b']);
    });

    it('filters list by kind', async () => {
      const { MemoryManager } = require(memoryJsPath);
      const mgr = new MemoryManager({ dir: tmpDir });
      await mgr.handleToolCall('memory_store', { session_id: 's', key: 'a', kind: 'knowledge', value: 1 });
      await mgr.handleToolCall('memory_store', { session_id: 's', key: 'b', kind: 'result', value: 2 });

      const result = await mgr.handleToolCall('memory_list', { session_id: 's', kind: 'result' });
      const payload = JSON.parse(result.content[0].text);
      expect(payload.count).toBe(1);
      expect(payload.entries[0].key).toBe('b');
    });
  });

  describe('overwrite semantics', () => {
    it('memory_store with same key overwrites existing entry', async () => {
      const { MemoryManager } = require(memoryJsPath);
      const mgr = new MemoryManager({ dir: tmpDir });
      await mgr.handleToolCall('memory_store', {
        session_id: 's', key: 'k', kind: 'knowledge', value: 'v1',
      });
      await mgr.handleToolCall('memory_store', {
        session_id: 's', key: 'k', kind: 'knowledge', value: 'v2',
      });

      const result = await mgr.handleToolCall('memory_list', { session_id: 's' });
      const payload = JSON.parse(result.content[0].text);
      expect(payload.count).toBe(1);
      expect(payload.entries[0].value).toBe('v2');
    });
  });

  describe('TTL and expiry', () => {
    it('excludes expired entries from search and list', () => {
      const { MemoryManager } = require(memoryJsPath);
      let now = 1_000_000;
      const mgr = new MemoryManager({ dir: tmpDir, now: () => now });
      mgr.store({ session_id: 's', key: 'short', kind: 'working', value: 1 });
      mgr.store({ session_id: 's', key: 'long', kind: 'knowledge', value: 2 });

      // Advance past working TTL (1h)
      now += 60 * 60 * 1000 + 1;
      const listed = mgr.list('s');
      expect(listed.length).toBe(1);
      expect(listed[0].key).toBe('long');

      const searched = mgr.search({ session_id: 's', query: 'short' });
      expect(searched.length).toBe(0);
    });

    it('memory_store with custom ttl_ms respects it', () => {
      const { MemoryManager } = require(memoryJsPath);
      let now = 1_000_000;
      const mgr = new MemoryManager({ dir: tmpDir, now: () => now });
      mgr.store({
        session_id: 's', key: 'custom', kind: 'knowledge', value: 1, ttl_ms: 500,
      });

      let listed = mgr.list('s');
      expect(listed.length).toBe(1);

      now += 501;
      listed = mgr.list('s');
      expect(listed.length).toBe(0);
    });

    it("kind: 'knowledge' has no expiry", () => {
      const { MemoryManager } = require(memoryJsPath);
      let now = 1_000_000;
      const mgr = new MemoryManager({ dir: tmpDir, now: () => now });
      const entry = mgr.store({ session_id: 's', key: 'k', kind: 'knowledge', value: 1 });
      expect(entry.expires_at).toBeNull();

      now += 365 * 24 * 60 * 60 * 1000; // +1 year
      const listed = mgr.list('s');
      expect(listed.length).toBe(1);
    });

    it("kind: 'working' expires after 1h (mock clock)", () => {
      const { MemoryManager } = require(memoryJsPath);
      const t0 = 1_000_000;
      let now = t0;
      const mgr = new MemoryManager({ dir: tmpDir, now: () => now });
      const entry = mgr.store({ session_id: 's', key: 'w', kind: 'working', value: 1 });
      expect(entry.expires_at).toBe(t0 + 60 * 60 * 1000);

      now = t0 + 59 * 60 * 1000; // 59m later: still alive
      expect(mgr.list('s').length).toBe(1);

      now = t0 + 60 * 60 * 1000 + 1; // 1h + 1ms later: expired
      expect(mgr.list('s').length).toBe(0);
    });
  });

  describe('cross-session isolation', () => {
    it('entries from session A are not visible to session B', async () => {
      const { MemoryManager } = require(memoryJsPath);
      const mgr = new MemoryManager({ dir: tmpDir });
      await mgr.handleToolCall('memory_store', {
        session_id: 'A', key: 'secret', kind: 'knowledge', value: 'alpha',
      });
      await mgr.handleToolCall('memory_store', {
        session_id: 'B', key: 'other', kind: 'knowledge', value: 'beta',
      });

      const resA = await mgr.handleToolCall('memory_list', { session_id: 'A' });
      const payloadA = JSON.parse(resA.content[0].text);
      expect(payloadA.count).toBe(1);
      expect(payloadA.entries[0].key).toBe('secret');

      const resB = await mgr.handleToolCall('memory_list', { session_id: 'B' });
      const payloadB = JSON.parse(resB.content[0].text);
      expect(payloadB.count).toBe(1);
      expect(payloadB.entries[0].key).toBe('other');

      const searchA = await mgr.handleToolCall('memory_search', {
        session_id: 'A', query: 'other',
      });
      const searchPayloadA = JSON.parse(searchA.content[0].text);
      expect(searchPayloadA.count).toBe(0);
    });
  });

  describe('MCP tool surface', () => {
    it('getTools returns 3 tools with correct annotations', () => {
      const { MemoryManager } = require(memoryJsPath);
      const mgr = new MemoryManager({ dir: tmpDir });
      const tools = mgr.getTools();
      expect(tools.length).toBe(3);

      const store = tools.find((t: any) => t.name === 'memory_store');
      expect(store.annotations.readOnlyHint).toBe(false);
      expect(store.annotations.destructiveHint).toBe(false);
      expect(store.annotations.idempotentHint).toBe(true);

      const search = tools.find((t: any) => t.name === 'memory_search');
      expect(search.annotations.readOnlyHint).toBe(true);
      expect(search.annotations.idempotentHint).toBe(true);

      const list = tools.find((t: any) => t.name === 'memory_list');
      expect(list.annotations.readOnlyHint).toBe(true);
      expect(list.annotations.idempotentHint).toBe(true);
    });

    it('isMemoryTool identifies memory tools correctly', () => {
      const { MemoryManager } = require(memoryJsPath);
      const mgr = new MemoryManager({ dir: tmpDir });
      expect(mgr.isMemoryTool('memory_store')).toBe(true);
      expect(mgr.isMemoryTool('memory_search')).toBe(true);
      expect(mgr.isMemoryTool('memory_list')).toBe(true);
      expect(mgr.isMemoryTool('claim_acquire')).toBe(false);
      expect(mgr.isMemoryTool('nav_get_map')).toBe(false);
    });

    it('round-trip via tool handler: store -> search -> list', async () => {
      const { MemoryManager } = require(memoryJsPath);
      const mgr = new MemoryManager({ dir: tmpDir });

      const storeRes = await mgr.handleToolCall('memory_store', {
        session_id: 'rt', key: 'note-1', kind: 'decision', value: { outcome: 'ship' }, tags: ['meeting'],
      });
      expect(JSON.parse(storeRes.content[0].text).stored).toBe(true);

      const searchRes = await mgr.handleToolCall('memory_search', {
        session_id: 'rt', query: 'note', tags: ['meeting'],
      });
      const searchPayload = JSON.parse(searchRes.content[0].text);
      expect(searchPayload.count).toBe(1);
      expect(searchPayload.entries[0].value).toEqual({ outcome: 'ship' });

      const listRes = await mgr.handleToolCall('memory_list', { session_id: 'rt' });
      const listPayload = JSON.parse(listRes.content[0].text);
      expect(listPayload.count).toBe(1);
      expect(listPayload.entries[0].key).toBe('note-1');
    });
  });

  describe('backend coverage', () => {
    it('JSON fallback works when forced', async () => {
      const { MemoryManager } = require(memoryJsPath);
      const mgr = new MemoryManager({ dir: tmpDir, forceJsonBackend: true });
      expect(mgr.getBackendName()).toBe('json-fallback');
      await mgr.handleToolCall('memory_store', {
        session_id: 's', key: 'k', kind: 'knowledge', value: 42,
      });
      const result = await mgr.handleToolCall('memory_list', { session_id: 's' });
      const payload = JSON.parse(result.content[0].text);
      expect(payload.count).toBe(1);
      expect(payload.entries[0].value).toBe(42);
    });
  });
});
