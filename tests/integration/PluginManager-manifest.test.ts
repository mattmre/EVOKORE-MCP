import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';

const ROOT = path.resolve(__dirname, '../..');
const pluginManagerTsPath = path.join(ROOT, 'src', 'PluginManager.ts');
const pluginManagerJsPath = path.join(ROOT, 'dist', 'PluginManager.js');
const packageJsonPath = path.join(ROOT, 'package.json');

/**
 * Build a plugin directory under `dir` named `sub` containing a `plugin.js`
 * that registers `tool` and an optional `plugin.json`.
 */
async function writePluginFixture(
  dir: string,
  sub: string,
  opts: { tool: string; pluginName: string; pluginJson?: string | object | null }
): Promise<string> {
  const pluginDir = path.join(dir, sub);
  await fsp.mkdir(pluginDir, { recursive: true });
  const jsCode = `
    module.exports = {
      name: ${JSON.stringify(opts.pluginName)},
      version: '1.0.0',
      register(ctx) {
        ctx.addTool(${JSON.stringify(opts.tool)}, {
          description: 'fixture',
          inputSchema: { type: 'object', properties: {} }
        }, async () => ({ content: [{ type: 'text', text: 'ok' }] }));
      }
    };
  `;
  await fsp.writeFile(path.join(pluginDir, 'plugin.js'), jsCode);
  if (opts.pluginJson !== undefined && opts.pluginJson !== null) {
    const raw = typeof opts.pluginJson === 'string'
      ? opts.pluginJson
      : JSON.stringify(opts.pluginJson, null, 2);
    await fsp.writeFile(path.join(pluginDir, 'plugin.json'), raw);
  }
  return pluginDir;
}

/**
 * The existing PluginManager loads `*.js` files directly in `EVOKORE_PLUGINS_DIR`.
 * To keep manifest fixtures co-located with their `.js` files, we point each test
 * at a subdirectory that itself IS the plugins dir for that test.
 *
 * Because the manager only looks at files directly under its configured dir,
 * each fixture subdir must be its own plugins dir. We mkdtemp a parent and then
 * add one nested dir per fixture, pointing EVOKORE_PLUGINS_DIR at it.
 */

const currentPkgVersion: string = (() => {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return pkg.version;
})();

