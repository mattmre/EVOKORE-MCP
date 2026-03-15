import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import http from 'http';

const ROOT = path.resolve(__dirname, '../..');
const httpServerJsPath = path.join(ROOT, 'dist', 'HttpServer.js');
const sessionIsolationJsPath = path.join(ROOT, 'dist', 'SessionIsolation.js');
const httpServerTsPath = path.join(ROOT, 'src', 'HttpServer.ts');
const indexTsPath = path.join(ROOT, 'src', 'index.ts');
const sessionIsolationTsPath = path.join(ROOT, 'src', 'SessionIsolation.ts');

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

describe('SessionIsolation-HttpServer Wiring', () => {

  // ---- Phase 1: Source-level structural validation ----

  describe('Phase 1: HttpServer source imports and uses SessionIsolation', () => {
    const httpSrc = fs.readFileSync(httpServerTsPath, 'utf8');

    it('imports SessionIsolation', () => {
      expect(httpSrc).toMatch(/import.*SessionIsolation.*from/);
    });

    it('HttpServerOptions includes sessionIsolation field', () => {
      expect(httpSrc).toMatch(/sessionIsolation\s*\?\s*:\s*SessionIsolation/);
    });

    it('stores sessionIsolation as a private field', () => {
      expect(httpSrc).toMatch(/private\s+sessionIsolation/);
    });

    it('has a getSessionIsolation accessor', () => {
      expect(httpSrc).toMatch(/getSessionIsolation\s*\(\)/);
    });

    it('calls createSession in onsessioninitialized', () => {
      expect(httpSrc).toMatch(/sessionIsolation\?\.createSession\s*\(/);
    });

    it('calls destroySession in onclose', () => {
      expect(httpSrc).toMatch(/sessionIsolation\?\.destroySession\s*\(/);
    });

    it('sets up a cleanup interval in start()', () => {
      expect(httpSrc).toMatch(/cleanupInterval/);
      expect(httpSrc).toMatch(/setInterval/);
      expect(httpSrc).toMatch(/cleanExpired/);
    });

    it('clears the cleanup interval in stop()', () => {
      expect(httpSrc).toMatch(/clearInterval\s*\(\s*this\.cleanupInterval\s*\)/);
    });

    it('destroys sessions for all transports in stop()', () => {
      // stop() iterates transport keys and calls destroySession
      expect(httpSrc).toMatch(/this\.transports\.keys\(\)/);
    });
  });

  describe('Phase 1: index.ts uses SessionIsolation instead of activatedToolSessionsBySession', () => {
    const indexSrc = fs.readFileSync(indexTsPath, 'utf8');

    it('imports SessionIsolation', () => {
      expect(indexSrc).toMatch(/import.*SessionIsolation.*from/);
    });

    it('declares sessionIsolation as a private field', () => {
      expect(indexSrc).toMatch(/private\s+sessionIsolation\s*:\s*SessionIsolation/);
    });

    it('instantiates SessionIsolation in constructor', () => {
      expect(indexSrc).toMatch(/new\s+SessionIsolation\s*\(/);
    });

    it('does NOT have the old activatedToolSessionsBySession field', () => {
      expect(indexSrc).not.toMatch(/activatedToolSessionsBySession/);
    });

    it('does NOT have the old ActivatedToolSessionState type', () => {
      expect(indexSrc).not.toMatch(/ActivatedToolSessionState/);
    });

    it('does NOT have the old MAX_ACTIVATED_TOOL_SESSIONS constant', () => {
      expect(indexSrc).not.toMatch(/MAX_ACTIVATED_TOOL_SESSIONS/);
    });

    it('does NOT have the old ACTIVATED_TOOL_SESSION_TTL_MS constant', () => {
      expect(indexSrc).not.toMatch(/ACTIVATED_TOOL_SESSION_TTL_MS/);
    });

    it('passes sessionIsolation to HttpServer constructor', () => {
      expect(indexSrc).toMatch(/sessionIsolation\s*:\s*this\.sessionIsolation/);
    });

    it('pre-creates the default session in run() for stdio mode', () => {
      expect(indexSrc).toMatch(/sessionIsolation\.createSession\s*\(\s*DEFAULT_SESSION_ID\s*\)/);
    });

    it('getActivatedTools delegates to sessionIsolation', () => {
      expect(indexSrc).toMatch(/sessionIsolation\.getSession\s*\(/);
    });
  });

  // ---- Phase 2: SessionIsolation maxSessions and LRU eviction ----

  describe('Phase 2: SessionIsolation maxSessions and LRU eviction', () => {
    const siSrc = fs.readFileSync(sessionIsolationTsPath, 'utf8');

    it('SessionIsolationOptions includes maxSessions', () => {
      expect(siSrc).toMatch(/maxSessions\s*\?\s*:\s*number/);
    });

    it('has a private maxSessions field', () => {
      expect(siSrc).toMatch(/private\s+maxSessions\s*:\s*number/);
    });

    it('has a getMaxSessions accessor', () => {
      expect(siSrc).toMatch(/getMaxSessions\s*\(\)/);
    });

    it('defaults maxSessions to 100', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation();
      expect(iso.getMaxSessions()).toBe(100);
    });

    it('respects custom maxSessions from constructor', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation({ maxSessions: 5 });
      expect(iso.getMaxSessions()).toBe(5);
    });

    it('evicts the LRU session when at capacity', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation({ maxSessions: 3, ttlMs: 60000 });

      const s1 = iso.createSession('first');
      s1.lastAccessedAt = Date.now() - 30000; // oldest

      const s2 = iso.createSession('second');
      s2.lastAccessedAt = Date.now() - 20000;

      const s3 = iso.createSession('third');
      s3.lastAccessedAt = Date.now() - 10000;

      // At capacity (3/3). Creating a 4th should evict 'first' (oldest lastAccessedAt).
      iso.createSession('fourth');

      expect(iso.getSession('first')).toBeNull();
      expect(iso.getSession('second')).not.toBeNull();
      expect(iso.getSession('third')).not.toBeNull();
      expect(iso.getSession('fourth')).not.toBeNull();
    });

    it('evicts expired sessions before LRU eviction', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation({ maxSessions: 3, ttlMs: 100 });

      const s1 = iso.createSession('expired-a');
      s1.lastAccessedAt = Date.now() - 200; // expired (>100ms TTL)

      const s2 = iso.createSession('alive-b');
      s2.lastAccessedAt = Date.now() - 50; // still alive

      const s3 = iso.createSession('alive-c');
      // s3 is fresh

      // At capacity (3/3). Creating a 4th should remove expired-a first, no LRU eviction needed.
      iso.createSession('new-d');

      expect(iso.getSession('expired-a')).toBeNull();
      expect(iso.getSession('alive-b')).not.toBeNull();
      expect(iso.getSession('alive-c')).not.toBeNull();
      expect(iso.getSession('new-d')).not.toBeNull();
    });

    it('does not evict when replacing an existing session ID', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation({ maxSessions: 2, ttlMs: 60000 });

      iso.createSession('a');
      iso.createSession('b');

      // Replacing 'a' should not trigger eviction of 'b'
      iso.createSession('a');

      expect(iso.getSession('a')).not.toBeNull();
      expect(iso.getSession('b')).not.toBeNull();
    });
  });

  // ---- Phase 3: Runtime HttpServer + SessionIsolation integration ----

  describe('Phase 3: HttpServer creates sessions in SessionIsolation on connection', () => {
    let httpServer: any;
    let sessionIsolation: any;

    afterAll(async () => {
      if (httpServer) {
        await httpServer.stop().catch(() => {});
      }
    });

    it('creates a session when an MCP client initializes', async () => {
      const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
      const { HttpServer } = require(httpServerJsPath);
      const { SessionIsolation } = require(sessionIsolationJsPath);

      const mcpServer = new Server(
        { name: 'wiring-test', version: '0.0.1' },
        { capabilities: { tools: {} } }
      );

      sessionIsolation = new SessionIsolation();
      httpServer = new HttpServer(mcpServer, {
        port: 0,
        host: '127.0.0.1',
        sessionIsolation,
      });

      await httpServer.start();

      expect(sessionIsolation.listSessions().length).toBe(0);

      // Send an initialize request to create a session
      const addr = httpServer.getAddress();
      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '0.0.1' },
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

      // SessionIsolation should now have a session
      const sessions = sessionIsolation.listSessions();
      expect(sessions.length).toBe(1);
    });

    it('getSessionIsolation returns the provided instance', () => {
      expect(httpServer.getSessionIsolation()).toBe(sessionIsolation);
    });
  });

  describe('Phase 3: HttpServer destroys sessions on transport close and stop', () => {
    it('stop() destroys all sessions and clears the cleanup interval', async () => {
      const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
      const { HttpServer } = require(httpServerJsPath);
      const { SessionIsolation } = require(sessionIsolationJsPath);

      const mcpServer = new Server(
        { name: 'stop-test', version: '0.0.1' },
        { capabilities: { tools: {} } }
      );

      const iso = new SessionIsolation();
      const server = new HttpServer(mcpServer, {
        port: 0,
        host: '127.0.0.1',
        sessionIsolation: iso,
      });

      await server.start();

      // Create a session via initialize
      const addr = server.getAddress();
      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'stop-test-client', version: '0.0.1' },
        },
      };

      await httpRequest({
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

      expect(iso.listSessions().length).toBe(1);

      // stop() should destroy all sessions
      await server.stop();

      expect(iso.listSessions().length).toBe(0);
    });
  });

  describe('Phase 3: HttpServer without SessionIsolation still works', () => {
    it('starts and responds to /health without SessionIsolation', async () => {
      const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
      const { HttpServer } = require(httpServerJsPath);

      const mcpServer = new Server(
        { name: 'no-isolation-test', version: '0.0.1' },
        { capabilities: { tools: {} } }
      );

      const server = new HttpServer(mcpServer, { port: 0, host: '127.0.0.1' });
      await server.start();

      expect(server.getSessionIsolation()).toBeNull();

      const addr = server.getAddress();
      const res = await httpRequest({
        hostname: '127.0.0.1',
        port: addr.port,
        path: '/health',
        method: 'GET',
      });

      expect(res.statusCode).toBe(200);

      await server.stop();
    });
  });

  // ---- Phase 4: Research doc ----

  describe('Phase 4: Research documentation', () => {
    it('wiring research doc exists', () => {
      const docPath = path.join(ROOT, 'docs', 'research', 'session-isolation-httpserver-wiring-2026-03-15.md');
      expect(fs.existsSync(docPath)).toBe(true);

      const content = fs.readFileSync(docPath, 'utf8');
      expect(content).toMatch(/SessionIsolation/);
      expect(content).toMatch(/HttpServer/);
      expect(content).toMatch(/LRU Eviction/i);
      expect(content).toMatch(/Cleanup Timer/i);
      expect(content).toMatch(/Duplicate Tracking/i);
    });
  });
});
