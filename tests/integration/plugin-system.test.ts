import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';

const ROOT = path.resolve(__dirname, '../..');
const pluginManagerTsPath = path.join(ROOT, 'src', 'PluginManager.ts');
const pluginManagerJsPath = path.join(ROOT, 'dist', 'PluginManager.js');
const indexTsPath = path.join(ROOT, 'src', 'index.ts');
const examplePluginPath = path.join(ROOT, 'plugins', 'example-hello.js');

describe('T28: Plugin System', () => {
  // ---- Module existence ----

  describe('PluginManager module exists', () => {
    it('has TypeScript source file', () => {
      expect(fs.existsSync(pluginManagerTsPath)).toBe(true);
    });

    it('has compiled JavaScript file', () => {
      expect(fs.existsSync(pluginManagerJsPath)).toBe(true);
    });

    it('exports PluginManager class', () => {
      const mod = require(pluginManagerJsPath);
      expect(mod.PluginManager).toBeDefined();
      expect(typeof mod.PluginManager).toBe('function');
    });
  });

  // ---- Source structure validation ----

  describe('source contains plugin system structure', () => {
    const src = fs.readFileSync(pluginManagerTsPath, 'utf8');

    it('defines PluginContext interface', () => {
      expect(src).toMatch(/interface PluginContext/);
    });

    it('defines PluginManifest interface', () => {
      expect(src).toMatch(/interface PluginManifest/);
    });

    it('has loadPlugins method', () => {
      expect(src).toMatch(/async loadPlugins/);
    });

    it('has loadSinglePlugin method', () => {
      expect(src).toMatch(/loadSinglePlugin/);
    });

    it('has getTools method', () => {
      expect(src).toMatch(/getTools\(\): Tool\[\]/);
    });

    it('has handleToolCall method', () => {
      expect(src).toMatch(/async handleToolCall/);
    });

    it('has isPluginTool method', () => {
      expect(src).toMatch(/isPluginTool/);
    });

    it('supports EVOKORE_PLUGINS_DIR env var', () => {
      expect(src).toMatch(/EVOKORE_PLUGINS_DIR/);
    });

    it('clears require cache for hot-reload', () => {
      expect(src).toMatch(/require\.cache/);
    });

    it('defines reload_plugins tool', () => {
      expect(src).toMatch(/reload_plugins/);
    });
  });

  // ---- Plugin directory scanning ----

  describe('plugin directory scanning', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'evokore-plugin-test-'));
    });

    afterEach(async () => {
      await fsp.rm(tmpDir, { recursive: true, force: true });
    });

    it('handles missing plugins directory gracefully', async () => {
      const originalEnv = process.env.EVOKORE_PLUGINS_DIR;
      process.env.EVOKORE_PLUGINS_DIR = path.join(tmpDir, 'nonexistent');
      try {
        // Clear require cache to pick up new env
        delete require.cache[require.resolve(pluginManagerJsPath)];
        const { PluginManager } = require(pluginManagerJsPath);
        const pm = new PluginManager();
        const result = await pm.loadPlugins();
        expect(result.loaded).toBe(0);
        expect(result.failed).toBe(0);
      } finally {
        if (originalEnv === undefined) {
          delete process.env.EVOKORE_PLUGINS_DIR;
        } else {
          process.env.EVOKORE_PLUGINS_DIR = originalEnv;
        }
        delete require.cache[require.resolve(pluginManagerJsPath)];
      }
    });

    it('handles empty plugins directory', async () => {
      const originalEnv = process.env.EVOKORE_PLUGINS_DIR;
      process.env.EVOKORE_PLUGINS_DIR = tmpDir;
      try {
        delete require.cache[require.resolve(pluginManagerJsPath)];
        const { PluginManager } = require(pluginManagerJsPath);
        const pm = new PluginManager();
        const result = await pm.loadPlugins();
        expect(result.loaded).toBe(0);
        expect(result.failed).toBe(0);
        expect(result.totalTools).toBe(0);
      } finally {
        if (originalEnv === undefined) {
          delete process.env.EVOKORE_PLUGINS_DIR;
        } else {
          process.env.EVOKORE_PLUGINS_DIR = originalEnv;
        }
        delete require.cache[require.resolve(pluginManagerJsPath)];
      }
    });

    it('skips non-.js files and dotfiles', async () => {
      await fsp.writeFile(path.join(tmpDir, '.hidden.js'), 'module.exports = { name: "hidden", register() {} };');
      await fsp.writeFile(path.join(tmpDir, 'readme.txt'), 'not a plugin');
      await fsp.writeFile(path.join(tmpDir, 'data.json'), '{}');

      const originalEnv = process.env.EVOKORE_PLUGINS_DIR;
      process.env.EVOKORE_PLUGINS_DIR = tmpDir;
      try {
        delete require.cache[require.resolve(pluginManagerJsPath)];
        const { PluginManager } = require(pluginManagerJsPath);
        const pm = new PluginManager();
        const result = await pm.loadPlugins();
        expect(result.loaded).toBe(0);
        expect(result.failed).toBe(0);
      } finally {
        if (originalEnv === undefined) {
          delete process.env.EVOKORE_PLUGINS_DIR;
        } else {
          process.env.EVOKORE_PLUGINS_DIR = originalEnv;
        }
        delete require.cache[require.resolve(pluginManagerJsPath)];
      }
    });
  });

  // ---- Valid plugin loading ----

  describe('valid plugin loading', () => {
    let tmpDir: string;
    let originalEnv: string | undefined;

    beforeEach(async () => {
      tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'evokore-plugin-test-'));
      originalEnv = process.env.EVOKORE_PLUGINS_DIR;
      process.env.EVOKORE_PLUGINS_DIR = tmpDir;
      delete require.cache[require.resolve(pluginManagerJsPath)];
    });

    afterEach(async () => {
      if (originalEnv === undefined) {
        delete process.env.EVOKORE_PLUGINS_DIR;
      } else {
        process.env.EVOKORE_PLUGINS_DIR = originalEnv;
      }
      delete require.cache[require.resolve(pluginManagerJsPath)];
      await fsp.rm(tmpDir, { recursive: true, force: true });
    });

    it('loads a valid plugin and registers its tool', async () => {
      const pluginCode = `
        module.exports = {
          name: 'test-plugin',
          version: '2.0.0',
          register(ctx) {
            ctx.addTool('test_tool', {
              description: 'A test tool',
              inputSchema: { type: 'object', properties: { x: { type: 'number' } } }
            }, async (args) => ({
              content: [{ type: 'text', text: 'result: ' + (args?.x || 0) }]
            }));
          }
        };
      `;
      await fsp.writeFile(path.join(tmpDir, 'test-plugin.js'), pluginCode);

      const { PluginManager } = require(pluginManagerJsPath);
      const pm = new PluginManager();
      const result = await pm.loadPlugins();

      expect(result.loaded).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.totalTools).toBe(1);
    });

    it('getTools includes plugin tools plus reload_plugins meta-tool', async () => {
      const pluginCode = `
        module.exports = {
          name: 'tool-test',
          register(ctx) {
            ctx.addTool('my_custom_tool', {
              description: 'Custom tool',
              inputSchema: { type: 'object', properties: {} }
            }, async () => ({ content: [{ type: 'text', text: 'ok' }] }));
          }
        };
      `;
      await fsp.writeFile(path.join(tmpDir, 'tool-test.js'), pluginCode);

      const { PluginManager } = require(pluginManagerJsPath);
      const pm = new PluginManager();
      await pm.loadPlugins();

      const tools = pm.getTools();
      const toolNames = tools.map((t: any) => t.name);
      expect(toolNames).toContain('reload_plugins');
      expect(toolNames).toContain('my_custom_tool');
    });

    it('handles tool call delegation to plugin handler', async () => {
      const pluginCode = `
        module.exports = {
          name: 'callable-plugin',
          register(ctx) {
            ctx.addTool('greet', {
              description: 'Greet someone',
              inputSchema: { type: 'object', properties: { who: { type: 'string' } } }
            }, async (args) => ({
              content: [{ type: 'text', text: 'Hello ' + (args?.who || 'nobody') }]
            }));
          }
        };
      `;
      await fsp.writeFile(path.join(tmpDir, 'callable.js'), pluginCode);

      const { PluginManager } = require(pluginManagerJsPath);
      const pm = new PluginManager();
      await pm.loadPlugins();

      expect(pm.isPluginTool('greet')).toBe(true);

      const result = await pm.handleToolCall('greet', { who: 'Alice' });
      expect(result.content[0].text).toBe('Hello Alice');
    });

    it('returns null for non-plugin tool calls', async () => {
      const { PluginManager } = require(pluginManagerJsPath);
      const pm = new PluginManager();
      await pm.loadPlugins();

      const result = await pm.handleToolCall('nonexistent_tool', {});
      expect(result).toBeNull();
    });

    it('isPluginTool returns false for unknown tools', async () => {
      const { PluginManager } = require(pluginManagerJsPath);
      const pm = new PluginManager();
      await pm.loadPlugins();

      expect(pm.isPluginTool('unknown')).toBe(false);
    });

    it('loads multiple plugins', async () => {
      const pluginA = `
        module.exports = {
          name: 'plugin-a',
          register(ctx) {
            ctx.addTool('tool_a', { description: 'Tool A', inputSchema: { type: 'object', properties: {} } }, async () => ({ content: [{ type: 'text', text: 'A' }] }));
          }
        };
      `;
      const pluginB = `
        module.exports = {
          name: 'plugin-b',
          register(ctx) {
            ctx.addTool('tool_b', { description: 'Tool B', inputSchema: { type: 'object', properties: {} } }, async () => ({ content: [{ type: 'text', text: 'B' }] }));
            ctx.addTool('tool_b2', { description: 'Tool B2', inputSchema: { type: 'object', properties: {} } }, async () => ({ content: [{ type: 'text', text: 'B2' }] }));
          }
        };
      `;
      await fsp.writeFile(path.join(tmpDir, 'plugin-a.js'), pluginA);
      await fsp.writeFile(path.join(tmpDir, 'plugin-b.js'), pluginB);

      const { PluginManager } = require(pluginManagerJsPath);
      const pm = new PluginManager();
      const result = await pm.loadPlugins();

      expect(result.loaded).toBe(2);
      expect(result.totalTools).toBe(3);
      expect(pm.getPluginCount()).toBe(2);
      expect(pm.getToolCount()).toBe(3);
    });

    it('registers plugin resources', async () => {
      const pluginCode = `
        module.exports = {
          name: 'resource-plugin',
          register(ctx) {
            ctx.addResource('plugin://test/status', { name: 'Test Status', mimeType: 'application/json' }, async () => ({
              text: JSON.stringify({ ok: true })
            }));
          }
        };
      `;
      await fsp.writeFile(path.join(tmpDir, 'resource-plugin.js'), pluginCode);

      const { PluginManager } = require(pluginManagerJsPath);
      const pm = new PluginManager();
      await pm.loadPlugins();

      const resources = pm.getResources();
      expect(resources.length).toBe(1);
      expect(resources[0].uri).toBe('plugin://test/status');
      expect(pm.isPluginResource('plugin://test/status')).toBe(true);

      const readResult = await pm.handleResourceRead('plugin://test/status');
      expect(readResult).not.toBeNull();
      expect(readResult!.contents[0].text).toBe('{"ok":true}');
    });
  });

  // ---- Fail-safe on invalid plugins ----

  describe('fail-safe on invalid plugins', () => {
    let tmpDir: string;
    let originalEnv: string | undefined;

    beforeEach(async () => {
      tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'evokore-plugin-test-'));
      originalEnv = process.env.EVOKORE_PLUGINS_DIR;
      process.env.EVOKORE_PLUGINS_DIR = tmpDir;
      delete require.cache[require.resolve(pluginManagerJsPath)];
    });

    afterEach(async () => {
      if (originalEnv === undefined) {
        delete process.env.EVOKORE_PLUGINS_DIR;
      } else {
        process.env.EVOKORE_PLUGINS_DIR = originalEnv;
      }
      delete require.cache[require.resolve(pluginManagerJsPath)];
      await fsp.rm(tmpDir, { recursive: true, force: true });
    });

    it('does not crash on plugin with syntax error', async () => {
      await fsp.writeFile(path.join(tmpDir, 'bad-syntax.js'), 'this is not valid javascript @@@');

      const { PluginManager } = require(pluginManagerJsPath);
      const pm = new PluginManager();
      const result = await pm.loadPlugins();

      expect(result.loaded).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].file).toBe('bad-syntax.js');
    });

    it('does not crash on plugin without register function', async () => {
      await fsp.writeFile(path.join(tmpDir, 'no-register.js'), 'module.exports = { name: "bad" };');

      const { PluginManager } = require(pluginManagerJsPath);
      const pm = new PluginManager();
      const result = await pm.loadPlugins();

      expect(result.loaded).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors[0].error).toMatch(/register/);
    });

    it('does not crash on plugin without name', async () => {
      await fsp.writeFile(path.join(tmpDir, 'no-name.js'), 'module.exports = { register() {} };');

      const { PluginManager } = require(pluginManagerJsPath);
      const pm = new PluginManager();
      const result = await pm.loadPlugins();

      expect(result.loaded).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors[0].error).toMatch(/name/);
    });

    it('does not crash on plugin that throws during register', async () => {
      const pluginCode = `
        module.exports = {
          name: 'crasher',
          register(ctx) { throw new Error('intentional crash'); }
        };
      `;
      await fsp.writeFile(path.join(tmpDir, 'crasher.js'), pluginCode);

      const { PluginManager } = require(pluginManagerJsPath);
      const pm = new PluginManager();
      const result = await pm.loadPlugins();

      expect(result.loaded).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors[0].error).toMatch(/intentional crash/);
    });

    it('loads valid plugins even when some fail', async () => {
      await fsp.writeFile(path.join(tmpDir, 'bad.js'), 'this is broken @@@');
      const goodPlugin = `
        module.exports = {
          name: 'good-plugin',
          register(ctx) {
            ctx.addTool('good_tool', { description: 'Works', inputSchema: { type: 'object', properties: {} } }, async () => ({ content: [{ type: 'text', text: 'ok' }] }));
          }
        };
      `;
      await fsp.writeFile(path.join(tmpDir, 'good.js'), goodPlugin);

      const { PluginManager } = require(pluginManagerJsPath);
      const pm = new PluginManager();
      const result = await pm.loadPlugins();

      expect(result.loaded).toBe(1);
      expect(result.failed).toBe(1);
      expect(pm.isPluginTool('good_tool')).toBe(true);
    });
  });

  // ---- Hot-reload behavior ----

  describe('hot-reload behavior', () => {
    let tmpDir: string;
    let originalEnv: string | undefined;

    beforeEach(async () => {
      tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'evokore-plugin-test-'));
      originalEnv = process.env.EVOKORE_PLUGINS_DIR;
      process.env.EVOKORE_PLUGINS_DIR = tmpDir;
      delete require.cache[require.resolve(pluginManagerJsPath)];
    });

    afterEach(async () => {
      if (originalEnv === undefined) {
        delete process.env.EVOKORE_PLUGINS_DIR;
      } else {
        process.env.EVOKORE_PLUGINS_DIR = originalEnv;
      }
      delete require.cache[require.resolve(pluginManagerJsPath)];
      await fsp.rm(tmpDir, { recursive: true, force: true });
    });

    it('reloads plugins and picks up changes', async () => {
      const v1 = `
        module.exports = {
          name: 'reload-test',
          version: '1.0.0',
          register(ctx) {
            ctx.addTool('versioned_tool', { description: 'v1', inputSchema: { type: 'object', properties: {} } }, async () => ({ content: [{ type: 'text', text: 'v1' }] }));
          }
        };
      `;
      await fsp.writeFile(path.join(tmpDir, 'reload-test.js'), v1);

      const { PluginManager } = require(pluginManagerJsPath);
      const pm = new PluginManager();
      await pm.loadPlugins();

      let result = await pm.handleToolCall('versioned_tool', {});
      expect(result.content[0].text).toBe('v1');

      // Update the plugin file
      const v2 = `
        module.exports = {
          name: 'reload-test',
          version: '2.0.0',
          register(ctx) {
            ctx.addTool('versioned_tool', { description: 'v2', inputSchema: { type: 'object', properties: {} } }, async () => ({ content: [{ type: 'text', text: 'v2' }] }));
          }
        };
      `;
      await fsp.writeFile(path.join(tmpDir, 'reload-test.js'), v2);

      // Reload
      await pm.loadPlugins();

      result = await pm.handleToolCall('versioned_tool', {});
      expect(result.content[0].text).toBe('v2');

      const loaded = pm.getLoadedPlugins();
      expect(loaded[0].version).toBe('2.0.0');
    });

    it('clears plugins that are removed from directory', async () => {
      const plugin = `
        module.exports = {
          name: 'ephemeral',
          register(ctx) {
            ctx.addTool('temp_tool', { description: 'temp', inputSchema: { type: 'object', properties: {} } }, async () => ({ content: [{ type: 'text', text: 'temp' }] }));
          }
        };
      `;
      const pluginFile = path.join(tmpDir, 'ephemeral.js');
      await fsp.writeFile(pluginFile, plugin);

      const { PluginManager } = require(pluginManagerJsPath);
      const pm = new PluginManager();
      await pm.loadPlugins();

      expect(pm.isPluginTool('temp_tool')).toBe(true);

      // Remove the plugin file
      await fsp.unlink(pluginFile);
      await pm.loadPlugins();

      expect(pm.isPluginTool('temp_tool')).toBe(false);
      expect(pm.getPluginCount()).toBe(0);
    });
  });

  // ---- EVOKORE_PLUGINS_DIR env var ----

  describe('EVOKORE_PLUGINS_DIR env var', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'evokore-plugin-custom-'));
    });

    afterEach(async () => {
      await fsp.rm(tmpDir, { recursive: true, force: true });
    });

    it('uses custom directory from env var', async () => {
      const pluginCode = `
        module.exports = {
          name: 'custom-dir-plugin',
          register(ctx) {
            ctx.addTool('custom_tool', { description: 'Custom', inputSchema: { type: 'object', properties: {} } }, async () => ({ content: [{ type: 'text', text: 'custom' }] }));
          }
        };
      `;
      await fsp.writeFile(path.join(tmpDir, 'custom.js'), pluginCode);

      const originalEnv = process.env.EVOKORE_PLUGINS_DIR;
      process.env.EVOKORE_PLUGINS_DIR = tmpDir;
      try {
        delete require.cache[require.resolve(pluginManagerJsPath)];
        const { PluginManager } = require(pluginManagerJsPath);
        const pm = new PluginManager();

        expect(pm.getPluginsDir()).toBe(tmpDir);

        const result = await pm.loadPlugins();
        expect(result.loaded).toBe(1);
        expect(pm.isPluginTool('custom_tool')).toBe(true);
      } finally {
        if (originalEnv === undefined) {
          delete process.env.EVOKORE_PLUGINS_DIR;
        } else {
          process.env.EVOKORE_PLUGINS_DIR = originalEnv;
        }
        delete require.cache[require.resolve(pluginManagerJsPath)];
      }
    });
  });

  // ---- Example plugin validation ----

  describe('example-hello plugin', () => {
    it('example plugin file exists', () => {
      expect(fs.existsSync(examplePluginPath)).toBe(true);
    });

    it('example plugin has correct contract', () => {
      const plugin = require(examplePluginPath);
      expect(plugin.name).toBe('example-hello');
      expect(plugin.version).toBe('1.0.0');
      expect(typeof plugin.register).toBe('function');
    });

    it('example plugin registers hello_world tool', async () => {
      const originalEnv = process.env.EVOKORE_PLUGINS_DIR;
      process.env.EVOKORE_PLUGINS_DIR = path.join(ROOT, 'plugins');
      try {
        delete require.cache[require.resolve(pluginManagerJsPath)];
        const { PluginManager } = require(pluginManagerJsPath);
        const pm = new PluginManager();
        await pm.loadPlugins();

        expect(pm.isPluginTool('hello_world')).toBe(true);

        const result = await pm.handleToolCall('hello_world', { name: 'Test' });
        expect(result.content[0].text).toMatch(/Hello, Test!/);
      } finally {
        if (originalEnv === undefined) {
          delete process.env.EVOKORE_PLUGINS_DIR;
        } else {
          process.env.EVOKORE_PLUGINS_DIR = originalEnv;
        }
        delete require.cache[require.resolve(pluginManagerJsPath)];
      }
    });
  });

  // ---- index.ts integration ----

  describe('index.ts wires plugin system', () => {
    const indexSrc = fs.readFileSync(indexTsPath, 'utf8');

    it('imports PluginManager', () => {
      expect(indexSrc).toMatch(/import.*PluginManager.*from.*\.\/PluginManager/);
    });

    it('creates PluginManager instance', () => {
      expect(indexSrc).toMatch(/new PluginManager\(/);
    });

    it('calls loadPlugins in loadSubsystems', () => {
      expect(indexSrc).toMatch(/pluginManager\.loadPlugins\(\)/);
    });

    it('includes plugin tools in rebuildToolCatalog', () => {
      expect(indexSrc).toMatch(/pluginManager\.getTools\(\)/);
    });

    it('handles reload_plugins tool call', () => {
      expect(indexSrc).toMatch(/reload_plugins/);
      expect(indexSrc).toMatch(/handleReloadPlugins/);
    });

    it('routes plugin tool calls via isPluginTool', () => {
      expect(indexSrc).toMatch(/pluginManager\.isPluginTool/);
      expect(indexSrc).toMatch(/pluginManager\.handleToolCall/);
    });

    it('includes plugin resources in ListResourcesRequestSchema', () => {
      expect(indexSrc).toMatch(/pluginManager\.getResources\(\)/);
    });

    it('checks plugin resources in ReadResourceRequestSchema', () => {
      expect(indexSrc).toMatch(/pluginManager\.isPluginResource/);
      expect(indexSrc).toMatch(/pluginManager\.handleResourceRead/);
    });
  });

  // ---- Diagnostics ----

  describe('diagnostics methods', () => {
    it('getLoadedPlugins returns plugin summaries', async () => {
      const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'evokore-plugin-diag-'));
      const pluginCode = `
        module.exports = {
          name: 'diag-plugin',
          version: '3.1.0',
          register(ctx) {
            ctx.addTool('diag_tool', { description: 'Diag', inputSchema: { type: 'object', properties: {} } }, async () => ({ content: [{ type: 'text', text: 'ok' }] }));
          }
        };
      `;
      await fsp.writeFile(path.join(tmpDir, 'diag.js'), pluginCode);

      const originalEnv = process.env.EVOKORE_PLUGINS_DIR;
      process.env.EVOKORE_PLUGINS_DIR = tmpDir;
      try {
        delete require.cache[require.resolve(pluginManagerJsPath)];
        const { PluginManager } = require(pluginManagerJsPath);
        const pm = new PluginManager();
        await pm.loadPlugins();

        const loaded = pm.getLoadedPlugins();
        expect(loaded.length).toBe(1);
        expect(loaded[0].name).toBe('diag-plugin');
        expect(loaded[0].version).toBe('3.1.0');
        expect(loaded[0].toolCount).toBe(1);
        expect(loaded[0].resourceCount).toBe(0);
      } finally {
        if (originalEnv === undefined) {
          delete process.env.EVOKORE_PLUGINS_DIR;
        } else {
          process.env.EVOKORE_PLUGINS_DIR = originalEnv;
        }
        delete require.cache[require.resolve(pluginManagerJsPath)];
        await fsp.rm(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
