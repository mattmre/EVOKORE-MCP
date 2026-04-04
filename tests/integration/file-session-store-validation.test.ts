// TODO(BUG-28): convert from source-scraping to behavioral test
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import type { SessionState } from '../../src/SessionIsolation';

const ROOT = path.resolve(__dirname, '../..');
const fileStoreJsPath = path.join(ROOT, 'dist', 'stores', 'FileSessionStore.js');
const sessionStoreJsPath = path.join(ROOT, 'dist', 'SessionStore.js');
const sessionIsolationJsPath = path.join(ROOT, 'dist', 'SessionIsolation.js');
const httpServerTsPath = path.join(ROOT, 'src', 'HttpServer.ts');

// Unique temp root for all tests in this file — cleaned on exit
const TEMP_ROOT = path.join(os.tmpdir(), `evokore-fss-validation-${Date.now()}-${process.pid}`);

afterAll(async () => {
  try {
    await fsp.rm(TEMP_ROOT, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup
  }
});

/** Provide a unique temp directory per test to avoid cross-test interference. */
let dirCounter = 0;
function tempDir(label: string): string {
  return path.join(TEMP_ROOT, `${label}-${dirCounter++}`);
}

/** Create a minimal SessionState object compatible with the runtime interface. */
function createTestSessionState(id: string, overrides?: Partial<{
  createdAt: number;
  lastAccessedAt: number;
  role: string | null;
}>): SessionState {
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

async function waitForSessionVisibility(
  store: { get(sessionId: string): Promise<unknown> },
  sessionId: string,
  { shouldExist = true, timeoutMs = 1000, intervalMs = 25 }: { shouldExist?: boolean; timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const session = await store.get(sessionId);
    if (shouldExist ? session !== undefined : session === undefined) {
      return;
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  const expectation = shouldExist ? 'to persist' : 'to be removed';
  throw new Error(`Timed out waiting for session "${sessionId}" ${expectation}.`);
}

describe('FileSessionStore Production Validation', () => {

  // ========================================================================
  // 1. Construction and directory creation
  // ========================================================================

  describe('construction and directory creation', () => {
    it('uses the default directory when no options provided', () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const store = new FileSessionStore();
      const dir = store.getDirectory();
      // Default should be under the user home
      expect(dir).toContain('.evokore');
      expect(dir).toContain('session-store');
    });

    it('uses a custom directory when provided', () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('custom-dir');
      const store = new FileSessionStore({ directory: dir });
      expect(store.getDirectory()).toBe(dir);
    });

    it('creates the storage directory lazily on first write, not on construction', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('lazy-create');
      const store = new FileSessionStore({ directory: dir });

      // Directory should NOT exist yet — construction is lazy
      expect(fs.existsSync(dir)).toBe(false);

      // Write triggers directory creation
      await store.set('trigger', createTestSessionState('trigger'));
      expect(fs.existsSync(dir)).toBe(true);
    });

    it('handles deeply nested custom directory paths', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = path.join(tempDir('deep'), 'level1', 'level2', 'level3');
      const store = new FileSessionStore({ directory: dir });

      await store.set('deep-sess', createTestSessionState('deep-sess'));
      expect(fs.existsSync(dir)).toBe(true);
      const retrieved = await store.get('deep-sess');
      expect(retrieved).toBeDefined();
      expect(retrieved!.sessionId).toBe('deep-sess');
    });

    it('does not recreate the directory on subsequent writes (initialized flag)', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('init-flag');
      const store = new FileSessionStore({ directory: dir });

      // First write creates the directory
      await store.set('first', createTestSessionState('first'));
      const statBefore = await fsp.stat(dir);

      // Second write should skip mkdir
      await store.set('second', createTestSessionState('second'));
      const statAfter = await fsp.stat(dir);

      // Both sessions exist
      expect(await store.get('first')).toBeDefined();
      expect(await store.get('second')).toBeDefined();
      // Directory inode/creation time should be unchanged
      expect(statAfter.birthtimeMs).toBe(statBefore.birthtimeMs);
    });
  });

  // ========================================================================
  // 2. Save and load cycle
  // ========================================================================

  describe('save and load cycle', () => {
    it('round-trips a session with all field types populated', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('round-trip');
      const store = new FileSessionStore({ directory: dir });

      const state = createTestSessionState('full-state');
      state.activatedTools.add('github_search');
      state.activatedTools.add('fs_read_file');
      state.activatedTools.add('supabase_query');
      state.role = 'developer';
      state.rateLimitCounters.set('github_search', { tokens: 10, lastRefillAt: 1700000000000 });
      state.rateLimitCounters.set('fs_read_file', { tokens: 0, lastRefillAt: 1700000001000 });
      state.metadata.set('clientName', 'Claude Desktop');
      state.metadata.set('connectionTime', 1700000000000);
      state.metadata.set('nested', { deep: { value: 42 } });

      await store.set('full-state', state);
      const retrieved = await store.get('full-state');

      expect(retrieved).toBeDefined();
      expect(retrieved!.sessionId).toBe('full-state');
      expect(retrieved!.createdAt).toBe(state.createdAt);
      expect(retrieved!.lastAccessedAt).toBe(state.lastAccessedAt);

      // Set round-trip
      expect(retrieved!.activatedTools).toBeInstanceOf(Set);
      expect(retrieved!.activatedTools.size).toBe(3);
      expect(retrieved!.activatedTools.has('github_search')).toBe(true);
      expect(retrieved!.activatedTools.has('fs_read_file')).toBe(true);
      expect(retrieved!.activatedTools.has('supabase_query')).toBe(true);

      // Role
      expect(retrieved!.role).toBe('developer');

      // Map round-trip for rateLimitCounters
      expect(retrieved!.rateLimitCounters).toBeInstanceOf(Map);
      expect(retrieved!.rateLimitCounters.size).toBe(2);
      expect(retrieved!.rateLimitCounters.get('github_search')).toEqual({ tokens: 10, lastRefillAt: 1700000000000 });
      expect(retrieved!.rateLimitCounters.get('fs_read_file')).toEqual({ tokens: 0, lastRefillAt: 1700000001000 });

      // Map round-trip for metadata
      expect(retrieved!.metadata).toBeInstanceOf(Map);
      expect(retrieved!.metadata.get('clientName')).toBe('Claude Desktop');
      expect(retrieved!.metadata.get('connectionTime')).toBe(1700000000000);
      expect(retrieved!.metadata.get('nested')).toEqual({ deep: { value: 42 } });
    });

    it('round-trips a session with empty collections', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('empty-collections');
      const store = new FileSessionStore({ directory: dir });

      const state = createTestSessionState('empty-state');
      // All collections already empty by default

      await store.set('empty-state', state);
      const retrieved = await store.get('empty-state');

      expect(retrieved).toBeDefined();
      expect(retrieved!.activatedTools.size).toBe(0);
      expect(retrieved!.rateLimitCounters.size).toBe(0);
      expect(retrieved!.metadata.size).toBe(0);
      expect(retrieved!.role).toBeNull();
    });

    it('stores data as valid JSON on disk', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('json-on-disk');
      const store = new FileSessionStore({ directory: dir });

      const state = createTestSessionState('json-check');
      state.activatedTools.add('tool-a');
      state.metadata.set('key', 'value');

      await store.set('json-check', state);

      // Read the raw file and verify it parses as JSON
      const filePath = path.join(dir, 'json-check.json');
      const raw = await fsp.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw);

      expect(parsed.sessionId).toBe('json-check');
      expect(Array.isArray(parsed.activatedTools)).toBe(true);
      expect(parsed.activatedTools).toContain('tool-a');
      expect(parsed.metadata.key).toBe('value');
    });

    it('overwrites existing session on repeated set', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('overwrite');
      const store = new FileSessionStore({ directory: dir });

      const v1 = createTestSessionState('versioned');
      v1.role = 'admin';
      v1.activatedTools.add('tool-v1');
      await store.set('versioned', v1);

      const v2 = createTestSessionState('versioned');
      v2.role = 'readonly';
      v2.activatedTools.add('tool-v2');
      await store.set('versioned', v2);

      const result = await store.get('versioned');
      expect(result!.role).toBe('readonly');
      expect(result!.activatedTools.has('tool-v2')).toBe(true);
      expect(result!.activatedTools.has('tool-v1')).toBe(false);
    });
  });

  // ========================================================================
  // 3. Cross-restart persistence
  // ========================================================================

  describe('cross-restart persistence (new FileSessionStore instance reading old data)', () => {
    it('a fresh FileSessionStore reads sessions written by a prior instance', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('restart-basic');

      // --- "Process 1": create and persist sessions ---
      const store1 = new FileSessionStore({ directory: dir });
      const s1 = createTestSessionState('restart-1');
      s1.role = 'developer';
      s1.activatedTools.add('github_push');
      s1.metadata.set('env', 'production');
      await store1.set('restart-1', s1);

      const s2 = createTestSessionState('restart-2');
      s2.role = 'admin';
      s2.rateLimitCounters.set('tool-x', { tokens: 7, lastRefillAt: 99999 });
      await store1.set('restart-2', s2);

      // --- "Process 2": brand-new instance, same directory ---
      const store2 = new FileSessionStore({ directory: dir });

      const loaded1 = await store2.get('restart-1');
      expect(loaded1).toBeDefined();
      expect(loaded1!.sessionId).toBe('restart-1');
      expect(loaded1!.role).toBe('developer');
      expect(loaded1!.activatedTools.has('github_push')).toBe(true);
      expect(loaded1!.metadata.get('env')).toBe('production');

      const loaded2 = await store2.get('restart-2');
      expect(loaded2).toBeDefined();
      expect(loaded2!.role).toBe('admin');
      expect(loaded2!.rateLimitCounters.get('tool-x')).toEqual({ tokens: 7, lastRefillAt: 99999 });
    });

    it('list() on a fresh instance reflects sessions from a prior instance', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('restart-list');

      const store1 = new FileSessionStore({ directory: dir });
      await store1.set('alpha', createTestSessionState('alpha'));
      await store1.set('beta', createTestSessionState('beta'));
      await store1.set('gamma', createTestSessionState('gamma'));

      const store2 = new FileSessionStore({ directory: dir });
      const ids = await store2.list();
      expect(ids).toContain('alpha');
      expect(ids).toContain('beta');
      expect(ids).toContain('gamma');
      expect(ids.length).toBe(3);
    });

    it('delete on a fresh instance removes sessions created by a prior instance', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('restart-delete');

      const store1 = new FileSessionStore({ directory: dir });
      await store1.set('will-delete', createTestSessionState('will-delete'));
      await store1.set('will-keep', createTestSessionState('will-keep'));

      const store2 = new FileSessionStore({ directory: dir });
      await store2.delete('will-delete');

      expect(await store2.get('will-delete')).toBeUndefined();
      expect(await store2.get('will-keep')).toBeDefined();
    });

    it('list() returns sanitized filenames for sessions with special characters in the ID', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('restart-list-sanitized');

      const store = new FileSessionStore({ directory: dir });
      await store.set('user/123', createTestSessionState('user/123'));

      const ids = await store.list();
      expect(ids).toContain('user_123');
    });

    it('cleanup on a fresh instance removes expired sessions from a prior instance', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('restart-cleanup');

      const store1 = new FileSessionStore({ directory: dir });
      const old = createTestSessionState('stale', { lastAccessedAt: Date.now() - 200000 });
      const fresh = createTestSessionState('fresh');
      await store1.set('stale', old);
      await store1.set('fresh', fresh);

      const store2 = new FileSessionStore({ directory: dir });
      const removed = await store2.cleanup(60000);
      expect(removed).toBe(1);

      expect(await store2.get('stale')).toBeUndefined();
      expect(await store2.get('fresh')).toBeDefined();
    });
  });

  // ========================================================================
  // 4. Session TTL expiry (through SessionIsolation + FileSessionStore)
  // ========================================================================

  describe('session TTL expiry via SessionIsolation with FileSessionStore', () => {
    it('loadSession returns null for sessions that have exceeded TTL', async () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('ttl-expiry');

      const store = new FileSessionStore({ directory: dir });

      // Write a session that is already past TTL
      const expired = createTestSessionState('expired-sess', {
        lastAccessedAt: Date.now() - 120000,
      });
      await store.set('expired-sess', expired);

      const iso = new SessionIsolation({ store, ttlMs: 60000 });
      const loaded = await iso.loadSession('expired-sess');
      expect(loaded).toBeNull();
    });

    it('loadSession deletes expired sessions from the backing store', async () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('ttl-store-delete');

      const store = new FileSessionStore({ directory: dir });
      const expired = createTestSessionState('cleanup-target', {
        lastAccessedAt: Date.now() - 300000,
      });
      await store.set('cleanup-target', expired);

      const iso = new SessionIsolation({ store, ttlMs: 60000 });
      await iso.loadSession('cleanup-target');

      // The backing store file should also be gone
      const recheck = await store.get('cleanup-target');
      expect(recheck).toBeUndefined();
    });

    it('loadSession succeeds for sessions within TTL', async () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('ttl-valid');

      const store = new FileSessionStore({ directory: dir });
      const valid = createTestSessionState('valid-sess');
      valid.role = 'admin';
      valid.activatedTools.add('github_push');
      await store.set('valid-sess', valid);

      const iso = new SessionIsolation({ store, ttlMs: 3600000 });
      const loaded = await iso.loadSession('valid-sess');
      expect(loaded).not.toBeNull();
      expect(loaded!.sessionId).toBe('valid-sess');
      expect(loaded!.role).toBe('admin');
      expect(loaded!.activatedTools.has('github_push')).toBe(true);
    });
  });

  // ========================================================================
  // 5. Concurrent session isolation
  // ========================================================================

  describe('concurrent session isolation (multiple sessions do not interfere)', () => {
    it('many sessions written concurrently to different IDs are all persisted', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('concurrent-multi');
      const store = new FileSessionStore({ directory: dir });

      const count = 20;
      const writes = Array.from({ length: count }, (_, i) => {
        const state = createTestSessionState(`session-${i}`);
        state.role = i % 3 === 0 ? 'admin' : i % 3 === 1 ? 'developer' : 'readonly';
        state.activatedTools.add(`tool-${i}`);
        state.metadata.set('index', i);
        return store.set(`session-${i}`, state);
      });

      await Promise.all(writes);

      const ids = await store.list();
      expect(ids.length).toBe(count);

      // Verify each session independently
      for (let i = 0; i < count; i++) {
        const loaded = await store.get(`session-${i}`);
        expect(loaded).toBeDefined();
        expect(loaded!.sessionId).toBe(`session-${i}`);
        expect(loaded!.activatedTools.has(`tool-${i}`)).toBe(true);
        expect(loaded!.metadata.get('index')).toBe(i);
      }
    });

    it('concurrent writes to the same session ID do not corrupt the file', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('concurrent-same');
      const store = new FileSessionStore({ directory: dir });

      const writes = Array.from({ length: 10 }, (_, i) => {
        const state = createTestSessionState('contested');
        state.metadata.set('writer', i);
        state.role = `role-${i}`;
        return store.set('contested', state);
      });

      // All writes should complete without error
      await expect(Promise.all(writes)).resolves.toBeDefined();

      // The final state should be valid JSON with a real session
      const result = await store.get('contested');
      expect(result).toBeDefined();
      expect(result!.sessionId).toBe('contested');
      // One of the writers' roles should have won
      expect(result!.role).toMatch(/^role-\d$/);
    });

    it('deleting one session does not affect other sessions in the same directory', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('delete-isolation');
      const store = new FileSessionStore({ directory: dir });

      await store.set('keep-a', createTestSessionState('keep-a'));
      await store.set('remove-b', createTestSessionState('remove-b'));
      await store.set('keep-c', createTestSessionState('keep-c'));

      await store.delete('remove-b');

      expect(await store.get('keep-a')).toBeDefined();
      expect(await store.get('remove-b')).toBeUndefined();
      expect(await store.get('keep-c')).toBeDefined();
    });
  });

  // ========================================================================
  // 6. Session data integrity (serialize/deserialize)
  // ========================================================================

  describe('session data integrity (serialize/deserialize)', () => {
    it('serialization converts Set to array and Map to object', () => {
      const { serializeSessionState } = require(sessionStoreJsPath);

      const state = createTestSessionState('ser-integrity');
      state.activatedTools.add('tool-1');
      state.activatedTools.add('tool-2');
      state.rateLimitCounters.set('rl-1', { tokens: 5, lastRefillAt: 1000 });
      state.metadata.set('key', 'val');

      const serialized = serializeSessionState(state);

      expect(Array.isArray(serialized.activatedTools)).toBe(true);
      expect(serialized.activatedTools).toContain('tool-1');
      expect(serialized.activatedTools).toContain('tool-2');

      expect(serialized.rateLimitCounters).not.toBeInstanceOf(Map);
      expect(serialized.rateLimitCounters['rl-1']).toEqual({ tokens: 5, lastRefillAt: 1000 });

      expect(serialized.metadata).not.toBeInstanceOf(Map);
      expect(serialized.metadata['key']).toBe('val');
    });

    it('deserialization restores array to Set and object to Map', () => {
      const { deserializeSessionState } = require(sessionStoreJsPath);

      const serialized = {
        sessionId: 'deser-test',
        createdAt: 1000,
        lastAccessedAt: 2000,
        activatedTools: ['a', 'b', 'c'],
        role: 'admin',
        rateLimitCounters: { 'tool-x': { tokens: 3, lastRefillAt: 500 } },
        metadata: { foo: 'bar', num: 42 },
      };

      const restored = deserializeSessionState(serialized);

      expect(restored.activatedTools).toBeInstanceOf(Set);
      expect(restored.activatedTools.size).toBe(3);
      expect(restored.activatedTools.has('a')).toBe(true);
      expect(restored.activatedTools.has('b')).toBe(true);
      expect(restored.activatedTools.has('c')).toBe(true);

      expect(restored.rateLimitCounters).toBeInstanceOf(Map);
      expect(restored.rateLimitCounters.get('tool-x')).toEqual({ tokens: 3, lastRefillAt: 500 });

      expect(restored.metadata).toBeInstanceOf(Map);
      expect(restored.metadata.get('foo')).toBe('bar');
      expect(restored.metadata.get('num')).toBe(42);
    });

    it('full JSON serialize/parse/deserialize cycle preserves all data', () => {
      const { serializeSessionState, deserializeSessionState } = require(sessionStoreJsPath);

      const original = createTestSessionState('full-cycle');
      original.activatedTools.add('tool-alpha');
      original.role = 'developer';
      original.rateLimitCounters.set('rate-1', { tokens: 99, lastRefillAt: 12345 });
      original.metadata.set('complex', { nested: [1, 2, 3] });

      const serialized = serializeSessionState(original);
      const json = JSON.stringify(serialized);
      const parsed = JSON.parse(json);
      const restored = deserializeSessionState(parsed);

      expect(restored.sessionId).toBe('full-cycle');
      expect(restored.createdAt).toBe(original.createdAt);
      expect(restored.lastAccessedAt).toBe(original.lastAccessedAt);
      expect(restored.role).toBe('developer');
      expect(restored.activatedTools.has('tool-alpha')).toBe(true);
      expect(restored.rateLimitCounters.get('rate-1')).toEqual({ tokens: 99, lastRefillAt: 12345 });
      expect(restored.metadata.get('complex')).toEqual({ nested: [1, 2, 3] });
    });

    it('session ID is sanitized for filesystem safety', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('sanitize-id');
      const store = new FileSessionStore({ directory: dir });

      // ID with characters that could be problematic on filesystems
      const unsafeId = 'session/with:special<chars>';
      const state = createTestSessionState(unsafeId);
      await store.set(unsafeId, state);

      // Verify the file was written with a safe name
      const entries = await fsp.readdir(dir);
      expect(entries.length).toBe(1);
      const fileName = entries[0];
      // The sanitized name should not contain special chars
      expect(fileName).not.toMatch(/[/:*?"<>|]/);
      expect(fileName).toMatch(/\.json$/);
    });
  });

  // ========================================================================
  // 7. Error handling
  // ========================================================================

  describe('error handling', () => {
    it('get returns undefined when directory does not exist (ENOENT)', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('enoent-get');
      // Do NOT create the directory
      const store = new FileSessionStore({ directory: dir });
      const result = await store.get('nonexistent');
      expect(result).toBeUndefined();
    });

    it('list returns empty array when directory does not exist (ENOENT)', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('enoent-list');
      const store = new FileSessionStore({ directory: dir });
      const ids = await store.list();
      expect(ids).toEqual([]);
    });

    it('delete is idempotent for non-existent sessions', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('delete-noop');
      const store = new FileSessionStore({ directory: dir });
      // Should not throw
      await expect(store.delete('never-existed')).resolves.toBeUndefined();
    });

    it('cleanup returns 0 when directory does not exist', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('cleanup-enoent');
      const store = new FileSessionStore({ directory: dir });
      const removed = await store.cleanup(60000);
      expect(removed).toBe(0);
    });

    it('get handles corrupt JSON files gracefully by throwing', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('corrupt-json');
      const store = new FileSessionStore({ directory: dir });

      // Manually create a corrupt session file
      await fsp.mkdir(dir, { recursive: true });
      await fsp.writeFile(path.join(dir, 'corrupt.json'), '{ this is not valid json }', 'utf-8');

      // get() should throw on parse error (not ENOENT, so it propagates)
      await expect(store.get('corrupt')).rejects.toThrow();
    });

    it('cleanup skips corrupt JSON files without crashing', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('cleanup-corrupt');
      const store = new FileSessionStore({ directory: dir });

      await fsp.mkdir(dir, { recursive: true });
      // One valid expired session, one corrupt file
      const expired = createTestSessionState('valid-expired', { lastAccessedAt: Date.now() - 200000 });
      const { serializeSessionState } = require(sessionStoreJsPath);
      await fsp.writeFile(path.join(dir, 'valid-expired.json'), JSON.stringify(serializeSessionState(expired)), 'utf-8');
      await fsp.writeFile(path.join(dir, 'broken.json'), 'not json!!!', 'utf-8');

      // cleanup should process the valid file and skip the corrupt one
      const removed = await store.cleanup(60000);
      expect(removed).toBe(1);
      // Corrupt file should still be there (skipped, not deleted)
      const entries = await fsp.readdir(dir);
      expect(entries).toContain('broken.json');
    });

    it('list ignores .tmp files (partial writes)', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('ignore-tmp');
      const store = new FileSessionStore({ directory: dir });

      await store.set('real', createTestSessionState('real'));

      // Manually create a .tmp file that might exist from a partial write
      await fsp.writeFile(path.join(dir, 'real.json.12345.tmp'), '{}', 'utf-8');

      const ids = await store.list();
      expect(ids).toEqual(['real']);
      expect(ids).not.toContain('real.json.12345');
    });
  });

  // ========================================================================
  // 8. SessionIsolation integration with FileSessionStore
  // ========================================================================

  describe('SessionIsolation integration with FileSessionStore', () => {
    it('createSession persists to FileSessionStore (fire-and-forget)', async () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('iso-create');

      const store = new FileSessionStore({ directory: dir });
      const iso = new SessionIsolation({ store });

      iso.createSession('iso-1', 'developer');

      await waitForSessionVisibility(store, 'iso-1');

      const persisted = await store.get('iso-1');
      expect(persisted).toBeDefined();
      expect(persisted!.sessionId).toBe('iso-1');
      expect(persisted!.role).toBe('developer');
    });

    it('persistSession explicitly saves mutated state', async () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('iso-persist');

      const store = new FileSessionStore({ directory: dir });
      const iso = new SessionIsolation({ store });

      const session = iso.createSession('mutate-me');
      session.activatedTools.add('github_push');
      session.activatedTools.add('fs_write_file');
      session.role = 'admin';
      session.metadata.set('persona', 'ops-engineer');
      session.rateLimitCounters.set('github_push', { tokens: 3, lastRefillAt: Date.now() });

      await iso.persistSession('mutate-me');

      const persisted = await store.get('mutate-me');
      expect(persisted!.activatedTools.has('github_push')).toBe(true);
      expect(persisted!.activatedTools.has('fs_write_file')).toBe(true);
      expect(persisted!.role).toBe('admin');
      expect(persisted!.metadata.get('persona')).toBe('ops-engineer');
      expect(persisted!.rateLimitCounters.get('github_push')!.tokens).toBe(3);
    });

    it('persistSession is a no-op for a non-existent session', async () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('iso-persist-noop');

      const store = new FileSessionStore({ directory: dir });
      const iso = new SessionIsolation({ store });

      // Should not throw
      await expect(iso.persistSession('ghost')).resolves.toBeUndefined();
    });

    it('loadSession hydrates state into in-memory cache', async () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('iso-load');

      const store = new FileSessionStore({ directory: dir });

      // Write directly to store (simulating prior process)
      const state = createTestSessionState('load-me');
      state.role = 'readonly';
      state.activatedTools.add('read-only-tool');
      await store.set('load-me', state);

      const iso = new SessionIsolation({ store, ttlMs: 3600000 });

      // Not in memory yet
      expect(iso.getSession('load-me')).toBeNull();

      // Load from store
      const loaded = await iso.loadSession('load-me');
      expect(loaded).not.toBeNull();
      expect(loaded!.role).toBe('readonly');
      expect(loaded!.activatedTools.has('read-only-tool')).toBe(true);

      // Now accessible via getSession
      expect(iso.getSession('load-me')).not.toBeNull();
    });

    it('loadSession returns null for sessions not in the store', async () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('iso-load-missing');

      const store = new FileSessionStore({ directory: dir });
      const iso = new SessionIsolation({ store });

      const loaded = await iso.loadSession('does-not-exist');
      expect(loaded).toBeNull();
    });

    it('destroySession removes from both in-memory and file store', async () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('iso-destroy');

      const store = new FileSessionStore({ directory: dir });
      const iso = new SessionIsolation({ store });

      iso.createSession('destroy-me');

      await waitForSessionVisibility(store, 'destroy-me');

      expect(await store.get('destroy-me')).toBeDefined();

      iso.destroySession('destroy-me');

      await waitForSessionVisibility(store, 'destroy-me', { shouldExist: false });

      expect(iso.getSession('destroy-me')).toBeNull();
      expect(await store.get('destroy-me')).toBeUndefined();
    });

    it('full restart cycle: create, mutate, persist, reload via fresh instances', async () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('iso-full-restart');

      // --- Phase 1: first process ---
      const store1 = new FileSessionStore({ directory: dir });
      const iso1 = new SessionIsolation({ store: store1, ttlMs: 3600000 });

      const session = iso1.createSession('full-restart', 'developer');
      session.activatedTools.add('github_push');
      session.activatedTools.add('fs_write_file');
      session.metadata.set('workspace', '/home/user/project');
      session.rateLimitCounters.set('github_push', { tokens: 8, lastRefillAt: 55555 });

      await iso1.persistSession('full-restart');

      // --- Phase 2: simulate process restart ---
      const store2 = new FileSessionStore({ directory: dir });
      const iso2 = new SessionIsolation({ store: store2, ttlMs: 3600000 });

      // Not in memory
      expect(iso2.getSession('full-restart')).toBeNull();
      expect(iso2.size).toBe(0);

      // Load from disk
      const restored = await iso2.loadSession('full-restart');
      expect(restored).not.toBeNull();
      expect(restored!.sessionId).toBe('full-restart');
      expect(restored!.role).toBe('developer');
      expect(restored!.activatedTools.has('github_push')).toBe(true);
      expect(restored!.activatedTools.has('fs_write_file')).toBe(true);
      expect(restored!.metadata.get('workspace')).toBe('/home/user/project');
      expect(restored!.rateLimitCounters.get('github_push')).toEqual({ tokens: 8, lastRefillAt: 55555 });

      // In memory after load
      expect(iso2.size).toBe(1);
      expect(iso2.getSession('full-restart')).not.toBeNull();
    });
  });

  // ========================================================================
  // 9. HTTP session reattachment via loadSession (M1.1)
  // ========================================================================

  describe('HTTP session reattachment is wired via loadSession (M1.1)', () => {
    it('HttpServer calls loadSession before returning 404 for unknown sessions', () => {
      const httpSrc = fs.readFileSync(httpServerTsPath, 'utf8');

      // The handleMcpRequest method should still return 404 as final fallback
      expect(httpSrc).toMatch(/Session not found/);

      // Verify that loadSession IS called in the request handler before the 404 path
      const methodMatch = httpSrc.match(/handleMcpRequest[\s\S]*?Session not found/);
      expect(methodMatch).not.toBeNull();
      const methodBody = methodMatch![0];
      expect(methodBody).toMatch(/\.loadSession\s*\(/);
    });

    it('loadSession restores session state across a fresh SessionIsolation + FileSessionStore boundary', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const dir = tempDir('reattach-boundary');

      // Create store and SessionIsolation, create a session with state
      const store1 = new FileSessionStore({ directory: dir });
      const iso1 = new SessionIsolation({ store: store1, ttlMs: 60000 });
      const session = iso1.createSession('reattach-1', 'admin');
      session.activatedTools.add('tool_a');
      session.activatedTools.add('tool_b');
      session.metadata.set('custom', 'value');
      await iso1.persistSession('reattach-1');

      // Simulate restart: create new instances pointing at same directory
      const store2 = new FileSessionStore({ directory: dir });
      const iso2 = new SessionIsolation({ store: store2, ttlMs: 60000 });

      // Session should not be in memory yet
      expect(iso2.getSession('reattach-1')).toBeNull();

      // loadSession should restore it
      const loaded = await iso2.loadSession('reattach-1');
      expect(loaded).not.toBeNull();
      expect(loaded!.sessionId).toBe('reattach-1');
      expect(loaded!.role).toBe('admin');
      expect(loaded!.activatedTools.has('tool_a')).toBe(true);
      expect(loaded!.activatedTools.has('tool_b')).toBe(true);
      expect(loaded!.metadata.get('custom')).toBe('value');
    });

    it('expired sessions return null from loadSession after restart', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const dir = tempDir('reattach-expired');

      const store1 = new FileSessionStore({ directory: dir });
      const iso1 = new SessionIsolation({ store: store1, ttlMs: 1000 });
      const session = iso1.createSession('expired-1');
      // Backdate the session so it is expired
      session.lastAccessedAt = Date.now() - 5000;
      await iso1.persistSession('expired-1');

      // Simulate restart with same TTL
      const store2 = new FileSessionStore({ directory: dir });
      const iso2 = new SessionIsolation({ store: store2, ttlMs: 1000 });

      const loaded = await iso2.loadSession('expired-1');
      expect(loaded).toBeNull();
    });

    it('session_resumed webhook event type exists in WebhookManager', () => {
      const webhookSrc = fs.readFileSync(path.join(ROOT, 'src', 'WebhookManager.ts'), 'utf8');
      expect(webhookSrc).toMatch(/session_resumed/);
      // Verify it is in the WEBHOOK_EVENT_TYPES array
      expect(webhookSrc).toMatch(/"session_resumed"/);
    });

    it('HttpServer emits session_resumed webhook on reattachment', () => {
      const httpSrc = fs.readFileSync(httpServerTsPath, 'utf8');
      // The reattachment path should emit session_resumed
      expect(httpSrc).toMatch(/emit\s*\(\s*["']session_resumed["']/);
    });

    it('index.ts constructs SessionIsolation with FileSessionStore for HTTP mode', () => {
      const indexSrc = fs.readFileSync(path.join(ROOT, 'src', 'index.ts'), 'utf8');
      // Should import FileSessionStore
      expect(indexSrc).toMatch(/FileSessionStore/);
      // Should check httpMode and storeOverride
      expect(indexSrc).toMatch(/EVOKORE_SESSION_STORE/);
      expect(indexSrc).toMatch(/httpMode/);
    });

    it('persistSession is called after tool activation changes in index.ts', () => {
      const indexSrc = fs.readFileSync(path.join(ROOT, 'src', 'index.ts'), 'utf8');
      expect(indexSrc).toMatch(/persistSession/);
    });
  });

  // ========================================================================
  // 10. Env var configuration validation
  // ========================================================================

  describe('env var configuration validation', () => {
    it('EVOKORE_SESSION_TTL_MS is documented in .env.example', () => {
      const envExample = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
      expect(envExample).toMatch(/EVOKORE_SESSION_TTL_MS/);
    });

    it('SessionIsolation reads EVOKORE_SESSION_TTL_MS from process.env', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const original = process.env.EVOKORE_SESSION_TTL_MS;

      try {
        process.env.EVOKORE_SESSION_TTL_MS = '5000';
        const iso = new SessionIsolation();
        expect(iso.getTtlMs()).toBe(5000);
      } finally {
        if (original !== undefined) {
          process.env.EVOKORE_SESSION_TTL_MS = original;
        } else {
          delete process.env.EVOKORE_SESSION_TTL_MS;
        }
      }
    });

    it('invalid EVOKORE_SESSION_TTL_MS falls back to default 1 hour', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const original = process.env.EVOKORE_SESSION_TTL_MS;

      try {
        process.env.EVOKORE_SESSION_TTL_MS = 'not-a-number';
        const iso = new SessionIsolation();
        expect(iso.getTtlMs()).toBe(3600000);
      } finally {
        if (original !== undefined) {
          process.env.EVOKORE_SESSION_TTL_MS = original;
        } else {
          delete process.env.EVOKORE_SESSION_TTL_MS;
        }
      }
    });

    it('negative EVOKORE_SESSION_TTL_MS falls back to default 1 hour', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const original = process.env.EVOKORE_SESSION_TTL_MS;

      try {
        process.env.EVOKORE_SESSION_TTL_MS = '-1000';
        const iso = new SessionIsolation();
        expect(iso.getTtlMs()).toBe(3600000);
      } finally {
        if (original !== undefined) {
          process.env.EVOKORE_SESSION_TTL_MS = original;
        } else {
          delete process.env.EVOKORE_SESSION_TTL_MS;
        }
      }
    });

    it('constructor ttlMs option takes precedence over env var', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const original = process.env.EVOKORE_SESSION_TTL_MS;

      try {
        process.env.EVOKORE_SESSION_TTL_MS = '99999';
        const iso = new SessionIsolation({ ttlMs: 12345 });
        expect(iso.getTtlMs()).toBe(12345);
      } finally {
        if (original !== undefined) {
          process.env.EVOKORE_SESSION_TTL_MS = original;
        } else {
          delete process.env.EVOKORE_SESSION_TTL_MS;
        }
      }
    });
  });

  // ========================================================================
  // 11. File cleanup and garbage collection
  // ========================================================================

  describe('file cleanup and garbage collection', () => {
    it('cleanup removes only sessions older than maxAgeMs', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('gc-age');
      const store = new FileSessionStore({ directory: dir });

      const old1 = createTestSessionState('old-1', { lastAccessedAt: Date.now() - 200000 });
      const old2 = createTestSessionState('old-2', { lastAccessedAt: Date.now() - 150000 });
      const fresh = createTestSessionState('fresh-1');
      const recent = createTestSessionState('recent-1', { lastAccessedAt: Date.now() - 30000 });

      await store.set('old-1', old1);
      await store.set('old-2', old2);
      await store.set('fresh-1', fresh);
      await store.set('recent-1', recent);

      const removed = await store.cleanup(60000);
      expect(removed).toBe(2);

      expect(await store.get('old-1')).toBeUndefined();
      expect(await store.get('old-2')).toBeUndefined();
      expect(await store.get('fresh-1')).toBeDefined();
      expect(await store.get('recent-1')).toBeDefined();
    });

    it('cleanup returns 0 when all sessions are fresh', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('gc-all-fresh');
      const store = new FileSessionStore({ directory: dir });

      await store.set('a', createTestSessionState('a'));
      await store.set('b', createTestSessionState('b'));

      const removed = await store.cleanup(60000);
      expect(removed).toBe(0);

      expect(await store.get('a')).toBeDefined();
      expect(await store.get('b')).toBeDefined();
    });

    it('cleanup with maxAgeMs=0 removes all sessions', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('gc-zero-age');
      const store = new FileSessionStore({ directory: dir });

      await store.set('x', createTestSessionState('x'));
      await store.set('y', createTestSessionState('y'));

      // Small delay so that (now - lastAccessedAt) > 0
      await new Promise(resolve => setTimeout(resolve, 5));

      const removed = await store.cleanup(0);
      expect(removed).toBe(2);

      expect(await store.get('x')).toBeUndefined();
      expect(await store.get('y')).toBeUndefined();
    });

    it('cleanup removes session files from disk', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('gc-disk');
      const store = new FileSessionStore({ directory: dir });

      const old = createTestSessionState('disk-old', { lastAccessedAt: Date.now() - 200000 });
      await store.set('disk-old', old);

      // Verify file exists
      const entries1 = await fsp.readdir(dir);
      expect(entries1.some(e => e.includes('disk-old'))).toBe(true);

      await store.cleanup(60000);

      // Verify file is gone
      const entries2 = await fsp.readdir(dir);
      expect(entries2.some(e => e.includes('disk-old'))).toBe(false);
    });

    it('no leftover .tmp files after normal write operations', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('no-tmp');
      const store = new FileSessionStore({ directory: dir });

      // Write and overwrite several times
      for (let i = 0; i < 5; i++) {
        const state = createTestSessionState(`session-${i}`);
        await store.set(`session-${i}`, state);
      }

      const entries = await fsp.readdir(dir);
      const tmpFiles = entries.filter(e => e.endsWith('.tmp'));
      expect(tmpFiles.length).toBe(0);
    });

    it('SessionIsolation.cleanExpired triggers store.delete for expired sessions', async () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('gc-iso-clean');

      const store = new FileSessionStore({ directory: dir });
      const iso = new SessionIsolation({ store, ttlMs: 60000 });

      const session = iso.createSession('gc-target');

      // Wait for fire-and-forget createSession persistence to settle,
      // then explicitly persist to ensure the file exists on disk.
      await waitForSessionVisibility(store, 'gc-target');
      await iso.persistSession('gc-target');

      // Confirm the file exists before cleanup
      expect(await store.get('gc-target')).toBeDefined();

      // Manually expire
      session.lastAccessedAt = Date.now() - 120000;

      iso.cleanExpired();

      await waitForSessionVisibility(store, 'gc-target', { shouldExist: false });

      // Should be gone from both memory and disk
      expect(iso.getSession('gc-target')).toBeNull();
      expect(await store.get('gc-target')).toBeUndefined();
    });
  });

  // ========================================================================
  // 12. Write chain serialization
  // ========================================================================

  describe('write chain serialization', () => {
    it('rapid sequential writes to different sessions all complete', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('chain-multi');
      const store = new FileSessionStore({ directory: dir });

      // Fire writes without awaiting, then await all
      const promises: Promise<void>[] = [];
      for (let i = 0; i < 15; i++) {
        promises.push(store.set(`rapid-${i}`, createTestSessionState(`rapid-${i}`)));
      }
      await Promise.all(promises);

      const ids = await store.list();
      expect(ids.length).toBe(15);
    });

    it('interleaved set and delete operations do not deadlock', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('chain-interleave');
      const store = new FileSessionStore({ directory: dir });

      // Write, then interleave deletes and new writes
      await store.set('a', createTestSessionState('a'));
      await store.set('b', createTestSessionState('b'));

      const ops = [
        store.delete('a'),
        store.set('c', createTestSessionState('c')),
        store.set('b', createTestSessionState('b')), // overwrite
        store.delete('nonexistent'),
        store.set('d', createTestSessionState('d')),
      ];

      await expect(Promise.all(ops)).resolves.toBeDefined();

      expect(await store.get('a')).toBeUndefined();
      expect(await store.get('b')).toBeDefined();
      expect(await store.get('c')).toBeDefined();
      expect(await store.get('d')).toBeDefined();
    });
  });
});
