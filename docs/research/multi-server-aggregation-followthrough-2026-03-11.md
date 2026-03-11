# Multi-Server Aggregation Follow-Through - 2026-03-11

## Goal

Close `T15` by verifying whether EVOKORE still needed a multi-server MCP aggregator at all, then harden the operator-facing surface of the existing aggregator.

## Findings

EVOKORE already had the core aggregation runtime:

- `mcp.config.json` drives child-server registration
- `ProxyManager` boots multiple child MCP servers over stdio
- proxied tools are prefixed by `{serverId}_{toolName}`
- unresolved env placeholders fail fast per child server
- duplicate-prefixed tools use first-registration-wins
- cooldown protection and per-server error counts already exist
- `ServerState` already tracked connection status, error count, and last ping

The missing gap was visibility, not aggregation:

- the server registry existed only in memory
- there was no first-class tool for operators or agents to inspect child-server health
- there was no direct regression proving mixed connected/error child-server states through the aggregated router

## Decision

Keep the existing aggregator and expose its registry as a native operator tool:

- `proxy_server_status`

This slice also records registered tool counts per child server and validates the connected/error snapshot contract end-to-end.

## Validation

```bash
npm run build
node test-proxy-server-status-validation.js
npm test
```
