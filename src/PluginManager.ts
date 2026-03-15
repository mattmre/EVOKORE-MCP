import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { WebhookManager, WebhookEventType } from "./WebhookManager";

const DEFAULT_PLUGINS_DIR = path.resolve(__dirname, "../plugins");

export interface PluginTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  annotations?: Record<string, any>;
  handler: (args: any) => Promise<any>;
}

export interface PluginResource {
  uri: string;
  name: string;
  mimeType?: string;
  description?: string;
  handler: () => Promise<{ text: string }>;
}

export interface PluginContext {
  addTool(name: string, schema: { description: string; inputSchema: Record<string, any>; annotations?: Record<string, any> }, handler: (args: any) => Promise<any>): void;
  addResource(uri: string, resource: { name: string; mimeType?: string; description?: string }, handler: () => Promise<{ text: string }>): void;
  log(message: string): void;
  emitWebhook(event: string, data: Record<string, unknown>): void;
  onWebhookEvent(eventType: string, handler: (event: any) => void): void;
}

export interface PluginManifest {
  name: string;
  version?: string;
  register(context: PluginContext): void | Promise<void>;
}

export interface LoadedPlugin {
  name: string;
  version: string;
  filePath: string;
  tools: PluginTool[];
  resources: PluginResource[];
  loadedAt: number;
}

export interface PluginLoadResult {
  loaded: number;
  failed: number;
  totalTools: number;
  totalResources: number;
  loadTimeMs: number;
  errors: Array<{ file: string; error: string }>;
}

export class PluginManager {
  private plugins: Map<string, LoadedPlugin> = new Map();
  private pluginsDir: string;
  private webhookManager: WebhookManager | null;

  constructor(webhookManager?: WebhookManager) {
    this.pluginsDir = process.env.EVOKORE_PLUGINS_DIR
      ? path.resolve(process.env.EVOKORE_PLUGINS_DIR)
      : DEFAULT_PLUGINS_DIR;
    this.webhookManager = webhookManager ?? null;
  }

  getPluginsDir(): string {
    return this.pluginsDir;
  }

  async loadPlugins(): Promise<PluginLoadResult> {
    const startTime = Date.now();
    const result: PluginLoadResult = {
      loaded: 0,
      failed: 0,
      totalTools: 0,
      totalResources: 0,
      loadTimeMs: 0,
      errors: []
    };

    // Emit plugin_unloaded and clean up subscriptions for each previously loaded plugin before clearing
    if (this.webhookManager) {
      for (const [name, plugin] of this.plugins) {
        this.webhookManager.unsubscribeAll(name);
        this.webhookManager.emit("plugin_unloaded", { plugin: name, version: plugin.version });
      }
    }

    // Clear previously loaded plugins
    this.plugins.clear();

    // Check if plugins directory exists
    if (!fsSync.existsSync(this.pluginsDir)) {
      console.error(`[EVOKORE] Plugin directory not found: ${this.pluginsDir} (skipping plugin load)`);
      result.loadTimeMs = Date.now() - startTime;
      return result;
    }

    let entries: string[];
    try {
      entries = await fs.readdir(this.pluginsDir);
    } catch (err: any) {
      console.error(`[EVOKORE] Failed to read plugin directory: ${err?.message || err}`);
      result.loadTimeMs = Date.now() - startTime;
      return result;
    }

    const jsFiles = entries.filter(e => e.endsWith(".js") && !e.startsWith("."));

    for (const file of jsFiles) {
      const filePath = path.join(this.pluginsDir, file);
      try {
        await this.loadSinglePlugin(filePath);
        result.loaded++;

        // Emit plugin_loaded event for the just-loaded plugin
        if (this.webhookManager) {
          // Find the plugin that was just loaded from this file
          for (const plugin of this.plugins.values()) {
            if (plugin.filePath === filePath) {
              this.webhookManager.emit("plugin_loaded", {
                plugin: plugin.name,
                version: plugin.version,
                toolCount: plugin.tools.length,
                resourceCount: plugin.resources.length,
              });
              break;
            }
          }
        }
      } catch (err: any) {
        const errorMsg = err?.message || String(err);
        console.error(`[EVOKORE] Failed to load plugin ${file}: ${errorMsg}`);
        result.failed++;
        result.errors.push({ file, error: errorMsg });

        // Emit plugin_load_error event
        this.webhookManager?.emit("plugin_load_error", {
          file: path.basename(filePath),
          error: errorMsg,
        });
      }
    }

    // Compute totals
    for (const plugin of this.plugins.values()) {
      result.totalTools += plugin.tools.length;
      result.totalResources += plugin.resources.length;
    }

    result.loadTimeMs = Date.now() - startTime;

    if (result.loaded > 0 || result.failed > 0) {
      console.error(
        `[EVOKORE] Plugins loaded: ${result.loaded} ok, ${result.failed} failed, ` +
        `${result.totalTools} tools, ${result.totalResources} resources (${result.loadTimeMs}ms)`
      );
    }

    return result;
  }