describe('Wave 8-A: plugin.json manifest support', () => {
  // ---- Source structure ----

  describe('source exports', () => {
    const src = fs.readFileSync(pluginManagerTsPath, 'utf8');

    it('defines PluginJsonManifest interface', () => {
      expect(src).toMatch(/interface PluginJsonManifest/);
    });

    it('exports PluginJsonManifest interface', () => {
      expect(src).toMatch(/export interface PluginJsonManifest/);
    });

    it('exports LoadedPlugin interface', () => {
      expect(src).toMatch(/export interface LoadedPlugin/);
    });

    it('LoadedPlugin includes optional manifest field', () => {
      expect(src).toMatch(/manifest\?:\s*PluginJsonManifest/);
    });

    it('defines getPluginManifest method', () => {
      expect(src).toMatch(/getPluginManifest\s*\(/);
    });

    it('reload_plugins tool mentions plugin.json', () => {
      expect(src).toMatch(/plugin\.json/);
    });
  });

  // ---- Runtime manifest behavior ----

  describe('manifest runtime behavior', () => {
    let parentDir: string;
    let originalEnv: string | undefined;

    beforeEach(async () => {
      parentDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'evokore-plugin-manifest-'));
      originalEnv = process.env.EVOKORE_PLUGINS_DIR;
      delete require.cache[require.resolve(pluginManagerJsPath)];
    });

    afterEach(async () => {
      if (originalEnv === undefined) {
        delete process.env.EVOKORE_PLUGINS_DIR;
      } else {
        process.env.EVOKORE_PLUGINS_DIR = originalEnv;
      }
      delete require.cache[require.resolve(pluginManagerJsPath)];
      await fsp.rm(parentDir, { recursive: true, force: true });
    });

    async function loadPluginsAt(pluginsDir: string): Promise<any> {
      process.env.EVOKORE_PLUGINS_DIR = pluginsDir;
      delete require.cache[require.resolve(pluginManagerJsPath)];
      const { PluginManager } = require(pluginManagerJsPath);
      const pm = new PluginManager();
      const result = await pm.loadPlugins();
      return { pm, result };
    }

    it('1. plugin with valid manifest loads and manifest is accessible via getPluginManifest(name)', async () => {
      const pluginsDir = path.join(parentDir, 'valid-with-manifest-dir');
      await fsp.mkdir(pluginsDir, { recursive: true });
      const jsCode = `
        module.exports = {
          name: 'valid-with-manifest',
          version: '1.0.0',
          register(ctx) {
            ctx.addTool('vwm_tool', { description: 'x', inputSchema: { type: 'object', properties: {} } }, async () => ({ content: [{ type: 'text', text: 'ok' }] }));
          }
        };
      `;
      await fsp.writeFile(path.join(pluginsDir, 'plugin.js'), jsCode);
      await fsp.writeFile(
        path.join(pluginsDir, 'plugin.json'),
        JSON.stringify({
          name: 'valid-with-manifest',
          version: '1.2.3',
          description: 'A valid manifest',
          tools: ['vwm_tool'],
          permissions: ['read']
        })
      );

      const { pm, result } = await loadPluginsAt(pluginsDir);
      expect(result.loaded).toBe(1);
      expect(result.failed).toBe(0);

      const manifest = pm.getPluginManifest('valid-with-manifest');
      expect(manifest).toBeDefined();
      expect(manifest.name).toBe('valid-with-manifest');
      expect(manifest.version).toBe('1.2.3');
      expect(manifest.description).toBe('A valid manifest');
      expect(manifest.tools).toEqual(['vwm_tool']);
      expect(manifest.permissions).toEqual(['read']);
    });

    it('2. plugin without manifest loads normally; getPluginManifest returns undefined', async () => {
      const pluginsDir = path.join(parentDir, 'no-manifest-dir');
      await fsp.mkdir(pluginsDir, { recursive: true });
      await fsp.writeFile(
        path.join(pluginsDir, 'plugin.js'),
        `module.exports = {
          name: 'valid-without-manifest',
          version: '1.0.0',
          register(ctx) {
            ctx.addTool('vwoutm_tool', { description: 'x', inputSchema: { type: 'object', properties: {} } }, async () => ({ content: [{ type: 'text', text: 'ok' }] }));
          }
        };`
      );

      const { pm, result } = await loadPluginsAt(pluginsDir);
      expect(result.loaded).toBe(1);
      expect(result.failed).toBe(0);

      expect(pm.getPluginManifest('valid-without-manifest')).toBeUndefined();
      expect(pm.isPluginTool('vwoutm_tool')).toBe(true);
    });

    it('3. plugin with invalid manifest (missing name) loads but manifest is not attached', async () => {
      const pluginsDir = path.join(parentDir, 'invalid-missing-name-dir');
      await fsp.mkdir(pluginsDir, { recursive: true });
      await fsp.writeFile(
        path.join(pluginsDir, 'plugin.js'),
        `module.exports = {
          name: 'invalid-manifest-missing-name',
          version: '1.0.0',
          register(ctx) {
            ctx.addTool('imm_tool', { description: 'x', inputSchema: { type: 'object', properties: {} } }, async () => ({ content: [{ type: 'text', text: 'ok' }] }));
          }
        };`
      );
      await fsp.writeFile(
        path.join(pluginsDir, 'plugin.json'),
        JSON.stringify({ version: '1.0.0', description: 'no name field' })
      );

      const { pm, result } = await loadPluginsAt(pluginsDir);
      expect(result.loaded).toBe(1);
      expect(result.failed).toBe(0);
      expect(pm.getPluginManifest('invalid-manifest-missing-name')).toBeUndefined();
      expect(pm.isPluginTool('imm_tool')).toBe(true);
    });

    it('4. plugin with evokore_min_version > current package version is SKIPPED', async () => {
      const pluginsDir = path.join(parentDir, 'too-new-dir');
      await fsp.mkdir(pluginsDir, { recursive: true });
      await fsp.writeFile(
        path.join(pluginsDir, 'plugin.js'),
        `module.exports = {
          name: 'too-new',
          version: '1.0.0',
          register(ctx) {
            ctx.addTool('too_new_tool', { description: 'x', inputSchema: { type: 'object', properties: {} } }, async () => ({ content: [{ type: 'text', text: 'ok' }] }));
          }
        };`
      );
      await fsp.writeFile(
        path.join(pluginsDir, 'plugin.json'),
        JSON.stringify({
          name: 'too-new',
          version: '1.0.0',
          description: 'Requires future version',
          evokore_min_version: '999.0.0'
        })
      );

      const { pm, result } = await loadPluginsAt(pluginsDir);
      // Skipped plugins count as neither loaded nor failed.
      expect(result.loaded).toBe(0);
      expect(result.failed).toBe(0);
      expect(pm.isPluginTool('too_new_tool')).toBe(false);
      expect(pm.getPluginManifest('too-new')).toBeUndefined();
    });

    it('5. plugin with evokore_min_version <= current package version loads normally', async () => {
      const pluginsDir = path.join(parentDir, 'satisfied-min-dir');
      await fsp.mkdir(pluginsDir, { recursive: true });
      await fsp.writeFile(
        path.join(pluginsDir, 'plugin.js'),
        `module.exports = {
          name: 'satisfied-min',
          version: '1.0.0',
          register(ctx) {
            ctx.addTool('smin_tool', { description: 'x', inputSchema: { type: 'object', properties: {} } }, async () => ({ content: [{ type: 'text', text: 'ok' }] }));
          }
        };`
      );
      // Use the literal current package version so this test stays stable
      // even as the project bumps its own version.
      await fsp.writeFile(
        path.join(pluginsDir, 'plugin.json'),
        JSON.stringify({
          name: 'satisfied-min',
          version: '1.0.0',
          description: 'ok',
          evokore_min_version: currentPkgVersion
        })
      );

      const { pm, result } = await loadPluginsAt(pluginsDir);
      expect(result.loaded).toBe(1);
      expect(result.failed).toBe(0);
      expect(pm.isPluginTool('smin_tool')).toBe(true);
      const m = pm.getPluginManifest('satisfied-min');
      expect(m).toBeDefined();
      expect(m.evokore_min_version).toBe(currentPkgVersion);
    });

    it('6. getLoadedPlugins returns correct manifest field for each plugin', async () => {
      const pluginsDir = path.join(parentDir, 'mixed-dir');
      await fsp.mkdir(pluginsDir, { recursive: true });
      // With-manifest plugin
      await fsp.writeFile(
        path.join(pluginsDir, 'with.js'),
        `module.exports = {
          name: 'with',
          version: '1.0.0',
          register(ctx) {
            ctx.addTool('with_tool', { description: 'x', inputSchema: { type: 'object', properties: {} } }, async () => ({ content: [{ type: 'text', text: 'ok' }] }));
          }
        };`
      );
      // Without-manifest plugin (same dir, no plugin.json — but the loader looks
      // for `plugin.json` next to the `.js` file. Both sit in the same plugins
      // dir, so we need a single `plugin.json` to cover only "with"; we use a
      // per-plugin convention where a missing same-dir plugin.json means "no
      // manifest". Here, only ONE plugin.json can live in this dir; by design
      // the loader will apply it to both files if present. So to test truly
      // per-file manifest resolution, we use two nested plugin dirs instead.
      //
      // Restart with a cleaner layout: two sibling plugin dirs, each with its
      // own plugins dir pointer. For this test, we verify getLoadedPlugins
      // returns the right manifest when only ONE plugin has a plugin.json.
      await fsp.writeFile(
        path.join(pluginsDir, 'plugin.json'),
        JSON.stringify({ name: 'with', version: '2.0.0', description: 'has manifest' })
      );
      // Note: the loader applies `plugin.json` per-directory. Both `with.js`
      // and any other `.js` in the same dir would share it. So we only add
      // one plugin file here and verify manifest attachment.

      const { pm, result } = await loadPluginsAt(pluginsDir);
      expect(result.loaded).toBe(1);
      const loaded = pm.getLoadedPlugins();
      expect(loaded.length).toBe(1);
      const withEntry = loaded.find((p: any) => p.name === 'with');
      expect(withEntry).toBeDefined();
      expect(withEntry.manifest).toBeDefined();
      expect(withEntry.manifest.name).toBe('with');
      expect(withEntry.manifest.version).toBe('2.0.0');
      expect(withEntry.filePath).toBeDefined();
    });

    it('6b. getLoadedPlugins omits manifest for plugins without plugin.json', async () => {
      const pluginsDir = path.join(parentDir, 'bare-dir');
      await fsp.mkdir(pluginsDir, { recursive: true });
      await fsp.writeFile(
        path.join(pluginsDir, 'bare.js'),
        `module.exports = {
          name: 'bare',
          version: '1.0.0',
          register(ctx) {
            ctx.addTool('bare_tool', { description: 'x', inputSchema: { type: 'object', properties: {} } }, async () => ({ content: [{ type: 'text', text: 'ok' }] }));
          }
        };`
      );

      const { pm, result } = await loadPluginsAt(pluginsDir);
      expect(result.loaded).toBe(1);
      const loaded = pm.getLoadedPlugins();
      expect(loaded.length).toBe(1);
      expect(loaded[0].name).toBe('bare');
      expect(loaded[0].manifest).toBeUndefined();
    });

    it('7. bad JSON in plugin.json — plugin still loads (fail-open on manifest parse error)', async () => {
      const pluginsDir = path.join(parentDir, 'bad-json-dir');
      await fsp.mkdir(pluginsDir, { recursive: true });
      await fsp.writeFile(
        path.join(pluginsDir, 'plugin.js'),
        `module.exports = {
          name: 'bad-json',
          version: '1.0.0',
          register(ctx) {
            ctx.addTool('bj_tool', { description: 'x', inputSchema: { type: 'object', properties: {} } }, async () => ({ content: [{ type: 'text', text: 'ok' }] }));
          }
        };`
      );
      await fsp.writeFile(path.join(pluginsDir, 'plugin.json'), '{ this is not json ::::');

      const { pm, result } = await loadPluginsAt(pluginsDir);
      expect(result.loaded).toBe(1);
      expect(result.failed).toBe(0);
      expect(pm.isPluginTool('bj_tool')).toBe(true);
      expect(pm.getPluginManifest('bad-json')).toBeUndefined();
    });

    it('8. reload_plugins hot-reload still works with manifests', async () => {
      const pluginsDir = path.join(parentDir, 'reload-dir');
      await fsp.mkdir(pluginsDir, { recursive: true });
      const jsPath = path.join(pluginsDir, 'plugin.js');
      const jsonPath = path.join(pluginsDir, 'plugin.json');

      await fsp.writeFile(
        jsPath,
        `module.exports = {
          name: 'reloader',
          version: '1.0.0',
          register(ctx) {
            ctx.addTool('reload_tool', { description: 'v1', inputSchema: { type: 'object', properties: {} } }, async () => ({ content: [{ type: 'text', text: 'v1' }] }));
          }
        };`
      );
      await fsp.writeFile(
        jsonPath,
        JSON.stringify({ name: 'reloader', version: '1.0.0', description: 'v1' })
      );

      const { pm, result } = await loadPluginsAt(pluginsDir);
      expect(result.loaded).toBe(1);
      let manifest = pm.getPluginManifest('reloader');
      expect(manifest).toBeDefined();
      expect(manifest.version).toBe('1.0.0');

      // Update the plugin.json and hot-reload.
      await fsp.writeFile(
        jsonPath,
        JSON.stringify({ name: 'reloader', version: '2.0.0', description: 'v2' })
      );
      const reloadResult = await pm.loadPlugins();
      expect(reloadResult.loaded).toBe(1);
      manifest = pm.getPluginManifest('reloader');
      expect(manifest).toBeDefined();
      expect(manifest.version).toBe('2.0.0');
      expect(manifest.description).toBe('v2');
    });
  });

  // ---- reload_plugins tool surface ----

  describe('reload_plugins tool description', () => {
    it('getTools reload_plugins description mentions plugin.json', async () => {
      const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'evokore-plugin-manifest-tool-'));
      const originalEnv = process.env.EVOKORE_PLUGINS_DIR;
      process.env.EVOKORE_PLUGINS_DIR = tmpDir;
      try {
        delete require.cache[require.resolve(pluginManagerJsPath)];
        const { PluginManager } = require(pluginManagerJsPath);
        const pm = new PluginManager();
        await pm.loadPlugins();
        const tools = pm.getTools();
        const reload = tools.find((t: any) => t.name === 'reload_plugins');
        expect(reload).toBeDefined();
        expect(reload.description).toMatch(/plugin\.json/);
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
