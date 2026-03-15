# Webhook-Plugin Integration Research

**Date:** 2026-03-15
**Status:** Implemented
**PR:** feat: wire WebhookManager into PluginManager for plugin event hooks

## Problem Statement

WebhookManager and PluginManager were instantiated independently in `index.ts` with no cross-references. This meant:

1. Plugin lifecycle events (load, unload, errors) were invisible to webhook subscribers.
2. Plugins had no way to emit custom webhook events from their own code.
3. The `tool_call` webhook event lacked information about where a tool came from (builtin, plugin, native skill, or proxied child server).

## Integration Architecture

### Dependency Direction

```
index.ts (EvokoreMCPServer)
  |
  +-- WebhookManager (instantiated first)
  |
  +-- PluginManager(webhookManager)  <-- injected dependency
```

WebhookManager is created before PluginManager in the constructor. PluginManager stores it as an optional `WebhookManager | null` field, defaulting to `null` when not provided. This preserves backward compatibility -- PluginManager works identically when constructed without a WebhookManager.

### New Event Types

Three new event types added to `WebhookEventType`:

| Event | Trigger | Payload |
|-------|---------|---------|
| `plugin_loaded` | After successful `loadSinglePlugin()` | `{ plugin, version, toolCount, resourceCount }` |
| `plugin_unloaded` | Before `this.plugins.clear()` in `loadPlugins()` | `{ plugin, version }` |
| `plugin_load_error` | When `loadSinglePlugin()` throws | `{ file, error }` |

### Plugin-Side emitWebhook

The `PluginContext` interface now includes:

```typescript
emitWebhook(event: string, data: Record<string, unknown>): void;
```

Plugins can call `ctx.emitWebhook("custom_event", { key: "value" })` during their lifecycle. The implementation automatically tags each emission with `{ plugin: manifest.name }` so webhook subscribers can identify the source plugin.

The event string is cast to `WebhookEventType` at the call site. This means plugins can emit any of the 9 standard event types or custom strings (which will only be delivered if a webhook subscription explicitly lists that event type).

### Tool Call Source Field

The `tool_call` webhook event now includes a `source` field:

| Source | Meaning |
|--------|---------|
| `"builtin"` | `discover_tools`, `refresh_skills`, `fetch_skill`, `reload_plugins` |
| `"plugin"` | Tool registered by a loaded plugin |
| `"native"` | Tool from SkillManager / ToolCatalogIndex |
| `"proxied"` | Tool proxied from a child MCP server |
| `"unknown"` | No handler found (will result in MethodNotFound error) |

Source determination happens before the webhook emit so the field is always present in the payload.

## Files Modified

- `src/WebhookManager.ts` -- 3 new event types in union and array
- `src/PluginManager.ts` -- WebhookManager import, constructor parameter, lifecycle emissions, emitWebhook on PluginContext
- `src/index.ts` -- Constructor wiring order, source field computation for tool_call events

## Backward Compatibility

- `PluginManager()` with no arguments still works (webhookManager defaults to null).
- Existing webhook subscriptions see no change unless they subscribe to the new event types.
- The `source` field is additive to the existing `tool_call` payload; existing consumers that do not read it are unaffected.
- The `WEBHOOK_EVENT_TYPES` array now has 9 entries instead of 6; code that checks `.length === 6` will need updating.
