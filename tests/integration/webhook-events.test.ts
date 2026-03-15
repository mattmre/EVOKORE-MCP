import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import http from 'http';
import crypto from 'crypto';

const ROOT = path.resolve(__dirname, '../..');
const webhookManagerTsPath = path.join(ROOT, 'src', 'WebhookManager.ts');
const webhookManagerJsPath = path.join(ROOT, 'dist', 'WebhookManager.js');
const indexTsPath = path.join(ROOT, 'src', 'index.ts');

// ---- Source-level structural validation ----

describe('T29: Webhook Event System', () => {
  describe('WebhookManager module exists', () => {
    it('WebhookManager.ts source file exists', () => {
      expect(fs.existsSync(webhookManagerTsPath)).toBe(true);
    });

    it('WebhookManager.js compiled file exists', () => {
      expect(fs.existsSync(webhookManagerJsPath)).toBe(true);
    });

    it('exports WebhookManager class', () => {
      const mod = require(webhookManagerJsPath);
      expect(mod.WebhookManager).toBeDefined();
      expect(typeof mod.WebhookManager).toBe('function');
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
      const mod = require(webhookManagerJsPath);
      expect(Array.isArray(mod.WEBHOOK_EVENT_TYPES)).toBe(true);
      expect(mod.WEBHOOK_EVENT_TYPES).toContain('tool_call');
      expect(mod.WEBHOOK_EVENT_TYPES).toContain('tool_error');
      expect(mod.WEBHOOK_EVENT_TYPES).toContain('session_start');
      expect(mod.WEBHOOK_EVENT_TYPES).toContain('session_end');
      expect(mod.WEBHOOK_EVENT_TYPES).toContain('approval_requested');
      expect(mod.WEBHOOK_EVENT_TYPES).toContain('approval_granted');
      expect(mod.WEBHOOK_EVENT_TYPES.length).toBe(6);
    });
  });

  describe('webhook config parsing', () => {
    it('loadWebhooks reads from a config file with webhooks key', () => {
      const { WebhookManager } = require(webhookManagerJsPath);
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
        expect(hooks[0].secret).toBe('test-secret');
        expect(hooks[1].url).toBe('https://example.com/hook2');
        expect(hooks[1].secret).toBeUndefined();
      } finally {
        if (fs.existsSync(tmpConfig)) fs.unlinkSync(tmpConfig);
      }
    });

    it('loadWebhooks gracefully handles missing config file', () => {
      const { WebhookManager } = require(webhookManagerJsPath);
      const manager = new WebhookManager();
      manager.setEnabled(true);
      manager.loadWebhooks('/nonexistent/path.json');
      expect(manager.getWebhooks().length).toBe(0);
    });

    it('loadWebhooks gracefully handles config without webhooks key', () => {
      const { WebhookManager } = require(webhookManagerJsPath);
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
      const { WebhookManager } = require(webhookManagerJsPath);
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
      const { WebhookManager } = require(webhookManagerJsPath);
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
      const { WebhookManager } = require(webhookManagerJsPath);
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
      const { WebhookManager } = require(webhookManagerJsPath);
      const body = '{"test":true}';

      const sig1 = WebhookManager.computeSignature(body, 'secret-a');
      const sig2 = WebhookManager.computeSignature(body, 'secret-b');

      expect(sig1).not.toBe(sig2);
    });

    it('different payloads produce different signatures', () => {
      const { WebhookManager } = require(webhookManagerJsPath);
      const secret = 'shared-secret';

      const sig1 = WebhookManager.computeSignature('{"a":1}', secret);
      const sig2 = WebhookManager.computeSignature('{"a":2}', secret);

      expect(sig1).not.toBe(sig2);
    });
  });

  describe('event payload format', () => {
    it('emit constructs a well-formed payload and delivers it', async () => {
      const { WebhookManager } = require(webhookManagerJsPath);

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

        // Verify HMAC signature header
        expect(receivedHeaders['x-evokore-signature']).toBeDefined();
        const expectedSig = WebhookManager.computeSignature(
          JSON.stringify(receivedBody),
          'payload-test-secret'
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
      const { WebhookManager } = require(webhookManagerJsPath);

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
      const { WebhookManager } = require(webhookManagerJsPath);
      const manager = new WebhookManager();
      manager.setEnabled(true);

      // Should not throw
      expect(() => {
        manager.emit('tool_call', { tool: 'test' });
      }).not.toThrow();
    });

    it('emit skips webhooks that do not subscribe to the event type', async () => {
      const { WebhookManager } = require(webhookManagerJsPath);

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
      const { WebhookManager } = require(webhookManagerJsPath);

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
      const { WebhookManager } = require(webhookManagerJsPath);

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
      const { WebhookManager } = require(webhookManagerJsPath);
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
      const { WebhookManager } = require(webhookManagerJsPath);

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
  });
});
