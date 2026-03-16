/**
 * HTTP Pipeline Benchmark
 *
 * Measures latency of the core middleware components that make up the
 * EVOKORE-MCP HTTP pipeline:
 *   - Session Isolation (create, get, destroy)
 *   - OAuth token extraction and static validation
 *   - RBAC permission checks
 *   - Rate limit token bucket operations
 *
 * This is a measurement test, not a performance gate. It runs 100
 * sequential iterations through the middleware chain and reports
 * average, p50, p95, and p99 latencies.
 */

import { describe, it, expect } from 'vitest';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const sessionIsolationJsPath = path.join(ROOT, 'dist', 'SessionIsolation.js');
const oauthProviderJsPath = path.join(ROOT, 'dist', 'auth', 'OAuthProvider.js');
const securityManagerJsPath = path.join(ROOT, 'dist', 'SecurityManager.js');
const proxyManagerJsPath = path.join(ROOT, 'dist', 'ProxyManager.js');

const ITERATIONS = 100;

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function reportLatencies(label: string, durationsNs: number[]) {
  const durationsMs = durationsNs.map((ns) => ns / 1e6);
  durationsMs.sort((a, b) => a - b);

  const avg = durationsMs.reduce((s, v) => s + v, 0) / durationsMs.length;
  const p50 = percentile(durationsMs, 50);
  const p95 = percentile(durationsMs, 95);
  const p99 = percentile(durationsMs, 99);

  console.log(
    `  [${label}] avg=${avg.toFixed(3)}ms  p50=${p50.toFixed(3)}ms  p95=${p95.toFixed(3)}ms  p99=${p99.toFixed(3)}ms  (n=${durationsMs.length})`
  );

  return { avg, p50, p95, p99 };
}

