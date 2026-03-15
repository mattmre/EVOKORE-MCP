# Plugin System Architecture

**Date:** 2026-03-14
**Status:** Implemented
**PR:** T28

## Overview

EVOKORE-MCP v3.0 now supports a file-based plugin system that lets operators add custom tool providers without modifying EVOKORE's source code or running separate MCP servers. Plugins are single `.js` files dropped into a configurable directory, loaded at startup and reloadable at runtime.

## Architecture

### Loading Order

```
1. SecurityManager.loadPermissions()
2. SkillManager.loadSkills()
3. PluginManager.loadPlugins()    <-- plugins loaded here
4. ToolCatalogIndex rebuilt (native + plugin + proxied tools)
5. Proxy servers boot in background
```

Plugins are loaded **after** native skill tools but **before** proxy tools. This means plugin tools are treated as native (always-visible) tools in the ToolCatalogIndex, similar to `resolve_workflow` or `discover_tools`.

### Plugin Contract

Each plugin is a CommonJS module exporting:

```js
module.exports = {
  name: 'my-plugin',        // required: unique identifier
  version: '1.0.0',         // optional: semver
  register(context) {       // required: registration function
    // context.addTool(name, schema, handler)
    // context.addResource(uri, meta, handler)
    // context.log(message)
  }
};
```

#### context.addTool(name, schema, handler)

Registers an MCP tool.

- `name` (string): Tool name visible to clients
- `schema` (object): `{ description, inputSchema, annotations? }`
- `handler` (async function): `(args) => Promise<{ content: [{ type, text }] }>`

The handler must return a standard MCP tool result object.

#### context.addResource(uri, meta, handler)

Registers an MCP resource.

- `uri` (string): Resource URI (e.g., `plugin://my-plugin/status`)
- `meta` (object): `{ name, mimeType?, description? }`
- `handler` (async function): `() => Promise<{ text: string }>`

#### context.log(message)

Logs a message to stderr prefixed with the plugin name: `[EVOKORE][plugin:my-plugin] message`.

### Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `EVOKORE_PLUGINS_DIR` | `plugins/` (relative to project root) | Directory to scan for `.js` plugin files |

### Hot-Reload

The `reload_plugins` tool rescans the plugins directory, clears require cache entries for each plugin file, and re-executes all plugin registrations. This mirrors the `refresh_skills` pattern.

## Security Considerations

### Trust Boundary

Plugins execute in the same Node.js process as the EVOKORE server. They have full access to:
- The Node.js runtime (file system, network, child processes)
- Environment variables (including secrets)
- The MCP Server instance (indirectly, through the context API)

**Plugins should only be installed by the server operator.** The plugin directory should have restricted filesystem permissions. There is no sandboxing - this is intentional, as plugins need the same capabilities as native tools.

### Fail-Safe Loading

- A plugin that throws during `register()` does not crash the server
- Failed plugins are logged and skipped; other plugins continue loading
- The `reload_plugins` response reports which plugins failed and why
- The plugins directory not existing is not an error (silent skip)

### Namespace Collision

Plugin tool names share the global MCP tool namespace. If a plugin registers a tool with the same name as a native tool or another plugin's tool, the last-registered tool wins in the ToolCatalogIndex. The `isPluginTool()` check in the CallTool handler runs before the native tool check, so plugin tools can shadow native tools. Operators should use unique prefixed names (e.g., `myplugin_toolname`).

## Example Plugin

```js
// plugins/example-hello.js
module.exports = {
  name: 'example-hello',
  version: '1.0.0',
  register(context) {
    context.addTool(
      'hello_world',
      {
        description: 'A simple greeting tool.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name to greet' }
          }
        }
      },
      async (args) => ({
        content: [{ type: 'text', text: `Hello, ${args?.name || 'World'}!` }]
      })
    );
  }
};
```

## Testing

The plugin system is tested in `tests/integration/plugin-system.test.ts` covering:
- Module existence and structure
- Plugin directory scanning (including missing directories)
- Valid plugin loading and tool registration
- Fail-safe behavior on invalid plugins
- Hot-reload (re-registration)
- `EVOKORE_PLUGINS_DIR` env var override
- Tool call delegation
- Integration with `index.ts` (reload_plugins wiring)
