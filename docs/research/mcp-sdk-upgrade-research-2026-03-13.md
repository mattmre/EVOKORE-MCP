# MCP SDK Feature Adoption Research (T30)

**Date:** 2026-03-13
**SDK Version:** @modelcontextprotocol/sdk ^1.27.1 (already current)
**Task:** Adopt new SDK features without changing version

## Summary

This research documents the adoption of three MCP SDK features that were available in the installed SDK but not yet used by EVOKORE-MCP:

1. **Server Instructions** -- `instructions` field in Server options
2. **Tool Annotations** -- `annotations` and `title` on Tool definitions
3. **HTTP Client Transport** -- `StreamableHTTPClientTransport` for child servers

## Feature 1: Server Instructions

The `Server` constructor's options object accepts an optional `instructions` string. This is surfaced during the `initialize` handshake so clients can display or use it to understand server capabilities.

**Implementation:** Added a concise instruction string to the Server constructor in `src/index.ts` describing EVOKORE-MCP's purpose and key tools.

## Feature 2: Tool Annotations

The MCP SDK `Tool` type now includes:
- `title` (top-level) -- human-readable display name
- `annotations` -- object with behavioral hints:
  - `title` -- display name (duplicated inside annotations per spec)
  - `readOnlyHint` -- whether the tool only reads data
  - `destructiveHint` -- whether the tool can destroy/delete data
  - `idempotentHint` -- whether repeated calls produce the same result
  - `openWorldHint` -- whether the tool interacts with external systems

**Implementation:** Added annotations to all 7 native tools in `src/SkillManager.ts`. Proxied tools from child servers already preserve annotations through the existing `JSON.parse(JSON.stringify(tool))` deep-clone approach in ProxyManager.

### Annotation Mappings

| Tool | readOnlyHint | destructiveHint | idempotentHint | openWorldHint |
|------|-------------|----------------|---------------|--------------|
| docs_architect | false | false | false | false |
| skill_creator | false | false | false | false |
| resolve_workflow | true | false | true | false |
| search_skills | true | false | true | false |
| get_skill_help | true | false | true | false |
| discover_tools | false | false | true | false |
| proxy_server_status | true | false | true | false |

## Feature 3: HTTP Client Transport

The SDK ships `StreamableHTTPClientTransport` (from `@modelcontextprotocol/sdk/client/streamableHttp.js`) for connecting to MCP servers over HTTP instead of stdio.

**Implementation:** Extended ProxyManager to support a new `transport: "http"` + `url` config shape in `mcp.config.json`. When a server entry has `transport: "http"` and a `url`, ProxyManager creates a `StreamableHTTPClientTransport` instead of the default `StdioClientTransport`.

### Config Example

```json
{
  "servers": {
    "remote-server": {
      "url": "http://localhost:3000/mcp",
      "transport": "http"
    }
  }
}
```

Existing stdio-based servers continue to work unchanged. The `command` field is now optional (only required for stdio transport).

## Proxied Tool Field Forwarding

The existing ProxyManager tool-cloning code uses `JSON.parse(JSON.stringify(tool))` followed by name prefixing. This deep-clone approach automatically preserves any new fields (annotations, title, outputSchema, execution, icons, _meta) that child servers return. No code change was needed for this.

## Risk Assessment

- **Low risk:** All changes are additive. No existing behavior is modified.
- **Instructions:** Only affects the initialize handshake response.
- **Annotations:** Optional metadata; clients that don't understand them ignore them.
- **HTTP transport:** Only activated when explicitly configured; existing stdio configs are unchanged.

## Testing

- Source-level validation test confirms presence of instructions, annotations, and HTTP transport imports.
- Build verification ensures TypeScript compiles cleanly with the new types.
- Existing test suite (60+ tests) passes without modification.
