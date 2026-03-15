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
const indexTsPath = path.join(ROOT, 'src', 'index.ts');

describe('Webhook-Plugin Integration', () => {
  // ---- Phase 1: New event types in WebhookManager ----

  describe('Phase 1: plugin lifecycle event types', () => {
    const webhookSrc = fs.readFileSync(webhookManagerTsPath, 'utf8');

    it('WebhookEventType union includes plugin_loaded', () => {
      expect(webhookSrc).toMatch(/"plugin_loaded"/);
    });

    it('WebhookEventType union includes plugin_unloaded', () => {
      expect(webhookSrc).toMatch(/"plugin_unloaded"/);
    });

    it('WebhookEventType union includes plugin_load_error', () => {
      expect(webhookSrc).toMatch(/"plugin_load_error"/);
    });

    it('WEBHOOK_EVENT_TYPES array contains all 9 event types', () => {
      const { WEBHOOK_EVENT_TYPES } = require(webhookManagerJsPath);
      expect(WEBHOOK_EVENT_TYPES).toContain('plugin_loaded');
      expect(WEBHOOK_EVENT_TYPES).toContain('plugin_unloaded');
      expect(WEBHOOK_EVENT_TYPES).toContain('plugin_load_error');
      expect(WEBHOOK_EVENT_TYPES.length).toBe(9);
    });
  });

  // ---- Phase 2: PluginManager constructor accepts WebhookManager ----

  describe('Phase 2: PluginManager constructor accepts WebhookManager', () => {
    const pluginSrc = fs.readFileSync(pluginManagerTsPath, 'utf8');

    it('imports WebhookManager', () => {
      expect(pluginSrc).toMatch(/import.*WebhookManager.*from.*"\.\/WebhookManager"/);
    });

    it('constructor has optional webhookManager parameter', () => {
      expect(pluginSrc).toMatch(/constructor\(webhookManager\?\s*:\s*WebhookManager\)/);
    });

    it('stores webhookManager as private field', () => {
      expect(pluginSrc).toMatch(/private webhookManager:\s*WebhookManager\s*\|\s*null/);
    });

    it('can be constructed without arguments (backward compatible)', () => {
      const { PluginManager } = require(pluginManagerJsPath);
      const pm = new PluginManager();
      expect(pm).toBeDefined();
    });

    it('can be constructed with a WebhookManager', () => {
      const { PluginManager } = require(pluginManagerJsPath);
      const { WebhookManager } = require(webhookManagerJsPath);
      const wm = new WebhookManager();
      const pm = new PluginManager(wm);
      expect(pm).toBeDefined();
    });
  });

  // ---- Phase 3: emitWebhook on PluginContext ----

  describe('Phase 3: emitWebhook on PluginContext', () => {
    const pluginSrc = fs.readFileSync(pluginManagerTsPath, 'utf8');

    it('PluginContext interface includes emitWebhook method', () => {
      expect(pluginSrc).toMatch(/emitWebhook\(event:\s*string,\s*data:\s*Record<string,\s*unknown>\):\s*void/);
    });

    it('emitWebhook implementation tags emissions with plugin name', () => {
      expect(pluginSrc).toMatch(/plugin:\s*manifest\.name/);
    });
  });

  // ---- Phase 4: plugin lifecycle events emitted in loadPlugins ----

  describe('Phase 4: plugin lifecycle events in loadPlugins', () => {
    const pluginSrc = fs.readFileSync(pluginManagerTsPath, 'utf8');

    it('emits plugin_unloaded before clearing plugins', () => {
      expect(pluginSrc).toMatch(/emit\("plugin_unloaded"/);
    });

    it('emits plugin_loaded after successful load', () => {
      expect(pluginSrc).toMatch(/emit\("plugin_loaded"/);
    });

    it('emits plugin_load_error on load failure', () => {
      expect(pluginSrc).toMatch(/emit\("plugin_load_error"/);
    });
  });

  // ---- Phase 5: source field in tool_call events ----

  describe('Phase 5: source field in tool_call events in index.ts', () => {
    const indexSrc = fs.readFileSync(indexTsPath, 'utf8');

    it('computes source before emitting tool_call', () => {
      // source = "builtin" for built-in tools
      expect(indexSrc).toMatch(/source\s*=\s*"builtin"/);
    });

    it('identifies plugin tools as source "plugin"', () => {
      expect(indexSrc).toMatch(/source\s*=\s*"plugin"/);
    });

    it('identifies native tools as source "native"', () => {
      expect(indexSrc).toMatch(/source\s*=\s*"native"/);
    });

    it('identifies proxied tools as source "proxied"', () => {
      expect(indexSrc).toMatch(/source\s*=\s*"proxied"/);
    });

    it('includes source field in tool_call emit', () => {
      expect(indexSrc).toMatch(/emit\("tool_call",\s*\{\s*tool:\s*toolName,\s*source/);
    });
  });

  // ---- Phase 6: wiring in constructor ----

  describe('Phase 6: constructor wiring in index.ts', () => {
    const indexSrc = fs.readFileSync(indexTsPath, 'utf8');

    it('passes webhookManager to PluginManager constructor', () => {
      expect(indexSrc).toMatch(/new PluginManager\(this\.webhookManager\)/);
    });

    it('creates WebhookManager before PluginManager', () => {
      const wmIndex = indexSrc.indexOf('this.webhookManager = new WebhookManager()');
      const pmIndex = indexSrc.indexOf('new PluginManager(this.webhookManager)');
      expect(wmIndex).toBeGreaterThan(-1);
      expect(pmIndex).toBeGreaterThan(-1);
      expect(wmIndex).toBeLessThan(pmIndex);
    });
  });

  // ---- Phase 7: runtime integration ----

  describe('Phase 7: runtime integration - plugin lifecycle events', () => {
    let tmpDir: string;
    let originalEnv: string | undefined;

    beforeEach(async () => {
      tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'evokore-wh-plugin-test-'));
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

    it('emits plugin_loaded with correct payload when plugin loads', async () => {
      const pluginCode = `
        module.exports = {
          name: 'wh-test-plugin',
          version: '1.2.3',
          register(ctx) {
            ctx.addTool('wh_test_tool', {
              description: 'A test tool for webhook integration',
              inputSchema: { type: 'object', properties: {} }
            }, async () => ({ content: [{ type: 'text', text: 'ok' }] }));
          }
        };
      `;
      await fsp.writeFile(path.join(tmpDir, 'wh-test.js'), pluginCode);

      const { WebhookManager } = require(webhookManagerJsPath);
      const { PluginManager } = require(pluginManagerJsPath);

      const wm = new WebhookManager();
      wm.setEnabled(true);

      // Capture emitted events
      const emitted: Array<{ event: string; data: Record<string, unknown> }> = [];
      const originalEmit = wm.emit.bind(wm);
      wm.emit = (event: string, data: Record<string, unknown>) => {
        emitted.push({ event, data });
        // Don't actually deliver (no webhooks configured)
      };

      const pm = new PluginManager(wm);
      const result = await pm.loadPlugins();

      expect(result.loaded).toBe(1);

      const loadedEvents = emitted.filter(e => e.event === 'plugin_loaded');
      expect(loadedEvents.length).toBe(1);
      expect(loadedEvents[0].data.plugin).toBe('wh-test-plugin');
      expect(loadedEvents[0].data.version).toBe('1.2.3');
      expect(loadedEvents[0].data.toolCount).toBe(1);
      expect(loadedEvents[0].data.resourceCount).toBe(0);
    });

    it('emits plugin_load_error when plugin fails to load', async () => {
      await fsp.writeFile(path.join(tmpDir, 'bad-plugin.js'), 'this is broken @@@');

      const { WebhookManager } = require(webhookManagerJsPath);
      const { PluginManager } = require(pluginManagerJsPath);

      const wm = new WebhookManager();
      wm.setEnabled(true);

      const emitted: Array<{ event: string; data: Record<string, unknown> }> = [];
      wm.emit = (event: string, data: Record<string, unknown>) => {
        emitted.push({ event, data });
      };

      const pm = new PluginManager(wm);
      const result = await pm.loadPlugins();

      expect(result.failed).toBe(1);

      const errorEvents = emitted.filter(e => e.event === 'plugin_load_error');
      expect(errorEvents.length).toBe(1);
      expect(errorEvents[0].data.file).toBe('bad-plugin.js');
      expect(typeof errorEvents[0].data.error).toBe('string');
    });

    it('emits plugin_unloaded on reload when plugins were previously loaded', async () => {
      const pluginCode = `
        module.exports = {
          name: 'reload-wh-test',
          version: '1.0.0',
          register(ctx) {
            ctx.addTool('reload_wh_tool', {
              description: 'Reload test',
              inputSchema: { type: 'object', properties: {} }
            }, async () => ({ content: [{ type: 'text', text: 'ok' }] }));
          }
        };
      `;
      await fsp.writeFile(path.join(tmpDir, 'reload-test.js'), pluginCode);

      const { WebhookManager } = require(webhookManagerJsPath);
      const { PluginManager } = require(pluginManagerJsPath);

      const wm = new WebhookManager();
      wm.setEnabled(true);

      const emitted: Array<{ event: string; data: Record<string, unknown> }> = [];
      wm.emit = (event: string, data: Record<string, unknown>) => {
        emitted.push({ event, data });
      };

      const pm = new PluginManager(wm);

      // First load
      await pm.loadPlugins();

      // Clear event log
      emitted.length = 0;

      // Second load (reload)
      await pm.loadPlugins();

      const unloadedEvents = emitted.filter(e => e.event === 'plugin_unloaded');
      expect(unloadedEvents.length).toBe(1);
      expect(unloadedEvents[0].data.plugin).toBe('reload-wh-test');
      expect(unloadedEvents[0].data.version).toBe('1.0.0');
    });

    it('plugin can use emitWebhook from context', async () => {
      const pluginCode = `
        module.exports = {
          name: 'webhook-emitter',
          version: '1.0.0',
          register(ctx) {
            ctx.emitWebhook('tool_call', { custom: 'data' });
          }
        };
      `;
      await fsp.writeFile(path.join(tmpDir, 'emitter.js'), pluginCode);

      const { WebhookManager } = require(webhookManagerJsPath);
      const { PluginManager } = require(pluginManagerJsPath);

      const wm = new WebhookManager();
      wm.setEnabled(true);

      const emitted: Array<{ event: string; data: Record<string, unknown> }> = [];
      wm.emit = (event: string, data: Record<string, unknown>) => {
        emitted.push({ event, data });
      };

      const pm = new PluginManager(wm);
      await pm.loadPlugins();

      // The plugin calls emitWebhook during register()
      const customEvents = emitted.filter(
        e => e.event === 'tool_call' && (e.data as any).custom === 'data'
      );
      expect(customEvents.length).toBe(1);
      expect(customEvents[0].data.plugin).toBe('webhook-emitter');
    });

    it('emitWebhook is a no-op when no webhookManager is provided', async () => {
      const pluginCode = `
        module.exports = {
          name: 'no-wh-plugin',
          version: '1.0.0',
          register(ctx) {
            // Should not throw even without a webhookManager
            ctx.emitWebhook('tool_call', { test: true });
          }
        };
      `;
      await fsp.writeFile(path.join(tmpDir, 'no-wh.js'), pluginCode);

      const { PluginManager } = require(pluginManagerJsPath);

      // Construct without webhookManager
      const pm = new PluginManager();
      const result = await pm.loadPlugins();

      // Should load successfully without errors
      expect(result.loaded).toBe(1);
      expect(result.failed).toBe(0);
    });
  });
});
