---
title: "M3.3 WebSocket HITL Real-Time Approvals Research"
date: 2026-03-26
milestone: M3.3
status: implemented
---

# M3.3 WebSocket HITL Real-Time Approvals

## Current HITL Architecture

The HITL (Human-in-the-Loop) approval system uses a token-based flow:

1. **Token Generation**: When a restricted tool is called, `SecurityManager.generateToken()` creates a random 32-hex-char token, stores it in-memory with the tool name, args hash, and 5-minute TTL, and persists the truncated version to `~/.evokore/pending-approvals.json`.

2. **Error Return**: The MCP server returns an error to the AI client directing it to ask the user for approval and retry with `_evokore_approval_token` in the tool arguments.

3. **Token Validation**: On retry, `SecurityManager.validateToken()` checks the token matches the tool name and args hash, and that it has not been denied via the dashboard.

4. **Token Consumption**: `SecurityManager.consumeToken()` removes the token after successful use.

5. **Dashboard Polling**: The dashboard (`scripts/dashboard.js`) polls `GET /api/approvals` every 5 seconds to display pending tokens. Admins can deny tokens via `POST /api/approvals/deny`, which writes to `~/.evokore/denied-tokens.json`.

### File-Based IPC

- `~/.evokore/pending-approvals.json`: Written by SecurityManager (atomic .tmp + rename), read by dashboard.
- `~/.evokore/denied-tokens.json`: Written by dashboard, read by SecurityManager on next `validateToken()` call.

## WebSocket Design

### Transport

- Uses the `ws` library (already a dependency: `ws@^8.19.0` with `@types/ws` in devDependencies).
- `noServer: true` mode: the WebSocketServer does not create its own HTTP server but instead handles upgrade requests from the existing `HttpServer`'s HTTP server.

### Endpoint

- Path: `/ws/approvals`
- Protocol: Standard WebSocket upgrade over the existing HTTP server port (default 3100).

### Authentication

- Browsers cannot set custom headers on WebSocket upgrade requests.
- Auth is performed via query parameter: `ws://host:port/ws/approvals?token=<bearer>`
- The token is validated using the same `authenticateRequest` path as HTTP routes.
- Connections without a valid token are rejected with HTTP 401 during the upgrade handshake.

### RBAC

- WebSocket connections require at least `developer` role (same as the approvals page).
- Deny actions via WebSocket require `admin` role (same as HTTP deny endpoint).

### Message Protocol

All messages are JSON with a `type` field.

**Server-to-Client Messages:**

```json
{ "type": "snapshot", "approvals": [...] }
{ "type": "approval_requested", "data": { "token": "abcd1234...", "toolName": "...", "expiresAt": 123, "createdAt": 123 } }
{ "type": "approval_granted", "data": { "token": "abcd1234...", "toolName": "..." } }
{ "type": "approval_denied", "data": { "prefix": "abcd1234" } }
{ "type": "pong" }
```

**Client-to-Server Messages:**

```json
{ "type": "deny", "prefix": "abcd1234" }
{ "type": "ping" }
```

### Heartbeat

- Server sends ping frames every 30 seconds (configurable via `EVOKORE_WS_HEARTBEAT_MS`).
- Clients that do not respond with pong within the next heartbeat cycle are terminated.

### Connection Limits

- Maximum 10 concurrent WebSocket clients (configurable via `EVOKORE_WS_MAX_CLIENTS`).
- Excess connections receive HTTP 503 during upgrade.

### Opt-In

- Feature is gated behind `EVOKORE_WS_APPROVALS_ENABLED=true`.
- When disabled, the HTTP `upgrade` handler is not registered, and the WebSocketServer is not created.

## Callback Mechanism

Rather than tight coupling, the SecurityManager exposes a callback setter:

```typescript
setApprovalCallback(cb: (event: { type: string; data: unknown }) => void): void
```

The callback is invoked in:
- `generateToken()` -> `{ type: "approval_requested", data: { token, toolName, expiresAt, createdAt } }`
- `consumeToken()` -> `{ type: "approval_granted", data: { token, toolName } }`
- `denyToken()` -> `{ type: "approval_denied", data: { prefix } }`

The HttpServer registers itself as the callback consumer and broadcasts events to connected WebSocket clients.

## Backward Compatibility

- File-based IPC (`pending-approvals.json`, `denied-tokens.json`) continues to work regardless of WebSocket state.
- The dashboard falls back to 5-second polling when WebSocket is unavailable or disconnects.
- WebhookManager `approval_requested` / `approval_granted` events still fire independently.
- The existing HITL token flow is completely unchanged.

## Dashboard Integration

The approvals page JavaScript is upgraded to:
1. Attempt WebSocket connection on page load.
2. If connected, stop polling and use real-time events.
3. If disconnected, reconnect with exponential backoff (1s, 2s, 4s, ..., max 30s).
4. Display connection status indicator (green = live, yellow = reconnecting, gray = polling).
5. Send deny actions via WebSocket when connected, HTTP POST when not.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `EVOKORE_WS_APPROVALS_ENABLED` | `false` | Enable WebSocket real-time approval events |
| `EVOKORE_WS_HEARTBEAT_MS` | `30000` | WebSocket heartbeat interval |
| `EVOKORE_WS_MAX_CLIENTS` | `10` | Maximum concurrent WebSocket approval clients |
