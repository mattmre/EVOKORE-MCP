import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';

const ROOT = path.resolve(__dirname, '../..');
const webhookManagerTsPath = path.join(ROOT, 'src', 'WebhookManager.ts');
const webhookManagerJsPath = path.join(ROOT, 'dist', 'WebhookManager.js');
const pluginManagerTsPath = path.join(ROOT, 'src', 'PluginManager.ts');
const pluginManagerJsPath = path.join(ROOT, 'dist', 'PluginManager.js');

describe('Plugin Webhook Subscriptions', () => {
  // ---- Source structure validation ----

  describe('source structure: WebhookManager subscription API', () => {
    const src = fs.readFileSync(webhookManagerTsPath, 'utf8');

    it('has subscribers Map property', () => {
      expect(src).toMatch(/private subscribers:\s*Map</);
    });

    it('has subscribe method', () => {
      expect(src).toMatch(/subscribe\(eventType:\s*WebhookEventType,\s*pluginId:\s*string/);
    });

    it('has unsubscribeAll method', () => {
      expect(src).toMatch(/unsubscribeAll\(pluginId:\s*string\)/);
    });

    it('notifies subscribers in emit method', () => {
      expect(src).toMatch(/sub\.handler\(payload\)/);
    });

    it('catches subscriber errors in emit', () => {
      expect(src).toMatch(/Plugin.*webhook handler error/);
    });
  });

  describe('source structure: PluginContext onWebhookEvent', () => {
    const src = fs.readFileSync(pluginManagerTsPath, 'utf8');

    it('PluginContext interface includes onWebhookEvent', () => {
      expect(src).toMatch(/onWebhookEvent\(eventType:\s*string,\s*handler:\s*\(event:\s*any\)\s*=>\s*void\):\s*void/);
    });

    it('onWebhookEvent implementation calls subscribe', () => {
      expect(src).toMatch(/this\.webhookManager\.subscribe\(eventType as WebhookEventType,\s*pluginName,\s*handler\)/);
    });

    it('unsubscribeAll is called during plugin reload', () => {
      expect(src).toMatch(/this\.webhookManager\.unsubscribeAll\(name\)/);
    });
  });

  // ---- WebhookManager subscribe/unsubscribe unit tests ----

  describe('WebhookManager subscribe and unsubscribe', () => {
    it('subscribe registers a handler for an event type', () => {
      const { WebhookManager } = require(webhookManagerJsPath);
      const wm = new WebhookManager();
      wm.setEnabled(true);

      const received: any[] = [];
      wm.subscribe('tool_call', 'test-plugin', (event: any) => {
        received.push(event);
      });

      wm.emit('tool_call', { tool: 'my_tool' });

      expect(received.length).toBe(1);
      expect(received[0].event).toBe('tool_call');
      expect(received[0].data.tool).toBe('my_tool');
      expect(received[0].id).toBeDefined();
      expect(received[0].timestamp).toBeDefined();
    });

    it('subscriber receives events even without HTTP webhooks configured', () => {
      const { WebhookManager } = require(webhookManagerJsPath);
      const wm = new WebhookManager();
      // Webhooks disabled (default), no HTTP webhooks configured

      const received: any[] = [];
      wm.subscribe('session_start', 'listener-plugin', (event: any) => {
        received.push(event);
      });

      wm.emit('session_start', { sessionId: 'abc123' });

      expect(received.length).toBe(1);
      expect(received[0].data.sessionId).toBe('abc123');
    });

    it('multiple plugins can subscribe to the same event type', () => {
      const { WebhookManager } = require(webhookManagerJsPath);
      const wm = new WebhookManager();

      const receivedA: any[] = [];
      const receivedB: any[] = [];

      wm.subscribe('tool_call', 'plugin-a', (event: any) => {
        receivedA.push(event);
      });
      wm.subscribe('tool_call', 'plugin-b', (event: any) => {
        receivedB.push(event);
      });

      wm.emit('tool_call', { tool: 'shared_tool' });

      expect(receivedA.length).toBe(1);
      expect(receivedB.length).toBe(1);
      // Both receive the same event (same id)
      expect(receivedA[0].id).toBe(receivedB[0].id);
    });

    it('subscriber only receives events for subscribed type', () => {
      const { WebhookManager } = require(webhookManagerJsPath);
      const wm = new WebhookManager();

      const received: any[] = [];
      wm.subscribe('tool_error', 'selective-plugin', (event: any) => {
        received.push(event);
      });

      wm.emit('tool_call', { tool: 'some_tool' });
      wm.emit('session_start', { sessionId: 'xyz' });
      wm.emit('tool_error', { tool: 'broken_tool', error: 'oops' });

      expect(received.length).toBe(1);
      expect(received[0].event).toBe('tool_error');
    });

    it('unsubscribeAll removes all handlers for a plugin', () => {
      const { WebhookManager } = require(webhookManagerJsPath);
      const wm = new WebhookManager();

      const received: any[] = [];
      wm.subscribe('tool_call', 'removable-plugin', (event: any) => {
        received.push(event);
      });
      wm.subscribe('session_start', 'removable-plugin', (event: any) => {
        received.push(event);
      });

      // Verify subscriptions work
      wm.emit('tool_call', { tool: 'test' });
      expect(received.length).toBe(1);

      // Unsubscribe
      wm.unsubscribeAll('removable-plugin');

      // Emit again - should not reach handler
      wm.emit('tool_call', { tool: 'test2' });
      wm.emit('session_start', { sessionId: 'new' });
      expect(received.length).toBe(1); // still 1 from before
    });

    it('unsubscribeAll does not affect other plugins', () => {
      const { WebhookManager } = require(webhookManagerJsPath);
      const wm = new WebhookManager();

      const receivedA: any[] = [];
      const receivedB: any[] = [];

      wm.subscribe('tool_call', 'keep-plugin', (event: any) => {
        receivedA.push(event);
      });
      wm.subscribe('tool_call', 'remove-plugin', (event: any) => {
        receivedB.push(event);
      });

      wm.unsubscribeAll('remove-plugin');

      wm.emit('tool_call', { tool: 'check' });

      expect(receivedA.length).toBe(1);
      expect(receivedB.length).toBe(0);
    });

    it('subscriber errors are caught and do not crash emit', () => {
      const { WebhookManager } = require(webhookManagerJsPath);
      const wm = new WebhookManager();

      const received: any[] = [];

      // First subscriber throws
      wm.subscribe('tool_call', 'crasher', () => {
        throw new Error('subscriber crash');
      });
      // Second subscriber should still receive
      wm.subscribe('tool_call', 'survivor', (event: any) => {
        received.push(event);
      });

      // Should not throw
      expect(() => {
        wm.emit('tool_call', { tool: 'test' });
      }).not.toThrow();

      // Second subscriber still received the event
      expect(received.length).toBe(1);
    });
  });

  // ---- Plugin integration tests ----

  describe('plugin subscribes via onWebhookEvent', () => {
    let tmpDir: string;
    let originalEnv: string | undefined;

    beforeEach(async () => {
      tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'evokore-webhook-sub-test-'));
      originalEnv = process.env.EVOKORE_PLUGINS_DIR;
      process.env.EVOKORE_PLUGINS_DIR = tmpDir;
      delete require.cache[require.resolve(pluginManagerJsPath)];
      delete require.cache[require.resolve(webhookManagerJsPath)];
    });

    afterEach(async () => {
      if (originalEnv === undefined) {
        delete process.env.EVOKORE_PLUGINS_DIR;
      } else {
        process.env.EVOKORE_PLUGINS_DIR = originalEnv;
      }
      delete require.cache[require.resolve(pluginManagerJsPath)];
      delete require.cache[require.resolve(webhookManagerJsPath)];
      await fsp.rm(tmpDir, { recursive: true, force: true });
    });

    it('plugin can subscribe to events and receive them', async () => {
      // Plugin that subscribes to tool_call events and stores them
      const pluginCode = `
        const events = [];
        module.exports = {
          name: 'subscriber-plugin',
          version: '1.0.0',
          events,
          register(ctx) {
            ctx.onWebhookEvent('tool_call', (event) => {
              events.push(event);
            });
            ctx.addTool('get_events', {
              description: 'Get captured events',
              inputSchema: { type: 'object', properties: {} }
            }, async () => ({
              content: [{ type: 'text', text: JSON.stringify(events) }]
            }));
          }
        };
      `;
      const pluginPath = path.join(tmpDir, 'subscriber.js');
      await fsp.writeFile(pluginPath, pluginCode);

      const { WebhookManager } = require(webhookManagerJsPath);
      const { PluginManager } = require(pluginManagerJsPath);

      const wm = new WebhookManager();
      // Note: enabled is false, no HTTP webhooks -- but subscribers should still work
      const pm = new PluginManager(wm);
      await pm.loadPlugins();

      // Emit an event
      wm.emit('tool_call', { tool: 'test_tool', args: {} });

      // Check via the plugin's exposed events array
      const pluginModule = require(pluginPath);
      expect(pluginModule.events.length).toBe(1);
      expect(pluginModule.events[0].event).toBe('tool_call');
      expect(pluginModule.events[0].data.tool).toBe('test_tool');
    });

    it('onWebhookEvent is a no-op when no webhookManager is provided', async () => {
      const pluginCode = `
        module.exports = {
          name: 'no-wm-subscriber',
          version: '1.0.0',
          register(ctx) {
            // Should not throw even without a webhookManager
            ctx.onWebhookEvent('tool_call', () => {});
          }
        };
      `;
      await fsp.writeFile(path.join(tmpDir, 'no-wm.js'), pluginCode);

      const { PluginManager } = require(pluginManagerJsPath);

      // No webhookManager
      const pm = new PluginManager();
      const result = await pm.loadPlugins();

      expect(result.loaded).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('subscriptions are cleaned up on plugin reload', async () => {
      // Use a shared array via a dotfile module so it survives require cache clears
      // (dotfiles are skipped by the plugin loader)
      const sharedStatePath = path.join(tmpDir, '.shared-state.js');
      await fsp.writeFile(sharedStatePath, `module.exports = { events: [] };`);

      const pluginCode = `
        const state = require(${JSON.stringify(sharedStatePath)});
        module.exports = {
          name: 'reload-sub-plugin',
          version: '1.0.0',
          register(ctx) {
            ctx.onWebhookEvent('tool_call', (event) => {
              state.events.push(event);
            });
          }
        };
      `;
      const pluginPath = path.join(tmpDir, 'reload-sub.js');
      await fsp.writeFile(pluginPath, pluginCode);

      const { WebhookManager } = require(webhookManagerJsPath);
      const { PluginManager } = require(pluginManagerJsPath);

      const wm = new WebhookManager();
      const pm = new PluginManager(wm);

      // First load
      await pm.loadPlugins();

      const sharedState = require(sharedStatePath);

      // Emit and verify subscription works
      wm.emit('tool_call', { tool: 'before_reload' });
      expect(sharedState.events.length).toBe(1);

      // Reload plugins - old subscriptions should be cleaned up, new ones registered
      await pm.loadPlugins();

      // Clear and emit again
      sharedState.events.length = 0;
      wm.emit('tool_call', { tool: 'after_reload' });

      // The new subscription handler should have received the event
      // and the old one should NOT have received it (would cause double entries)
      expect(sharedState.events.length).toBe(1);
      expect(sharedState.events[0].data.tool).toBe('after_reload');

      // Clean up shared state require cache
      delete require.cache[require.resolve(sharedStatePath)];
    });

    it('backward compatibility: plugins without subscriptions work fine', async () => {
      const pluginCode = `
        module.exports = {
          name: 'legacy-plugin',
          version: '1.0.0',
          register(ctx) {
            ctx.addTool('legacy_tool', {
              description: 'A legacy tool that does not subscribe to events',
              inputSchema: { type: 'object', properties: {} }
            }, async () => ({
              content: [{ type: 'text', text: 'legacy works' }]
            }));
          }
        };
      `;
      await fsp.writeFile(path.join(tmpDir, 'legacy.js'), pluginCode);

      const { WebhookManager } = require(webhookManagerJsPath);
      const { PluginManager } = require(pluginManagerJsPath);

      const wm = new WebhookManager();
      const pm = new PluginManager(wm);
      const result = await pm.loadPlugins();

      expect(result.loaded).toBe(1);
      expect(result.failed).toBe(0);
      expect(pm.isPluginTool('legacy_tool')).toBe(true);

      // Emitting events should not cause any issues
      wm.emit('tool_call', { tool: 'some_tool' });

      const toolResult = await pm.handleToolCall('legacy_tool', {});
      expect(toolResult.content[0].text).toBe('legacy works');
    });

    it('plugin can subscribe to multiple event types', async () => {
      const pluginCode = `
        const events = [];
        module.exports = {
          name: 'multi-sub-plugin',
          version: '1.0.0',
          events,
          register(ctx) {
            ctx.onWebhookEvent('tool_call', (event) => { events.push(event); });
            ctx.onWebhookEvent('tool_error', (event) => { events.push(event); });
            ctx.onWebhookEvent('session_start', (event) => { events.push(event); });
          }
        };
      `;
      const pluginPath = path.join(tmpDir, 'multi-sub.js');
      await fsp.writeFile(pluginPath, pluginCode);

      const { WebhookManager } = require(webhookManagerJsPath);
      const { PluginManager } = require(pluginManagerJsPath);

      const wm = new WebhookManager();
      const pm = new PluginManager(wm);
      await pm.loadPlugins();

      wm.emit('tool_call', { tool: 'a' });
      wm.emit('tool_error', { tool: 'b', error: 'fail' });
      wm.emit('session_start', { sessionId: '123' });
      wm.emit('session_end', { sessionId: '123' }); // not subscribed

      const pluginModule = require(pluginPath);
      expect(pluginModule.events.length).toBe(3);
      expect(pluginModule.events.map((e: any) => e.event)).toEqual([
        'tool_call',
        'tool_error',
        'session_start',
      ]);
    });
  });
});
