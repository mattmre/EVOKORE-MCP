# EVOKORE-MCP Plugin Examples

Example plugins demonstrating the EVOKORE-MCP plugin contract. Each file is a
standalone, working plugin that you can copy into the `plugins/` directory (one
level up from this folder) and activate with the `reload_plugins` tool.

## Plugin Contract

Every plugin must export an object with:

```javascript
module.exports = {
  name: 'my-plugin',        // required - unique plugin identifier
  version: '1.0.0',         // optional - semver version string
  register(context) { ... } // required - called once at load time
};
```

The `context` object provides:

| Method | Description |
|--------|-------------|
| `context.addTool(name, schema, handler)` | Register a tool with a name, JSON schema, and async handler |
| `context.addResource(uri, meta, handler)` | Register a resource at a custom URI |
| `context.log(message)` | Log a message (appears as `[EVOKORE][plugin:name] message`) |
| `context.emitWebhook(event, data)` | Emit a custom webhook event |
| `context.onWebhookEvent(eventType, handler)` | Subscribe to incoming webhook events |

## Examples

### hello-world-plugin.js

The simplest possible plugin. Registers a single `greet` tool that returns a
greeting message. Start here to understand the basic structure.

**Tools:** `greet`

### webhook-listener-plugin.js

Demonstrates event subscription. Subscribes to `tool_call` and `tool_error`
webhook events, captures them in an in-memory log, and exposes the log via a
`get_event_log` tool.

**Tools:** `get_event_log`

### system-info-plugin.js

A more complete example with multiple tools and a resource. Exposes system
information (CPU, memory, platform) and process memory usage. Also registers a
machine-readable resource at `plugin://system-info/summary` and emits a custom
webhook event when queried.

**Tools:** `get_system_info`, `get_memory_usage`
**Resources:** `plugin://system-info/summary`

## Usage

1. Copy the desired plugin file into the `plugins/` directory:
   ```bash
   cp plugins/examples/hello-world-plugin.js plugins/
   ```

2. If the server is already running, call the `reload_plugins` tool to load
   the new plugin without restarting.

3. The plugin's tools will appear in `tools/list` and can be called normally.

## Notes

- Plugins in `plugins/examples/` are **not** loaded automatically. Only `.js`
  files directly inside `plugins/` are loaded.
- The `EVOKORE_PLUGINS_DIR` environment variable can override the default
  plugins directory.
- Plugin tools are dispatched through the standard MCP `CallToolRequest`
  handler and are subject to the same RBAC and rate limiting rules as native
  tools.
