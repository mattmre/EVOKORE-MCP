import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import http from 'http';

const ROOT = path.resolve(__dirname, '../..');
const httpServerTsPath = path.join(ROOT, 'src', 'HttpServer.ts');
const httpServerJsPath = path.join(ROOT, 'dist', 'HttpServer.js');
const indexTsPath = path.join(ROOT, 'src', 'index.ts');
const authModulePath = path.join(ROOT, 'dist', 'auth', 'OAuthProvider.js');

function httpRequest(options: {
  hostname: string;
  port: number;
  path: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: options.hostname,
        port: options.port,
        path: options.path,
        method: options.method,
        headers: options.headers,
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
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

describe('OAuthProvider-HttpServer Middleware Wiring', () => {

  // ---- Phase 1: Source-level structural validation ----

  describe('Phase 1: HttpServer source imports and uses OAuthProvider', () => {
    const httpSrc = fs.readFileSync(httpServerTsPath, 'utf8');

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

    it('HttpServerOptions includes authConfig field', () => {
      expect(httpSrc).toMatch(/authConfig\s*\?\s*:\s*AuthConfig/);
    });

    it('stores authConfig as a private field', () => {
      expect(httpSrc).toMatch(/private\s+authConfig\s*:\s*AuthConfig\s*\|\s*null/);
    });

    it('has a getAuthConfig accessor', () => {
      expect(httpSrc).toMatch(/getAuthConfig\s*\(\)/);
    });

    it('calls authenticateRequest in handleRequest', () => {
      expect(httpSrc).toMatch(/authenticateRequest\s*\(\s*req\s*,\s*this\.authConfig/);
    });

    it('calls sendUnauthorizedResponse when auth fails', () => {
      expect(httpSrc).toMatch(/sendUnauthorizedResponse\s*\(\s*res/);
    });

    it('checks isPublicPath before authenticating', () => {
      expect(httpSrc).toMatch(/isPublicPath\s*\(\s*url\s*\)/);
    });

    it('checks authConfig.required before running auth', () => {
      expect(httpSrc).toMatch(/this\.authConfig\.required/);
    });
  });

  describe('Phase 1: index.ts loads auth config and passes to HttpServer', () => {
    const indexSrc = fs.readFileSync(indexTsPath, 'utf8');

    it('imports loadAuthConfig from OAuthProvider', () => {
      expect(indexSrc).toMatch(/import.*loadAuthConfig.*from.*OAuthProvider/s);
    });

    it('calls loadAuthConfig() in runHttp', () => {
      expect(indexSrc).toMatch(/const\s+authConfig\s*=\s*loadAuthConfig\s*\(\)/);
    });

    it('passes authConfig to HttpServer constructor', () => {
      expect(indexSrc).toMatch(/authConfig/);
      // Verify it's in the HttpServer options block
      expect(indexSrc).toMatch(/new\s+HttpServer\s*\(\s*this\.server/);
    });
  });

  // ---- Phase 2: Runtime behavior with auth disabled ----

  describe('Phase 2: Auth disabled (default) - no-op behavior', () => {
    let httpServer: any;

    afterAll(async () => {
      if (httpServer) {
        await httpServer.stop().catch(() => {});
      }
    });

    it('starts without auth config and /health responds normally', async () => {
      const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
      const { HttpServer } = require(httpServerJsPath);

      const mcpServer = new Server(
        { name: 'no-auth-test', version: '0.0.1' },
        { capabilities: { tools: {} } }
      );

      httpServer = new HttpServer(mcpServer, { port: 0, host: '127.0.0.1' });
      await httpServer.start();

      expect(httpServer.getAuthConfig()).toBeNull();

      const addr = httpServer.getAddress();
      const res = await httpRequest({
        hostname: '127.0.0.1',
        port: addr.port,
        path: '/health',
        method: 'GET',
      });

      expect(res.statusCode).toBe(200);
    });

    it('/mcp initialize works without auth when auth is not configured', async () => {
      const addr = httpServer.getAddress();
      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'no-auth-client', version: '0.0.1' },
        },
      };

      const res = await httpRequest({
        hostname: '127.0.0.1',
        port: addr.port,
        path: '/mcp',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify(initRequest),
      });

      expect(res.statusCode).toBe(200);
    });

    it('/mcp works without auth when authConfig.required is false', async () => {
      const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
      const { HttpServer } = require(httpServerJsPath);

      const mcpServer = new Server(
        { name: 'auth-disabled-test', version: '0.0.1' },
        { capabilities: { tools: {} } }
      );

      const server = new HttpServer(mcpServer, {
        port: 0,
        host: '127.0.0.1',
        authConfig: { required: false, staticToken: null },
      });
      await server.start();

      const addr = server.getAddress();
      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'auth-disabled-client', version: '0.0.1' },
        },
      };

      const res = await httpRequest({
        hostname: '127.0.0.1',
        port: addr.port,
        path: '/mcp',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify(initRequest),
      });

      expect(res.statusCode).toBe(200);
      await server.stop();
    });
  });

  // ---- Phase 3: Runtime behavior with auth enabled ----

  describe('Phase 3: Auth enabled - unauthenticated /mcp requests rejected', () => {
    let httpServer: any;

    afterAll(async () => {
      if (httpServer) {
        await httpServer.stop().catch(() => {});
      }
    });

    it('rejects /mcp POST without Authorization header with 401', async () => {
      const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
      const { HttpServer } = require(httpServerJsPath);

      const mcpServer = new Server(
        { name: 'auth-required-test', version: '0.0.1' },
        { capabilities: { tools: {} } }
      );

      httpServer = new HttpServer(mcpServer, {
        port: 0,
        host: '127.0.0.1',
        authConfig: { required: true, staticToken: 'test-secret-token' },
      });
      await httpServer.start();

      const addr = httpServer.getAddress();
      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'unauth-client', version: '0.0.1' },
        },
      };

      const res = await httpRequest({
        hostname: '127.0.0.1',
        port: addr.port,
        path: '/mcp',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify(initRequest),
      });

      expect(res.statusCode).toBe(401);
      expect(res.headers['www-authenticate']).toMatch(/Bearer/);

      const body = JSON.parse(res.body);
      expect(body.jsonrpc).toBe('2.0');
      expect(body.error.code).toBe(-32001);
      expect(body.error.message).toBe('Unauthorized');
    });

    it('rejects /mcp POST with wrong Bearer token with 401', async () => {
      const addr = httpServer.getAddress();
      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'wrong-token-client', version: '0.0.1' },
        },
      };

      const res = await httpRequest({
        hostname: '127.0.0.1',
        port: addr.port,
        path: '/mcp',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: 'Bearer wrong-token',
        },
        body: JSON.stringify(initRequest),
      });

      expect(res.statusCode).toBe(401);
    });

    it('/health always bypasses auth even when auth is required', async () => {
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
    });

    it('/metrics stays protected when auth is required', async () => {
      const addr = httpServer.getAddress();

      const res = await httpRequest({
        hostname: '127.0.0.1',
        port: addr.port,
        path: '/metrics',
        method: 'GET',
      });

      expect(res.statusCode).toBe(401);
      expect(res.headers['www-authenticate']).toMatch(/Bearer/);
    });

    it('/metrics auth rejection does not increment telemetry auth failure counters', async () => {
      const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
      const { HttpServer } = require(httpServerJsPath);
      const { TelemetryManager } = require(path.join(ROOT, 'dist', 'TelemetryManager.js'));

      const mcpServer = new Server(
        { name: 'metrics-auth-failure-test', version: '0.0.1' },
        { capabilities: { tools: {} } }
      );
      const telemetryManager = new TelemetryManager();
      telemetryManager.setEnabled(true);

      const server = new HttpServer(mcpServer, {
        port: 0,
        host: '127.0.0.1',
        telemetryManager,
        authConfig: { required: true, staticToken: 'test-secret-token' },
      });
      await server.start();

      const addr = server.getAddress();
      const res = await httpRequest({
        hostname: '127.0.0.1',
        port: addr.port,
        path: '/metrics',
        method: 'GET',
      });

      expect(res.statusCode).toBe(401);
      expect(telemetryManager.getMetrics().auth.failureCount).toBe(0);

      await server.stop();
    });
  });

  describe('Phase 3: Auth enabled - authenticated /mcp requests pass through', () => {
    let httpServer: any;

    afterAll(async () => {
      if (httpServer) {
        await httpServer.stop().catch(() => {});
      }
    });

    it('allows /mcp POST with correct Bearer token', async () => {
      const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
      const { HttpServer } = require(httpServerJsPath);

      const mcpServer = new Server(
        { name: 'auth-pass-test', version: '0.0.1' },
        { capabilities: { tools: {} } }
      );

      httpServer = new HttpServer(mcpServer, {
        port: 0,
        host: '127.0.0.1',
        authConfig: { required: true, staticToken: 'correct-test-token' },
      });
      await httpServer.start();

      const addr = httpServer.getAddress();
      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'auth-client', version: '0.0.1' },
        },
      };

      const res = await httpRequest({
        hostname: '127.0.0.1',
        port: addr.port,
        path: '/mcp',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: 'Bearer correct-test-token',
        },
        body: JSON.stringify(initRequest),
      });

      // Should reach MCP handler and get a valid response
      expect(res.statusCode).toBe(200);
    });

    it('allows /metrics GET with correct Bearer token', async () => {
      const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
      const { HttpServer } = require(httpServerJsPath);
      const { TelemetryManager } = require(path.join(ROOT, 'dist', 'TelemetryManager.js'));

      const mcpServer = new Server(
        { name: 'auth-metrics-test', version: '0.0.1' },
        { capabilities: { tools: {} } }
      );
      const telemetryManager = new TelemetryManager();
      telemetryManager.setEnabled(true);
      telemetryManager.recordToolCall(25);

      const server = new HttpServer(mcpServer, {
        port: 0,
        host: '127.0.0.1',
        telemetryManager,
        authConfig: { required: true, staticToken: 'correct-test-token' },
      });
      await server.start();

      const addr = server.getAddress();
      const res = await httpRequest({
        hostname: '127.0.0.1',
        port: addr.port,
        path: '/metrics',
        method: 'GET',
        headers: {
          Authorization: 'Bearer correct-test-token',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.body).toContain('evokore_tool_calls_total 1');
      expect(res.body).toContain('evokore_auth_success_total 0');
      expect(telemetryManager.getMetrics().auth.successCount).toBe(0);

      await server.stop();
    });
  });

  // ---- Phase 4: getAuthConfig accessor ----

  describe('Phase 4: getAuthConfig accessor', () => {
    it('returns null when no auth config is provided', () => {
      const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
      const { HttpServer } = require(httpServerJsPath);

      const mcpServer = new Server(
        { name: 'accessor-test', version: '0.0.1' },
        { capabilities: { tools: {} } }
      );

      const server = new HttpServer(mcpServer, { port: 0, host: '127.0.0.1' });
      expect(server.getAuthConfig()).toBeNull();
    });

    it('returns the provided auth config', () => {
      const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
      const { HttpServer } = require(httpServerJsPath);

      const mcpServer = new Server(
        { name: 'accessor-test-2', version: '0.0.1' },
        { capabilities: { tools: {} } }
      );

      const authConfig = { required: true, staticToken: 'my-token' };
      const server = new HttpServer(mcpServer, {
        port: 0,
        host: '127.0.0.1',
        authConfig,
      });

      expect(server.getAuthConfig()).toEqual(authConfig);
    });
  });

  // ---- Phase 5: Research documentation ----

  describe('Phase 5: Research documentation', () => {
    it('middleware research doc exists', () => {
      const docPath = path.join(ROOT, 'docs', 'research', 'oauth-httpserver-middleware-2026-03-15.md');
      expect(fs.existsSync(docPath)).toBe(true);

      const content = fs.readFileSync(docPath, 'utf8');
      expect(content).toMatch(/OAuthProvider/);
      expect(content).toMatch(/HttpServer/);
      expect(content).toMatch(/middleware/i);
      expect(content).toMatch(/\/health/);
      expect(content).toMatch(/session.*role/i);
      expect(content).toMatch(/JWT/i);
    });
  });
});
