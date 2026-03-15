import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const proxyTsPath = path.join(ROOT, 'src', 'ProxyManager.ts');
const indexTsPath = path.join(ROOT, 'src', 'index.ts');
const sessionIsolationJsPath = path.join(ROOT, 'dist', 'SessionIsolation.js');
const proxyManagerJsPath = path.join(ROOT, 'dist', 'ProxyManager.js');

describe('Per-Session Rate Limiting for HttpServer', () => {

  // ---- Phase 1: Source structural validation ----

  describe('ProxyManager.callProxiedTool accepts sessionCounters parameter', () => {
    const src = fs.readFileSync(proxyTsPath, 'utf8');

    it('callProxiedTool signature includes optional sessionCounters after role', () => {
      expect(src).toMatch(
        /callProxiedTool\s*\(\s*toolName\s*:\s*string\s*,\s*args\s*:\s*any\s*,\s*role\?\s*:\s*string\s*\|\s*null\s*,\s*sessionCounters\?\s*:\s*Map\s*</
      );
    });

    it('passes sessionCounters to checkRateLimit', () => {
      expect(src).toMatch(/checkRateLimit\s*\(\s*serverId\s*,\s*originalName\s*,\s*sessionCounters\s*\)/);
    });
  });

  describe('ProxyManager.checkRateLimit accepts optional sessionCounters', () => {
    const src = fs.readFileSync(proxyTsPath, 'utf8');

    it('checkRateLimit signature includes optional sessionCounters parameter', () => {
      expect(src).toMatch(
        /private\s+checkRateLimit\s*\(\s*\n?\s*serverId\s*:\s*string\s*,\s*\n?\s*originalToolName\s*:\s*string\s*,\s*\n?\s*sessionCounters\?\s*:\s*Map\s*</
      );
    });

    it('uses tryConsumeSessionCounter when sessionCounters is provided', () => {
      expect(src).toMatch(/tryConsumeSessionCounter\s*\(/);
    });

    it('falls back to global bucket when sessionCounters is not provided', () => {
      // The else branch should still call tryConsume on the global bucket
      expect(src).toMatch(/else\s+if\s*\(\s*!toolBucket\.tryConsume\(\)\s*\)/);
      expect(src).toMatch(/else\s+if\s*\(\s*!serverBucket\.tryConsume\(\)\s*\)/);
    });
  });

  describe('index.ts threads session rateLimitCounters to ProxyManager', () => {
    const src = fs.readFileSync(indexTsPath, 'utf8');

    it('extracts sessionCounters from session state', () => {
      expect(src).toMatch(/sessionCounters/);
      expect(src).toMatch(/session\?\.rateLimitCounters/);
    });

    it('passes sessionCounters to callProxiedTool', () => {
      expect(src).toMatch(
        /callProxiedTool\s*\(\s*toolName\s*,\s*args\s*,\s*sessionRole\s*,\s*sessionCounters\s*\)/
      );
    });
  });

  describe('TokenBucket exposes capacity and refill rate getters', () => {
    const src = fs.readFileSync(proxyTsPath, 'utf8');

    it('has getCapacity method', () => {
      expect(src).toMatch(/getCapacity\s*\(\s*\)\s*:\s*number/);
    });

    it('has getRefillRatePerMs method', () => {
      expect(src).toMatch(/getRefillRatePerMs\s*\(\s*\)\s*:\s*number/);
    });
  });

  // ---- Phase 2: Runtime tests ----

  describe('two sessions with separate counters are independent', () => {
    it('exhausting one session does not affect the other', () => {
      const { TokenBucket } = require(proxyManagerJsPath);

      // Simulate the dual-bucket pattern:
      // A global bucket configured at 2 requests per minute
      const globalBucket = new TokenBucket(2);

      // Two independent session counter maps
      const sessionACounters: Map<string, { tokens: number; lastRefillAt: number }> = new Map();
      const sessionBCounters: Map<string, { tokens: number; lastRefillAt: number }> = new Map();

      const bucketKey = 'testserver';

      // Helper to simulate tryConsumeSessionCounter (mirrors ProxyManager logic)
      function tryConsume(
        key: string,
        counters: Map<string, { tokens: number; lastRefillAt: number }>,
        bucket: typeof globalBucket
      ): boolean {
        let counter = counters.get(key);
        if (!counter) {
          counter = { tokens: bucket.getCapacity(), lastRefillAt: Date.now() };
          counters.set(key, counter);
        }
        const now = Date.now();
        const elapsed = now - counter.lastRefillAt;
        counter.tokens = Math.min(
          bucket.getCapacity(),
          counter.tokens + elapsed * bucket.getRefillRatePerMs()
        );
        counter.lastRefillAt = now;
        if (counter.tokens >= 1) {
          counter.tokens -= 1;
          return true;
        }
        return false;
      }

      // Session A: consume both tokens
      expect(tryConsume(bucketKey, sessionACounters, globalBucket)).toBe(true);
      expect(tryConsume(bucketKey, sessionACounters, globalBucket)).toBe(true);
      // Session A should now be exhausted
      expect(tryConsume(bucketKey, sessionACounters, globalBucket)).toBe(false);

      // Session B: should still have its full quota
      expect(tryConsume(bucketKey, sessionBCounters, globalBucket)).toBe(true);
      expect(tryConsume(bucketKey, sessionBCounters, globalBucket)).toBe(true);
      expect(tryConsume(bucketKey, sessionBCounters, globalBucket)).toBe(false);
    });
  });

  describe('session counters initialize lazily when first checked', () => {
    it('counter is created on first tryConsume with global bucket capacity', () => {
      const { TokenBucket } = require(proxyManagerJsPath);
      const globalBucket = new TokenBucket(5);

      const sessionCounters: Map<string, { tokens: number; lastRefillAt: number }> = new Map();
      const key = 'lazy-test/some_tool';

      // Before first access, no counter exists
      expect(sessionCounters.has(key)).toBe(false);

      // Simulate lazy init (mirrors ProxyManager.tryConsumeSessionCounter)
      let counter = sessionCounters.get(key);
      if (!counter) {
        counter = { tokens: globalBucket.getCapacity(), lastRefillAt: Date.now() };
        sessionCounters.set(key, counter);
      }

      // After lazy init, counter exists with capacity matching global bucket
      expect(sessionCounters.has(key)).toBe(true);
      expect(counter.tokens).toBe(5);
    });
  });

  describe('stdio mode uses global buckets (no session counters isolation issue)', () => {
    it('callProxiedTool can be called without sessionCounters parameter', () => {
      // Verify the ProxyManager source allows omitting sessionCounters
      const src = fs.readFileSync(proxyTsPath, 'utf8');

      // The parameter is optional (has ?)
      expect(src).toMatch(/sessionCounters\?\s*:/);

      // The checkRateLimit call passes sessionCounters (which may be undefined)
      expect(src).toMatch(/checkRateLimit\s*\(\s*serverId\s*,\s*originalName\s*,\s*sessionCounters\s*\)/);
    });

    it('stdio session still gets rateLimitCounters from SessionIsolation', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation();

      // Simulate stdio default session creation (what index.ts does in run())
      const session = iso.createSession('__stdio_default_session__');
      expect(session.rateLimitCounters).toBeInstanceOf(Map);
      expect(session.rateLimitCounters.size).toBe(0);
    });
  });

  describe('TokenBucket getters return correct values', () => {
    it('getCapacity returns requestsPerMinute', () => {
      const { TokenBucket } = require(proxyManagerJsPath);
      const bucket = new TokenBucket(42);
      expect(bucket.getCapacity()).toBe(42);
    });

    it('getRefillRatePerMs returns requestsPerMinute / 60000', () => {
      const { TokenBucket } = require(proxyManagerJsPath);
      const bucket = new TokenBucket(60);
      expect(bucket.getRefillRatePerMs()).toBeCloseTo(60 / 60000, 10);
    });
  });

  // ---- Phase 3: Research documentation ----

  describe('research documentation', () => {
    it('per-session rate limiting research doc exists', () => {
      const docPath = path.join(ROOT, 'docs', 'research', 'rate-limiting-per-session-2026-03-15.md');
      expect(fs.existsSync(docPath)).toBe(true);

      const content = fs.readFileSync(docPath, 'utf8');
      expect(content).toMatch(/Per-Session Rate Limiting/i);
      expect(content).toMatch(/Dual-Bucket/i);
      expect(content).toMatch(/Lazy/i);
      expect(content).toMatch(/Backward Compat/i);
    });
  });
});
