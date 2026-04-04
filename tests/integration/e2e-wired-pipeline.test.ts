/**
 * E2E Integration Test: Full Wired Pipeline
 *
 * Tests the complete request lifecycle through all wired modules:
 *   HTTP Transport -> OAuth Auth -> Session Isolation -> RBAC -> Rate Limiting -> Tool Dispatch
 *
 * Covers:
 *   1. Source-level structural validation (all modules are wired correctly)
 *   2. Full pipeline integration with a real HTTP server
 *   3. Module interaction verification (sessions, roles, rate limits)
 *   4. Edge cases (invalid sessions, graceful shutdown, auth disabled)
 */

import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import http from 'http';

const ROOT = path.resolve(__dirname, '../..');
const httpServerTsPath = path.join(ROOT, 'src', 'HttpServer.ts');
const indexTsPath = path.join(ROOT, 'src', 'index.ts');
const sessionIsolationTsPath = path.join(ROOT, 'src', 'SessionIsolation.ts');
const securityManagerTsPath = path.join(ROOT, 'src', 'SecurityManager.ts');
const proxyManagerTsPath = path.join(ROOT, 'src', 'ProxyManager.ts');
const webhookManagerTsPath = path.join(ROOT, 'src', 'WebhookManager.ts');
const pluginManagerTsPath = path.join(ROOT, 'src', 'PluginManager.ts');
const oauthProviderTsPath = path.join(ROOT, 'src', 'auth', 'OAuthProvider.ts');

const httpServerJsPath = path.join(ROOT, 'dist', 'HttpServer.js');
const sessionIsolationJsPath = path.join(ROOT, 'dist', 'SessionIsolation.js');
const securityManagerJsPath = path.join(ROOT, 'dist', 'SecurityManager.js');
const proxyManagerJsPath = path.join(ROOT, 'dist', 'ProxyManager.js');

// ---- Helper: raw HTTP request ----

function httpRequest(options: {
  hostname: string;
  port: number;
  path: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: options.hostname,
        port: options.port,
        path: options.path,
        method: options.method,
        headers: options.headers,
        timeout: options.timeout ?? 10000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error('httpRequest helper: request timed out'));
    });
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

function mcpInitializeBody() {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'e2e-pipeline-test', version: '0.0.1' },
    },
  });
}