  private async loadSinglePlugin(filePath: string): Promise<void> {
    // Clear the require cache so hot-reload works
    const resolvedPath = require.resolve(filePath);
    delete require.cache[resolvedPath];

    const pluginModule = require(filePath);

    // Support both module.exports = { ... } and module.exports.default = { ... }
    const manifest: PluginManifest = pluginModule.default || pluginModule;

    if (!manifest || typeof manifest.register !== "function") {
      throw new Error("Plugin must export a register(context) function");
    }

    if (!manifest.name || typeof manifest.name !== "string") {
      throw new Error("Plugin must export a name string");
    }

    const tools: PluginTool[] = [];
    const resources: PluginResource[] = [];
    const pluginName = manifest.name;

    const context: PluginContext = {
      addTool(name, schema, handler) {
        if (!name || typeof name !== "string") {
          throw new Error("Tool name must be a non-empty string");
        }
        if (typeof handler !== "function") {
          throw new Error(`Tool '${name}' handler must be a function`);
        }
        tools.push({
          name,
          description: schema.description || "No description provided.",
          inputSchema: schema.inputSchema || { type: "object", properties: {} },
          annotations: schema.annotations,
          handler
        });
      },
      addResource(uri, resource, handler) {
        if (!uri || typeof uri !== "string") {
          throw new Error("Resource URI must be a non-empty string");
        }
        if (typeof handler !== "function") {
          throw new Error(`Resource '${uri}' handler must be a function`);
        }
        resources.push({
          uri,
          name: resource.name || uri,
          mimeType: resource.mimeType,
          description: resource.description,
          handler
        });
      },
      log(message: string) {
        console.error(`[EVOKORE][plugin:${pluginName}] ${message}`);
      },
      emitWebhook: (event: string, data: Record<string, unknown>) => {
        if (this.webhookManager) {
          this.webhookManager.emit(event as WebhookEventType, { ...data, plugin: manifest.name });
        }
      },
      onWebhookEvent: (eventType: string, handler: (event: any) => void) => {
        if (this.webhookManager) {
          this.webhookManager.subscribe(eventType, pluginName, handler);
        }
      }
    };

    await Promise.resolve(manifest.register(context));

    this.plugins.set(pluginName, {
      name: pluginName,
      version: manifest.version || "0.0.0",
      filePath,
      tools,
      resources,
      loadedAt: Date.now()
    });
  }

  /**
   * Returns MCP Tool definitions for all loaded plugin tools,
   * plus the built-in reload_plugins meta-tool.
   * These are merged with native tools in the ToolCatalogIndex.
   */
  getTools(): Tool[] {
    const tools: Tool[] = [
      {
        name: "reload_plugins",
        description: "Reload all plugins from the plugins directory. Use this after adding, removing, or modifying plugin files during a live session.",
        inputSchema: {
          type: "object" as const,
          properties: {},
          required: []
        },
        annotations: {
          title: "Reload Plugins",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false
        }
      } as Tool
    ];

    for (const plugin of this.plugins.values()) {
      for (const pt of plugin.tools) {
        tools.push({
          name: pt.name,
          description: pt.description,
          inputSchema: pt.inputSchema,
          ...(pt.annotations ? { annotations: pt.annotations } : {})
        } as Tool);
      }
    }
    return tools;
  }

  /**
   * Returns plugin-registered resources for inclusion in resources/list.
   */
  getResources(): Array<{ uri: string; name: string; mimeType?: string; description?: string }> {
    const resources: Array<{ uri: string; name: string; mimeType?: string; description?: string }> = [];
    for (const plugin of this.plugins.values()) {
      for (const pr of plugin.resources) {
        resources.push({
          uri: pr.uri,
          name: pr.name,
          mimeType: pr.mimeType,
          description: pr.description
        });
      }
    }
    return resources;
  }

  /**
   * Handle a tool call by delegating to the plugin tool's handler.
   * Returns null if no plugin owns this tool.
   */
  async handleToolCall(toolName: string, args: any): Promise<any | null> {
    for (const plugin of this.plugins.values()) {
      for (const pt of plugin.tools) {
        if (pt.name === toolName) {
          return await pt.handler(args);
        }
      }
    }
    return null;
  }

  /**
   * Handle a resource read by delegating to the plugin resource's handler.
   * Returns null if no plugin owns this resource.
   */
  async handleResourceRead(uri: string): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> } | null> {
    for (const plugin of this.plugins.values()) {
      for (const pr of plugin.resources) {
        if (pr.uri === uri) {
          const result = await pr.handler();
          return {
            contents: [{
              uri,
              mimeType: pr.mimeType || "text/plain",
              text: result.text
            }]
          };
        }
      }
    }
    return null;
  }

  /**
   * Check if a tool name belongs to a loaded plugin.
   */
  isPluginTool(toolName: string): boolean {
    for (const plugin of this.plugins.values()) {
      for (const pt of plugin.tools) {
        if (pt.name === toolName) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Check if a resource URI belongs to a loaded plugin.
   */
  isPluginResource(uri: string): boolean {
    for (const plugin of this.plugins.values()) {
      for (const pr of plugin.resources) {
        if (pr.uri === uri) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Get a summary of loaded plugins for diagnostics.
   */
  getLoadedPlugins(): Array<{ name: string; version: string; toolCount: number; resourceCount: number }> {
    return Array.from(this.plugins.values()).map(p => ({
      name: p.name,
      version: p.version,
      toolCount: p.tools.length,
      resourceCount: p.resources.length
    }));
  }

  getPluginCount(): number {
    return this.plugins.size;
  }

  getToolCount(): number {
    let count = 0;
    for (const plugin of this.plugins.values()) {
      count += plugin.tools.length;
    }
    return count;
  }
}
