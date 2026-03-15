# Plugin Authoring Guide

This guide covers how to create, test, and deploy plugins for EVOKORE-MCP. Plugins extend the server with custom tools and resources that are loaded at startup and can be hot-reloaded during a live session.

## Table of Contents

1. [Overview](#overview)
2. [Plugin Structure](#plugin-structure)
3. [Tool Definitions](#tool-definitions)
4. [Resource Definitions](#resource-definitions)
5. [WebhookManager Integration](#webhookmanager-integration)
6. [Hot-Reload](#hot-reload)
7. [Configuration](#configuration)
8. [Testing Plugins](#testing-plugins)
9. [Best Practices](#best-practices)
10. [Example Plugin](#example-plugin)

---

## Overview

Plugins are standalone JavaScript files that register tools and resources with the EVOKORE-MCP server. They are discovered from the `plugins/` directory (or a custom path) and loaded automatically at server startup.

**When to use plugins:**

- You need custom tools that are not provided by child MCP servers or the built-in skill system.
- You want to add domain-specific resources accessible via the MCP `resources/read` protocol.
- You want functionality that can be developed and deployed independently of the core server.
- You need to iterate on tool implementations without restarting the server (hot-reload).

**How plugins fit into the architecture:**

Plugin tools are registered alongside native tools (skills, discovery) and proxied tools (from child servers like GitHub, filesystem, Supabase). When a client calls `tools/list`, plugin tools appear in the full list. When a client calls a plugin tool, the `PluginManager` dispatches the call to the plugin's handler function. Plugin resources appear in `resources/list` and are read through `resources/read`.

---

## Plugin Structure

A plugin is a single `.js` file placed in the plugins directory. It must export a **manifest object** with the following shape:

```js
module.exports = {
  name: 'my-plugin',        // required -- unique plugin identifier
  version: '1.0.0',         // optional -- semver version string (defaults to "0.0.0")
  register(context) {       // required -- called once during plugin load
    // Use context to register tools and resources
  }
};
```

### Manifest Fields

| Field      | Type       | Required | Description                                                     |
|------------|------------|----------|-----------------------------------------------------------------|
| `name`     | `string`   | Yes      | Unique identifier for the plugin. Used in diagnostics and webhook events. |
| `version`  | `string`   | No       | Semver version string. Defaults to `"0.0.0"` if omitted.       |
| `register` | `function` | Yes      | Called once with a `PluginContext` object. Can be async.        |

### File Discovery Rules

- Only files ending in `.js` are loaded.
- Files starting with `.` (dotfiles) are ignored.
- Non-JS files (`.json`, `.txt`, `.ts`, etc.) are ignored.
- The `register` function can be synchronous or return a Promise (async).
- Both `module.exports = { ... }` and `module.exports.default = { ... }` export styles are supported.

### Directory Layout

```
plugins/
  .gitkeep
  example-hello.js       # The bundled example plugin
  my-custom-plugin.js    # Your plugin file
```

Each plugin is a single file. If your plugin needs helper modules, bundle them into the single file or use `require()` to load them from a known path.

---

## Tool Definitions

Tools are registered via `context.addTool()` inside the `register` function.

### addTool Signature

```js
context.addTool(name, schema, handler)
```

| Parameter | Type       | Description                                                        |
|-----------|------------|--------------------------------------------------------------------|
| `name`    | `string`   | Tool name. Must be a non-empty string. This is the name clients use to call the tool. |
| `schema`  | `object`   | An object with `description`, `inputSchema`, and optional `annotations`. |
| `handler` | `function` | Async function receiving `args` and returning an MCP tool result.  |

### Schema Object

```js
{
  description: 'Human-readable description of what the tool does.',
  inputSchema: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'First parameter' },
      param2: { type: 'number', description: 'Second parameter' }
    },
    required: ['param1']  // optional -- list of required properties
  },
  annotations: {           // optional -- MCP tool annotations
    title: 'My Tool',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }
}
```

The `inputSchema` follows JSON Schema (draft-07) conventions. If omitted, it defaults to `{ type: "object", properties: {} }`.

### Handler Function

The handler receives the parsed arguments object and must return an MCP-compatible result:

```js
async (args) => {
  const value = args?.myParam || 'default';
  return {
    content: [{
      type: 'text',
      text: `Result: ${value}`
    }]
  };
}
```

The `content` array can contain multiple items. Each item has a `type` (typically `"text"`) and the corresponding data field (`text` for text content).

### Handler Error Handling

If your handler throws an error, the PluginManager propagates it as an MCP error to the client. To return a user-facing error instead of throwing, set `isError: true`:

```js
async (args) => {
  if (!args?.required_field) {
    return {
      content: [{ type: 'text', text: 'Missing required_field parameter.' }],
      isError: true
    };
  }
  // ... normal processing
}
```

---

## Resource Definitions

Resources are registered via `context.addResource()` inside the `register` function.

### addResource Signature

```js
context.addResource(uri, metadata, handler)
```

| Parameter  | Type       | Description                                                      |
|------------|------------|------------------------------------------------------------------|
| `uri`      | `string`   | Resource URI. Must be a non-empty string. Clients use this to read the resource. |
| `metadata` | `object`   | An object with `name`, optional `mimeType`, and optional `description`. |
| `handler`  | `function` | Async function returning `{ text: string }`.                     |

### Resource Example

```js
context.addResource(
  'plugin://my-plugin/status',
  {
    name: 'My Plugin Status',
    mimeType: 'application/json',
    description: 'Returns the current status of my-plugin.'
  },
  async () => ({
    text: JSON.stringify({ healthy: true, uptime: process.uptime() })
  })
);
```

Resources appear in `resources/list` alongside server-level resources (`evokore://server/status`, etc.) and skill resources (`skill://` URIs).

---

## WebhookManager Integration

Plugins can emit webhook events through the `context.emitWebhook()` method. This integrates with the EVOKORE-MCP webhook event system, which dispatches HMAC-signed payloads to configured HTTP endpoints.

### emitWebhook Signature

```js
context.emitWebhook(event, data)
```

| Parameter | Type     | Description                                                         |
|-----------|----------|---------------------------------------------------------------------|
| `event`   | `string` | The webhook event type (e.g., `"tool_call"`, `"tool_error"`).      |
| `data`    | `object` | Arbitrary data payload. The plugin `name` is automatically appended. |

### Usage Example

```js
register(context) {
  context.addTool('process_data', {
    description: 'Process incoming data and emit a webhook event.',
    inputSchema: {
      type: 'object',
      properties: {
        input: { type: 'string' }
      }
    }
  }, async (args) => {
    const result = doSomething(args.input);

    // Emit a custom webhook event
    context.emitWebhook('tool_call', {
      action: 'data_processed',
      inputLength: args.input?.length || 0
    });

    return {
      content: [{ type: 'text', text: `Processed: ${result}` }]
    };
  });
}
```

The `plugin` field is automatically added to the data payload by the PluginManager, so the webhook receiver knows which plugin originated the event.

### Plugin Lifecycle Events

The PluginManager itself emits webhook events for plugin lifecycle changes:

| Event               | When Emitted                          | Data Fields                                      |
|---------------------|---------------------------------------|--------------------------------------------------|
| `plugin_loaded`     | After a plugin loads successfully     | `plugin`, `version`, `toolCount`, `resourceCount` |
| `plugin_unloaded`   | Before clearing plugins during reload | `plugin`, `version`                              |
| `plugin_load_error` | When a plugin fails to load           | `file`, `error`                                  |

These events are emitted automatically. You do not need to emit them from your plugin code.

### When emitWebhook is a No-Op

If the server was constructed without webhooks enabled (`EVOKORE_WEBHOOKS_ENABLED` is not `"true"`) or no `WebhookManager` was passed to the `PluginManager`, calls to `context.emitWebhook()` are silently ignored. Your plugin does not need to guard against this case.

---

## Hot-Reload

Plugins support hot-reload through the built-in `reload_plugins` tool. This allows you to add, modify, or remove plugin files without restarting the EVOKORE-MCP server.

### How It Works

1. The client (or AI agent) calls the `reload_plugins` tool (no arguments needed).
2. The PluginManager clears all previously loaded plugins from memory.
3. It deletes the Node.js `require.cache` entry for each plugin file, ensuring the fresh file is read from disk.
4. It re-scans the plugins directory and loads all `.js` files.
5. The tool catalog is rebuilt and `tools/list_changed` is sent to connected clients.

### Reload Behavior

- **Modified plugins**: The updated code is loaded. New tool definitions replace old ones.
- **Removed plugins**: Tools and resources from deleted plugin files are no longer available.
- **Added plugins**: New `.js` files in the plugins directory are discovered and loaded.
- **Partial failures**: If some plugins fail during reload, the successful ones are still loaded. The response lists any errors.

### Reload Response Format

The `reload_plugins` tool returns a summary:

```
Plugins reloaded in 12ms: 3 loaded, 1 failed, 5 tools, 2 resources.

Errors:
  - broken-plugin.js: Unexpected token (syntax error)

Loaded plugins:
  - my-plugin v1.2.0 (2 tools, 1 resources)
  - utility-plugin v1.0.0 (3 tools, 1 resources)
  - example-hello v1.0.0 (0 tools, 0 resources)
```

### Development Workflow

1. Start the EVOKORE-MCP server normally.
2. Edit or create a plugin file in the `plugins/` directory.
3. Ask the AI agent to call `reload_plugins` (or call it directly via the MCP client).
4. The new tools are immediately available.

---

## Configuration

### EVOKORE_PLUGINS_DIR

By default, the PluginManager loads plugins from the `plugins/` directory at the repository root. Override this by setting the `EVOKORE_PLUGINS_DIR` environment variable:

```bash
# In .env or shell environment
EVOKORE_PLUGINS_DIR=/path/to/my/custom/plugins
```

The path is resolved to an absolute path via `path.resolve()`.

### Webhook Configuration

To receive plugin lifecycle events (and events emitted by plugins via `context.emitWebhook`), configure webhooks in `mcp.config.json`:

```json
{
  "webhooks": [
    {
      "url": "https://my-endpoint.example.com/hooks",
      "events": ["plugin_loaded", "plugin_unloaded", "plugin_load_error", "tool_call"],
      "secret": "my-hmac-secret"
    }
  ]
}
```

And enable webhooks:

```bash
# In .env
EVOKORE_WEBHOOKS_ENABLED=true
```

### No Config File Changes Needed for Plugins

Plugins do not require any entry in `mcp.config.json`. The `servers` block in that file is for child MCP servers (proxied via stdio or HTTP). Plugins are discovered from the filesystem and loaded by the `PluginManager` independently.

---

## Testing Plugins

### Unit Testing a Plugin Module

You can test a plugin in isolation by constructing a mock `PluginContext`:

```js
const { describe, it, expect } = require('vitest');

describe('my-plugin', () => {
  it('registers the expected tool', () => {
    const plugin = require('../plugins/my-plugin.js');
    const tools = [];

    const mockContext = {
      addTool(name, schema, handler) {
        tools.push({ name, schema, handler });
      },
      addResource() {},
      log() {},
      emitWebhook() {}
    };

    plugin.register(mockContext);

    expect(tools.length).toBe(1);
    expect(tools[0].name).toBe('my_tool');
  });

  it('handler returns expected output', async () => {
    const plugin = require('../plugins/my-plugin.js');
    let capturedHandler;

    const mockContext = {
      addTool(name, schema, handler) {
        capturedHandler = handler;
      },
      addResource() {},
      log() {},
      emitWebhook() {}
    };

    plugin.register(mockContext);

    const result = await capturedHandler({ input: 'test' });
    expect(result.content[0].text).toContain('test');
  });
});
```

### Integration Testing with PluginManager

You can test plugins through the real `PluginManager` by pointing it at a temporary directory:

```js
const { describe, it, expect, beforeEach, afterEach } = require('vitest');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');

describe('my-plugin integration', () => {
  let tmpDir;
  let originalEnv;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'plugin-test-'));
    originalEnv = process.env.EVOKORE_PLUGINS_DIR;
    process.env.EVOKORE_PLUGINS_DIR = tmpDir;
  });

  afterEach(async () => {
    if (originalEnv === undefined) {
      delete process.env.EVOKORE_PLUGINS_DIR;
    } else {
      process.env.EVOKORE_PLUGINS_DIR = originalEnv;
    }
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it('loads and calls the tool', async () => {
    // Copy your plugin to the temp dir
    await fsp.copyFile(
      path.join(__dirname, '..', 'plugins', 'my-plugin.js'),
      path.join(tmpDir, 'my-plugin.js')
    );

    const { PluginManager } = require('../dist/PluginManager.js');
    const pm = new PluginManager();
    const result = await pm.loadPlugins();

    expect(result.loaded).toBe(1);
    expect(pm.isPluginTool('my_tool')).toBe(true);

    const callResult = await pm.handleToolCall('my_tool', { input: 'hello' });
    expect(callResult.content[0].text).toBeDefined();
  });
});
```

### Running Tests

EVOKORE-MCP uses vitest as its test runner:

```bash
# Run all tests
npx vitest run

# Run only plugin-related tests
npx vitest run tests/integration/plugin-system.test.ts
npx vitest run tests/integration/webhook-plugin-integration.test.ts
```

---

## Best Practices

### Naming

- Use a descriptive, unique `name` for your plugin (e.g., `"jira-integration"`, not `"plugin1"`).
- Use `snake_case` for tool names to match MCP conventions (e.g., `create_ticket`, not `createTicket`).
- Avoid tool names that could collide with native tools (`discover_tools`, `refresh_skills`, `reload_plugins`, `fetch_skill`) or with tools from child servers. Prefixing tool names with your plugin name is a safe approach (e.g., `jira_create_ticket`).

### Error Handling

- Always validate input arguments at the start of your handler.
- Return `isError: true` for user-recoverable errors rather than throwing.
- Throw errors only for unexpected failures (bugs, missing dependencies).
- Never let unhandled promise rejections escape your handler.

```js
async (args) => {
  if (!args?.url) {
    return {
      content: [{ type: 'text', text: 'The "url" parameter is required.' }],
      isError: true
    };
  }

  try {
    const data = await fetchData(args.url);
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Failed to fetch: ${err.message}` }],
      isError: true
    };
  }
}
```

### Security

- Never hardcode secrets, API keys, or credentials in plugin files. Read them from environment variables via `process.env`.
- Be cautious with `context.emitWebhook()` -- do not include sensitive data in webhook payloads.
- If your plugin executes user-provided input, sanitize it to prevent injection attacks.
- Plugin files are loaded via `require()`, so they run with full Node.js privileges. Only load plugins from trusted sources.

### Performance

- Keep the `register` function fast. Heavy initialization (network calls, large file reads) should happen lazily inside tool handlers, not during registration.
- Avoid blocking the event loop in handlers. Use async I/O for file and network operations.
- If a tool handler is expensive, document it in the tool description so the AI agent can make informed decisions about when to call it.

### Annotations

Use MCP tool annotations to give clients metadata about your tool's behavior:

```js
annotations: {
  title: 'Human-Friendly Tool Name',
  readOnlyHint: true,       // true if the tool only reads data
  destructiveHint: false,   // true if the tool modifies/deletes data
  idempotentHint: true,     // true if calling twice has same effect as once
  openWorldHint: false      // true if the tool accesses external systems
}
```

### Logging

Use `context.log()` for diagnostic output. Messages are prefixed with the plugin name and sent to stderr:

```js
context.log('Initializing database connection...');
// Output: [EVOKORE][plugin:my-plugin] Initializing database connection...
```

Do not use `console.log()` for logging -- it writes to stdout, which is reserved for the MCP JSON-RPC transport in stdio mode. Use `console.error()` or `context.log()` instead.

---

## Example Plugin

Here is a complete walkthrough of the bundled `example-hello` plugin that ships with EVOKORE-MCP.

### Source: `plugins/example-hello.js`

```js
/**
 * Example EVOKORE-MCP Plugin
 *
 * Demonstrates the plugin contract by registering a simple hello_world tool.
 * Place .js files in the plugins/ directory (or the path set by EVOKORE_PLUGINS_DIR)
 * and they will be loaded automatically at server startup.
 *
 * Reload without restarting the server by calling the reload_plugins tool.
 *
 * Plugin contract:
 *   module.exports = {
 *     name: string,           // required - unique plugin identifier
 *     version: string,        // optional - semver version
 *     register(context): void // required - called once to register tools/resources
 *   }
 *
 * context API:
 *   context.addTool(name, schema, handler)
 *   context.addResource(uri, meta, handler)
 *   context.log(message)
 */

module.exports = {
  name: 'example-hello',
  version: '1.0.0',

  register(context) {
    context.log('Registering hello_world tool');

    context.addTool(
      'hello_world',
      {
        description: 'A simple example tool that returns a greeting. Demonstrates the EVOKORE-MCP plugin contract.',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name to greet (default: "World")'
            }
          }
        }
      },
      async (args) => {
        const name = args?.name || 'World';
        return {
          content: [{
            type: 'text',
            text: `Hello, ${name}! This response comes from the example-hello plugin.`
          }]
        };
      }
    );
  }
};
```

### What Happens at Startup

1. The `PluginManager` scans `plugins/` and finds `example-hello.js`.
2. It `require()`s the file and validates the manifest (`name` and `register` are present).
3. It calls `register(context)`, which registers the `hello_world` tool.
4. The tool catalog is rebuilt to include `hello_world` alongside native and proxied tools.
5. If webhooks are enabled, a `plugin_loaded` event is emitted with `{ plugin: "example-hello", version: "1.0.0", toolCount: 1, resourceCount: 0 }`.

### Calling the Tool

Once the server is running, any MCP client can call the tool:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "hello_world",
    "arguments": { "name": "Alice" }
  }
}
```

Response:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{
      "type": "text",
      "text": "Hello, Alice! This response comes from the example-hello plugin."
    }]
  }
}
```

### Building on the Example

To create your own plugin, copy `example-hello.js`, rename it, and modify the `name`, `version`, and `register` function to register your own tools and resources. Then call `reload_plugins` or restart the server to pick up the new file.

---

## PluginContext API Reference

The `context` object passed to the `register` function provides these methods:

| Method          | Signature                                                                                    | Description                                      |
|-----------------|----------------------------------------------------------------------------------------------|--------------------------------------------------|
| `addTool`       | `addTool(name: string, schema: { description, inputSchema, annotations? }, handler: fn)`    | Register a tool with the given name and handler.  |
| `addResource`   | `addResource(uri: string, meta: { name, mimeType?, description? }, handler: fn)`            | Register a resource at the given URI.             |
| `log`           | `log(message: string)`                                                                       | Log a message to stderr with plugin name prefix.  |
| `emitWebhook`   | `emitWebhook(event: string, data: Record<string, unknown>)`                                 | Emit a webhook event (no-op if webhooks disabled).|
