import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import { WebhookManager, WEBHOOK_EVENT_TYPES, WebhookPayload } from '../../src/WebhookManager';

const ROOT = path.resolve(__dirname, '../..');
const webhookManagerTsPath = path.join(ROOT, 'src', 'WebhookManager.ts');
const indexTsPath = path.join(ROOT, 'src', 'index.ts');
const proxyManagerTsPath = path.join(ROOT, 'src', 'ProxyManager.ts');

// ---- Source-level structural validation ----

describe('T29: Webhook Event System', () => {
  // BUG-35: SSRF protection blocks private/loopback addresses by default.
  // Tests use 127.0.0.1 so we must opt in for local dev/test usage.
  const savedAllowPrivate = process.env.EVOKORE_WEBHOOKS_ALLOW_PRIVATE;
  beforeAll(() => {
    process.env.EVOKORE_WEBHOOKS_ALLOW_PRIVATE = 'true';
  });
  afterAll(() => {
    if (savedAllowPrivate !== undefined) {
      process.env.EVOKORE_WEBHOOKS_ALLOW_PRIVATE = savedAllowPrivate;
    } else {
      delete process.env.EVOKORE_WEBHOOKS_ALLOW_PRIVATE;
    }
  });

  describe('WebhookManager module exists', () => {
    it('WebhookManager.ts source file exists', () => {
      expect(fs.existsSync(webhookManagerTsPath)).toBe(true);
    });

    it('exports WebhookManager class', () => {
      expect(WebhookManager).toBeDefined();
      expect(typeof WebhookManager).toBe('function');
    });
  });

  describe('event type definitions', () => {
    const src = fs.readFileSync(webhookManagerTsPath, 'utf8');

    it('defines WebhookEventType as a union type', () => {
      expect(src).toMatch(/type WebhookEventType/);
    });

    it('includes tool_call event', () => {
      expect(src).toMatch(/"tool_call"/);
    });

    it('includes tool_error event', () => {
      expect(src).toMatch(/"tool_error"/);
    });

    it('includes session_start event', () => {
      expect(src).toMatch(/"session_start"/);
    });

    it('includes session_end event', () => {
      expect(src).toMatch(/"session_end"/);
    });

    it('includes approval_requested event', () => {
      expect(src).toMatch(/"approval_requested"/);
    });

    it('includes approval_granted event', () => {
      expect(src).toMatch(/"approval_granted"/);
    });

    it('exports WEBHOOK_EVENT_TYPES array', () => {
      expect(Array.isArray(WEBHOOK_EVENT_TYPES)).toBe(true);
      expect(WEBHOOK_EVENT_TYPES).toContain('tool_call');
      expect(WEBHOOK_EVENT_TYPES).toContain('tool_error');
      expect(WEBHOOK_EVENT_TYPES).toContain('session_start');
      expect(WEBHOOK_EVENT_TYPES).toContain('session_end');
      expect(WEBHOOK_EVENT_TYPES).toContain('approval_requested');
      expect(WEBHOOK_EVENT_TYPES).toContain('approval_granted');
      expect(WEBHOOK_EVENT_TYPES).toContain('session_resumed');
      expect(WEBHOOK_EVENT_TYPES.length).toBe(10);
    });
  });

  describe('webhook config parsing', () => {
    it('loadWebhooks reads from a config file with webhooks key', () => {
      const tmpConfig = path.join(ROOT, '.test-webhook-config.json');

      try {
        fs.writeFileSync(tmpConfig, JSON.stringify({
          webhooks: [
            { url: 'https://example.com/hook', events: ['tool_call'], secret: 'test-secret' },
            { url: 'https://example.com/hook2', events: ['tool_error'] }
          ]
        }));

        const manager = new WebhookManager();
        manager.setEnabled(true);
        manager.loadWebhooks(tmpConfig);

        const hooks = manager.getWebhooks();
        expect(hooks.length).toBe(2);
        expect(hooks[0].url).toBe('https://example.com/hook');
        expect(hooks[0].events).toEqual(['tool_call']);
        expect(hooks[0].hasSecret).toBe(true);
        expect(hooks[1].url).toBe('https://example.com/hook2');
        expect(hooks[1].hasSecret).toBe(false);
      } finally {
        if (fs.existsSync(tmpConfig)) fs.unlinkSync(tmpConfig);
      }
    });

    it('loadWebhooks gracefully handles missing config file', () => {
      const manager = new WebhookManager();
      manager.setEnabled(true);
      manager.loadWebhooks('/nonexistent/path.json');
      expect(manager.getWebhooks().length).toBe(0);
    });

    it('loadWebhooks gracefully handles config without webhooks key', () => {
      const tmpConfig = path.join(ROOT, '.test-webhook-config-no-key.json');

      try {
        fs.writeFileSync(tmpConfig, JSON.stringify({ servers: {} }));

        const manager = new WebhookManager();
        manager.setEnabled(true);
        manager.loadWebhooks(tmpConfig);
        expect(manager.getWebhooks().length).toBe(0);
      } finally {
        if (fs.existsSync(tmpConfig)) fs.unlinkSync(tmpConfig);
      }
    });

    it('loadWebhooks filters invalid webhook entries', () => {
      const tmpConfig = path.join(ROOT, '.test-webhook-config-invalid.json');

      try {
        fs.writeFileSync(tmpConfig, JSON.stringify({
          webhooks: [
            { url: 'https://valid.com/hook', events: ['tool_call'] },
            { events: ['tool_call'] },         // missing url
            { url: 'https://no-events.com' },  // missing events
            { url: '', events: ['tool_call'] }, // empty url
            { url: 'https://empty-events.com', events: [] }, // empty events
            null,
            42
          ]
        }));

        const manager = new WebhookManager();
        manager.setEnabled(true);
        manager.loadWebhooks(tmpConfig);
        expect(manager.getWebhooks().length).toBe(1);
        expect(manager.getWebhooks()[0].url).toBe('https://valid.com/hook');
      } finally {
        if (fs.existsSync(tmpConfig)) fs.unlinkSync(tmpConfig);
      }
    });

    it('loadWebhooks is skipped when disabled', () => {
      const tmpConfig = path.join(ROOT, '.test-webhook-config-disabled.json');

      try {
        fs.writeFileSync(tmpConfig, JSON.stringify({
          webhooks: [
            { url: 'https://example.com/hook', events: ['tool_call'] }
          ]
        }));

        const manager = new WebhookManager();
        // NOT calling setEnabled(true) -- default is disabled
        manager.loadWebhooks(tmpConfig);
        expect(manager.getWebhooks().length).toBe(0);
      } finally {
        if (fs.existsSync(tmpConfig)) fs.unlinkSync(tmpConfig);
      }
    });
  });

  describe('HMAC signature generation', () => {
    it('computeSignature produces a valid HMAC-SHA256 hex digest', () => {
      const body = '{"event":"tool_call","data":{}}';
      const secret = 'test-secret-123';

      const signature = WebhookManager.computeSignature(body, secret);

      // Verify independently
      const expected = crypto
        .createHmac('sha256', secret)
        .update(body, 'utf8')
        .digest('hex');

      expect(signature).toBe(expected);
      expect(signature).toMatch(/^[0-9a-f]{64}$/);
    });

    it('different secrets produce different signatures', () => {
      const body = '{"test":true}';

      const sig1 = WebhookManager.computeSignature(body, 'secret-a');
      const sig2 = WebhookManager.computeSignature(body, 'secret-b');

      expect(sig1).not.toBe(sig2);
    });

    it('different payloads produce different signatures', () => {
      const secret = 'shared-secret';

      const sig1 = WebhookManager.computeSignature('{"a":1}', secret);
      const sig2 = WebhookManager.computeSignature('{"a":2}', secret);

      expect(sig1).not.toBe(sig2);
    });
  });

  describe('signature verification', () => {
    it('verifySignature returns true for valid signature', () => {
      const body = '{"test":true}';
      const secret = 'test-secret';
      const sig = WebhookManager.computeSignature(body, secret);
      expect(WebhookManager.verifySignature(body, secret, sig)).toBe(true);
    });

    it('verifySignature returns false for invalid signature', () => {
      const body = '{"test":true}';
      const secret = 'test-secret';
      expect(WebhookManager.verifySignature(body, secret, 'invalid-hex')).toBe(false);
    });
  });

  describe('URL scheme validation', () => {
    it('rejects non-HTTP webhook URLs', () => {
      const tmpConfig = path.join(ROOT, '.test-webhook-config-url-scheme.json');

      try {
        fs.writeFileSync(tmpConfig, JSON.stringify({
          webhooks: [
            { url: 'ftp://example.com/hook', events: ['tool_call'] },
            { url: 'file:///etc/passwd', events: ['tool_call'] },
            { url: 'javascript:alert(1)', events: ['tool_call'] },
            { url: 'https://valid.com/hook', events: ['tool_call'] },
            { url: 'http://localhost:8080/hook', events: ['tool_error'] }
          ]
        }));

        const manager = new WebhookManager();
        manager.setEnabled(true);
        manager.loadWebhooks(tmpConfig);

        const hooks = manager.getWebhooks();
        expect(hooks.length).toBe(2);
        expect(hooks[0].url).toBe('https://valid.com/hook');
        expect(hooks[1].url).toBe('http://localhost:8080/hook');
      } finally {
        if (fs.existsSync(tmpConfig)) fs.unlinkSync(tmpConfig);
      }
    });
  });

  describe('event payload format', () => {
    it('emit constructs a well-formed payload and delivers it', async () => {
      // Start a local HTTP server to capture the webhook delivery
      let receivedBody: any = null;
      let receivedHeaders: http.IncomingHttpHeaders = {};

      const server = http.createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          receivedBody = JSON.parse(Buffer.concat(chunks).toString());
          receivedHeaders = req.headers;
          res.writeHead(200);
          res.end();
        });
      });

      const port = await new Promise<number>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address() as { port: number };
          resolve(addr.port);
        });
      });

      try {
        const manager = new WebhookManager();
        manager.setEnabled(true);
        manager.setWebhooks([
          { url: `http://127.0.0.1:${port}/webhook`, events: ['tool_call'], secret: 'payload-test-secret' }
        ]);

        manager.emit('tool_call', { tool: 'test_tool', arguments: { key: 'value' } });

        // Wait for fire-and-forget delivery
        await new Promise((resolve) => setTimeout(resolve, 2000));

        expect(receivedBody).not.toBeNull();
        expect(receivedBody.event).toBe('tool_call');
        expect(receivedBody.data.tool).toBe('test_tool');
        expect(receivedBody.data.arguments).toEqual({ key: 'value' });
        expect(receivedBody.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(receivedBody.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);

        // Verify HMAC signature header (now includes timestamp in HMAC input)
        expect(receivedHeaders['x-evokore-signature']).toBeDefined();
        const ts = Number(receivedHeaders['x-evokore-timestamp']);
        expect(ts).toBeGreaterThan(0);
        const expectedSig = WebhookManager.computeSignature(
          JSON.stringify(receivedBody),
          'payload-test-secret',
          ts
        );
        expect(receivedHeaders['x-evokore-signature']).toBe(expectedSig);
        expect(receivedHeaders['content-type']).toBe('application/json');
        expect(receivedHeaders['user-agent']).toBe('EVOKORE-MCP-Webhook/3.0');
      } finally {
        server.close();
      }
    });
  });

  describe('fire-and-forget delivery', () => {
    it('emit does not block the caller even when webhook is slow', async () => {
      // Create a slow server that takes 3 seconds to respond
      const server = http.createServer((req, res) => {
        req.resume();
        req.on('end', () => {
          setTimeout(() => {
            res.writeHead(200);
            res.end();
          }, 3000);
        });
      });

      const port = await new Promise<number>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address() as { port: number };
          resolve(addr.port);
        });
      });

      try {
        const manager = new WebhookManager();
        manager.setEnabled(true);
        manager.setWebhooks([
          { url: `http://127.0.0.1:${port}/slow`, events: ['tool_call'] }
        ]);

        const start = Date.now();
        manager.emit('tool_call', { tool: 'fast_test' });
        const elapsed = Date.now() - start;

        // emit should return nearly instantly (under 50ms)
        expect(elapsed).toBeLessThan(50);
      } finally {
        server.close();
      }
    });

    it('emit does not throw when no webhooks are configured', () => {
      const manager = new WebhookManager();
      manager.setEnabled(true);

      // Should not throw
      expect(() => {
        manager.emit('tool_call', { tool: 'test' });
      }).not.toThrow();
    });

    it('emit skips webhooks that do not subscribe to the event type', async () => {
      let hitCount = 0;
      const server = http.createServer((req, res) => {
        hitCount++;
        req.resume();
        req.on('end', () => {
          res.writeHead(200);
          res.end();
        });
      });

      const port = await new Promise<number>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address() as { port: number };
          resolve(addr.port);
        });
      });

      try {
        const manager = new WebhookManager();
        manager.setEnabled(true);
        manager.setWebhooks([
          { url: `http://127.0.0.1:${port}/hook`, events: ['tool_error'] }
        ]);

        // Emit a tool_call event -- this webhook only listens to tool_error
        manager.emit('tool_call', { tool: 'test' });

        await new Promise((resolve) => setTimeout(resolve, 1000));
        expect(hitCount).toBe(0);
      } finally {
        server.close();
      }
    });
  });

  describe('retry logic', () => {
    it('retries failed deliveries up to 3 times', async () => {
      let attemptCount = 0;
      const server = http.createServer((req, res) => {
        attemptCount++;
        req.resume();
        req.on('end', () => {
          if (attemptCount < 3) {
            res.writeHead(500);
            res.end('Internal Server Error');
          } else {
            res.writeHead(200);
            res.end('OK');
          }
        });
      });

      const port = await new Promise<number>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address() as { port: number };
          resolve(addr.port);
        });
      });

      try {
        const manager = new WebhookManager();
        manager.setEnabled(true);
        manager.setWebhooks([
          { url: `http://127.0.0.1:${port}/retry`, events: ['tool_call'] }
        ]);

        manager.emit('tool_call', { tool: 'retry_test' });

        // Wait for retries (500ms + 1000ms + some processing time)
        await new Promise((resolve) => setTimeout(resolve, 5000));

        // Should have attempted 3 times (2 failures + 1 success)
        expect(attemptCount).toBe(3);
      } finally {
        server.close();
      }
    }, 10000);

    it('gives up after 3 failed attempts', async () => {
      let attemptCount = 0;
      const server = http.createServer((req, res) => {
        attemptCount++;
        req.resume();
        req.on('end', () => {
          res.writeHead(500);
          res.end('Always fail');
        });
      });

      const port = await new Promise<number>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address() as { port: number };
          resolve(addr.port);
        });
      });

      try {
        const manager = new WebhookManager();
        manager.setEnabled(true);
        manager.setWebhooks([
          { url: `http://127.0.0.1:${port}/fail`, events: ['tool_call'] }
        ]);

        manager.emit('tool_call', { tool: 'fail_test' });

        // Wait for all retry attempts
        await new Promise((resolve) => setTimeout(resolve, 6000));

        // Should have attempted exactly 3 times then given up
        expect(attemptCount).toBe(3);
      } finally {
        server.close();
      }
    }, 10000);
  });

  describe('disabled state (EVOKORE_WEBHOOKS_ENABLED=false)', () => {
    it('isEnabled returns false by default', () => {
      // Save and clear env
      const saved = process.env.EVOKORE_WEBHOOKS_ENABLED;
      delete process.env.EVOKORE_WEBHOOKS_ENABLED;

      try {
        const manager = new WebhookManager();
        expect(manager.isEnabled()).toBe(false);
      } finally {
        if (saved !== undefined) {
          process.env.EVOKORE_WEBHOOKS_ENABLED = saved;
        }
      }
    });

    it('emit is a no-op when disabled', async () => {
      let hitCount = 0;
      const server = http.createServer((req, res) => {
        hitCount++;
        req.resume();
        req.on('end', () => {
          res.writeHead(200);
          res.end();
        });
      });

      const port = await new Promise<number>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address() as { port: number };
          resolve(addr.port);
        });
      });

      try {
        const manager = new WebhookManager();
        // Explicitly NOT enabled
        manager.setWebhooks([
          { url: `http://127.0.0.1:${port}/hook`, events: ['tool_call'] }
        ]);

        manager.emit('tool_call', { tool: 'should_not_arrive' });

        await new Promise((resolve) => setTimeout(resolve, 1000));
        expect(hitCount).toBe(0);
      } finally {
        server.close();
      }
    });
  });

  describe('index.ts integration', () => {
    const indexSrc = fs.readFileSync(indexTsPath, 'utf8');

    it('imports WebhookManager', () => {
      expect(indexSrc).toMatch(/import.*WebhookManager.*from.*"\.\/WebhookManager"/);
    });

    it('declares webhookManager as a private field', () => {
      expect(indexSrc).toMatch(/private webhookManager:\s*WebhookManager/);
    });

    it('instantiates WebhookManager in constructor', () => {
      expect(indexSrc).toMatch(/this\.webhookManager\s*=\s*new WebhookManager\(\)/);
    });

    it('loads webhooks during loadSubsystems', () => {
      expect(indexSrc).toMatch(/this\.webhookManager\.loadWebhooks\(\)/);
    });

    it('emits tool_call event in CallToolRequest handler', () => {
      expect(indexSrc).toMatch(/this\.webhookManager\.emit\("tool_call"/);
    });

    it('emits tool_error event for errors', () => {
      expect(indexSrc).toMatch(/this\.webhookManager\.emit\("tool_error"/);
    });

    it('emits session_start event in run methods', () => {
      expect(indexSrc).toMatch(/this\.webhookManager\.emit\("session_start"/);
    });

    it('redacts sensitive arguments in tool_call emit', () => {
      expect(indexSrc).toMatch(/this\.redactSensitiveArgs\(/);
    });

    it('emits session_end in HTTP shutdown handler', () => {
      expect(indexSrc).toMatch(/this\.webhookManager\.emit\("session_end",\s*\{\s*transport:\s*"http"/);
    });

    it('emits session_end in stdio shutdown handler', () => {
      expect(indexSrc).toMatch(/this\.webhookManager\.emit\("session_end",\s*\{\s*transport:\s*"stdio"/);
    });

    it('passes webhookManager to ProxyManager constructor', () => {
      expect(indexSrc).toMatch(/new ProxyManager\(this\.securityManager,\s*this\.webhookManager\)/);
    });

    it('creates WebhookManager before ProxyManager', () => {
      const wmIndex = indexSrc.indexOf('this.webhookManager = new WebhookManager()');
      const pmIndex = indexSrc.indexOf('new ProxyManager(this.securityManager, this.webhookManager)');
      expect(wmIndex).toBeGreaterThan(-1);
      expect(pmIndex).toBeGreaterThan(-1);
      expect(wmIndex).toBeLessThan(pmIndex);
    });
  });

  describe('ProxyManager webhook integration (source-level)', () => {
    const proxySrc = fs.readFileSync(proxyManagerTsPath, 'utf8');

    it('imports WebhookManager', () => {
      expect(proxySrc).toMatch(/import.*WebhookManager.*from.*"\.\/WebhookManager"/);
    });

    it('constructor accepts optional WebhookManager parameter', () => {
      expect(proxySrc).toMatch(/constructor\(security:\s*SecurityManager,\s*webhookManager\?\s*:\s*WebhookManager\)/);
    });

    it('stores webhookManager as private field', () => {
      expect(proxySrc).toMatch(/private webhookManager:\s*WebhookManager\s*\|\s*null/);
    });

    it('emits approval_requested when HITL token is generated', () => {
      expect(proxySrc).toMatch(/\.emit\("approval_requested"/);
    });

    it('approval_requested includes tool, server, and tokenPrefix', () => {
      expect(proxySrc).toMatch(/emit\("approval_requested",\s*\{[^}]*tool:\s*toolName/);
      expect(proxySrc).toMatch(/emit\("approval_requested",\s*\{[^}]*server:\s*serverId/);
      expect(proxySrc).toMatch(/emit\("approval_requested",\s*\{[^}]*tokenPrefix:/);
    });

    it('emits approval_granted when a valid token is consumed', () => {
      expect(proxySrc).toMatch(/\.emit\("approval_granted"/);
    });

    it('approval_granted includes tool and server', () => {
      expect(proxySrc).toMatch(/emit\("approval_granted",\s*\{[^}]*tool:\s*toolName/);
      expect(proxySrc).toMatch(/emit\("approval_granted",\s*\{[^}]*server:\s*serverId/);
    });
  });

  describe('replay protection', () => {
    it('delivery includes X-EVOKORE-Timestamp and X-EVOKORE-Nonce headers', async () => {
      let receivedHeaders: http.IncomingHttpHeaders = {};

      const server = http.createServer((req, res) => {
        receivedHeaders = req.headers;
        req.resume();
        req.on('end', () => {
          res.writeHead(200);
          res.end();
        });
      });

      const port = await new Promise<number>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address() as { port: number };
          resolve(addr.port);
        });
      });

      try {
        const manager = new WebhookManager();
        manager.setEnabled(true);
        manager.setWebhooks([
          { url: `http://127.0.0.1:${port}/hook`, events: ['tool_call'], secret: 'replay-test' }
        ]);

        manager.emit('tool_call', { tool: 'test_replay' });

        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Timestamp header should be a Unix epoch seconds string
        expect(receivedHeaders['x-evokore-timestamp']).toBeDefined();
        const ts = Number(receivedHeaders['x-evokore-timestamp']);
        expect(ts).toBeGreaterThan(0);
        // Should be within a few seconds of now
        expect(Math.abs(Date.now() / 1000 - ts)).toBeLessThan(10);

        // Nonce header should be present
        expect(receivedHeaders['x-evokore-nonce']).toBeDefined();
        expect(receivedHeaders['x-evokore-nonce']).toMatch(/^[0-9a-f-]{36}$/);
      } finally {
        server.close();
      }
    });

    it('nonce header matches payload id', async () => {
      let receivedBody: any = null;
      let receivedHeaders: http.IncomingHttpHeaders = {};

      const server = http.createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          receivedBody = JSON.parse(Buffer.concat(chunks).toString());
          receivedHeaders = req.headers;
          res.writeHead(200);
          res.end();
        });
      });

      const port = await new Promise<number>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address() as { port: number };
          resolve(addr.port);
        });
      });

      try {
        const manager = new WebhookManager();
        manager.setEnabled(true);
        manager.setWebhooks([
          { url: `http://127.0.0.1:${port}/hook`, events: ['tool_call'] }
        ]);

        manager.emit('tool_call', { tool: 'nonce_test' });

        await new Promise((resolve) => setTimeout(resolve, 2000));

        expect(receivedBody).not.toBeNull();
        expect(receivedHeaders['x-evokore-nonce']).toBe(receivedBody.id);
      } finally {
        server.close();
      }
    });

    it('computeSignature with timestamp produces different output than without', () => {
      const body = '{"event":"tool_call","data":{}}';
      const secret = 'test-secret-123';
      const timestamp = Math.floor(Date.now() / 1000);

      const sigWithout = WebhookManager.computeSignature(body, secret);
      const sigWith = WebhookManager.computeSignature(body, secret, timestamp);

      expect(sigWithout).not.toBe(sigWith);
      // Both should be valid hex
      expect(sigWithout).toMatch(/^[0-9a-f]{64}$/);
      expect(sigWith).toMatch(/^[0-9a-f]{64}$/);
    });

    it('verifySignature with valid timestamp passes', () => {
      const body = '{"test":"replay"}';
      const secret = 'replay-secret';
      const timestamp = Math.floor(Date.now() / 1000);

      const sig = WebhookManager.computeSignature(body, secret, timestamp);
      expect(WebhookManager.verifySignature(body, secret, sig, timestamp)).toBe(true);
    });

    it('verifySignature with expired timestamp (6 min old) fails', () => {
      const body = '{"test":"expired"}';
      const secret = 'replay-secret';
      // 6 minutes ago (beyond the 5-minute window)
      const timestamp = Math.floor(Date.now() / 1000) - 360;

      const sig = WebhookManager.computeSignature(body, secret, timestamp);
      expect(WebhookManager.verifySignature(body, secret, sig, timestamp)).toBe(false);
    });

    it('verifySignature with future timestamp (6 min ahead) fails', () => {
      const body = '{"test":"future"}';
      const secret = 'replay-secret';
      // 6 minutes in the future (beyond the 5-minute window)
      const timestamp = Math.floor(Date.now() / 1000) + 360;

      const sig = WebhookManager.computeSignature(body, secret, timestamp);
      expect(WebhookManager.verifySignature(body, secret, sig, timestamp)).toBe(false);
    });

    it('verifySignature without timestamp still works (backward compat)', () => {
      const body = '{"test":"legacy"}';
      const secret = 'legacy-secret';

      const sig = WebhookManager.computeSignature(body, secret);
      expect(WebhookManager.verifySignature(body, secret, sig)).toBe(true);
    });

    it('REPLAY_WINDOW_MS is 300000 (5 minutes)', () => {
      expect(WebhookManager.REPLAY_WINDOW_MS).toBe(300_000);
    });
  });

  describe('ProxyManager backward compatibility', () => {
    it('can be constructed without WebhookManager (backward compatible)', () => {
      const { ProxyManager } = require('../../dist/ProxyManager.js');
      const { SecurityManager } = require('../../dist/SecurityManager.js');

      const sm = new SecurityManager();
      const pm = new ProxyManager(sm);
      expect(pm).toBeDefined();
      expect(pm.canHandle('nonexistent_tool')).toBe(false);
    });

    it('can be constructed with a WebhookManager', () => {
      const { ProxyManager } = require('../../dist/ProxyManager.js');
      const { SecurityManager } = require('../../dist/SecurityManager.js');
      const { WebhookManager } = require('../../dist/WebhookManager.js');

      const sm = new SecurityManager();
      const wm = new WebhookManager();
      const pm = new ProxyManager(sm, wm);
      expect(pm).toBeDefined();
    });
  });

  describe('session_end event unit tests', () => {
    it('WebhookManager can emit session_end with correct payload', async () => {
      let receivedBody: any = null;

      const server = http.createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          receivedBody = JSON.parse(Buffer.concat(chunks).toString());
          res.writeHead(200);
          res.end();
        });
      });

      const port = await new Promise<number>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address() as { port: number };
          resolve(addr.port);
        });
      });

      try {
        const manager = new WebhookManager();
        manager.setEnabled(true);
        manager.setWebhooks([
          { url: `http://127.0.0.1:${port}/webhook`, events: ['session_end'] }
        ]);

        manager.emit('session_end', { transport: 'http', reason: 'shutdown' });

        await new Promise((resolve) => setTimeout(resolve, 2000));

        expect(receivedBody).not.toBeNull();
        expect(receivedBody.event).toBe('session_end');
        expect(receivedBody.data.transport).toBe('http');
        expect(receivedBody.data.reason).toBe('shutdown');
        expect(receivedBody.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(receivedBody.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      } finally {
        server.close();
      }
    });
  });

  describe('approval event unit tests', () => {
    it('WebhookManager can emit approval_requested with correct payload', async () => {
      let receivedBody: any = null;

      const server = http.createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          receivedBody = JSON.parse(Buffer.concat(chunks).toString());
          res.writeHead(200);
          res.end();
        });
      });

      const port = await new Promise<number>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address() as { port: number };
          resolve(addr.port);
        });
      });

      try {
        const manager = new WebhookManager();
        manager.setEnabled(true);
        manager.setWebhooks([
          { url: `http://127.0.0.1:${port}/webhook`, events: ['approval_requested'] }
        ]);

        manager.emit('approval_requested', {
          tool: 'supabase_run_query',
          server: 'supabase',
          tokenPrefix: 'abcd1234...'
        });

        await new Promise((resolve) => setTimeout(resolve, 2000));

        expect(receivedBody).not.toBeNull();
        expect(receivedBody.event).toBe('approval_requested');
        expect(receivedBody.data.tool).toBe('supabase_run_query');
        expect(receivedBody.data.server).toBe('supabase');
        expect(receivedBody.data.tokenPrefix).toBe('abcd1234...');
      } finally {
        server.close();
      }
    });

    it('WebhookManager can emit approval_granted with correct payload', async () => {
      let receivedBody: any = null;

      const server = http.createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          receivedBody = JSON.parse(Buffer.concat(chunks).toString());
          res.writeHead(200);
          res.end();
        });
      });

      const port = await new Promise<number>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address() as { port: number };
          resolve(addr.port);
        });
      });

      try {
        const manager = new WebhookManager();
        manager.setEnabled(true);
        manager.setWebhooks([
          { url: `http://127.0.0.1:${port}/webhook`, events: ['approval_granted'] }
        ]);

        manager.emit('approval_granted', {
          tool: 'supabase_run_query',
          server: 'supabase'
        });

        await new Promise((resolve) => setTimeout(resolve, 2000));

        expect(receivedBody).not.toBeNull();
        expect(receivedBody.event).toBe('approval_granted');
        expect(receivedBody.data.tool).toBe('supabase_run_query');
        expect(receivedBody.data.server).toBe('supabase');
      } finally {
        server.close();
      }
    });
  });
});
