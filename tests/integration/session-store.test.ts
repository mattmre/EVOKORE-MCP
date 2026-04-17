import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';

const ROOT = path.resolve(__dirname, '../..');
const memoryStoreJsPath = path.join(ROOT, 'dist', 'stores', 'MemorySessionStore.js');
const fileStoreJsPath = path.join(ROOT, 'dist', 'stores', 'FileSessionStore.js');
const sessionIsolationJsPath = path.join(ROOT, 'dist', 'SessionIsolation.js');
const sessionStoreJsPath = path.join(ROOT, 'dist', 'SessionStore.js');

// Temp directory for FileSessionStore tests — cleaned up in afterAll
const TEMP_STORE_DIR = path.join(os.tmpdir(), `evokore-session-store-test-${Date.now()}`);

afterAll(async () => {
  // Clean up temp directory
  try {
    await fsp.rm(TEMP_STORE_DIR, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup
  }
});

// ---- Helper: create a minimal SessionState ----

function createTestSessionState(id: string, overrides?: Partial<{
  createdAt: number;
  lastAccessedAt: number;
  role: string | null;
}>): any {
  const now = Date.now();
  return {
    sessionId: id,
    createdAt: overrides?.createdAt ?? now,
    lastAccessedAt: overrides?.lastAccessedAt ?? now,
    activatedTools: new Set<string>(),
    role: overrides?.role ?? null,
    rateLimitCounters: new Map(),
    metadata: new Map(),
  };
}

describe('Session Store Architecture', () => {

  // ---- MemorySessionStore CRUD ----

  describe('MemorySessionStore CRUD operations', () => {
    it('compiled module exists and exports MemorySessionStore', () => {
      const mod = require(memoryStoreJsPath);
      expect(mod.MemorySessionStore).toBeDefined();
      expect(typeof mod.MemorySessionStore).toBe('function');
    });

    it('get returns undefined for non-existent session', async () => {
      const { MemorySessionStore } = require(memoryStoreJsPath);
      const store = new MemorySessionStore();
      const result = await store.get('nonexistent');
      expect(result).toBeUndefined();
    });

    it('set and get round-trip preserves session state', async () => {
      const { MemorySessionStore } = require(memoryStoreJsPath);
      const store = new MemorySessionStore();
      const state = createTestSessionState('mem-1');
      state.activatedTools.add('tool-a');
      state.metadata.set('key', 'value');

      await store.set('mem-1', state);
      const retrieved = await store.get('mem-1');

      expect(retrieved).toBeDefined();
      expect(retrieved!.sessionId).toBe('mem-1');
      expect(retrieved!.activatedTools.has('tool-a')).toBe(true);
      expect(retrieved!.metadata.get('key')).toBe('value');
    });

    it('delete removes a session', async () => {
      const { MemorySessionStore } = require(memoryStoreJsPath);
      const store = new MemorySessionStore();
      const state = createTestSessionState('mem-delete');

      await store.set('mem-delete', state);
      await store.delete('mem-delete');
      const result = await store.get('mem-delete');
      expect(result).toBeUndefined();
    });

    it('delete is idempotent for non-existent sessions', async () => {
      const { MemorySessionStore } = require(memoryStoreJsPath);
      const store = new MemorySessionStore();
      // Should not throw
      await store.delete('never-existed');
    });

    it('list returns all stored session IDs', async () => {
      const { MemorySessionStore } = require(memoryStoreJsPath);
      const store = new MemorySessionStore();

      await store.set('a', createTestSessionState('a'));
      await store.set('b', createTestSessionState('b'));
      await store.set('c', createTestSessionState('c'));

      const ids = await store.list();
      expect(ids).toContain('a');
      expect(ids).toContain('b');
      expect(ids).toContain('c');
      expect(ids.length).toBe(3);
    });

    it('cleanup removes sessions older than maxAgeMs', async () => {
      const { MemorySessionStore } = require(memoryStoreJsPath);
      const store = new MemorySessionStore();

      const oldState = createTestSessionState('old', {
        lastAccessedAt: Date.now() - 120000,
      });
      const freshState = createTestSessionState('fresh');

      await store.set('old', oldState);
      await store.set('fresh', freshState);

      const removed = await store.cleanup(60000);
      expect(removed).toBe(1);

      expect(await store.get('old')).toBeUndefined();
      expect(await store.get('fresh')).toBeDefined();
    });

    it('cleanup returns 0 when no sessions are expired', async () => {
      const { MemorySessionStore } = require(memoryStoreJsPath);
      const store = new MemorySessionStore();

      await store.set('active', createTestSessionState('active'));
      const removed = await store.cleanup(60000);
      expect(removed).toBe(0);
    });

    it('set overwrites existing session with same ID', async () => {
      const { MemorySessionStore } = require(memoryStoreJsPath);
      const store = new MemorySessionStore();

      const first = createTestSessionState('overwrite');
      first.role = 'admin';
      await store.set('overwrite', first);

      const second = createTestSessionState('overwrite');
      second.role = 'readonly';
      await store.set('overwrite', second);

      const result = await store.get('overwrite');
      expect(result!.role).toBe('readonly');
    });
  });

  // ---- FileSessionStore CRUD ----

  describe('FileSessionStore CRUD operations', () => {
    // Each test uses a unique subdirectory under TEMP_STORE_DIR

    it('compiled module exists and exports FileSessionStore', () => {
      const mod = require(fileStoreJsPath);
      expect(mod.FileSessionStore).toBeDefined();
      expect(typeof mod.FileSessionStore).toBe('function');
    });

    it('get returns undefined for non-existent session', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = path.join(TEMP_STORE_DIR, 'get-missing');
      const store = new FileSessionStore({ directory: dir });
      const result = await store.get('nonexistent');
      expect(result).toBeUndefined();
    });

    it('set and get round-trip preserves session state with Set/Map serialization', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = path.join(TEMP_STORE_DIR, 'set-get');
      const store = new FileSessionStore({ directory: dir });

      const state = createTestSessionState('file-1');
      state.activatedTools.add('tool-x');
      state.activatedTools.add('tool-y');
      state.role = 'developer';
      state.rateLimitCounters.set('tool-x', { tokens: 5, lastRefillAt: Date.now() });
      state.metadata.set('client', 'vscode');

      await store.set('file-1', state);
      const retrieved = await store.get('file-1');

      expect(retrieved).toBeDefined();
      expect(retrieved!.sessionId).toBe('file-1');
      expect(retrieved!.activatedTools).toBeInstanceOf(Set);
      expect(retrieved!.activatedTools.has('tool-x')).toBe(true);
      expect(retrieved!.activatedTools.has('tool-y')).toBe(true);
      expect(retrieved!.role).toBe('developer');
      expect(retrieved!.rateLimitCounters).toBeInstanceOf(Map);
      expect(retrieved!.rateLimitCounters.get('tool-x')).toEqual(
        expect.objectContaining({ tokens: 5 })
      );
      expect(retrieved!.metadata).toBeInstanceOf(Map);
      expect(retrieved!.metadata.get('client')).toBe('vscode');
    });

    it('creates storage directory automatically on first write', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = path.join(TEMP_STORE_DIR, 'auto-create');
      expect(fs.existsSync(dir)).toBe(false);

      const store = new FileSessionStore({ directory: dir });
      await store.set('auto', createTestSessionState('auto'));

      expect(fs.existsSync(dir)).toBe(true);
    });

    it('delete removes a session file', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = path.join(TEMP_STORE_DIR, 'delete');
      const store = new FileSessionStore({ directory: dir });

      await store.set('to-delete', createTestSessionState('to-delete'));
      expect(await store.get('to-delete')).toBeDefined();

      await store.delete('to-delete');
      expect(await store.get('to-delete')).toBeUndefined();
    });

    it('delete is idempotent for non-existent sessions', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = path.join(TEMP_STORE_DIR, 'delete-noop');
      const store = new FileSessionStore({ directory: dir });
      // Should not throw
      await store.delete('never-existed');
    });

    it('list returns all stored session IDs', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = path.join(TEMP_STORE_DIR, 'list');
      const store = new FileSessionStore({ directory: dir });

      await store.set('alpha', createTestSessionState('alpha'));
      await store.set('beta', createTestSessionState('beta'));
      await store.set('gamma', createTestSessionState('gamma'));

      const ids = await store.list();
      expect(ids).toContain('alpha');
      expect(ids).toContain('beta');
      expect(ids).toContain('gamma');
      expect(ids.length).toBe(3);
    });

    it('list returns empty array when directory does not exist', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = path.join(TEMP_STORE_DIR, 'list-empty-nonexistent');
      const store = new FileSessionStore({ directory: dir });

      const ids = await store.list();
      expect(ids).toEqual([]);
    });

    it('cleanup removes sessions older than maxAgeMs', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = path.join(TEMP_STORE_DIR, 'cleanup');
      const store = new FileSessionStore({ directory: dir });

      const oldState = createTestSessionState('expired', {
        lastAccessedAt: Date.now() - 120000,
      });
      const freshState = createTestSessionState('active');

      await store.set('expired', oldState);
      await store.set('active', freshState);

      const removed = await store.cleanup(60000);
      expect(removed).toBe(1);

      expect(await store.get('expired')).toBeUndefined();
      expect(await store.get('active')).toBeDefined();
    });

    it('cleanup returns 0 when no sessions are expired', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = path.join(TEMP_STORE_DIR, 'cleanup-none');
      const store = new FileSessionStore({ directory: dir });

      await store.set('active', createTestSessionState('active'));
      const removed = await store.cleanup(60000);
      expect(removed).toBe(0);
    });

    it('set overwrites existing session file', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = path.join(TEMP_STORE_DIR, 'overwrite');
      const store = new FileSessionStore({ directory: dir });

      const first = createTestSessionState('ow');
      first.role = 'admin';
      await store.set('ow', first);

      const second = createTestSessionState('ow');
      second.role = 'readonly';
      await store.set('ow', second);

      const result = await store.get('ow');
      expect(result!.role).toBe('readonly');
    });

    it('concurrent writes to the same session do not race on a shared temp file', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = path.join(TEMP_STORE_DIR, 'concurrent-overwrite');
      const store = new FileSessionStore({ directory: dir });

      const writes = Array.from({ length: 8 }, (_, index) => {
        const state = createTestSessionState('concurrent');
        state.role = index % 2 === 0 ? 'developer' : 'admin';
        state.metadata.set('writeIndex', index);
        return store.set('concurrent', state);
      });

      await expect(Promise.all(writes)).resolves.toBeDefined();

      const result = await store.get('concurrent');
      expect(result).toBeDefined();
      expect(['developer', 'admin']).toContain(result!.role);
      expect(typeof result!.metadata.get('writeIndex')).toBe('number');
    });

    it('getDirectory returns the configured directory', () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = path.join(TEMP_STORE_DIR, 'get-dir');
      const store = new FileSessionStore({ directory: dir });
      expect(store.getDirectory()).toBe(dir);
    });
  });

  // ---- Serialization helpers ----

  describe('serializeSessionState and deserializeSessionState', () => {
    it('round-trip preserves all fields', () => {
      const { serializeSessionState, deserializeSessionState } = require(sessionStoreJsPath);

      const original = createTestSessionState('ser-test');
      original.activatedTools.add('a');
      original.activatedTools.add('b');
      original.role = 'dev';
      original.rateLimitCounters.set('tool-1', { tokens: 3, lastRefillAt: 1000 });
      original.metadata.set('key', 'val');

      const serialized = serializeSessionState(original);
      expect(Array.isArray(serialized.activatedTools)).toBe(true);
      expect(typeof serialized.rateLimitCounters).toBe('object');
      expect(typeof serialized.metadata).toBe('object');

      const restored = deserializeSessionState(serialized);
      expect(restored.sessionId).toBe('ser-test');
      expect(restored.activatedTools).toBeInstanceOf(Set);
      expect(restored.activatedTools.has('a')).toBe(true);
      expect(restored.activatedTools.has('b')).toBe(true);
      expect(restored.role).toBe('dev');
      expect(restored.rateLimitCounters).toBeInstanceOf(Map);
      expect(restored.rateLimitCounters.get('tool-1')).toEqual({ tokens: 3, lastRefillAt: 1000 });
      expect(restored.metadata).toBeInstanceOf(Map);
      expect(restored.metadata.get('key')).toBe('val');
    });

    it('serialized form is JSON.stringify safe', () => {
      const { serializeSessionState } = require(sessionStoreJsPath);
      const state = createTestSessionState('json-safe');
      state.activatedTools.add('x');
      state.metadata.set('nested', { deep: true });

      const serialized = serializeSessionState(state);
      const json = JSON.stringify(serialized);
      const parsed = JSON.parse(json);

      expect(parsed.sessionId).toBe('json-safe');
      expect(parsed.activatedTools).toEqual(['x']);
      expect(parsed.metadata.nested).toEqual({ deep: true });
    });
  });

  // ---- SessionIsolation with MemorySessionStore (default behavior) ----

  describe('SessionIsolation with MemorySessionStore (default)', () => {
    it('uses MemorySessionStore when no store option is provided', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const { MemorySessionStore } = require(memoryStoreJsPath);
      const iso = new SessionIsolation();
      expect(iso.getStore()).toBeInstanceOf(MemorySessionStore);
    });

    it('createSession still works synchronously', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation();
      const session = iso.createSession('sync-test');
      expect(session.sessionId).toBe('sync-test');
    });

    it('getSession returns the created session', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation();
      iso.createSession('get-test');
      const session = iso.getSession('get-test');
      expect(session).not.toBeNull();
      expect(session!.sessionId).toBe('get-test');
    });

    it('destroySession removes the session', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation();
      iso.createSession('destroy-test');
      expect(iso.destroySession('destroy-test')).toBe(true);
      expect(iso.getSession('destroy-test')).toBeNull();
    });

    it('listSessions returns all active sessions', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation({ ttlMs: 60000 });
      iso.createSession('a');
      iso.createSession('b');
      const list = iso.listSessions();
      expect(list).toContain('a');
      expect(list).toContain('b');
    });

    it('cleanExpired removes expired sessions', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation({ ttlMs: 60000 });
      iso.createSession('alive');
      iso.createSession('dead');
      const deadState = iso.getSession('dead');
      if (deadState) {
        deadState.lastAccessedAt = Date.now() - 120000;
      }
      const removed = iso.cleanExpired();
      expect(removed).toBe(1);
      expect(iso.getSession('dead')).toBeNull();
      expect(iso.getSession('alive')).not.toBeNull();
    });

    it('TTL defaults to 1 hour', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const original = process.env.EVOKORE_SESSION_TTL_MS;
      delete process.env.EVOKORE_SESSION_TTL_MS;
      const iso = new SessionIsolation();
      expect(iso.getTtlMs()).toBe(60 * 60 * 1000);
      if (original !== undefined) {
        process.env.EVOKORE_SESSION_TTL_MS = original;
      }
    });

    it('maxSessions defaults to 100', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation();
      expect(iso.getMaxSessions()).toBe(100);
    });
  });

  // ---- SessionIsolation with FileSessionStore ----

  describe('SessionIsolation with FileSessionStore', () => {
    it('accepts FileSessionStore as store option', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = path.join(TEMP_STORE_DIR, 'iso-file-store');
      const store = new FileSessionStore({ directory: dir });
      const iso = new SessionIsolation({ store });
      expect(iso.getStore()).toBe(store);
    });

    it('createSession writes to the file store', async () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = path.join(TEMP_STORE_DIR, 'iso-file-create');
      const store = new FileSessionStore({ directory: dir });
      const iso = new SessionIsolation({ store });

      iso.createSession('file-sess');
      // Wait a tick for the fire-and-forget store.set to settle
      await new Promise(resolve => setTimeout(resolve, 50));

      const persisted = await store.get('file-sess');
      expect(persisted).toBeDefined();
      expect(persisted!.sessionId).toBe('file-sess');
    });

    it('persistSession explicitly persists current state', async () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = path.join(TEMP_STORE_DIR, 'iso-file-persist');
      const store = new FileSessionStore({ directory: dir });
      const iso = new SessionIsolation({ store });

      const session = iso.createSession('persist-test');
      session.activatedTools.add('my-tool');
      session.role = 'admin';

      await iso.persistSession('persist-test');

      const persisted = await store.get('persist-test');
      expect(persisted).toBeDefined();
      expect(persisted!.activatedTools.has('my-tool')).toBe(true);
      expect(persisted!.role).toBe('admin');
    });

    it('restart smoke restores persisted state through a fresh store and isolation instance', async () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = path.join(TEMP_STORE_DIR, 'iso-file-restart-smoke');

      const firstStore = new FileSessionStore({ directory: dir });
      const firstIsolation = new SessionIsolation({ store: firstStore });
      const firstSession = firstIsolation.createSession('restart-smoke');
      firstSession.activatedTools.add('tool-after-restart');
      firstSession.role = 'developer';
      firstSession.metadata.set('persona', 'ops');
      firstSession.rateLimitCounters.set('tool-after-restart', {
        tokens: 4,
        lastRefillAt: 12345,
      });

      await firstIsolation.persistSession('restart-smoke');

      const secondStore = new FileSessionStore({ directory: dir });
      const secondIsolation = new SessionIsolation({ store: secondStore });

      expect(secondIsolation.getSession('restart-smoke')).toBeNull();

      const restored = await secondIsolation.loadSession('restart-smoke');
      expect(restored).not.toBeNull();
      expect(restored!.sessionId).toBe('restart-smoke');
      expect(restored!.activatedTools.has('tool-after-restart')).toBe(true);
      expect(restored!.role).toBe('developer');
      expect(restored!.metadata.get('persona')).toBe('ops');
      expect(restored!.rateLimitCounters.get('tool-after-restart')).toEqual({
        tokens: 4,
        lastRefillAt: 12345,
      });

      expect(secondIsolation.getSession('restart-smoke')).not.toBeNull();
    });

    it('loadSession restores a session from the file store', async () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = path.join(TEMP_STORE_DIR, 'iso-file-load');
      const store = new FileSessionStore({ directory: dir });

      // Write a session directly to the store (simulating a previous process)
      const state = createTestSessionState('load-test');
      state.role = 'developer';
      state.activatedTools.add('loaded-tool');
      await store.set('load-test', state);

      // Create a fresh SessionIsolation that connects to the same store
      const iso = new SessionIsolation({ store });

      // Session is not in-memory yet
      expect(iso.getSession('load-test')).toBeNull();

      // Load from store
      const loaded = await iso.loadSession('load-test');
      expect(loaded).not.toBeNull();
      expect(loaded!.sessionId).toBe('load-test');
      expect(loaded!.role).toBe('developer');
      expect(loaded!.activatedTools.has('loaded-tool')).toBe(true);

      // Now it should be accessible via getSession
      expect(iso.getSession('load-test')).not.toBeNull();
    });

    it('loadSession returns null for expired sessions', async () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = path.join(TEMP_STORE_DIR, 'iso-file-load-expired');
      const store = new FileSessionStore({ directory: dir });

      const state = createTestSessionState('expired-load', {
        lastAccessedAt: Date.now() - 120000,
      });
      await store.set('expired-load', state);

      const iso = new SessionIsolation({ store, ttlMs: 60000 });
      const loaded = await iso.loadSession('expired-load');
      expect(loaded).toBeNull();
    });
  });

  // ---- Backward compatibility ----

  describe('backward compatibility', () => {
    it('SessionIsolation constructor with no arguments works as before', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation();

      // All original methods work
      const session = iso.createSession('compat-1', 'admin');
      expect(session.sessionId).toBe('compat-1');
      expect(session.role).toBe('admin');
      expect(iso.getSession('compat-1')).not.toBeNull();
      expect(iso.hasSession('compat-1')).toBe(true);
      expect(iso.listSessions()).toContain('compat-1');
      expect(iso.destroySession('compat-1')).toBe(true);
      expect(iso.size).toBe(0);
    });

    it('SessionIsolation with only ttlMs option works as before', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation({ ttlMs: 5000 });
      expect(iso.getTtlMs()).toBe(5000);
      iso.createSession('ttl-test');
      expect(iso.getSession('ttl-test')).not.toBeNull();
    });

    it('SessionIsolation with only maxSessions option works as before', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation({ maxSessions: 5 });
      expect(iso.getMaxSessions()).toBe(5);
    });

    it('LRU eviction still works with default store', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation({ maxSessions: 3, ttlMs: 60000 });

      const now = Date.now();
      iso.createSession('s1');
      iso.createSession('s2');
      iso.createSession('s3');

      // Manually backdate s1 and s2 so their lastAccessedAt ordering is deterministic
      // s1 is most recently accessed (will be touched below), s2 is oldest
      const s1 = iso.getSession('s1')!;
      const s2 = iso.getSession('s2')!;
      const s3 = iso.getSession('s3')!;

      s1.lastAccessedAt = now - 2000;
      s2.lastAccessedAt = now - 3000; // oldest
      s3.lastAccessedAt = now - 1000;

      // Touch s1 to make it the most recently accessed
      iso.getSession('s1');

      // This should evict s2 (least recently accessed after the touch)
      iso.createSession('s4');

      expect(iso.getSession('s1')).not.toBeNull();
      expect(iso.getSession('s2')).toBeNull(); // evicted
      expect(iso.getSession('s3')).not.toBeNull();
      expect(iso.getSession('s4')).not.toBeNull();
    });

    it('created sessions expose the canonical runtime state shape', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation();
      const session = iso.createSession('shape-test');

      expect(session).toMatchObject({
        sessionId: 'shape-test',
        role: null,
      });
      expect(typeof session.createdAt).toBe('number');
      expect(typeof session.lastAccessedAt).toBe('number');
      expect(session.activatedTools).toBeInstanceOf(Set);
      expect(session.rateLimitCounters).toBeInstanceOf(Map);
      expect(session.metadata).toBeInstanceOf(Map);
    });
  });
});
