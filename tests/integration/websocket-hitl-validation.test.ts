import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import WebSocket from 'ws';

const ROOT = path.resolve(__dirname, '../..');
const httpServerJsPath = path.join(ROOT, 'dist', 'HttpServer.js');
const securityManagerJsPath = path.join(ROOT, 'dist', 'SecurityManager.js');
const authModulePath = path.join(ROOT, 'dist', 'auth', 'OAuthProvider.js');
const DASHBOARD_PATH = path.join(ROOT, 'scripts', 'dashboard.js');

/**
 * Wait for a WebSocket message matching a predicate.
 * Checks the buffered messages first (captured by the early listener set up
 * in connectWS), then listens for future messages.
 */
function waitForMessage(
  ws: WebSocket,
  predicate: (msg: any) => boolean,
  timeoutMs = 3000
): Promise<any> {
  return new Promise((resolve, reject) => {
    // Check buffered messages first (captured before this call)
    const buf = (ws as any)._msgBuffer as any[] | undefined;
    if (buf) {
      for (let i = 0; i < buf.length; i++) {
        if (predicate(buf[i])) {
          const match = buf[i];
          buf.splice(i, 1);
          resolve(match);
          return;
        }
      }
    }

    const timer = setTimeout(
      () => reject(new Error('WS message timeout')),
      timeoutMs
    );
    const handler = (data: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(data.toString());
        if (predicate(msg)) {
          clearTimeout(timer);
          ws.removeListener('message', handler);
          resolve(msg);
        }
      } catch {
        // Ignore unparseable messages
      }
    };
    ws.on('message', handler);
  });
}

/**
 * Open a WebSocket connection and wait for it to be ready.
 * Attaches a message buffer immediately so no early messages are lost.
 */
