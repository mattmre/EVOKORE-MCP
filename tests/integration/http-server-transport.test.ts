import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import http from 'http';

const ROOT = path.resolve(__dirname, '../..');
const httpServerTsPath = path.join(ROOT, 'src', 'HttpServer.ts');
const httpServerJsPath = path.join(ROOT, 'dist', 'HttpServer.js');
const indexTsPath = path.join(ROOT, 'src', 'index.ts');

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

describe('T26: StreamableHTTP Server Transport', () => {
  // ---- Source-level structural validation ----

  describe('HttpServer source structure', () => {
    const src = fs.readFileSync(httpServerTsPath, 'utf8');

    it('imports StreamableHTTPServerTransport from the MCP SDK', () => {
      expect(src).toMatch(/StreamableHTTPServerTransport/);
      expect(src).toMatch(/import.*StreamableHTTPServerTransport.*from/);
    });

    it('imports http from node:http or http', () => {
      expect(src).toMatch(/import\s+http\s+from\s+["'](?:node:)?http["']/);
    });

    it('exports the HttpServer class', () => {
      expect(src).toMatch(/export\s+class\s+HttpServer/);
    });

    it('defines a start() method', () => {
      expect(src).toMatch(/async\s+start\s*\(\)/);
    });

    it('defines a stop() method', () => {
      expect(src).toMatch(/async\s+stop\s*\(\)/);
    });

    it('handles /health GET requests', () => {
      expect(src).toMatch(/\/health/);
    });

    it('handles /mcp endpoint', () => {
      expect(src).toMatch(/\/mcp/);
    });

    it('uses randomUUID for session ID generation', () => {
      expect(src).toMatch(/randomUUID/);
    });

    it('supports configurable port via EVOKORE_HTTP_PORT', () => {
      expect(src).toMatch(/EVOKORE_HTTP_PORT/);
    });

    it('supports configurable host via EVOKORE_HTTP_HOST', () => {
      expect(src).toMatch(/EVOKORE_HTTP_HOST/);
    });

    it('defaults port to 3100', () => {
      expect(src).toMatch(/3100/);
    });

    it('defaults host to 127.0.0.1', () => {
      expect(src).toMatch(/127\.0\.0\.1/);
    });
  });

  // ---- index.ts HTTP mode integration ----

  describe('index.ts HTTP mode wiring', () => {
    const src = fs.readFileSync(indexTsPath, 'utf8');

    it('imports HttpServer', () => {
      expect(src).toMatch(/import.*HttpServer.*from/);
    });

    it('defines a runHttp() method', () => {
      expect(src).toMatch(/async\s+runHttp\s*\(\)/);
    });

    it('checks EVOKORE_HTTP_MODE env var', () => {
      expect(src).toMatch(/EVOKORE_HTTP_MODE/);
    });

    it('checks --http CLI flag', () => {
      expect(src).toMatch(/--http/);
    });

    it('creates HttpServer with the MCP Server instance in runHttp()', () => {
      expect(src).toMatch(/new\s+HttpServer\s*\(\s*this\.server\s*\)/);
    });

    it('still has the stdio run() method', () => {
      expect(src).toMatch(/new\s+StdioServerTransport\s*\(\)/);
    });

    it('registers SIGTERM and SIGINT handlers for HTTP mode', () => {
      expect(src).toMatch(/SIGTERM/);
      expect(src).toMatch(/SIGINT/);
    });
  });

  // ---- Runtime: HttpServer module loads ----

  describe('HttpServer module loads', () => {
    it('compiled HttpServer module exists and exports HttpServer class', () => {
      const mod = require(httpServerJsPath);
      expect(mod.HttpServer).toBeDefined();
      expect(typeof mod.HttpServer).toBe('function');
    });
  });

  // ---- Runtime: HttpServer starts and responds ----

  describe('HttpServer runtime behavior', () => {
    let httpServer: any;
    let port: number;

    afterAll(async () => {
      if (httpServer) {
        await httpServer.stop().catch(() => {});
      }
    });

    it('starts on a random port and responds to /health', async () => {
      // Create a minimal MCP Server for testing
      const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
      const mcpServer = new Server(
        { name: 'test-server', version: '0.0.1' },
        { capabilities: { tools: {} } }
      );

      const { HttpServer } = require(httpServerJsPath);
      // Use port 0 to let the OS assign a random port
      httpServer = new HttpServer(mcpServer, { port: 0, host: '127.0.0.1' });
      await httpServer.start();

      const addr = httpServer.getAddress();
      port = addr.port;
      expect(port).toBeGreaterThan(0);

      // Test /health endpoint
      const healthRes = await httpRequest({
        hostname: '127.0.0.1',
        port,
        path: '/health',
        method: 'GET',
      });

      expect(healthRes.statusCode).toBe(200);
      const healthBody = JSON.parse(healthRes.body);
      expect(healthBody.status).toBe('ok');
      expect(healthBody.transport).toBe('streamable-http');
    });

    it('returns 404 for unknown paths', async () => {
      const addr = httpServer.getAddress();
      const res = await httpRequest({
        hostname: '127.0.0.1',
        port: addr.port,
        path: '/unknown',
        method: 'GET',
      });
      expect(res.statusCode).toBe(404);
    });

    it('POST /mcp with a valid JSON-RPC initialize request gets a response', async () => {
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

      // The transport should respond with either 200 (JSON) or 200 (SSE)
      expect(res.statusCode).toBe(200);
    });

    it('GET /mcp without a session ID returns 400', async () => {
      const addr = httpServer.getAddress();
      const res = await httpRequest({
        hostname: '127.0.0.1',
        port: addr.port,
        path: '/mcp',
        method: 'GET',
      });
      // No session = bad request for new session attempt via GET
      expect(res.statusCode).toBe(400);
    });

    it('POST /mcp with invalid session ID returns 404', async () => {
      const addr = httpServer.getAddress();
      const res = await httpRequest({
        hostname: '127.0.0.1',
        port: addr.port,
        path: '/mcp',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'mcp-session-id': 'nonexistent-session-id-12345',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }),
      });
      expect(res.statusCode).toBe(404);
    });

    it('graceful shutdown closes the server', async () => {
      const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
      const { HttpServer } = require(httpServerJsPath);

      const mcpServer2 = new Server(
        { name: 'shutdown-test', version: '0.0.1' },
        { capabilities: { tools: {} } }
      );

      const server2 = new HttpServer(mcpServer2, { port: 0, host: '127.0.0.1' });
      await server2.start();
      const addr2 = server2.getAddress();

      // Verify it is listening
      const healthBefore = await httpRequest({
        hostname: '127.0.0.1',
        port: addr2.port,
        path: '/health',
        method: 'GET',
      });
      expect(healthBefore.statusCode).toBe(200);

      // Stop
      await server2.stop();

      // After stopping, connecting should fail
      await expect(
        httpRequest({
          hostname: '127.0.0.1',
          port: addr2.port,
          path: '/health',
          method: 'GET',
        })
      ).rejects.toThrow();
    });
  });
});
