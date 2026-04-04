import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const redisStoreTsPath = path.join(ROOT, 'src', 'stores', 'RedisSessionStore.ts');
const redisStoreJsPath = path.join(ROOT, 'dist', 'stores', 'RedisSessionStore.js');
const sessionStoreJsPath = path.join(ROOT, 'dist', 'SessionStore.js');
const indexTsPath = path.join(ROOT, 'src', 'index.ts');
const envExamplePath = path.join(ROOT, '.env.example');

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

// ============================================================================
// Section 1: Module Structure (always runs, no Redis required)
// ============================================================================

describe('RedisSessionStore Module Structure', () => {

  describe('source file', () => {
    const src = fs.readFileSync(redisStoreTsPath, 'utf8');

    it('exists and is readable', () => {
      expect(src.length).toBeGreaterThan(0);
    });

    it('exports RedisSessionStore class', () => {
      expect(src).toMatch(/export\s+class\s+RedisSessionStore/);
    });

    it('implements SessionStore interface', () => {
      expect(src).toMatch(/implements\s+SessionStore/);
    });

    it('imports from SessionStore module', () => {
      expect(src).toMatch(/import.*SessionStore.*from.*SessionStore/);
    });

    it('imports serializeSessionState helper', () => {
      expect(src).toMatch(/import.*serializeSessionState/);
    });

    it('imports deserializeSessionState helper', () => {
      expect(src).toMatch(/import.*deserializeSessionState/);
    });

    it('defines get method', () => {
      expect(src).toMatch(/async\s+get\s*\(\s*sessionId\s*:\s*string\s*\)/);
    });

    it('defines set method', () => {
      expect(src).toMatch(/async\s+set\s*\(\s*sessionId\s*:\s*string/);
    });

    it('defines delete method', () => {
      expect(src).toMatch(/async\s+delete\s*\(\s*sessionId\s*:\s*string\s*\)/);
    });

    it('defines list method', () => {
      expect(src).toMatch(/async\s+list\s*\(\s*\)/);
    });

    it('defines cleanup method', () => {
      expect(src).toMatch(/async\s+cleanup\s*\(\s*maxAgeMs\s*:\s*number\s*\)/);
    });

    it('defines disconnect method for clean shutdown', () => {
      expect(src).toMatch(/async\s+disconnect\s*\(\s*\)/);
    });

    it('disconnect method satisfies optional SessionStore.disconnect interface', () => {
      // SessionStore declares disconnect?(): Promise<void>; RedisSessionStore implements it
      const sessionStoreSrc = fs.readFileSync(path.join(ROOT, 'src', 'SessionStore.ts'), 'utf8');
      expect(sessionStoreSrc).toMatch(/disconnect\?\(\)\s*:\s*Promise<void>/);
      expect(src).toMatch(/async\s+disconnect\s*\(\s*\)/);
    });

    it('exports RedisSessionStoreOptions interface', () => {
      expect(src).toMatch(/export\s+interface\s+RedisSessionStoreOptions/);
    });

    it('options interface includes url field', () => {
      expect(src).toMatch(/url\?\s*:\s*string/);
    });

    it('options interface includes keyPrefix field', () => {
      expect(src).toMatch(/keyPrefix\?\s*:\s*string/);
    });

    it('options interface includes ttlMs field', () => {
      expect(src).toMatch(/ttlMs\?\s*:\s*number/);
    });

    it('uses dynamic import for ioredis', () => {
      // The import uses a variable to avoid TypeScript compile-time resolution:
      // const moduleName = "ioredis"; await import(moduleName)
      expect(src).toContain('"ioredis"');
      expect(src).toMatch(/import\s*\(/);
    });

    it('uses SCAN for listing keys (not KEYS)', () => {
      expect(src).toMatch(/\.scan\s*\(/);
      expect(src).not.toMatch(/\.keys\s*\(/);
    });

    it('uses PX option for TTL (millisecond precision)', () => {
      expect(src).toMatch(/"PX"/);
    });
  });

  describe('compiled module', () => {
    it('exists after build', () => {
      expect(fs.existsSync(redisStoreJsPath)).toBe(true);
    });

    it('exports RedisSessionStore constructor', () => {
      const mod = require(redisStoreJsPath);
      expect(mod.RedisSessionStore).toBeDefined();
      expect(typeof mod.RedisSessionStore).toBe('function');
    });
  });

  describe('constructor defaults', () => {
    it('defaults url to redis://127.0.0.1:6379', () => {
      const { RedisSessionStore } = require(redisStoreJsPath);
      const store = new RedisSessionStore();
      expect(store.getUrl()).toBe('redis://127.0.0.1:6379');
    });

    it('defaults keyPrefix to evokore', () => {
      const { RedisSessionStore } = require(redisStoreJsPath);
      const store = new RedisSessionStore();
      expect(store.getKeyPrefix()).toBe('evokore');
    });

    it('defaults ttlMs to 3600000 (1 hour)', () => {
      const { RedisSessionStore } = require(redisStoreJsPath);
      const store = new RedisSessionStore();
      expect(store.getTtlMs()).toBe(3600000);
    });

    it('accepts custom url', () => {
      const { RedisSessionStore } = require(redisStoreJsPath);
      const store = new RedisSessionStore({ url: 'redis://custom:6380' });
      expect(store.getUrl()).toBe('redis://custom:6380');
    });

    it('accepts custom keyPrefix', () => {
      const { RedisSessionStore } = require(redisStoreJsPath);
      const store = new RedisSessionStore({ keyPrefix: 'myapp' });
      expect(store.getKeyPrefix()).toBe('myapp');
    });

    it('accepts custom ttlMs', () => {
      const { RedisSessionStore } = require(redisStoreJsPath);
      const store = new RedisSessionStore({ ttlMs: 5000 });
      expect(store.getTtlMs()).toBe(5000);
    });
  });
});

// ============================================================================
// Section 2: Unit tests with mocked ioredis (always runs)
// ============================================================================

describe('RedisSessionStore with mocked ioredis', () => {
  // We test the compiled JS module by mocking the ioredis require
  // Since the code uses dynamic import, we intercept at the module level

  let mockRedisInstance: any;
  let RedisSessionStore: any;
  let serializeSessionState: any;

  beforeEach(async () => {
    // Create a fresh mock Redis instance for each test
    mockRedisInstance = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
      scan: vi.fn().mockResolvedValue(['0', []]),
      quit: vi.fn().mockResolvedValue('OK'),
      connect: vi.fn().mockResolvedValue(undefined),
      status: 'ready',
    };

    // Clear module cache to get fresh imports
    const redisStoreKey = Object.keys(require.cache).find(k => k.includes('RedisSessionStore'));
    if (redisStoreKey) delete require.cache[redisStoreKey];

    // We need to test using the actual module but mock the ioredis dependency
    // Since the code uses dynamic import('ioredis'), we mock at runtime
    const mod = require(redisStoreJsPath);
    RedisSessionStore = mod.RedisSessionStore;

    const storeMod = require(sessionStoreJsPath);
    serializeSessionState = storeMod.serializeSessionState;
  });

  function createStoreWithMock(): any {
    const store = new RedisSessionStore({ url: 'redis://mock:6379' });
    // Inject mock client directly to bypass dynamic import
    (store as any).client = mockRedisInstance;
    (store as any).connectPromise = Promise.resolve(mockRedisInstance);
    return store;
  }

  describe('get()', () => {
    it('returns undefined for missing keys', async () => {
      const store = createStoreWithMock();
      mockRedisInstance.get.mockResolvedValue(null);

      const result = await store.get('nonexistent');
      expect(result).toBeUndefined();
      expect(mockRedisInstance.get).toHaveBeenCalledWith('evokore:session:nonexistent');
    });

    it('deserializes stored JSON correctly', async () => {
      const store = createStoreWithMock();
      const state = createTestSessionState('test-1');
      state.activatedTools.add('tool-a');
      state.role = 'admin';
      state.metadata.set('key', 'value');

      const serialized = serializeSessionState(state);
      mockRedisInstance.get.mockResolvedValue(JSON.stringify(serialized));

      const result = await store.get('test-1');
      expect(result).toBeDefined();
      expect(result!.sessionId).toBe('test-1');
      expect(result!.activatedTools).toBeInstanceOf(Set);
      expect(result!.activatedTools.has('tool-a')).toBe(true);
      expect(result!.role).toBe('admin');
      expect(result!.metadata).toBeInstanceOf(Map);
      expect(result!.metadata.get('key')).toBe('value');
    });

    it('returns undefined on parse errors', async () => {
      const store = createStoreWithMock();
      mockRedisInstance.get.mockResolvedValue('not-valid-json{{{');

      const result = await store.get('bad-json');
      expect(result).toBeUndefined();
    });

    it('returns undefined when Redis throws', async () => {
      const store = createStoreWithMock();
      mockRedisInstance.get.mockRejectedValue(new Error('Connection refused'));

      const result = await store.get('error-key');
      expect(result).toBeUndefined();
    });
  });

  describe('set()', () => {
    it('serializes and stores with TTL', async () => {
      const store = createStoreWithMock();
      const state = createTestSessionState('set-test');
      state.activatedTools.add('tool-b');
      state.role = 'developer';

      await store.set('set-test', state);

      expect(mockRedisInstance.set).toHaveBeenCalledTimes(1);
      const [key, value, pxFlag, ttl] = mockRedisInstance.set.mock.calls[0];
      expect(key).toBe('evokore:session:set-test');
      expect(pxFlag).toBe('PX');
      expect(ttl).toBe(3600000);

      // Verify the stored value is valid JSON with correct fields
      const parsed = JSON.parse(value);
      expect(parsed.sessionId).toBe('set-test');
      expect(parsed.activatedTools).toContain('tool-b');
      expect(parsed.role).toBe('developer');
    });

    it('uses custom TTL', async () => {
      const store = new RedisSessionStore({ ttlMs: 5000 });
      (store as any).client = mockRedisInstance;
      (store as any).connectPromise = Promise.resolve(mockRedisInstance);

      await store.set('ttl-test', createTestSessionState('ttl-test'));

      const [, , , ttl] = mockRedisInstance.set.mock.calls[0];
      expect(ttl).toBe(5000);
    });

    it('uses custom keyPrefix', async () => {
      const store = new RedisSessionStore({ keyPrefix: 'myapp' });
      (store as any).client = mockRedisInstance;
      (store as any).connectPromise = Promise.resolve(mockRedisInstance);

      await store.set('prefix-test', createTestSessionState('prefix-test'));

      const [key] = mockRedisInstance.set.mock.calls[0];
      expect(key).toBe('myapp:session:prefix-test');
    });

    it('swallows write errors silently', async () => {
      const store = createStoreWithMock();
      mockRedisInstance.set.mockRejectedValue(new Error('Write error'));

      // Should not throw
      await expect(store.set('fail-test', createTestSessionState('fail-test'))).resolves.toBeUndefined();
    });
  });

  describe('delete()', () => {
    it('calls DEL with correct key', async () => {
      const store = createStoreWithMock();
      await store.delete('del-test');

      expect(mockRedisInstance.del).toHaveBeenCalledWith('evokore:session:del-test');
    });

    it('swallows delete errors silently', async () => {
      const store = createStoreWithMock();
      mockRedisInstance.del.mockRejectedValue(new Error('Delete error'));

      await expect(store.delete('error-delete')).resolves.toBeUndefined();
    });
  });

  describe('list()', () => {
    it('uses SCAN and extracts session IDs', async () => {
      const store = createStoreWithMock();
      mockRedisInstance.scan
        .mockResolvedValueOnce(['42', ['evokore:session:a', 'evokore:session:b']])
        .mockResolvedValueOnce(['0', ['evokore:session:c']]);

      const ids = await store.list();

      expect(ids).toContain('a');
      expect(ids).toContain('b');
      expect(ids).toContain('c');
      expect(ids.length).toBe(3);

      // Verify SCAN was called with correct pattern
      expect(mockRedisInstance.scan).toHaveBeenCalledWith('0', 'MATCH', 'evokore:session:*', 'COUNT', 100);
    });

    it('returns empty array on connection error', async () => {
      const store = createStoreWithMock();
      mockRedisInstance.scan.mockRejectedValue(new Error('Connection error'));

      const ids = await store.list();
      expect(ids).toEqual([]);
    });

    it('handles empty scan result', async () => {
      const store = createStoreWithMock();
      mockRedisInstance.scan.mockResolvedValueOnce(['0', []]);

      const ids = await store.list();
      expect(ids).toEqual([]);
    });

    it('uses custom keyPrefix in SCAN pattern', async () => {
      const store = new RedisSessionStore({ keyPrefix: 'custom' });
      (store as any).client = mockRedisInstance;
      (store as any).connectPromise = Promise.resolve(mockRedisInstance);

      mockRedisInstance.scan.mockResolvedValueOnce(['0', ['custom:session:x']]);

      const ids = await store.list();
      expect(ids).toEqual(['x']);
      expect(mockRedisInstance.scan).toHaveBeenCalledWith('0', 'MATCH', 'custom:session:*', 'COUNT', 100);
    });
  });

  describe('cleanup()', () => {
    it('removes sessions older than maxAgeMs', async () => {
      const store = createStoreWithMock();
      const now = Date.now();

      const oldState = createTestSessionState('old', { lastAccessedAt: now - 120000 });
      const freshState = createTestSessionState('fresh', { lastAccessedAt: now });

      const oldSerialized = serializeSessionState(oldState);
      const freshSerialized = serializeSessionState(freshState);

      mockRedisInstance.scan.mockResolvedValueOnce([
        '0',
        ['evokore:session:old', 'evokore:session:fresh'],
      ]);
      mockRedisInstance.get
        .mockResolvedValueOnce(JSON.stringify(oldSerialized))
        .mockResolvedValueOnce(JSON.stringify(freshSerialized));

      const removed = await store.cleanup(60000);
      expect(removed).toBe(1);

      // DEL should have been called only for the old session
      expect(mockRedisInstance.del).toHaveBeenCalledWith('evokore:session:old');
      expect(mockRedisInstance.del).toHaveBeenCalledTimes(1);
    });

    it('returns 0 when no sessions are expired', async () => {
      const store = createStoreWithMock();
      const freshState = createTestSessionState('fresh');
      const freshSerialized = serializeSessionState(freshState);

      mockRedisInstance.scan.mockResolvedValueOnce(['0', ['evokore:session:fresh']]);
      mockRedisInstance.get.mockResolvedValueOnce(JSON.stringify(freshSerialized));

      const removed = await store.cleanup(60000);
      expect(removed).toBe(0);
    });

    it('returns 0 on connection error', async () => {
      const store = createStoreWithMock();
      mockRedisInstance.scan.mockRejectedValue(new Error('scan failed'));

      const removed = await store.cleanup(60000);
      expect(removed).toBe(0);
    });
  });

  describe('disconnect()', () => {
    it('calls quit on the client', async () => {
      const store = createStoreWithMock();
      await store.disconnect();

      expect(mockRedisInstance.quit).toHaveBeenCalled();
    });

    it('clears client reference after disconnect', async () => {
      const store = createStoreWithMock();
      await store.disconnect();

      // Client should be null after disconnect
      expect((store as any).client).toBeNull();
      expect((store as any).connectPromise).toBeNull();
    });

    it('handles quit errors gracefully', async () => {
      const store = createStoreWithMock();
      mockRedisInstance.quit.mockRejectedValue(new Error('quit failed'));

      // Should not throw
      await expect(store.disconnect()).resolves.toBeUndefined();
    });

    it('is idempotent when client is not connected', async () => {
      const { RedisSessionStore } = require(redisStoreJsPath);
      const store = new RedisSessionStore();
      // No client was ever created
      await expect(store.disconnect()).resolves.toBeUndefined();
    });
  });

  describe('lazy connection', () => {
    it('does not connect on construction', () => {
      const { RedisSessionStore } = require(redisStoreJsPath);
      const store = new RedisSessionStore();

      expect((store as any).client).toBeNull();
      expect((store as any).connectPromise).toBeNull();
    });
  });
});

// ============================================================================
// Section 3: Integration tests (gated on EVOKORE_REDIS_URL)
// ============================================================================

describe.skipIf(!process.env.EVOKORE_REDIS_URL)('RedisSessionStore Integration (live Redis)', () => {
  let RedisSessionStore: any;
  let store: any;
  const testPrefix = `evokore-test-${Date.now()}-${process.pid}`;

  beforeEach(async () => {
    const mod = require(redisStoreJsPath);
    RedisSessionStore = mod.RedisSessionStore;
    store = new RedisSessionStore({
      url: process.env.EVOKORE_REDIS_URL,
      keyPrefix: testPrefix,
      ttlMs: 60000,
    });
  });

  afterEach(async () => {
    if (store) {
      // Clean up test keys
      const ids = await store.list();
      for (const id of ids) {
        await store.delete(id);
      }
      await store.disconnect();
    }
  });

  it('round-trips a session state with all field types', async () => {
    const state = createTestSessionState('integration-1');
    state.activatedTools.add('tool-x');
    state.activatedTools.add('tool-y');
    state.role = 'developer';
    state.rateLimitCounters.set('tool-x', { tokens: 5, lastRefillAt: Date.now() });
    state.metadata.set('client', 'vscode');

    await store.set('integration-1', state);
    const retrieved = await store.get('integration-1');

    expect(retrieved).toBeDefined();
    expect(retrieved!.sessionId).toBe('integration-1');
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

  it('cross-instance persistence', async () => {
    const state = createTestSessionState('cross-instance');
    state.role = 'admin';
    state.activatedTools.add('shared-tool');

    await store.set('cross-instance', state);

    // Create a second store instance pointing at the same Redis
    const secondStore = new RedisSessionStore({
      url: process.env.EVOKORE_REDIS_URL,
      keyPrefix: testPrefix,
      ttlMs: 60000,
    });

    const retrieved = await secondStore.get('cross-instance');
    expect(retrieved).toBeDefined();
    expect(retrieved!.sessionId).toBe('cross-instance');
    expect(retrieved!.role).toBe('admin');
    expect(retrieved!.activatedTools.has('shared-tool')).toBe(true);

    await secondStore.disconnect();
  });

  it('delete removes a session', async () => {
    await store.set('to-delete', createTestSessionState('to-delete'));
    expect(await store.get('to-delete')).toBeDefined();

    await store.delete('to-delete');
    expect(await store.get('to-delete')).toBeUndefined();
  });

  it('list returns all stored session IDs', async () => {
    await store.set('alpha', createTestSessionState('alpha'));
    await store.set('beta', createTestSessionState('beta'));
    await store.set('gamma', createTestSessionState('gamma'));

    const ids = await store.list();
    expect(ids).toContain('alpha');
    expect(ids).toContain('beta');
    expect(ids).toContain('gamma');
    expect(ids.length).toBe(3);
  });

  it('cleanup removes stale sessions', async () => {
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

  it('concurrent writes do not throw', async () => {
    const writes = Array.from({ length: 10 }, (_, i) => {
      const state = createTestSessionState('concurrent');
      state.role = i % 2 === 0 ? 'developer' : 'admin';
      return store.set('concurrent', state);
    });

    await expect(Promise.all(writes)).resolves.toBeDefined();

    const result = await store.get('concurrent');
    expect(result).toBeDefined();
    expect(['developer', 'admin']).toContain(result!.role);
  });
});

// ============================================================================
// Section 4: Env documentation sync
// ============================================================================

describe('RedisSessionStore env documentation', () => {
  const envExample = fs.readFileSync(envExamplePath, 'utf8');

  it('EVOKORE_REDIS_URL is documented in env example', () => {
    expect(envExample).toContain('EVOKORE_REDIS_URL');
  });

  it('EVOKORE_REDIS_KEY_PREFIX is documented in env example', () => {
    expect(envExample).toContain('EVOKORE_REDIS_KEY_PREFIX');
  });

  it('EVOKORE_SESSION_STORE documents redis as an option', () => {
    // The comment line and the variable line may be on separate lines,
    // so check that "redis" appears in the session store section
    expect(envExample).toContain('EVOKORE_SESSION_STORE');
    expect(envExample).toMatch(/Options:.*redis/);
  });

  it('index.ts wiring references EVOKORE_REDIS_URL', () => {
    const indexSrc = fs.readFileSync(indexTsPath, 'utf8');
    expect(indexSrc).toContain('EVOKORE_REDIS_URL');
  });

  it('index.ts wiring references EVOKORE_REDIS_KEY_PREFIX', () => {
    const indexSrc = fs.readFileSync(indexTsPath, 'utf8');
    expect(indexSrc).toContain('EVOKORE_REDIS_KEY_PREFIX');
  });

  it('index.ts has redis store type branch', () => {
    const indexSrc = fs.readFileSync(indexTsPath, 'utf8');
    expect(indexSrc).toMatch(/storeOverride\s*===\s*["']redis["']/);
  });
});