function connectWS(
  port: number,
  wsPath: string,
  headers?: Record<string, string>
): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${wsPath}`, { headers });

    // Buffer all messages that arrive before test code calls waitForMessage.
    // This prevents race conditions where the server sends the snapshot
    // message before the test's waitForMessage listener is attached.
    const msgBuffer: any[] = [];
    (ws as any)._msgBuffer = msgBuffer;
    ws.on('message', (data: WebSocket.RawData) => {
      try {
        msgBuffer.push(JSON.parse(data.toString()));
      } catch { /* ignore unparseable */ }
    });

    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error('WS connect timeout'));
    }, 3000);
    ws.on('open', () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Attempt a raw HTTP upgrade and capture the status code returned by the server.
 * This is used to test rejection paths (401, 404, 503) where the WebSocket
 * handshake is intentionally denied.
 */
function rawUpgrade(
  port: number,
  wsPath: string,
  headers?: Record<string, string>
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: wsPath,
        method: 'GET',
        headers: {
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Version': '13',
          'Sec-WebSocket-Key': Buffer.from('testkey1234567890').toString(
            'base64'
          ),
          ...(headers || {}),
        },
      },
      (res: any) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

describe('WebSocket HITL Real-Time Approvals (M3.3)', () => {
  // ========================================================================
  // Section 1: Behavioral tests — env var recognition and server startup
  // ========================================================================
  describe('Section 1: Env Var Recognition (behavioral)', () => {
    it('WebSocket server starts when EVOKORE_WS_APPROVALS_ENABLED=true', async () => {
      const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
      const { HttpServer } = require(httpServerJsPath);
      const { SecurityManager } = require(securityManagerJsPath);

      const saved = process.env.EVOKORE_WS_APPROVALS_ENABLED;
      process.env.EVOKORE_WS_APPROVALS_ENABLED = 'true';

      try {
        const mcpServer = new Server(
          { name: 'ws-env-test', version: '0.0.1' },
          { capabilities: { tools: {} } }
        );
        const sm = new SecurityManager();
        const server = new HttpServer(mcpServer, {
          port: 0,
          host: '127.0.0.1',
          securityManager: sm,
        });
        await server.start();
        const { port } = server.getAddress();

        // A successful WebSocket connection proves the WS server started
        const ws = await connectWS(port, '/ws/approvals');
        // Should receive a snapshot message on connect
        const msg = await waitForMessage(ws, (m) => m.type === 'snapshot');
        expect(msg.type).toBe('snapshot');
        expect(Array.isArray(msg.approvals)).toBe(true);

        ws.close();
        await server.stop();
      } finally {
        if (saved !== undefined) process.env.EVOKORE_WS_APPROVALS_ENABLED = saved;
        else delete process.env.EVOKORE_WS_APPROVALS_ENABLED;
      }
    });

    it('WebSocket server does NOT start when EVOKORE_WS_APPROVALS_ENABLED is unset', async () => {
      const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
      const { HttpServer } = require(httpServerJsPath);

      const saved = process.env.EVOKORE_WS_APPROVALS_ENABLED;
      delete process.env.EVOKORE_WS_APPROVALS_ENABLED;

      try {
        const mcpServer = new Server(
          { name: 'ws-disabled-test', version: '0.0.1' },
          { capabilities: { tools: {} } }
        );
        const server = new HttpServer(mcpServer, {
          port: 0,
          host: '127.0.0.1',
        });
        await server.start();
        const { port } = server.getAddress();

        // Upgrade request should fail because no WebSocket server is listening
        const result = await rawUpgrade(port, '/ws/approvals');
        // Without WS enabled, the server should NOT upgrade
        // The HTTP server itself may return 404 or just not handle the upgrade
        // Either way, we should NOT get a 101 Switching Protocols
        expect(result.statusCode).not.toBe(101);

        await server.stop();
      } finally {
        if (saved !== undefined) process.env.EVOKORE_WS_APPROVALS_ENABLED = saved;
        else delete process.env.EVOKORE_WS_APPROVALS_ENABLED;
      }
    });

    it('EVOKORE_WS_HEARTBEAT_MS controls heartbeat interval', async () => {
      const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
      const { HttpServer } = require(httpServerJsPath);
      const { SecurityManager } = require(securityManagerJsPath);

      const savedWs = process.env.EVOKORE_WS_APPROVALS_ENABLED;
      const savedHb = process.env.EVOKORE_WS_HEARTBEAT_MS;
      process.env.EVOKORE_WS_APPROVALS_ENABLED = 'true';
      // Set heartbeat to the minimum enforced by code (5000ms)
      process.env.EVOKORE_WS_HEARTBEAT_MS = '5000';

      try {
        const mcpServer = new Server(
          { name: 'ws-hb-test', version: '0.0.1' },
          { capabilities: { tools: {} } }
        );
        const sm = new SecurityManager();
        const server = new HttpServer(mcpServer, {
          port: 0,
          host: '127.0.0.1',
          securityManager: sm,
        });
        await server.start();
        const { port } = server.getAddress();

        // Connect and verify the snapshot arrives
        const ws = await connectWS(port, '/ws/approvals');
        const msg = await waitForMessage(ws, (m) => m.type === 'snapshot');
        expect(msg.type).toBe('snapshot');

        // Wait for the server heartbeat to fire a ping frame.
        // The heartbeat interval is 5000ms; wait up to 7000ms for the ping.
        const pingReceived = await new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => resolve(false), 7000);
          ws.on('ping', () => {
            clearTimeout(timer);
            resolve(true);
          });
        });
        expect(pingReceived).toBe(true);

        // After the ping cycle, verify the connection is still open
        expect(ws.readyState).toBe(WebSocket.OPEN);

        ws.close();
        await server.stop();
      } finally {
        if (savedWs !== undefined) process.env.EVOKORE_WS_APPROVALS_ENABLED = savedWs;
        else delete process.env.EVOKORE_WS_APPROVALS_ENABLED;
        if (savedHb !== undefined) process.env.EVOKORE_WS_HEARTBEAT_MS = savedHb;
        else delete process.env.EVOKORE_WS_HEARTBEAT_MS;
      }
    }, 15000);

    it('EVOKORE_WS_MAX_CLIENTS limits concurrent WebSocket connections', async () => {
      const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
      const { HttpServer } = require(httpServerJsPath);
      const { SecurityManager } = require(securityManagerJsPath);

      const savedWs = process.env.EVOKORE_WS_APPROVALS_ENABLED;
      const savedMax = process.env.EVOKORE_WS_MAX_CLIENTS;
      process.env.EVOKORE_WS_APPROVALS_ENABLED = 'true';
      process.env.EVOKORE_WS_MAX_CLIENTS = '1';

      try {
        const mcpServer = new Server(
          { name: 'ws-max-test', version: '0.0.1' },
          { capabilities: { tools: {} } }
        );
        const sm = new SecurityManager();
        const server = new HttpServer(mcpServer, {
          port: 0,
          host: '127.0.0.1',
          securityManager: sm,
        });
        await server.start();
        const { port } = server.getAddress();

        // First connection should succeed
        const ws1 = await connectWS(port, '/ws/approvals');
        await waitForMessage(ws1, (m) => m.type === 'snapshot');

        // Second connection should be rejected with 503
        const result = await rawUpgrade(port, '/ws/approvals');
        expect(result.statusCode).toBe(503);
        expect(result.body).toContain('Too many WebSocket clients');

        ws1.close();
        await server.stop();
      } finally {
        if (savedWs !== undefined) process.env.EVOKORE_WS_APPROVALS_ENABLED = savedWs;
        else delete process.env.EVOKORE_WS_APPROVALS_ENABLED;
        if (savedMax !== undefined) process.env.EVOKORE_WS_MAX_CLIENTS = savedMax;
        else delete process.env.EVOKORE_WS_MAX_CLIENTS;
      }
    });

    it('All WS-related env vars documented in .env.example', () => {
      const envExample = fs.readFileSync(
        path.join(ROOT, '.env.example'),
        'utf8'
      );
      expect(envExample).toContain('EVOKORE_WS_APPROVALS_ENABLED');
      expect(envExample).toContain('EVOKORE_WS_HEARTBEAT_MS');
      expect(envExample).toContain('EVOKORE_WS_MAX_CLIENTS');
      expect(envExample).toContain('EVOKORE_DASHBOARD_APPROVAL_WS_URL');
      expect(envExample).toContain('EVOKORE_DASHBOARD_APPROVAL_WS_TOKEN');
    });
  });

  // ========================================================================
  // Section 2: WebSocket Protocol (behavioral — real connections)
  // ========================================================================
  describe('Section 2: WebSocket Protocol (behavioral)', () => {
    let httpServer: any;
    let port: number;
    let sm: any;

    const savedEnv: Record<string, string | undefined> = {};

    beforeAll(async () => {
      // Snapshot env vars we will change
      for (const key of [
        'EVOKORE_WS_APPROVALS_ENABLED',
        'EVOKORE_WS_HEARTBEAT_MS',
        'EVOKORE_WS_MAX_CLIENTS',
        'EVOKORE_AUTH_REQUIRED',
        'EVOKORE_AUTH_TOKEN',
        'EVOKORE_HTTP_PORT',
        'EVOKORE_HTTP_HOST',
      ]) {
        savedEnv[key] = process.env[key];
      }

      process.env.EVOKORE_WS_APPROVALS_ENABLED = 'true';
      process.env.EVOKORE_WS_HEARTBEAT_MS = '30000';
      process.env.EVOKORE_WS_MAX_CLIENTS = '10';
      // Auth is NOT required for most protocol tests (Section 2)
      delete process.env.EVOKORE_AUTH_REQUIRED;
      delete process.env.EVOKORE_AUTH_TOKEN;

      const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
      const { HttpServer } = require(httpServerJsPath);
      const { SecurityManager } = require(securityManagerJsPath);

      const mcpServer = new Server(
        { name: 'ws-protocol-test', version: '0.0.1' },
        { capabilities: { tools: {} } }
      );
      sm = new SecurityManager();
      httpServer = new HttpServer(mcpServer, {
        port: 0,
        host: '127.0.0.1',
        securityManager: sm,
      });
      await httpServer.start();
      port = httpServer.getAddress().port;
    });

    afterAll(async () => {
      await httpServer?.stop().catch(() => {});
      // Restore env
      for (const [key, val] of Object.entries(savedEnv)) {
        if (val === undefined) delete process.env[key];
        else process.env[key] = val;
      }
    });

    it('connection endpoint path is /ws/approvals', async () => {
      const ws = await connectWS(port, '/ws/approvals');
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
    });

    it('snapshot message sent on connection', async () => {
      const ws = await connectWS(port, '/ws/approvals');
      const msg = await waitForMessage(ws, (m) => m.type === 'snapshot');
      expect(msg.type).toBe('snapshot');
      expect(Array.isArray(msg.approvals)).toBe(true);
      ws.close();
    });

    it('messages are valid JSON with type field', async () => {
      const ws = await connectWS(port, '/ws/approvals');
      const msg = await waitForMessage(ws, () => true);
      expect(typeof msg).toBe('object');
      expect(typeof msg.type).toBe('string');
      ws.close();
    });

    it('non /ws/approvals upgrade requests rejected with 404', async () => {
      const result = await rawUpgrade(port, '/ws/wrong-path');
      expect(result.statusCode).toBe(404);
    });

    it('ping/pong heartbeat: server responds with pong to client ping', async () => {
      const ws = await connectWS(port, '/ws/approvals');
      // Consume the initial snapshot
      await waitForMessage(ws, (m) => m.type === 'snapshot');

      // Send a JSON-level ping
      ws.send(JSON.stringify({ type: 'ping' }));
      const pong = await waitForMessage(ws, (m) => m.type === 'pong');
      expect(pong.type).toBe('pong');
      ws.close();
    });

    it('client can send approve message via WebSocket', async () => {
      // Generate a token so there is something to approve
      const token = sm.generateToken('test-tool', { arg: 'val' });
      const prefix = token.substring(0, 8);

      const ws = await connectWS(port, '/ws/approvals');
      // Consume snapshot
      await waitForMessage(ws, (m) => m.type === 'snapshot');

      // Send approve
      ws.send(JSON.stringify({ type: 'approve', prefix }));

      // We should receive an approval_acknowledged broadcast
      const ack = await waitForMessage(
        ws,
        (m) => m.type === 'approval_acknowledged'
      );
      expect(ack.type).toBe('approval_acknowledged');
      expect(ack.data.prefix).toBe(prefix);

      ws.close();
    });

    it('client can send deny message via WebSocket', async () => {
      // Generate a token to deny
      const token = sm.generateToken('deny-tool', { arg: 'x' });

      const ws = await connectWS(port, '/ws/approvals');
      await waitForMessage(ws, (m) => m.type === 'snapshot');

      // Send deny with full token
      ws.send(JSON.stringify({ type: 'deny', token }));

      // Should receive approval_denied broadcast
      const denied = await waitForMessage(
        ws,
        (m) => m.type === 'approval_denied'
      );
      expect(denied.type).toBe('approval_denied');

      ws.close();
    });

    it('server broadcasts approval_requested when a new token is generated', async () => {
      const ws = await connectWS(port, '/ws/approvals');
      await waitForMessage(ws, (m) => m.type === 'snapshot');

      // Generate a new token (this triggers approval_requested broadcast)
      sm.generateToken('broadcast-test-tool', { a: 1 });

      const requested = await waitForMessage(
        ws,
        (m) => m.type === 'approval_requested'
      );
      expect(requested.type).toBe('approval_requested');
      expect(requested.data.toolName).toBe('broadcast-test-tool');

      ws.close();
    });

    it('server broadcasts approval_granted when a token is consumed', async () => {
      const token = sm.generateToken('consume-test', {});

      const ws = await connectWS(port, '/ws/approvals');
      await waitForMessage(ws, (m) => m.type === 'snapshot');

      sm.consumeToken(token);

      const granted = await waitForMessage(
        ws,
        (m) => m.type === 'approval_granted'
      );
      expect(granted.type).toBe('approval_granted');
      expect(granted.data.toolName).toBe('consume-test');

      ws.close();
    });

    it('invalid approve prefix returns error message', async () => {
      const ws = await connectWS(port, '/ws/approvals');
      await waitForMessage(ws, (m) => m.type === 'snapshot');

      // Send a prefix that is too short (< 4 chars)
      ws.send(JSON.stringify({ type: 'approve', prefix: 'ab' }));

      const errMsg = await waitForMessage(ws, (m) => m.type === 'error');
      expect(errMsg.type).toBe('error');
      expect(errMsg.message).toContain('Invalid token prefix');

      ws.close();
    });

    it('malformed JSON is silently ignored (no crash)', async () => {
      const ws = await connectWS(port, '/ws/approvals');
      await waitForMessage(ws, (m) => m.type === 'snapshot');

      // Send garbage
      ws.send('this is not json {{{');

      // Connection should still be open — send a ping to verify
      ws.send(JSON.stringify({ type: 'ping' }));
      const pong = await waitForMessage(ws, (m) => m.type === 'pong');
      expect(pong.type).toBe('pong');

      ws.close();
    });
  });

  // ========================================================================
  // Section 2b: Auth-gated WebSocket connections (behavioral)
  // ========================================================================
  describe('Section 2b: Auth-Gated WebSocket Connections (behavioral)', () => {
    let httpServer: any;
    let port: number;

    const savedEnv: Record<string, string | undefined> = {};

    beforeAll(async () => {
      for (const key of [
        'EVOKORE_WS_APPROVALS_ENABLED',
        'EVOKORE_AUTH_REQUIRED',
        'EVOKORE_AUTH_TOKEN',
        'EVOKORE_ROLE',
      ]) {
        savedEnv[key] = process.env[key];
      }

      process.env.EVOKORE_WS_APPROVALS_ENABLED = 'true';
      process.env.EVOKORE_AUTH_REQUIRED = 'true';
      process.env.EVOKORE_AUTH_TOKEN = 'test-token-123';
      // The WebSocket RBAC check requires at least "developer" role.
      // When using static token auth, claims have no role, so the server
      // falls back to EVOKORE_ROLE. Set it to pass the RBAC gate.
      process.env.EVOKORE_ROLE = 'developer';

      const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
      const { HttpServer } = require(httpServerJsPath);
      const { SecurityManager } = require(securityManagerJsPath);
      const { loadAuthConfig } = require(authModulePath);

      const mcpServer = new Server(
        { name: 'ws-auth-test', version: '0.0.1' },
        { capabilities: { tools: {} } }
      );
      const sm = new SecurityManager();
      const authConfig = loadAuthConfig();
      httpServer = new HttpServer(mcpServer, {
        port: 0,
        host: '127.0.0.1',
        securityManager: sm,
        authConfig,
      });
      await httpServer.start();
      port = httpServer.getAddress().port;
    });

    afterAll(async () => {
      await httpServer?.stop().catch(() => {});
      for (const [key, val] of Object.entries(savedEnv)) {
        if (val === undefined) delete process.env[key];
        else process.env[key] = val;
      }
    });

    it('authenticated connection with valid Bearer token succeeds', async () => {
      const ws = await connectWS(port, '/ws/approvals', {
        Authorization: 'Bearer test-token-123',
      });
      const msg = await waitForMessage(ws, (m) => m.type === 'snapshot');
      expect(msg.type).toBe('snapshot');
      ws.close();
    });

    it('missing Authorization header returns 401', async () => {
      const result = await rawUpgrade(port, '/ws/approvals');
      expect(result.statusCode).toBe(401);
    });

    it('invalid token returns 401', async () => {
      const result = await rawUpgrade(port, '/ws/approvals', {
        Authorization: 'Bearer wrong-token',
      });
      expect(result.statusCode).toBe(401);
    });
  });

  // ========================================================================
  // Section 3: SecurityManager Callback (behavioral — actual method calls)
  // ========================================================================
  describe('Section 3: SecurityManager Callback (behavioral)', () => {
    let SecurityManager: any;

    beforeAll(() => {
      SecurityManager = require(securityManagerJsPath).SecurityManager;
    });

    it('setApprovalCallback registers a callback that fires on generateToken', () => {
      const sm = new SecurityManager();
      const events: any[] = [];
      sm.setApprovalCallback((event: any) => events.push(event));

      const token = sm.generateToken('test-tool', { key: 'value' });

      expect(events.length).toBe(1);
      expect(events[0].type).toBe('approval_requested');
      expect(events[0].data.toolName).toBe('test-tool');
      // tokenFull was removed from approval_requested events (SEC-01)
      expect(events[0].data.tokenFull).toBeUndefined();
      expect(events[0].data.token).toBe(token.substring(0, 8) + '...');
    });

    it('consumeToken fires approval_granted event', () => {
      const sm = new SecurityManager();
      const events: any[] = [];
      sm.setApprovalCallback((event: any) => events.push(event));

      const token = sm.generateToken('tool-a', {});
      events.length = 0; // Clear the approval_requested event

      sm.consumeToken(token);

      expect(events.length).toBe(1);
      expect(events[0].type).toBe('approval_granted');
      expect(events[0].data.toolName).toBe('tool-a');
    });

    it('approveToken fires approval_acknowledged event', () => {
      const sm = new SecurityManager();
      const events: any[] = [];
      sm.setApprovalCallback((event: any) => events.push(event));

      const token = sm.generateToken('tool-b', { x: 1 });
      events.length = 0;

      const prefix = token.substring(0, 8);
      const result = sm.approveToken(prefix);

      expect(result).toBe(true);
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('approval_acknowledged');
      expect(events[0].data.prefix).toBe(prefix);
      expect(events[0].data.approvedAt).toBeGreaterThan(0);
    });

    it('denyToken fires approval_denied event', () => {
      const sm = new SecurityManager();
      const events: any[] = [];
      sm.setApprovalCallback((event: any) => events.push(event));

      const token = sm.generateToken('tool-c', {});
      events.length = 0;

      const result = sm.denyToken(token);

      expect(result).toBe(true);
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('approval_denied');
    });

    it('emitApprovalEvent is a no-op when no callback is registered', () => {
      const sm = new SecurityManager();
      // No callback set — should not throw
      expect(() => {
        sm.generateToken('no-cb-tool', {});
      }).not.toThrow();
    });

    it('callback failure does not break token lifecycle (try-catch)', () => {
      const sm = new SecurityManager();
      sm.setApprovalCallback(() => {
        throw new Error('Deliberate callback failure');
      });

      // generateToken should still work (token is returned)
      const token = sm.generateToken('failing-cb-tool', { data: 'test' });
      expect(typeof token).toBe('string');
      expect(token.length).toBe(32);

      // validateToken should still work after a callback failure
      const valid = sm.validateToken('failing-cb-tool', token, { data: 'test' });
      expect(valid).toBe(true);

      // consumeToken should still work
      expect(() => sm.consumeToken(token)).not.toThrow();
    });

    it('full lifecycle: generate -> approve -> consume fires all events in order', () => {
      const sm = new SecurityManager();
      const events: any[] = [];
      sm.setApprovalCallback((event: any) => events.push(event));

      const token = sm.generateToken('lifecycle-tool', { step: 'full' });
      const prefix = token.substring(0, 8);
      sm.approveToken(prefix);
      sm.consumeToken(token);

      expect(events.length).toBe(3);
      expect(events[0].type).toBe('approval_requested');
      expect(events[1].type).toBe('approval_acknowledged');
      expect(events[2].type).toBe('approval_granted');
    });
  });

  // ========================================================================
  // Section 4: Dashboard Integration (HTTP behavioral)
  // ========================================================================
  // BUG-28: Converted from source-scraping to HTTP behavioral tests.
  // Spawns scripts/dashboard.js as a child process, GETs /approvals, and
  // asserts on the served HTML containing the expected client-side JS.
  describe('Section 4: Dashboard Integration (HTTP behavioral)', () => {
    const { spawn, ChildProcess } = require('child_process') as typeof import('child_process');
    const http = require('http') as typeof import('http');
    const DASH_PORT = 18899;

    /** GET a page from the dashboard server. */
    function httpGet(port: number, urlPath: string): Promise<{ statusCode: number; body: string }> {
      return new Promise((resolve, reject) => {
        const req = http.request(
          { hostname: '127.0.0.1', port, path: urlPath, method: 'GET' },
          (res: any) => {
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end', () =>
              resolve({ statusCode: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() })
            );
          }
        );
        req.on('error', reject);
        req.end();
      });
    }

    /** Poll until the dashboard responds on the given port. */
    function waitForDashboard(port: number, maxWaitMs = 8000): Promise<void> {
      return new Promise((resolve, reject) => {
        const start = Date.now();
        const poll = () => {
          http
            .get(`http://127.0.0.1:${port}/`, (res: any) => {
              res.resume();
              resolve();
            })
            .on('error', () => {
              if (Date.now() - start > maxWaitMs) reject(new Error('Dashboard did not start'));
              else setTimeout(poll, 150);
            });
        };
        poll();
      });
    }

    /** Spawn dashboard, wait for ready, fetch /approvals, kill, return HTML. */
    async function fetchApprovalsHtml(
      envOverrides: Record<string, string> = {}
    ): Promise<string> {
      const proc = spawn(process.execPath, [DASHBOARD_PATH], {
        cwd: ROOT,
        env: {
          ...process.env,
          EVOKORE_DASHBOARD_PORT: String(DASH_PORT),
          EVOKORE_HTTP_PORT: '3100',
          EVOKORE_HTTP_HOST: '127.0.0.1',
          ...envOverrides,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      try {
        await waitForDashboard(DASH_PORT);
        const res = await httpGet(DASH_PORT, '/approvals');
        expect(res.statusCode).toBe(200);
        return res.body;
      } finally {
        proc.kill();
        // Brief settle so the port is freed before the next spawn
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    // Fetched once for the default env, once with custom WS overrides
    let approvalHtml: string;
    let approvalHtmlWithWsUrl: string;

    beforeAll(async () => {
      // Default dashboard (no WS URL override, no token auth)
      approvalHtml = await fetchApprovalsHtml();

      // Dashboard with explicit WS URL and token overrides
      approvalHtmlWithWsUrl = await fetchApprovalsHtml({
        EVOKORE_DASHBOARD_APPROVAL_WS_URL: 'ws://custom-host:9999/ws/approvals',
        EVOKORE_DASHBOARD_APPROVAL_WS_TOKEN: 'custom-ws-token',
      });
    }, 25000);

    it('approvals page includes WebSocket connection code', () => {
      expect(approvalHtml).toContain('new WebSocket(');
      expect(approvalHtml).toContain('connectWebSocket');
    });

    it('approvals page declares WS endpoint variables for client-side routing', () => {
      expect(approvalHtml).toContain('var approvalWsUrl =');
      expect(approvalHtml).toContain('var approvalWsHost =');
      expect(approvalHtml).toContain('var approvalWsPort =');
    });

    it('env-var interpolation: custom WS URL appears in served HTML', () => {
      expect(approvalHtmlWithWsUrl).toContain('ws://custom-host:9999/ws/approvals');
    });

    it('approvals page declares WS token variable for client-side auth', () => {
      expect(approvalHtml).toContain('var approvalWsToken =');
    });

    it('env-var interpolation: custom WS token appears in served HTML', () => {
      expect(approvalHtmlWithWsUrl).toContain('custom-ws-token');
    });

    it('preserves same-origin fallback for non-loopback deployments', () => {
      expect(approvalHtml).toContain("window.location.host + '/ws/approvals'");
      expect(approvalHtml).toContain('loopbackHosts');
      expect(approvalHtml).toContain("approvalWsHost === '0.0.0.0' ? pageHost : approvalWsHost");
    });

    it('appends token with query-safe delimiter handling', () => {
      expect(approvalHtml).toContain("wsUrl.indexOf('?') === -1 ? '?' : '&'");
    });

    it('fallback to polling when WebSocket unavailable', () => {
      expect(approvalHtml).toContain('startPolling()');
      expect(approvalHtml).toContain('scheduleReconnect');
    });

    it('reconnection logic with exponential backoff', () => {
      expect(approvalHtml).toContain('wsReconnectDelay');
      expect(approvalHtml).toContain('wsMaxReconnectDelay');
      expect(approvalHtml).toContain('wsReconnectDelay * 2');
      expect(approvalHtml).toContain('Math.min(');
    });

    it('connection status indicator in UI', () => {
      expect(approvalHtml).toContain('ws-status');
      expect(approvalHtml).toContain('ws-dot-live');
      expect(approvalHtml).toContain('ws-dot-reconnecting');
      expect(approvalHtml).toContain('ws-dot-polling');
      expect(approvalHtml).toContain('updateWsStatus');
    });

    it('WS-based deny action when connected uses full token (BUG-01)', () => {
      expect(approvalHtml).toContain('wsConnected && wsConnection');
      expect(approvalHtml).toContain("JSON.stringify({ type: 'deny', token: token })");
    });

    it('WS-based approve action requires a live connection', () => {
      expect(approvalHtml).toContain('function approveToken(prefix)');
      expect(approvalHtml).toContain("JSON.stringify({ type: 'approve', prefix: prefix })");
      expect(approvalHtml).toContain('Approve requires a live WebSocket connection');
    });

    it('handles snapshot message type from server', () => {
      expect(approvalHtml).toContain("msg.type === 'snapshot'");
      expect(approvalHtml).toContain('msg.approvals');
    });

    it('handles approval_requested message type from server', () => {
      expect(approvalHtml).toContain("msg.type === 'approval_requested'");
    });

    it('handles approval_acknowledged message type from server', () => {
      expect(approvalHtml).toContain("msg.type === 'approval_acknowledged'");
      expect(approvalHtml).toContain('approvedAt');
    });

    it('handles approval_denied message type from server', () => {
      expect(approvalHtml).toContain("msg.type === 'approval_denied'");
    });

    it('handles approval_granted message type from server', () => {
      expect(approvalHtml).toContain("msg.type === 'approval_granted'");
    });

    it('handles WebSocket error messages by reloading approvals', () => {
      expect(approvalHtml).toContain("msg.type === 'error'");
      expect(approvalHtml).toContain('loadApprovals();');
      expect(approvalHtml).toContain('alert(msg.message)');
    });
  });

  // ========================================================================
  // Section 5: Backward Compatibility (behavioral)
  // ========================================================================
  describe('Section 5: Backward Compatibility (behavioral)', () => {
    it('HITL token lifecycle works correctly when WS is enabled', async () => {
      const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
      const { HttpServer } = require(httpServerJsPath);
      const { SecurityManager } = require(securityManagerJsPath);

      const saved = process.env.EVOKORE_WS_APPROVALS_ENABLED;
      process.env.EVOKORE_WS_APPROVALS_ENABLED = 'true';

      try {
        const mcpServer = new Server(
          { name: 'ws-compat-test', version: '0.0.1' },
          { capabilities: { tools: {} } }
        );
        const sm = new SecurityManager();
        const server = new HttpServer(mcpServer, {
          port: 0,
          host: '127.0.0.1',
          securityManager: sm,
        });
        await server.start();

        // Full HITL lifecycle: generate -> validate -> approve -> validate -> consume
        const token = sm.generateToken('compat-tool', { action: 'test' });
        expect(typeof token).toBe('string');
        expect(token.length).toBe(32);

        // Token should validate
        const valid = sm.validateToken('compat-tool', token, { action: 'test' });
        expect(valid).toBe(true);

        // Approve via prefix
        const prefix = token.substring(0, 8);
        expect(sm.approveToken(prefix)).toBe(true);

        // Token still validates after approve
        const stillValid = sm.validateToken('compat-tool', token, { action: 'test' });
        expect(stillValid).toBe(true);

        // Consume
        sm.consumeToken(token);

        // Token no longer validates after consume
        const afterConsume = sm.validateToken('compat-tool', token, { action: 'test' });
        expect(afterConsume).toBe(false);

        await server.stop();
      } finally {
        if (saved !== undefined) process.env.EVOKORE_WS_APPROVALS_ENABLED = saved;
        else delete process.env.EVOKORE_WS_APPROVALS_ENABLED;
      }
    });

    it('HITL token lifecycle works correctly when WS is disabled', () => {
      const { SecurityManager } = require(securityManagerJsPath);
      const sm = new SecurityManager();

      // No server, no callback — pure token lifecycle
      const token = sm.generateToken('offline-tool', { x: 1 });
      expect(typeof token).toBe('string');

      expect(sm.validateToken('offline-tool', token, { x: 1 })).toBe(true);
      expect(sm.validateToken('wrong-tool', token, { x: 1 })).toBe(false);
      expect(sm.validateToken('offline-tool', token, { x: 2 })).toBe(false);

      sm.consumeToken(token);
      expect(sm.validateToken('offline-tool', token, { x: 1 })).toBe(false);
    });

    it('denyToken lifecycle works via full token comparison', () => {
      const { SecurityManager } = require(securityManagerJsPath);
      const sm = new SecurityManager();

      const token = sm.generateToken('deny-compat', {});
      expect(sm.denyToken(token)).toBe(true);

      // After denial, token should no longer be pending
      const pending = sm.getPendingApprovals();
      const found = pending.find((p: any) => p.token === token.substring(0, 8) + '...');
      expect(found).toBeUndefined();
    });

    it('denyToken works with prefix (8+ chars) for dashboard compatibility', () => {
      const { SecurityManager } = require(securityManagerJsPath);
      const sm = new SecurityManager();

      const token = sm.generateToken('deny-prefix-tool', {});
      const prefix = token.substring(0, 8);
      expect(sm.denyToken(prefix)).toBe(true);

      // After prefix denial, token should no longer be pending
      const pending = sm.getPendingApprovals();
      const found = pending.find((p: any) => p.toolName === 'deny-prefix-tool');
      expect(found).toBeUndefined();
    });

    it('WebSocket feature is opt-in only (not started when env var is false)', async () => {
      const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
      const { HttpServer } = require(httpServerJsPath);

      const saved = process.env.EVOKORE_WS_APPROVALS_ENABLED;
      process.env.EVOKORE_WS_APPROVALS_ENABLED = 'false';

      try {
        const mcpServer = new Server(
          { name: 'ws-opt-in-test', version: '0.0.1' },
          { capabilities: { tools: {} } }
        );
        const server = new HttpServer(mcpServer, {
          port: 0,
          host: '127.0.0.1',
        });
        await server.start();
        const { port } = server.getAddress();

        // Upgrade should fail — WS is not enabled
        const result = await rawUpgrade(port, '/ws/approvals');
        expect(result.statusCode).not.toBe(101);

        await server.stop();
      } finally {
        if (saved !== undefined) process.env.EVOKORE_WS_APPROVALS_ENABLED = saved;
        else delete process.env.EVOKORE_WS_APPROVALS_ENABLED;
      }
    });

    it('HttpServer options interface accepts securityManager', () => {
      const { HttpServer } = require(httpServerJsPath);
      const { SecurityManager } = require(securityManagerJsPath);
      const { Server } = require('@modelcontextprotocol/sdk/server/index.js');

      const mcpServer = new Server(
        { name: 'options-test', version: '0.0.1' },
        { capabilities: { tools: {} } }
      );
      const sm = new SecurityManager();

      // Should not throw — proves the interface accepts securityManager
      const server = new HttpServer(mcpServer, { securityManager: sm });
      expect(server).toBeDefined();
    });

    it('WebSocket server properly cleaned up on stop()', async () => {
      const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
      const { HttpServer } = require(httpServerJsPath);
      const { SecurityManager } = require(securityManagerJsPath);

      const saved = process.env.EVOKORE_WS_APPROVALS_ENABLED;
      process.env.EVOKORE_WS_APPROVALS_ENABLED = 'true';

      try {
        const mcpServer = new Server(
          { name: 'ws-cleanup-test', version: '0.0.1' },
          { capabilities: { tools: {} } }
        );
        const sm = new SecurityManager();
        const server = new HttpServer(mcpServer, {
          port: 0,
          host: '127.0.0.1',
          securityManager: sm,
        });
        await server.start();
        const { port: serverPort } = server.getAddress();

        // Connect a WS client
        const ws = await connectWS(serverPort, '/ws/approvals');
        await waitForMessage(ws, (m) => m.type === 'snapshot');

        // Stop the server
        await server.stop();

        // Client should be disconnected (close event)
        await new Promise<void>((resolve) => {
          if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
            resolve();
          } else {
            ws.on('close', () => resolve());
            // Safety timeout
            setTimeout(() => resolve(), 2000);
          }
        });

        // After stop, connecting should fail
        await expect(
          connectWS(serverPort, '/ws/approvals')
        ).rejects.toThrow();
      } finally {
        if (saved !== undefined) process.env.EVOKORE_WS_APPROVALS_ENABLED = saved;
        else delete process.env.EVOKORE_WS_APPROVALS_ENABLED;
      }
    });

    it('getPendingApprovals returns current pending tokens', () => {
      const { SecurityManager } = require(securityManagerJsPath);
      const sm = new SecurityManager();

      const token1 = sm.generateToken('pending-tool-1', {});
      const token2 = sm.generateToken('pending-tool-2', {});

      const pending = sm.getPendingApprovals();
      expect(pending.length).toBeGreaterThanOrEqual(2);

      const names = pending.map((p: any) => p.toolName);
      expect(names).toContain('pending-tool-1');
      expect(names).toContain('pending-tool-2');

      // Each entry has expected fields (tokenFull removed per SEC-01)
      for (const entry of pending) {
        expect(entry.token).toBeDefined();
        expect((entry as any).tokenFull).toBeUndefined();
        expect(entry.toolName).toBeDefined();
        expect(entry.expiresAt).toBeGreaterThan(Date.now() - 1000);
        expect(entry.createdAt).toBeGreaterThan(0);
      }
    });
  });
});
