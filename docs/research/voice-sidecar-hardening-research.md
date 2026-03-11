# Voice Sidecar Hardening Research

**Date:** 2026-03-10
**Status:** Implemented

## Problem Statement

The VoiceSidecar WebSocket server (`src/VoiceSidecar.ts`) lacked several security and resilience hardening measures. It bound to all interfaces, had no connection limits, no input validation, no heartbeat mechanism, and no timeout protections for ElevenLabs API calls.

## Threat Model

| Threat | Mitigation |
|--------|-----------|
| Remote network access to voice server | Bind to `127.0.0.1` + `verifyClient` loopback check |
| Denial of service via connection flood | `MAX_CONNECTIONS` limit (default 5, env-configurable) |
| Oversized payloads | `maxPayload: 1MB` on WebSocketServer |
| Zombie/dead client connections | 30-second ping/pong heartbeat |
| Malformed input crashing server | Type-check `text` (string), length limit (10000), validate `persona` type |
| ElevenLabs API hang on connect | 10-second connect timeout |
| Transient ElevenLabs failures | Retry with exponential backoff (max 2 retries) |
| ElevenLabs flush hang | 30-second flush timeout with force resolution |
| Stale temp files from crashes | Startup cleanup of `evokore-voice-*.mp3` in tmpdir |
| Unclean shutdown leaving resources | Graceful shutdown: close clients with 1001, 2s drain period |

## Implementation Details

### Localhost Binding + verifyClient

```typescript
const wss = new WebSocketServer({
  port: PORT,
  host: "127.0.0.1",
  maxPayload: MAX_PAYLOAD_BYTES,
  verifyClient: (info) => {
    const origin = info.req.socket.remoteAddress || "";
    return LOOPBACK_ADDRESSES.has(origin);
  },
});
```

The `verifyClient` callback provides defense-in-depth beyond the host binding. It checks `remoteAddress` against `["127.0.0.1", "::1", "::ffff:127.0.0.1"]` to handle both IPv4 and IPv6 loopback variants.

### Connection Limit

Uses `wss.clients.size` checked immediately after `connection` event. Close code `1013` (Try Again Later) signals the client to retry. The limit is configurable via `VOICE_SIDECAR_MAX_CONNECTIONS` env var, defaulting to 5.

### Heartbeat

Standard WebSocket ping/pong pattern. A 30-second interval sends pings and checks for pong responses. Clients that miss a pong cycle are terminated. The `__alive` flag is set to `true` on pong and `false` before each ping.

### Input Validation

Three validation checks before processing:
1. `text` must be a string (type check)
2. `text` length must not exceed 10,000 characters
3. `persona` must be a string if provided

Invalid input returns a JSON error message to the client without crashing.

### Health Check

Sending `{"text": "__health"}` returns:
```json
{
  "type": "health",
  "status": "ok",
  "connections": 2,
  "uptime": 3600
}
```

This enables monitoring without requiring ElevenLabs connectivity.

### Connect Retry with Backoff

The `connect()` method wraps `attemptConnect()` in a retry loop:
- Attempt 0: immediate
- Attempt 1: 500ms delay
- Attempt 2: 1000ms delay

Each attempt has a 10-second timeout. After all retries fail, the original error is thrown.

### Flush Timeout

A 30-second `setTimeout` wraps the flush promise. If ElevenLabs hangs without sending `isFinal`, the timeout closes the WebSocket and resolves the promise to prevent indefinite blocking.

### Startup Temp Cleanup

`cleanupStaleTempFiles()` scans `os.tmpdir()` for files matching `evokore-voice-*.mp3` and removes them. This handles cases where prior crashes left temp files behind.

### Graceful Shutdown

Replaces the simple `wss.close(); process.exit(0)` with:
1. Clear heartbeat interval
2. Send close code `1001` (Going Away) to all connected clients
3. Wait 2 seconds for drain
4. Close server and exit

## Test Coverage

- `test-voice-refinement-validation.js`: Updated with assertions for `verifyClient`, `maxPayload`, heartbeat, host binding, connection limit
- `test-voice-sidecar-smoke-validation.js`: Updated startup log regex to match `127.0.0.1`
- `test-voice-sidecar-hardening-validation.js`: New comprehensive validation test covering all 13 hardening features

## Configuration Reference

| Env Variable | Default | Description |
|-------------|---------|-------------|
| `VOICE_SIDECAR_PORT` | `8888` | WebSocket server port |
| `VOICE_SIDECAR_MAX_CONNECTIONS` | `5` | Maximum concurrent client connections |
| `VOICE_SIDECAR_DISABLE_PLAYBACK` | `0` | Set to `1` to skip audio playback |
| `VOICE_SIDECAR_ARTIFACT_DIR` | (none) | Directory to save audio artifacts |