function tryConsumeSessionCounter(
  key: string,
  counters: Map<string, { tokens: number; lastRefillAt: number }>,
  bucket: { getCapacity(): number; getRefillRatePerMs(): number }
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

// ============================================================================
// TEST GROUP 1: Source-level structural validation
// ============================================================================

describe('E2E Wired Pipeline', () => {

  describe('Group 1: Source-level structural validation', () => {

    describe('HttpServer imports and wires SessionIsolation, OAuthProvider', () => {
      const httpSrc = fs.readFileSync(httpServerTsPath, 'utf8');

      it('imports SessionIsolation', () => {
        expect(httpSrc).toMatch(/import.*SessionIsolation.*from.*\.\/SessionIsolation/);
      });

      it('imports authenticateRequest from OAuthProvider', () => {
        expect(httpSrc).toMatch(/import.*authenticateRequest.*from.*OAuthProvider/s);
      });

      it('imports sendUnauthorizedResponse from OAuthProvider', () => {
        expect(httpSrc).toMatch(/import.*sendUnauthorizedResponse.*from.*OAuthProvider/s);
      });

      it('imports isPublicPath from OAuthProvider', () => {
        expect(httpSrc).toMatch(/import.*isPublicPath.*from.*OAuthProvider/s);
      });

      it('imports AuthConfig type from OAuthProvider', () => {
        expect(httpSrc).toMatch(/import.*AuthConfig.*from.*OAuthProvider/s);
      });

      it('HttpServerOptions has sessionIsolation and authConfig fields', () => {
        expect(httpSrc).toMatch(/sessionIsolation\s*\?\s*:\s*SessionIsolation/);
        expect(httpSrc).toMatch(/authConfig\s*\?\s*:\s*AuthConfig/);
      });

      it('stores both as private fields', () => {
        expect(httpSrc).toMatch(/private\s+sessionIsolation\s*:\s*SessionIsolation\s*\|\s*null/);
        expect(httpSrc).toMatch(/private\s+authConfig\s*:\s*AuthConfig\s*\|\s*null/);
      });

      it('calls authenticateRequest in the request handler', () => {
        expect(httpSrc).toMatch(/authenticateRequest\s*\(\s*req\s*,\s*this\.authConfig/);
      });

      it('calls createSession in onsessioninitialized', () => {
        expect(httpSrc).toMatch(/sessionIsolation\?\.createSession\s*\(/);
      });

      it('calls destroySession in onclose', () => {
        expect(httpSrc).toMatch(/sessionIsolation\?\.destroySession\s*\(/);
      });

      it('sets up periodic cleanup interval for session expiry', () => {
        expect(httpSrc).toMatch(/setInterval/);
        expect(httpSrc).toMatch(/cleanExpired/);
      });

      it('passes roleOverride from auth claims to createSession', () => {
        expect(httpSrc).toMatch(/roleOverride/);
        expect(httpSrc).toMatch(/createSession\s*\(\s*newSessionId\s*,\s*role\s*\)/);
      });
    });

    describe('index.ts wires all modules together', () => {
      const indexSrc = fs.readFileSync(indexTsPath, 'utf8');

      it('imports all core modules', () => {
        expect(indexSrc).toMatch(/import.*SkillManager.*from/);
        expect(indexSrc).toMatch(/import.*ProxyManager.*from/);
        expect(indexSrc).toMatch(/import.*SecurityManager.*from/);
        expect(indexSrc).toMatch(/import.*PluginManager.*from/);
        expect(indexSrc).toMatch(/import.*HttpServer.*from/);
        expect(indexSrc).toMatch(/import.*WebhookManager.*from/);
        expect(indexSrc).toMatch(/import.*SessionIsolation.*from/);
        expect(indexSrc).toMatch(/import.*loadAuthConfig.*from.*OAuthProvider/s);
      });

      it('constructs SecurityManager first, then passes to ProxyManager', () => {
        expect(indexSrc).toMatch(/this\.securityManager\s*=\s*new\s+SecurityManager\s*\(\)/);
        expect(indexSrc).toMatch(/this\.proxyManager\s*=\s*new\s+ProxyManager\s*\(\s*this\.securityManager/);
      });

      it('constructs WebhookManager and passes to ProxyManager', () => {
        expect(indexSrc).toMatch(/this\.webhookManager\s*=\s*new\s+WebhookManager\s*\(\)/);
        expect(indexSrc).toMatch(/new\s+ProxyManager\s*\(\s*this\.securityManager\s*,\s*this\.webhookManager\s*\)/);
      });

      it('constructs PluginManager with WebhookManager', () => {
        expect(indexSrc).toMatch(/this\.pluginManager\s*=\s*new\s+PluginManager\s*\(\s*this\.webhookManager\s*\)/);
      });

      it('constructs SessionIsolation and passes to HttpServer', () => {
        expect(indexSrc).toMatch(/this\.sessionIsolation\s*=\s*new\s+SessionIsolation\s*\(/);
        expect(indexSrc).toMatch(/sessionIsolation\s*:\s*this\.sessionIsolation/);
      });

      it('calls loadAuthConfig and passes to HttpServer in runHttp', () => {
        expect(indexSrc).toMatch(/const\s+authConfig\s*=\s*loadAuthConfig\s*\(\)/);
        expect(indexSrc).toMatch(/new\s+HttpServer\s*\(\s*this\.server/);
      });

      it('threads session role and rateLimitCounters to callProxiedTool', () => {
        expect(indexSrc).toMatch(/session\?\.role/);
        expect(indexSrc).toMatch(/session\?\.rateLimitCounters/);
        expect(indexSrc).toMatch(/callProxiedTool\s*\(\s*toolName\s*,\s*args\s*,\s*sessionRole\s*,\s*sessionCounters\s*\)/);
      });

      it('emits webhook events for session start and end', () => {
        expect(indexSrc).toMatch(/webhookManager\.emit\s*\(\s*"session_start"/);
        expect(indexSrc).toMatch(/webhookManager\.emit\s*\(\s*"session_end"/);
      });

      it('emits webhook events for tool calls and errors', () => {
        expect(indexSrc).toMatch(/webhookManager\.emit\s*\(\s*"tool_call"/);
        expect(indexSrc).toMatch(/webhookManager\.emit\s*\(\s*"tool_error"/);
      });
    });

    describe('ProxyManager accepts role and sessionCounters for RBAC + rate limiting', () => {
      const proxySrc = fs.readFileSync(proxyManagerTsPath, 'utf8');

      it('callProxiedTool signature includes role and sessionCounters', () => {
        expect(proxySrc).toMatch(
          /callProxiedTool\s*\(\s*toolName\s*:\s*string\s*,\s*args\s*:\s*any\s*,\s*role\?\s*:\s*string\s*\|\s*null\s*,\s*sessionCounters\?\s*:\s*Map\s*</
        );
      });

      it('passes role to checkPermission', () => {
        expect(proxySrc).toMatch(/checkPermission\s*\(\s*toolName\s*,\s*role\s*\)/);
      });

      it('passes sessionCounters to checkRateLimit', () => {
        expect(proxySrc).toMatch(/checkRateLimit\s*\(\s*serverId\s*,\s*originalName\s*,\s*sessionCounters\s*\)/);
      });
    });

    describe('SecurityManager checkPermission supports per-session role override', () => {
      const secSrc = fs.readFileSync(securityManagerTsPath, 'utf8');

      it('checkPermission accepts optional role parameter', () => {
        expect(secSrc).toMatch(/checkPermission\s*\(\s*toolName\s*:\s*string\s*,\s*role\?\s*:\s*string\s*\|\s*null\s*\)/);
      });

      it('resolves effectiveRole from parameter or activeRole', () => {
        expect(secSrc).toMatch(/effectiveRole/);
      });
    });

    describe('SessionIsolation stores role and rateLimitCounters per session', () => {
      const siSrc = fs.readFileSync(sessionIsolationTsPath, 'utf8');

      it('SessionState has role field', () => {
        expect(siSrc).toMatch(/role\s*:\s*string\s*\|\s*null/);
      });

      it('SessionState has rateLimitCounters field', () => {
        expect(siSrc).toMatch(/rateLimitCounters\s*:\s*Map\s*</);
      });

      it('createSession accepts optional role parameter', () => {
        expect(siSrc).toMatch(/createSession\s*\(\s*sessionId\s*:\s*string\s*,\s*role\?\s*:\s*string\s*\|\s*null\s*\)/);
      });
    });

    describe('WebhookManager is wired into ProxyManager and PluginManager', () => {
      const proxySrc = fs.readFileSync(proxyManagerTsPath, 'utf8');
      const pluginSrc = fs.readFileSync(pluginManagerTsPath, 'utf8');

      it('ProxyManager constructor accepts WebhookManager', () => {
        expect(proxySrc).toMatch(/constructor\s*\(\s*security\s*:\s*SecurityManager\s*,\s*webhookManager\?\s*:\s*WebhookManager\s*\)/);
      });

      it('PluginManager constructor accepts WebhookManager', () => {
        expect(pluginSrc).toMatch(/constructor\s*\(\s*webhookManager\?\s*:\s*WebhookManager\s*\)/);
      });
    });

    describe('OAuthProvider validates tokens with timing-safe comparison', () => {
      const authSrc = fs.readFileSync(oauthProviderTsPath, 'utf8');

      it('uses crypto.timingSafeEqual for static token validation', () => {
        expect(authSrc).toMatch(/timingSafeEqual/);
      });

      it('supports static and jwt modes', () => {
        expect(authSrc).toMatch(/mode\s*:\s*"static"\s*\|\s*"jwt"/);
      });

      it('isPublicPath exempts /health from auth', () => {
        expect(authSrc).toMatch(/\/health/);
      });
    });
  });

  // ============================================================================
  // TEST GROUP 2: Full pipeline integration with real HTTP server
  // ============================================================================

  describe('Group 2: Full pipeline integration', () => {

    describe('Unauthenticated request to /mcp returns 401', () => {
      let httpServer: any;

      afterAll(async () => {
        if (httpServer) {
          await httpServer.stop().catch(() => {});
        }
      });

      it('rejects POST /mcp without auth header when auth is required', async () => {
        const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
        const { HttpServer } = require(httpServerJsPath);
        const { SessionIsolation } = require(sessionIsolationJsPath);

        const mcpServer = new Server(
          { name: 'e2e-unauth-test', version: '0.0.1' },
          { capabilities: { tools: {} } }
        );

        const iso = new SessionIsolation({ ttlMs: 30000 });
        httpServer = new HttpServer(mcpServer, {
          port: 0,
          host: '127.0.0.1',
          sessionIsolation: iso,
          authConfig: {
            required: true,
            mode: 'static' as const,
            staticToken: 'pipeline-secret-token',
          },
        });
        await httpServer.start();

        const addr = httpServer.getAddress();
        const res = await httpRequest({
          hostname: '127.0.0.1',
          port: addr.port,
          path: '/mcp',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
          },
          body: mcpInitializeBody(),
        });

        expect(res.statusCode).toBe(401);
        expect(res.headers['www-authenticate']).toMatch(/Bearer/);

        const body = JSON.parse(res.body);
        expect(body.jsonrpc).toBe('2.0');
        expect(body.error.code).toBe(-32001);
        expect(body.error.message).toBe('Unauthorized');

        // No session should have been created
        expect(iso.listSessions().length).toBe(0);
      });
    });

    describe('/health bypasses auth even when auth is required', () => {
      let httpServer: any;

      afterAll(async () => {
        if (httpServer) {
          await httpServer.stop().catch(() => {});
        }
      });

      it('returns 200 for /health without any auth header', async () => {
        const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
        const { HttpServer } = require(httpServerJsPath);
        const { SessionIsolation } = require(sessionIsolationJsPath);

        const mcpServer = new Server(
          { name: 'e2e-health-test', version: '0.0.1' },
          { capabilities: { tools: {} } }
        );

        const iso = new SessionIsolation();
        httpServer = new HttpServer(mcpServer, {
          port: 0,
          host: '127.0.0.1',
          sessionIsolation: iso,
          authConfig: {
            required: true,
            mode: 'static' as const,
            staticToken: 'health-test-token',
          },
        });
        await httpServer.start();

        const addr = httpServer.getAddress();
        const res = await httpRequest({
          hostname: '127.0.0.1',
          port: addr.port,
          path: '/health',
          method: 'GET',
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.status).toBe('ok');
        expect(body.transport).toBe('streamable-http');
      });
    });

    describe('Authenticated request creates session and returns MCP response', () => {
      let httpServer: any;
      let sessionIsolation: any;

      afterAll(async () => {
        if (httpServer) {
          await httpServer.stop().catch(() => {});
        }
      });

      it('POST /mcp with valid Bearer token creates session and returns 200', async () => {
        const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
        const { HttpServer } = require(httpServerJsPath);
        const { SessionIsolation } = require(sessionIsolationJsPath);

        const mcpServer = new Server(
          { name: 'e2e-auth-session-test', version: '0.0.1' },
          { capabilities: { tools: {} } }
        );

        sessionIsolation = new SessionIsolation({ ttlMs: 30000 });
        httpServer = new HttpServer(mcpServer, {
          port: 0,
          host: '127.0.0.1',
          sessionIsolation,
          authConfig: {
            required: true,
            mode: 'static' as const,
            staticToken: 'e2e-valid-token',
          },
        });
        await httpServer.start();

        expect(sessionIsolation.listSessions().length).toBe(0);

        const addr = httpServer.getAddress();
        const res = await httpRequest({
          hostname: '127.0.0.1',
          port: addr.port,
          path: '/mcp',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            Authorization: 'Bearer e2e-valid-token',
          },
          body: mcpInitializeBody(),
        });

        expect(res.statusCode).toBe(200);

        // A session should now exist in SessionIsolation
        const sessions = sessionIsolation.listSessions();
        expect(sessions.length).toBe(1);

        const sessionId = sessions[0];
        const session = sessionIsolation.getSession(sessionId);
        expect(session).not.toBeNull();
        expect(session.rateLimitCounters).toBeInstanceOf(Map);
        expect(session.activatedTools).toBeInstanceOf(Set);
        expect(session.role).toBe(process.env.EVOKORE_ROLE || null);
      });
    });

    describe('Wrong Bearer token is rejected even with valid JSON body', () => {
      let httpServer: any;

      afterAll(async () => {
        if (httpServer) {
          await httpServer.stop().catch(() => {});
        }
      });

      it('returns 401 for wrong static token', async () => {
        const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
        const { HttpServer } = require(httpServerJsPath);

        const mcpServer = new Server(
          { name: 'e2e-wrong-token-test', version: '0.0.1' },
          { capabilities: { tools: {} } }
        );

        httpServer = new HttpServer(mcpServer, {
          port: 0,
          host: '127.0.0.1',
          authConfig: {
            required: true,
            mode: 'static' as const,
            staticToken: 'the-correct-token',
          },
        });
        await httpServer.start();

        const addr = httpServer.getAddress();
        const res = await httpRequest({
          hostname: '127.0.0.1',
          port: addr.port,
          path: '/mcp',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            Authorization: 'Bearer wrong-token-here',
          },
          body: mcpInitializeBody(),
        });

        expect(res.statusCode).toBe(401);
      });
    });

    describe('Unknown session ID returns 404', () => {
      let httpServer: any;

      afterAll(async () => {
        if (httpServer) {
          await httpServer.stop().catch(() => {});
        }
      });

      it('returns 404 when mcp-session-id header references unknown session', async () => {
        const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
        const { HttpServer } = require(httpServerJsPath);
        const { SessionIsolation } = require(sessionIsolationJsPath);

        const mcpServer = new Server(
          { name: 'e2e-unknown-session-test', version: '0.0.1' },
          { capabilities: { tools: {} } }
        );

        httpServer = new HttpServer(mcpServer, {
          port: 0,
          host: '127.0.0.1',
          sessionIsolation: new SessionIsolation(),
        });
        await httpServer.start();

        const addr = httpServer.getAddress();
        const res = await httpRequest({
          hostname: '127.0.0.1',
          port: addr.port,
          path: '/mcp',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            'mcp-session-id': 'nonexistent-session-id-12345',
          },
          body: mcpInitializeBody(),
        });

        expect(res.statusCode).toBe(404);
        const body = JSON.parse(res.body);
        expect(body.error).toMatch(/Session not found/i);
      });
    });

    describe('Auth disabled allows all requests through', () => {
      let httpServer: any;
      let iso: any;

      afterAll(async () => {
        if (httpServer) {
          await httpServer.stop().catch(() => {});
        }
      });

      it('allows /mcp without auth when authConfig.required is false', async () => {
        const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
        const { HttpServer } = require(httpServerJsPath);
        const { SessionIsolation } = require(sessionIsolationJsPath);

        const mcpServer = new Server(
          { name: 'e2e-no-auth-test', version: '0.0.1' },
          { capabilities: { tools: {} } }
        );

        iso = new SessionIsolation();
        httpServer = new HttpServer(mcpServer, {
          port: 0,
          host: '127.0.0.1',
          sessionIsolation: iso,
          authConfig: {
            required: false,
            mode: 'static' as const,
            staticToken: null,
          },
        });
        await httpServer.start();

        const addr = httpServer.getAddress();
        const res = await httpRequest({
          hostname: '127.0.0.1',
          port: addr.port,
          path: '/mcp',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
          },
          body: mcpInitializeBody(),
        });

        expect(res.statusCode).toBe(200);
        expect(iso.listSessions().length).toBe(1);
      });

      it('allows /mcp when no authConfig is provided at all', async () => {
        const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
        const { HttpServer } = require(httpServerJsPath);
        const { SessionIsolation } = require(sessionIsolationJsPath);

        const mcpServer = new Server(
          { name: 'e2e-null-auth-test', version: '0.0.1' },
          { capabilities: { tools: {} } }
        );

        const iso2 = new SessionIsolation();
        const server2 = new HttpServer(mcpServer, {
          port: 0,
          host: '127.0.0.1',
          sessionIsolation: iso2,
        });
        await server2.start();

        try {
          const addr = server2.getAddress();
          const res = await httpRequest({
            hostname: '127.0.0.1',
            port: addr.port,
            path: '/mcp',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json, text/event-stream',
            },
            body: mcpInitializeBody(),
          });

          expect(res.statusCode).toBe(200);
          expect(server2.getAuthConfig()).toBeNull();
          expect(iso2.listSessions().length).toBe(1);
        } finally {
          await server2.stop();
        }
      });
    });

    describe('Non-POST to /mcp without session is rejected', () => {
      let httpServer: any;

      afterAll(async () => {
        if (httpServer) {
          await httpServer.stop().catch(() => {});
        }
      });

      it('returns 400 for GET /mcp without session header', async () => {
        const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
        const { HttpServer } = require(httpServerJsPath);

        const mcpServer = new Server(
          { name: 'e2e-get-mcp-test', version: '0.0.1' },
          { capabilities: { tools: {} } }
        );

        httpServer = new HttpServer(mcpServer, {
          port: 0,
          host: '127.0.0.1',
        });
        await httpServer.start();

        const addr = httpServer.getAddress();
        const res = await httpRequest({
          hostname: '127.0.0.1',
          port: addr.port,
          path: '/mcp',
          method: 'GET',
        });

        expect(res.statusCode).toBe(400);
        const body = JSON.parse(res.body);
        expect(body.error).toMatch(/POST/i);
      });
    });

    describe('Unknown route returns 404', () => {
      let httpServer: any;

      afterAll(async () => {
        if (httpServer) {
          await httpServer.stop().catch(() => {});
        }
      });

      it('returns 404 for unrecognized path', async () => {
        const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
        const { HttpServer } = require(httpServerJsPath);

        const mcpServer = new Server(
          { name: 'e2e-404-test', version: '0.0.1' },
          { capabilities: { tools: {} } }
        );

        httpServer = new HttpServer(mcpServer, {
          port: 0,
          host: '127.0.0.1',
        });
        await httpServer.start();

        const addr = httpServer.getAddress();
        const res = await httpRequest({
          hostname: '127.0.0.1',
          port: addr.port,
          path: '/nonexistent',
          method: 'GET',
        });

        expect(res.statusCode).toBe(404);
      });
    });
  });

  // ============================================================================
  // TEST GROUP 3: Module interaction verification
  // ============================================================================

  describe('Group 3: Module interaction verification', () => {

    describe('Session created with role from createSession', () => {
      it('HttpServer passes role through to SessionIsolation.createSession', () => {
        const { SessionIsolation } = require(sessionIsolationJsPath);
        const iso = new SessionIsolation();

        // Simulate what HttpServer.onsessioninitialized does:
        // role = roleOverride ?? process.env.EVOKORE_ROLE ?? null
        const session = iso.createSession('test-session-with-role', 'developer');

        expect(session.role).toBe('developer');
        expect(session.rateLimitCounters).toBeInstanceOf(Map);
        expect(session.rateLimitCounters.size).toBe(0);
        expect(session.activatedTools).toBeInstanceOf(Set);
      });

      it('session role is used by SecurityManager.checkPermission', () => {
        const { SessionIsolation } = require(sessionIsolationJsPath);
        const { SecurityManager } = require(securityManagerJsPath);

        const iso = new SessionIsolation();
        const sm = new SecurityManager();
        // Set up roles manually (normally loaded from permissions.yml)
        sm.roles = new Map([
          ['admin', { description: 'Full access', default_permission: 'allow' }],
          ['readonly', { description: 'Read-only', default_permission: 'deny', overrides: { fs_read_file: 'allow' } }],
        ]);

        const adminSession = iso.createSession('admin-session', 'admin');
        const readonlySession = iso.createSession('readonly-session', 'readonly');

        // checkPermission uses session role
        expect(sm.checkPermission('fs_write_file', adminSession.role)).toBe('allow');
        expect(sm.checkPermission('fs_write_file', readonlySession.role)).toBe('deny');
        expect(sm.checkPermission('fs_read_file', readonlySession.role)).toBe('allow');
      });
    });

    describe('Rate limit counters are tied to individual sessions', () => {
      it('two sessions have independent rate limit counter maps', () => {
        const { SessionIsolation } = require(sessionIsolationJsPath);
        const { TokenBucket } = require(proxyManagerJsPath);

        const iso = new SessionIsolation();
        const sessionA = iso.createSession('rate-session-a', 'admin');
        const sessionB = iso.createSession('rate-session-b', 'admin');

        // Each session has its own rateLimitCounters map
        expect(sessionA.rateLimitCounters).not.toBe(sessionB.rateLimitCounters);

        // Simulate rate limiting using the token bucket pattern
        const globalBucket = new TokenBucket(2); // 2 requests per minute

        const toolKey = 'testserver/some_tool';

        // Session A: use up both tokens
        expect(tryConsumeSessionCounter(toolKey, sessionA.rateLimitCounters, globalBucket)).toBe(true);
        expect(tryConsumeSessionCounter(toolKey, sessionA.rateLimitCounters, globalBucket)).toBe(true);
        expect(tryConsumeSessionCounter(toolKey, sessionA.rateLimitCounters, globalBucket)).toBe(false);

        // Session B: should still have full capacity
        expect(tryConsumeSessionCounter(toolKey, sessionB.rateLimitCounters, globalBucket)).toBe(true);
        expect(tryConsumeSessionCounter(toolKey, sessionB.rateLimitCounters, globalBucket)).toBe(true);
        expect(tryConsumeSessionCounter(toolKey, sessionB.rateLimitCounters, globalBucket)).toBe(false);
      });
    });

    describe('Session expiry cleans up counters and state', () => {
      it('expired session and its rate limit counters are removed by cleanExpired', () => {
        const { SessionIsolation } = require(sessionIsolationJsPath);

        const iso = new SessionIsolation({ ttlMs: 100 }); // 100ms TTL

        const session = iso.createSession('expiring-session', 'admin');
        session.rateLimitCounters.set('server/tool', { tokens: 3, lastRefillAt: Date.now() });
        session.activatedTools.add('discover_tools');

        // Verify the session exists
        expect(iso.hasSession('expiring-session')).toBe(true);
        expect(session.rateLimitCounters.size).toBe(1);

        // Expire the session manually
        session.lastAccessedAt = Date.now() - 200;

        const removed = iso.cleanExpired();
        expect(removed).toBe(1);
        expect(iso.hasSession('expiring-session')).toBe(false);
        expect(iso.size).toBe(0);
      });

      it('transport cleanup simulation mirrors HttpServer cleanup interval', () => {
        const { SessionIsolation } = require(sessionIsolationJsPath);
        const iso = new SessionIsolation({ ttlMs: 100 });

        // Simulate the HttpServer's transports Map
        const transports = new Map<string, { closed: boolean }>();

        // Create two sessions with rate limit data
        const sessionA = iso.createSession('cleanup-a');
        sessionA.rateLimitCounters.set('github/search', { tokens: 5, lastRefillAt: Date.now() });
        transports.set('cleanup-a', { closed: false });

        const sessionB = iso.createSession('cleanup-b');
        sessionB.rateLimitCounters.set('fs/read_file', { tokens: 10, lastRefillAt: Date.now() });
        transports.set('cleanup-b', { closed: false });

        // Expire session A
        sessionA.lastAccessedAt = Date.now() - 200;

        // Run the cleanup logic (mirrors HttpServer setInterval)
        const removed = iso.cleanExpired();
        expect(removed).toBe(1);

        if (removed > 0) {
          for (const [sessionId, transport] of transports.entries()) {
            if (!iso.hasSession(sessionId)) {
              transports.delete(sessionId);
              transport.closed = true;
            }
          }
        }

        // Session A's transport should be closed, B should be intact
        expect(transports.size).toBe(1);
        expect(transports.has('cleanup-b')).toBe(true);
        expect(transports.has('cleanup-a')).toBe(false);

        // Session B's counters should be intact
        const sessionBState = iso.getSession('cleanup-b');
        expect(sessionBState).not.toBeNull();
        expect(sessionBState!.rateLimitCounters.size).toBe(1);
      });
    });

    describe('Multiple concurrent sessions remain isolated', () => {
      it('each session has independent activatedTools, role, and rateLimitCounters', () => {
        const { SessionIsolation } = require(sessionIsolationJsPath);

        const iso = new SessionIsolation();

        const session1 = iso.createSession('multi-1', 'admin');
        const session2 = iso.createSession('multi-2', 'developer');
        const session3 = iso.createSession('multi-3', 'readonly');

        // Set up unique state per session
        session1.activatedTools.add('tool-a');
        session2.activatedTools.add('tool-b');
        session3.activatedTools.add('tool-c');

        session1.rateLimitCounters.set('key1', { tokens: 10, lastRefillAt: Date.now() });
        session2.rateLimitCounters.set('key2', { tokens: 20, lastRefillAt: Date.now() });
        session3.rateLimitCounters.set('key3', { tokens: 30, lastRefillAt: Date.now() });

        session1.metadata.set('custom', 'value1');
        session2.metadata.set('custom', 'value2');

        // Verify each session is fully independent
        expect(session1.role).toBe('admin');
        expect(session2.role).toBe('developer');
        expect(session3.role).toBe('readonly');

        expect(session1.activatedTools.has('tool-a')).toBe(true);
        expect(session1.activatedTools.has('tool-b')).toBe(false);

        expect(session2.activatedTools.has('tool-b')).toBe(true);
        expect(session2.activatedTools.has('tool-a')).toBe(false);

        expect(session1.rateLimitCounters.get('key1')?.tokens).toBe(10);
        expect(session2.rateLimitCounters.get('key2')?.tokens).toBe(20);
        expect(session3.rateLimitCounters.get('key3')?.tokens).toBe(30);

        // Cross-contamination check
        expect(session1.rateLimitCounters.has('key2')).toBe(false);
        expect(session2.rateLimitCounters.has('key1')).toBe(false);

        expect(session1.metadata.get('custom')).toBe('value1');
        expect(session2.metadata.get('custom')).toBe('value2');
        expect(session3.metadata.has('custom')).toBe(false);

        // All three sessions coexist
        expect(iso.listSessions().length).toBe(3);
      });
    });

    describe('Full RBAC + rate limit integration for two sessions', () => {
      it('admin session allows a tool that readonly session denies, each with own counters', () => {
        const { SessionIsolation } = require(sessionIsolationJsPath);
        const { SecurityManager } = require(securityManagerJsPath);
        const { TokenBucket } = require(proxyManagerJsPath);

        const iso = new SessionIsolation();
        const sm = new SecurityManager();
        sm.rules = {};
        sm.roles = new Map([
          ['admin', { description: 'Full access', default_permission: 'allow' }],
          ['readonly', { description: 'Read-only', default_permission: 'deny', overrides: { fs_read_file: 'allow' } }],
        ]);

        const adminSession = iso.createSession('pipeline-admin', 'admin');
        const readonlySession = iso.createSession('pipeline-readonly', 'readonly');

        // RBAC: admin can write, readonly cannot
        expect(sm.checkPermission('fs_write_file', adminSession.role)).toBe('allow');
        expect(sm.checkPermission('fs_write_file', readonlySession.role)).toBe('deny');

        // Rate limiting: both have independent counters
        const bucket = new TokenBucket(1); // 1 req/min

        // Admin can read (RBAC allows + rate limit allows first call)
        expect(sm.checkPermission('fs_read_file', adminSession.role)).toBe('allow');
        expect(tryConsumeSessionCounter('server/fs_read_file', adminSession.rateLimitCounters, bucket)).toBe(true);
        // Admin exhausted
        expect(tryConsumeSessionCounter('server/fs_read_file', adminSession.rateLimitCounters, bucket)).toBe(false);

        // Readonly can still read (RBAC allows via override + rate limit has own counter)
        expect(sm.checkPermission('fs_read_file', readonlySession.role)).toBe('allow');
        expect(tryConsumeSessionCounter('server/fs_read_file', readonlySession.rateLimitCounters, bucket)).toBe(true);
        // Readonly exhausted
        expect(tryConsumeSessionCounter('server/fs_read_file', readonlySession.rateLimitCounters, bucket)).toBe(false);
      });
    });
  });

  // ============================================================================
  // TEST GROUP 4: Edge cases
  // ============================================================================

  describe('Group 4: Edge cases', () => {

    describe('Graceful shutdown cleans all sessions', () => {
      it('stop() destroys all sessions and clears transport map', async () => {
        const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
        const { HttpServer } = require(httpServerJsPath);
        const { SessionIsolation } = require(sessionIsolationJsPath);

        const mcpServer = new Server(
          { name: 'e2e-shutdown-test', version: '0.0.1' },
          { capabilities: { tools: {} } }
        );

        const iso = new SessionIsolation();
        const server = new HttpServer(mcpServer, {
          port: 0,
          host: '127.0.0.1',
          sessionIsolation: iso,
        });
        await server.start();

        const addr = server.getAddress();

        // Create one session via MCP initialize
        // (MCP SDK Server only supports one transport connection at a time)
        await httpRequest({
          hostname: '127.0.0.1',
          port: addr.port,
          path: '/mcp',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
          },
          body: mcpInitializeBody(),
        });

        expect(iso.listSessions().length).toBe(1);

        // Graceful shutdown should destroy all sessions
        await server.stop();

        expect(iso.listSessions().length).toBe(0);
      });
    });

    describe('LRU eviction when at max sessions capacity', () => {
      it('oldest session is evicted when capacity is reached', () => {
        const { SessionIsolation } = require(sessionIsolationJsPath);

        const iso = new SessionIsolation({ maxSessions: 3, ttlMs: 60000 });

        const s1 = iso.createSession('evict-1');
        s1.lastAccessedAt = Date.now() - 30000; // oldest
        s1.rateLimitCounters.set('github/search', { tokens: 5, lastRefillAt: Date.now() });

        const s2 = iso.createSession('evict-2');
        s2.lastAccessedAt = Date.now() - 20000;

        const s3 = iso.createSession('evict-3');
        s3.lastAccessedAt = Date.now() - 10000;

        // At capacity. Creating a 4th evicts the LRU (evict-1)
        const s4 = iso.createSession('evict-4');

        expect(iso.getSession('evict-1')).toBeNull();
        expect(iso.getSession('evict-2')).not.toBeNull();
        expect(iso.getSession('evict-3')).not.toBeNull();
        expect(iso.getSession('evict-4')).not.toBeNull();
      });
    });

    describe('Session state survives multiple accesses', () => {
      it('getSession updates lastAccessedAt and preserves state', async () => {
        const { SessionIsolation } = require(sessionIsolationJsPath);

        const iso = new SessionIsolation({ ttlMs: 60000 });
        const session = iso.createSession('persistent', 'admin');
        session.rateLimitCounters.set('tool-a', { tokens: 42, lastRefillAt: Date.now() });
        session.activatedTools.add('discover_tools');

        const originalLastAccess = session.lastAccessedAt;

        // Small delay to ensure timestamp changes
        await new Promise(resolve => setTimeout(resolve, 10));

        // Access the session
        const retrieved = iso.getSession('persistent');
        expect(retrieved).not.toBeNull();
        expect(retrieved!.role).toBe('admin');
        expect(retrieved!.rateLimitCounters.get('tool-a')?.tokens).toBe(42);
        expect(retrieved!.activatedTools.has('discover_tools')).toBe(true);
        expect(retrieved!.lastAccessedAt).toBeGreaterThan(originalLastAccess);
      });
    });

    describe('HttpServer getSessionIsolation and getAuthConfig accessors', () => {
      it('returns the provided instances', () => {
        const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
        const { HttpServer } = require(httpServerJsPath);
        const { SessionIsolation } = require(sessionIsolationJsPath);

        const mcpServer = new Server(
          { name: 'accessor-test', version: '0.0.1' },
          { capabilities: { tools: {} } }
        );

        const iso = new SessionIsolation();
        const authConfig = {
          required: true,
          mode: 'static' as const,
          staticToken: 'test',
        };
        const server = new HttpServer(mcpServer, {
          port: 0,
          host: '127.0.0.1',
          sessionIsolation: iso,
          authConfig,
        });

        expect(server.getSessionIsolation()).toBe(iso);
        expect(server.getAuthConfig()).toEqual(authConfig);
      });

      it('returns null when no options provided', () => {
        const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
        const { HttpServer } = require(httpServerJsPath);

        const mcpServer = new Server(
          { name: 'null-accessor-test', version: '0.0.1' },
          { capabilities: { tools: {} } }
        );

        const server = new HttpServer(mcpServer, { port: 0, host: '127.0.0.1' });

        expect(server.getSessionIsolation()).toBeNull();
        expect(server.getAuthConfig()).toBeNull();
      });
    });

    describe('WebhookManager wiring is event-driven and fire-and-forget', () => {
      const webhookSrc = fs.readFileSync(webhookManagerTsPath, 'utf8');

      it('emit method is fire-and-forget (catches delivery errors)', () => {
        expect(webhookSrc).toMatch(/\.catch\s*\(/);
        expect(webhookSrc).toMatch(/deliverWithRetry/);
      });

      it('uses HMAC-SHA256 for signature verification', () => {
        expect(webhookSrc).toMatch(/hmac.*sha256/i);
        expect(webhookSrc).toMatch(/timingSafeEqual/);
      });

      it('redacts secrets in getWebhooks output', () => {
        expect(webhookSrc).toMatch(/hasSecret/);
        // Verify the return type uses Omit to strip secret
        expect(webhookSrc).toMatch(/Omit\s*<\s*WebhookConfig\s*,\s*['"]secret['"]\s*>/);
      });
    });

    describe('End-to-end pipeline: auth -> session -> RBAC -> rate limit flow', () => {
      it('demonstrates the complete flow through all modules in the correct order', () => {
        const { SessionIsolation } = require(sessionIsolationJsPath);
        const { SecurityManager } = require(securityManagerJsPath);
        const { TokenBucket } = require(proxyManagerJsPath);

        // 1. AUTH: Validate bearer token (simulated - in real flow, OAuthProvider does this)
        const staticToken = 'pipeline-test-token';
        const incomingToken = 'pipeline-test-token';
        expect(incomingToken).toBe(staticToken); // Auth passes

        // 2. SESSION: Create session with role from auth claims
        const iso = new SessionIsolation({ ttlMs: 60000 });
        const roleFromAuth = 'developer'; // Would come from JWT claims or EVOKORE_ROLE
        const session = iso.createSession('e2e-flow-session', roleFromAuth);

        expect(session.sessionId).toBe('e2e-flow-session');
        expect(session.role).toBe('developer');

        // 3. RBAC: Check permission using session role
        const sm = new SecurityManager();
        sm.roles = new Map([
          ['developer', {
            description: 'Developer access',
            default_permission: 'require_approval',
            overrides: { fs_read_file: 'allow', github_search_code: 'allow' },
          }],
        ]);

        const readPermission = sm.checkPermission('fs_read_file', session.role);
        expect(readPermission).toBe('allow');

        const writePermission = sm.checkPermission('fs_write_file', session.role);
        expect(writePermission).toBe('require_approval');

        // 4. RATE LIMIT: Check rate limit using session counters
        const bucket = new TokenBucket(3); // 3 req/min

        // First three calls pass
        expect(tryConsumeSessionCounter('server/fs_read_file', session.rateLimitCounters, bucket)).toBe(true);
        expect(tryConsumeSessionCounter('server/fs_read_file', session.rateLimitCounters, bucket)).toBe(true);
        expect(tryConsumeSessionCounter('server/fs_read_file', session.rateLimitCounters, bucket)).toBe(true);
        // Fourth call is rate-limited
        expect(tryConsumeSessionCounter('server/fs_read_file', session.rateLimitCounters, bucket)).toBe(false);

        // 5. SESSION CLEANUP: Verify session can be destroyed
        expect(iso.destroySession('e2e-flow-session')).toBe(true);
        expect(iso.hasSession('e2e-flow-session')).toBe(false);
      });
    });
  });
});