describe('HTTP Pipeline Benchmark', () => {
  // ---- Session Isolation benchmark ----

  it('measures SessionIsolation create/get/destroy cycle latency', () => {
    const { SessionIsolation } = require(sessionIsolationJsPath);
    const isolation = new SessionIsolation({ ttlMs: 60_000, maxSessions: 200 });
    const durations: number[] = [];

    for (let i = 0; i < ITERATIONS; i++) {
      const sessionId = `bench-session-${i}`;
      const start = process.hrtime.bigint();

      // Simulate the full session lifecycle
      isolation.createSession(sessionId, i % 2 === 0 ? 'admin' : 'developer');
      const session = isolation.getSession(sessionId);
      if (session) {
        session.activatedTools.add(`tool-${i}`);
        session.rateLimitCounters.set(`server/tool-${i}`, { tokens: 10, lastRefillAt: Date.now() });
      }
      isolation.destroySession(sessionId);

      const end = process.hrtime.bigint();
      durations.push(Number(end - start));
    }

    const stats = reportLatencies('SessionIsolation lifecycle', durations);
    // Sanity check: each cycle should be well under 10ms
    expect(stats.p99).toBeLessThan(10);
  });

  // ---- OAuth token extraction benchmark ----

  it('measures OAuth token extraction and static validation latency', () => {
    const { extractBearerToken, validateToken } = require(oauthProviderJsPath);
    const config = {
      required: true,
      mode: 'static' as const,
      staticToken: 'benchmark-secret-token-value-for-testing',
    };

    const durations: number[] = [];
    const validHeader = `Bearer ${config.staticToken}`;
    const invalidHeader = 'Bearer wrong-token-value';

    for (let i = 0; i < ITERATIONS; i++) {
      const header = i % 2 === 0 ? validHeader : invalidHeader;
      const start = process.hrtime.bigint();

      const token = extractBearerToken(header);
      if (token) {
        validateToken(token, config);
      }

      const end = process.hrtime.bigint();
      durations.push(Number(end - start));
    }

    const stats = reportLatencies('OAuth static auth', durations);
    // Token extraction + comparison should be sub-millisecond
    expect(stats.p99).toBeLessThan(5);
  });

  // ---- RBAC permission check benchmark ----

  it('measures RBAC permission check latency', () => {
    const { SecurityManager } = require(securityManagerJsPath);
    const security = new SecurityManager();

    // Manually populate rules and roles for benchmarking
    // (loadPermissions reads from disk, which we skip for pure CPU measurement)
    const rules: Record<string, string> = {};
    const roles = new Map();

    // Create realistic rule set
    for (let i = 0; i < 50; i++) {
      rules[`server_tool_${i}`] = i % 5 === 0 ? 'require_approval' : 'allow';
    }
    rules['dangerous_tool'] = 'deny';

    roles.set('admin', {
      description: 'Full access',
      default_permission: 'allow',
      overrides: { dangerous_tool: 'require_approval' },
    });
    roles.set('developer', {
      description: 'Standard access',
      default_permission: 'allow',
      overrides: { dangerous_tool: 'deny' },
    });
    roles.set('readonly', {
      description: 'Read only',
      default_permission: 'deny',
      overrides: {},
    });

    // Inject rules and roles via internal state (for benchmarking only)
    (security as any).rules = rules;
    (security as any).roles = roles;
    (security as any).activeRole = 'developer';

    const durations: number[] = [];
    const toolNames = Object.keys(rules).concat(['unknown_tool', 'dangerous_tool']);

    for (let i = 0; i < ITERATIONS; i++) {
      const toolName = toolNames[i % toolNames.length];
      const role = i % 3 === 0 ? 'admin' : i % 3 === 1 ? 'developer' : 'readonly';

      const start = process.hrtime.bigint();
      security.checkPermission(toolName, role);
      const end = process.hrtime.bigint();

      durations.push(Number(end - start));
    }

    const stats = reportLatencies('RBAC permission check', durations);
    // Permission checks are pure map lookups, should be very fast
    expect(stats.p99).toBeLessThan(5);
  });

  // ---- TokenBucket rate limit benchmark ----

  it('measures TokenBucket rate limit check latency', () => {
    const { TokenBucket } = require(proxyManagerJsPath);
    const durations: number[] = [];

    // Create a bucket with high capacity so we don't exhaust it during the benchmark
    const bucket = new TokenBucket(1000, 1000);

    for (let i = 0; i < ITERATIONS; i++) {
      const start = process.hrtime.bigint();
      bucket.tryConsume();
      const end = process.hrtime.bigint();
      durations.push(Number(end - start));
    }

    const stats = reportLatencies('TokenBucket tryConsume', durations);
    // Token bucket operations are O(1), should be sub-millisecond
    expect(stats.p99).toBeLessThan(5);
  });

  // ---- Combined pipeline simulation ----

  it('measures combined middleware chain latency (session + auth + RBAC + rate limit)', () => {
    const { SessionIsolation } = require(sessionIsolationJsPath);
    const { extractBearerToken, validateToken } = require(oauthProviderJsPath);
    const { SecurityManager } = require(securityManagerJsPath);
    const { TokenBucket } = require(proxyManagerJsPath);

    // Set up components
    const isolation = new SessionIsolation({ ttlMs: 60_000, maxSessions: 200 });
    const security = new SecurityManager();
    (security as any).rules = { test_tool: 'allow' };
    (security as any).roles = new Map([
      ['developer', { description: 'Dev', default_permission: 'allow', overrides: {} }],
    ]);
    (security as any).activeRole = 'developer';

    const authConfig = {
      required: true,
      mode: 'static' as const,
      staticToken: 'pipeline-bench-token',
    };
    const bucket = new TokenBucket(1000, 1000);
    const authHeader = `Bearer ${authConfig.staticToken}`;

    // Pre-create a session
    const sessionId = 'bench-combined-session';
    isolation.createSession(sessionId, 'developer');

    const durations: number[] = [];

    for (let i = 0; i < ITERATIONS; i++) {
      const start = process.hrtime.bigint();

      // Step 1: Auth - extract and validate token
      const token = extractBearerToken(authHeader);
      const authValid = token ? validateToken(token, authConfig) : false;

      // Step 2: Session - retrieve session state
      const session = isolation.getSession(sessionId);

      // Step 3: RBAC - check permission
      const permission = security.checkPermission('test_tool', session?.role);

      // Step 4: Rate limit - check bucket
      const allowed = bucket.tryConsume();

      const end = process.hrtime.bigint();
      durations.push(Number(end - start));

      // Verify the pipeline works correctly
      if (i === 0) {
        expect(authValid).toBe(true);
        expect(session).not.toBeNull();
        expect(permission).toBe('allow');
        expect(allowed).toBe(true);
      }
    }

    const stats = reportLatencies('Combined pipeline', durations);
    // Combined middleware should complete well under 10ms per request
    expect(stats.p99).toBeLessThan(10);

    // Clean up
    isolation.destroySession(sessionId);

    // Summary
    console.log('\n  Pipeline benchmark complete:');
    console.log(`    ${ITERATIONS} sequential requests through auth + session + RBAC + rate limit`);
    console.log(`    Average latency: ${stats.avg.toFixed(3)}ms`);
    console.log(`    p50: ${stats.p50.toFixed(3)}ms  p95: ${stats.p95.toFixed(3)}ms  p99: ${stats.p99.toFixed(3)}ms`);
  });
});
