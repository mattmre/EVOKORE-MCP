# Webhook Configuration Guide

EVOKORE-MCP emits structured webhook events for tool calls, errors, session lifecycle, plugin operations, and human-in-the-loop (HITL) approval flows. This guide covers configuration, event schemas, signature verification, and security best practices.

## Table of Contents

1. [Overview](#overview)
2. [Configuration](#configuration)
3. [Event Types](#event-types)
4. [HMAC Signature Verification](#hmac-signature-verification)
5. [Security Best Practices](#security-best-practices)
6. [Retry Logic](#retry-logic)
7. [Argument Redaction](#argument-redaction)
8. [Integration Examples](#integration-examples)
9. [Troubleshooting](#troubleshooting)

---

## Overview

The EVOKORE-MCP webhook system provides real-time event notifications to external HTTP endpoints. Every significant runtime event -- tool invocations, errors, session starts/stops, HITL approval flows, and plugin lifecycle changes -- can be delivered to one or more subscriber URLs.

Key design principles:

- **Fire-and-forget**: Emitting a webhook never blocks the MCP request/response cycle. Delivery runs in the background.
- **Retry with exponential backoff**: Failed deliveries are retried up to 3 times with increasing delays.
- **HMAC-SHA256 signatures**: Payloads are signed so receivers can verify authenticity and integrity.
- **Opt-in**: Webhooks are disabled by default. Enable them with `EVOKORE_WEBHOOKS_ENABLED=true`.
- **Argument redaction**: Sensitive fields (tokens, passwords, API keys) are automatically redacted before emission.

---

## Configuration

### Enabling Webhooks

Set the environment variable in your `.env` file or shell:

```bash
EVOKORE_WEBHOOKS_ENABLED=true
```

Without this variable set to `"true"`, the `WebhookManager` skips all loading and emission -- no HTTP requests are made.

### Defining Webhook Subscriptions

Add a `webhooks` array to the top level of `mcp.config.json`:

```json
{
  "servers": { ... },
  "webhooks": [
    {
      "url": "https://example.com/evokore/events",
      "events": ["tool_call", "tool_error", "session_start", "session_end"],
      "secret": "your-webhook-secret-here"
    },
    {
      "url": "https://monitoring.internal/hooks/evokore",
      "events": ["tool_error", "session_end"],
      "secret": "another-secret"
    }
  ]
}
```

Each webhook subscription has three fields:

| Field    | Type       | Required | Description |
|----------|------------|----------|-------------|
| `url`    | `string`   | Yes      | The HTTP or HTTPS endpoint that will receive POST requests. Must be a valid URL with `http:` or `https:` protocol. |
| `events` | `string[]` | Yes      | Array of event type names to subscribe to. Must contain at least one valid event type. |
| `secret` | `string`   | No       | Shared secret used to compute HMAC-SHA256 signatures. When present, every delivery includes an `X-EVOKORE-Signature` header. |

### Validation Rules

- URLs must use `http:` or `https:` protocol. Other schemes (e.g., `ftp:`, `ws:`) are rejected at load time.
- The `events` array must contain at least one entry. Unrecognized event names are silently filtered out.
- Subscriptions that fail validation are excluded from the loaded set.
- Invalid or missing `mcp.config.json` files are handled gracefully -- the server starts without webhooks.

### Environment Variable Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `EVOKORE_WEBHOOKS_ENABLED` | `false` | Set to `"true"` to enable webhook loading and delivery. |

---

## Event Types

EVOKORE-MCP supports 9 event types across four categories.

### Payload Envelope

Every webhook delivery sends a JSON POST body with this envelope structure:

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "timestamp": "2026-03-15T14:30:00.000Z",
  "event": "tool_call",
  "data": { ... }
}
```

| Field       | Type     | Description |
|-------------|----------|-------------|
| `id`        | `string` | A unique UUID v4 identifier for this event delivery. |
| `timestamp` | `string` | ISO 8601 timestamp of when the event was emitted. |
| `event`     | `string` | The event type name. |
| `data`      | `object` | Event-specific payload data (see below). |

### Tool Events

#### `tool_call`

Emitted at the **start** of every tool invocation, before the tool executes. This fires for all tool sources: builtin, native, plugin, and proxied.

```json
{
  "event": "tool_call",
  "data": {
    "tool": "github_create_issue",
    "source": "proxied",
    "arguments": {
      "owner": "myorg",
      "repo": "myrepo",
      "title": "Bug report",
      "api_key": "[REDACTED]"
    }
  }
}
```

| Data Field   | Type     | Description |
|--------------|----------|-------------|
| `tool`       | `string` | The full tool name (with server prefix for proxied tools). |
| `source`     | `string` | One of `"builtin"`, `"native"`, `"plugin"`, `"proxied"`, or `"unknown"`. |
| `arguments`  | `object` | The tool call arguments with sensitive values redacted. |

#### `tool_error`

Emitted when a tool call throws an exception (not when a tool returns `isError: true` in its result).

```json
{
  "event": "tool_error",
  "data": {
    "tool": "github_create_issue",
    "arguments": {
      "owner": "myorg",
      "repo": "myrepo",
      "token": "[REDACTED]"
    },
    "error": "Client for server 'github' is not connected."
  }
}
```

| Data Field   | Type     | Description |
|--------------|----------|-------------|
| `tool`       | `string` | The tool name that failed. |
| `arguments`  | `object` | The tool call arguments with sensitive values redacted. |
| `error`      | `string` | The error message string. |

### Session Events

#### `session_start`

Emitted once when the EVOKORE-MCP server starts and is ready to accept requests.

For stdio transport:
```json
{
  "event": "session_start",
  "data": {
    "transport": "stdio"
  }
}
```

For HTTP transport:
```json
{
  "event": "session_start",
  "data": {
    "transport": "http",
    "host": "127.0.0.1",
    "port": 3100
  }
}
```

| Data Field   | Type     | Description |
|--------------|----------|-------------|
| `transport`  | `string` | Either `"stdio"` or `"http"`. |
| `host`       | `string` | (HTTP only) The host the server is listening on. |
| `port`       | `number` | (HTTP only) The port the server is listening on. |

#### `session_end`

Emitted when the server receives a shutdown signal (SIGTERM or SIGINT). A 500ms grace period allows the fire-and-forget delivery to complete before the process exits.

```json
{
  "event": "session_end",
  "data": {
    "transport": "stdio",
    "reason": "shutdown"
  }
}
```

| Data Field   | Type     | Description |
|--------------|----------|-------------|
| `transport`  | `string` | Either `"stdio"` or `"http"`. |
| `reason`     | `string` | Currently always `"shutdown"`. |

### Approval Events (HITL)

These events are emitted by the security interceptor in the `ProxyManager` when a tool requires human-in-the-loop approval.

#### `approval_requested`

Emitted when a tool call is blocked because the tool's permission level is `require_approval` and no valid approval token was provided.

```json
{
  "event": "approval_requested",
  "data": {
    "tool": "supabase_apply_migration",
    "server": "supabase",
    "tokenPrefix": "a1b2c3d4..."
  }
}
```

| Data Field    | Type     | Description |
|---------------|----------|-------------|
| `tool`        | `string` | The prefixed tool name that requires approval. |
| `server`      | `string` | The child server ID that owns the tool. |
| `tokenPrefix` | `string` | The first 8 characters of the approval token, followed by `"..."`. |

#### `approval_granted`

Emitted when a tool call provides a valid approval token and the tool is about to execute.

```json
{
  "event": "approval_granted",
  "data": {
    "tool": "supabase_apply_migration",
    "server": "supabase"
  }
}
```

| Data Field | Type     | Description |
|------------|----------|-------------|
| `tool`     | `string` | The prefixed tool name that was approved. |
| `server`   | `string` | The child server ID. |

### Plugin Events

#### `plugin_loaded`

Emitted when a plugin is successfully loaded from the `plugins/` directory.

```json
{
  "event": "plugin_loaded",
  "data": {
    "plugin": "my-plugin",
    "version": "1.0.0",
    "toolCount": 3,
    "resourceCount": 1
  }
}
```

| Data Field      | Type     | Description |
|-----------------|----------|-------------|
| `plugin`        | `string` | The plugin name from its manifest. |
| `version`       | `string` | The plugin version. |
| `toolCount`     | `number` | Number of tools registered by this plugin. |
| `resourceCount` | `number` | Number of resources registered by this plugin. |

#### `plugin_unloaded`

Emitted for each previously loaded plugin when plugins are being reloaded (before the new set is loaded).

```json
{
  "event": "plugin_unloaded",
  "data": {
    "plugin": "my-plugin",
    "version": "1.0.0"
  }
}
```

| Data Field | Type     | Description |
|------------|----------|-------------|
| `plugin`   | `string` | The plugin name that was unloaded. |
| `version`  | `string` | The plugin version that was unloaded. |

#### `plugin_load_error`

Emitted when a plugin file fails to load.

```json
{
  "event": "plugin_load_error",
  "data": {
    "file": "broken-plugin.js",
    "error": "SyntaxError: Unexpected token"
  }
}
```

| Data Field | Type     | Description |
|------------|----------|-------------|
| `file`     | `string` | The filename (basename only) that failed to load. |
| `error`    | `string` | The error message. |

---

## HMAC Signature Verification

When a webhook subscription includes a `secret` field, every delivery is signed with HMAC-SHA256. The signature is sent in the `X-EVOKORE-Signature` HTTP header as a lowercase hex string.

### Delivery Headers

Every webhook delivery includes the following security-related headers:

| Header                 | Value | Always Present |
|------------------------|-------|:--------------:|
| `X-EVOKORE-Signature`  | HMAC-SHA256 hex digest (see below) | Only when `secret` is configured |
| `X-EVOKORE-Timestamp`  | Unix epoch seconds (e.g., `"1742050200"`) | Yes |
| `X-EVOKORE-Nonce`      | UUID v4 matching the payload `id` field | Yes |

### How Signing Works

1. The full JSON payload body is serialized to a UTF-8 string.
2. The current time is captured as Unix epoch seconds (integer).
3. An HMAC-SHA256 digest is computed over the string `${timestamp}.${body}` using the shared secret.
4. The resulting digest is encoded as a lowercase hexadecimal string.
5. This hex string is sent in the `X-EVOKORE-Signature` header alongside the `X-EVOKORE-Timestamp` and `X-EVOKORE-Nonce` headers.

### Replay Protection

To prevent replay attacks, the HMAC signature binds the payload to a specific timestamp. Receivers should:

1. Read the `X-EVOKORE-Timestamp` header value.
2. Reject the delivery if the timestamp is more than **5 minutes** (300 seconds) from the current time in either direction.
3. Compute the expected HMAC over `${timestamp}.${body}` (not just `body`).
4. Compare using timing-safe comparison.
5. Optionally track the `X-EVOKORE-Nonce` (which equals the payload `id`) to reject duplicate deliveries within the time window.

**Backward compatibility:** When the `X-EVOKORE-Timestamp` header is absent (e.g., from an older EVOKORE-MCP version), receivers should fall back to computing the HMAC over the raw body alone. The `verifySignature()` static method handles both modes automatically based on whether a timestamp is provided.

### Verifying Signatures

To verify a webhook delivery:

1. Read the raw request body as a string (do not parse/re-serialize JSON).
2. Read the `X-EVOKORE-Timestamp` header.
3. Check that the timestamp is within the 5-minute replay window.
4. Compute the expected HMAC-SHA256 over `${timestamp}.${body}` using your stored secret.
5. Compare the computed signature with the `X-EVOKORE-Signature` header using a **timing-safe** comparison function.

#### Node.js Verification Example

```javascript
const crypto = require("crypto");

const REPLAY_WINDOW_SECONDS = 300; // 5 minutes

function verifyWebhookSignature(rawBody, secret, receivedSignature, timestamp) {
  // Replay protection: reject stale or future timestamps
  if (timestamp !== undefined) {
    const nowSeconds = Date.now() / 1000;
    if (Math.abs(nowSeconds - timestamp) > REPLAY_WINDOW_SECONDS) {
      return false;
    }
  }

  // Compute HMAC over "timestamp.body" when timestamp is present, or just "body" for legacy
  const message = timestamp !== undefined ? `${timestamp}.${rawBody}` : rawBody;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(message, "utf8")
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const receivedBuf = Buffer.from(receivedSignature, "hex");

  if (expectedBuf.length !== receivedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

// Usage in an Express handler:
app.post("/webhooks/evokore", (req, res) => {
  const rawBody = req.body.toString("utf8");
  const signature = req.headers["x-evokore-signature"];
  const timestamp = req.headers["x-evokore-timestamp"]
    ? Number(req.headers["x-evokore-timestamp"])
    : undefined;

  if (!verifyWebhookSignature(rawBody, SECRET, signature, timestamp)) {
    return res.status(401).send("Invalid signature");
  }
  // ...
});
```

#### Python Verification Example

```python
import hmac
import hashlib
import time

REPLAY_WINDOW_SECONDS = 300  # 5 minutes

def verify_webhook_signature(
    raw_body: bytes, secret: str, received_signature: str, timestamp: int | None = None
) -> bool:
    # Replay protection
    if timestamp is not None:
        now = time.time()
        if abs(now - timestamp) > REPLAY_WINDOW_SECONDS:
            return False

    # Compute HMAC over "timestamp.body" or just "body"
    if timestamp is not None:
        message = f"{timestamp}.".encode("utf-8") + raw_body
    else:
        message = raw_body

    expected = hmac.new(
        secret.encode("utf-8"),
        message,
        hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(expected, received_signature)
```

#### Go Verification Example

```go
package main

import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/hex"
    "fmt"
    "math"
    "time"
)

const replayWindowSeconds = 300 // 5 minutes

func verifyWebhookSignature(rawBody []byte, secret string, receivedSignature string, timestamp *int64) bool {
    // Replay protection
    if timestamp != nil {
        now := time.Now().Unix()
        if math.Abs(float64(now-*timestamp)) > replayWindowSeconds {
            return false
        }
    }

    // Compute HMAC over "timestamp.body" or just "body"
    var message []byte
    if timestamp != nil {
        message = []byte(fmt.Sprintf("%d.%s", *timestamp, rawBody))
    } else {
        message = rawBody
    }

    mac := hmac.New(sha256.New, []byte(secret))
    mac.Write(message)
    expected := hex.EncodeToString(mac.Sum(nil))

    return hmac.Equal([]byte(expected), []byte(receivedSignature))
}
```

### Important Notes

- Always use timing-safe comparison. Standard string equality (`===`, `==`) is vulnerable to timing attacks that can leak the secret one character at a time.
- Verify the raw body bytes, not a re-serialized JSON object. JSON serialization is not guaranteed to produce identical byte sequences.
- The signature is a lowercase hex string (64 characters for SHA-256).
- The signature now covers `${timestamp}.${body}` when the timestamp header is present, preventing replay of captured payloads beyond the 5-minute window.
- The `X-EVOKORE-Nonce` header matches the `id` field in the payload and can be used for deduplication.

---

## Security Best Practices

### Use HTTPS Endpoints

Always configure webhook URLs with `https://` in production. While `http://` is allowed (useful for local development or internal networks), it transmits payloads and signatures in plaintext.

### Protect Your Shared Secret

- Generate secrets with high entropy (at least 32 random bytes). Example:
  ```bash
  openssl rand -hex 32
  ```
- Store secrets in environment variables or a secrets manager, not in version control.
- If `mcp.config.json` is committed to your repository, use environment variable interpolation for the secret:
  ```json
  {
    "webhooks": [
      {
        "url": "https://example.com/hooks",
        "events": ["tool_call"],
        "secret": "${WEBHOOK_SECRET}"
      }
    ]
  }
  ```
  Note: As of the current implementation, `${VAR}` interpolation is supported for `env` blocks in server configs but not directly in webhook config values. Store the secret directly in `mcp.config.json` or keep the file outside of version control.

### Rotate Secrets Periodically

When rotating a webhook secret:

1. Configure your receiver to accept signatures from both the old and new secret.
2. Update `mcp.config.json` with the new secret and restart EVOKORE-MCP.
3. After confirming deliveries are being verified with the new secret, remove the old secret from your receiver.

### Validate Event Freshness (Replay Protection)

EVOKORE-MCP now includes server-side replay protection: the HMAC signature binds the payload to the `X-EVOKORE-Timestamp` header value, and receivers should verify that the timestamp is within a 5-minute window before checking the signature. See the [HMAC Signature Verification](#hmac-signature-verification) section for details.

For additional defense-in-depth, you can also check the ISO 8601 `timestamp` field in the payload envelope:

```javascript
const eventTime = new Date(payload.timestamp).getTime();
const now = Date.now();
const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

if (Math.abs(now - eventTime) > MAX_AGE_MS) {
  // Reject: event is too old or has a future timestamp
  return res.status(400).send("Event timestamp out of range");
}
```

### Deduplicate Events

Use the `X-EVOKORE-Nonce` header (or the `id` field in the payload, which is the same UUID v4 value) to detect and discard duplicate deliveries. Retries can cause the same event to arrive more than once. Store processed nonces for a window matching your timestamp validation window.

---

## Retry Logic

Failed webhook deliveries are retried with exponential backoff:

| Attempt | Delay Before Attempt | Cumulative Time |
|---------|---------------------|-----------------|
| 1       | 0ms (immediate)     | 0ms             |
| 2       | 500ms               | 500ms           |
| 3       | 1000ms              | 1500ms          |

### What Counts as a Failure

- HTTP response status outside the `2xx` range (e.g., `4xx`, `5xx`).
- Network errors (DNS failure, connection refused, socket error).
- Request timeout (10 seconds per attempt).

### What Happens After All Retries Fail

An error message is logged to stderr:

```
[EVOKORE] Webhook delivery to https://example.com/hooks failed after retries: HTTP 503
```

The failed delivery is not persisted or queued for later. The event is lost from the webhook perspective (though it remains in session replay logs if enabled).

### Configuration Constants

These values are defined in `src/WebhookManager.ts` and are not currently configurable via environment variables:

| Constant             | Value    | Description |
|----------------------|----------|-------------|
| `MAX_RETRIES`        | `3`      | Maximum number of delivery attempts. |
| `INITIAL_BACKOFF_MS` | `500`    | Base delay for exponential backoff (doubled each retry). |
| `DELIVERY_TIMEOUT_MS`| `10000`  | Per-request timeout in milliseconds. |

---

## Argument Redaction

Before emitting `tool_call` and `tool_error` events, EVOKORE-MCP redacts argument values that match a set of sensitive key patterns. The redaction replaces the value with the string `"[REDACTED]"`.

### Redacted Keys

Any argument key whose lowercase form contains any of these substrings is redacted:

| Pattern              | Matches Examples |
|----------------------|------------------|
| `_evokore_approval_token` | `_evokore_approval_token` |
| `password`           | `password`, `user_password`, `passwordHash` |
| `secret`             | `secret`, `client_secret`, `secretKey` |
| `token`              | `token`, `access_token`, `refreshToken` |
| `key`                | `key`, `api_key`, `privateKey` |
| `credential`         | `credential`, `credentials` |
| `api_key`            | `api_key`, `API_KEY` |
| `apikey`             | `apiKey`, `apikey` |
| `access_token`       | `access_token` |
| `accesstoken`        | `accessToken`, `accesstoken` |

The matching is case-insensitive and uses substring containment, so `mySecretValue` would be redacted because it contains `secret`.

### Example

Given these tool arguments:

```json
{
  "owner": "myorg",
  "repo": "myrepo",
  "api_key": "sk-abc123",
  "title": "New issue"
}
```

The webhook payload will contain:

```json
{
  "arguments": {
    "owner": "myorg",
    "repo": "myrepo",
    "api_key": "[REDACTED]",
    "title": "New issue"
  }
}
```

---

## Integration Examples

### Express.js Webhook Receiver

```javascript
const express = require("express");
const crypto = require("crypto");

const app = express();
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const REPLAY_WINDOW_SECONDS = 300; // 5 minutes
const processedIds = new Set();

// Use raw body for signature verification
app.use("/webhooks/evokore", express.raw({ type: "application/json" }));

app.post("/webhooks/evokore", (req, res) => {
  const rawBody = req.body.toString("utf8");
  const signature = req.headers["x-evokore-signature"];
  const timestamp = req.headers["x-evokore-timestamp"]
    ? Number(req.headers["x-evokore-timestamp"])
    : undefined;

  // 1. Replay protection: reject stale or future timestamps
  if (timestamp !== undefined) {
    const nowSeconds = Date.now() / 1000;
    if (Math.abs(nowSeconds - timestamp) > REPLAY_WINDOW_SECONDS) {
      return res.status(400).send("Timestamp out of range");
    }
  }

  // 2. Verify HMAC signature (timestamp-aware)
  if (WEBHOOK_SECRET && signature) {
    const message = timestamp !== undefined ? `${timestamp}.${rawBody}` : rawBody;
    const expected = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(message, "utf8")
      .digest("hex");

    const expectedBuf = Buffer.from(expected, "hex");
    const receivedBuf = Buffer.from(signature, "hex");

    if (
      expectedBuf.length !== receivedBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, receivedBuf)
    ) {
      return res.status(401).send("Invalid signature");
    }
  }

  const payload = JSON.parse(rawBody);

  // 3. Deduplicate using nonce (X-EVOKORE-Nonce matches payload.id)
  const nonce = req.headers["x-evokore-nonce"] || payload.id;
  if (processedIds.has(nonce)) {
    return res.status(200).send("Already processed");
  }
  processedIds.add(nonce);

  // 4. Handle the event
  switch (payload.event) {
    case "tool_call":
      console.log(`Tool called: ${payload.data.tool} (${payload.data.source})`);
      break;

    case "tool_error":
      console.error(`Tool error: ${payload.data.tool} - ${payload.data.error}`);
      break;

    case "session_start":
      console.log(`Session started on ${payload.data.transport}`);
      break;

    case "session_end":
      console.log(`Session ended: ${payload.data.reason}`);
      break;

    case "approval_requested":
      console.log(`Approval needed for ${payload.data.tool} (token: ${payload.data.tokenPrefix})`);
      break;

    case "approval_granted":
      console.log(`Approval granted for ${payload.data.tool}`);
      break;

    case "plugin_loaded":
      console.log(`Plugin loaded: ${payload.data.plugin} v${payload.data.version}`);
      break;

    case "plugin_load_error":
      console.error(`Plugin failed: ${payload.data.file} - ${payload.data.error}`);
      break;

    default:
      console.log(`Unknown event: ${payload.event}`);
  }

  res.status(200).send("OK");
});

app.listen(3000, () => console.log("Webhook receiver listening on port 3000"));
```

### Go Webhook Receiver

```go
package main

import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/hex"
    "encoding/json"
    "fmt"
    "io"
    "log"
    "math"
    "net/http"
    "os"
    "strconv"
    "time"
)

var webhookSecret = os.Getenv("WEBHOOK_SECRET")

const replayWindowSeconds = 300 // 5 minutes

type WebhookPayload struct {
    ID        string                 `json:"id"`
    Timestamp string                 `json:"timestamp"`
    Event     string                 `json:"event"`
    Data      map[string]interface{} `json:"data"`
}

func verifySignature(body []byte, secret, signature string, timestamp *int64) bool {
    // Replay protection
    if timestamp != nil {
        now := time.Now().Unix()
        if math.Abs(float64(now-*timestamp)) > replayWindowSeconds {
            return false
        }
    }

    // Compute HMAC over "timestamp.body" or just "body"
    var message []byte
    if timestamp != nil {
        message = []byte(fmt.Sprintf("%d.%s", *timestamp, body))
    } else {
        message = body
    }

    mac := hmac.New(sha256.New, []byte(secret))
    mac.Write(message)
    expected := hex.EncodeToString(mac.Sum(nil))
    return hmac.Equal([]byte(expected), []byte(signature))
}

func webhookHandler(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
        return
    }

    body, err := io.ReadAll(r.Body)
    if err != nil {
        http.Error(w, "Failed to read body", http.StatusBadRequest)
        return
    }
    defer r.Body.Close()

    // Parse timestamp header for replay protection
    var timestamp *int64
    if tsHeader := r.Header.Get("X-EVOKORE-Timestamp"); tsHeader != "" {
        if ts, err := strconv.ParseInt(tsHeader, 10, 64); err == nil {
            timestamp = &ts
        }
    }

    // Verify signature (timestamp-aware)
    if webhookSecret != "" {
        signature := r.Header.Get("X-EVOKORE-Signature")
        if !verifySignature(body, webhookSecret, signature, timestamp) {
            http.Error(w, "Invalid signature", http.StatusUnauthorized)
            return
        }
    }

    var payload WebhookPayload
    if err := json.Unmarshal(body, &payload); err != nil {
        http.Error(w, "Invalid JSON", http.StatusBadRequest)
        return
    }

    // Handle event
    switch payload.Event {
    case "tool_call":
        log.Printf("Tool called: %s (%s)", payload.Data["tool"], payload.Data["source"])
    case "tool_error":
        log.Printf("Tool error: %s - %s", payload.Data["tool"], payload.Data["error"])
    case "session_start":
        log.Printf("Session started: %s", payload.Data["transport"])
    case "session_end":
        log.Printf("Session ended: %s", payload.Data["reason"])
    case "approval_requested":
        log.Printf("Approval requested: %s", payload.Data["tool"])
    case "approval_granted":
        log.Printf("Approval granted: %s", payload.Data["tool"])
    case "plugin_loaded":
        log.Printf("Plugin loaded: %s", payload.Data["plugin"])
    case "plugin_load_error":
        log.Printf("Plugin load error: %s - %s", payload.Data["file"], payload.Data["error"])
    default:
        log.Printf("Unknown event: %s", payload.Event)
    }

    w.WriteHeader(http.StatusOK)
    fmt.Fprint(w, "OK")
}

func main() {
    http.HandleFunc("/webhooks/evokore", webhookHandler)
    log.Println("Webhook receiver listening on :3000")
    log.Fatal(http.ListenAndServe(":3000", nil))
}
```

---

## Troubleshooting

### Webhooks are not firing

1. **Check the environment variable.** Webhooks require `EVOKORE_WEBHOOKS_ENABLED=true` in `.env` or the process environment. Without it, the `WebhookManager` never loads subscriptions or emits events.

2. **Check your config file.** Ensure `mcp.config.json` has a top-level `webhooks` array with at least one valid entry. Look for stderr output on startup:
   ```
   [EVOKORE] Loaded 2 webhook subscription(s).
   ```
   If you do not see this message, your webhook config is missing or invalid.

3. **Validate the URL.** Only `http:` and `https:` protocols are accepted. Entries with other protocols are silently dropped.

4. **Check event subscriptions.** Ensure the `events` array includes the event types you want to receive. Unrecognized event names are silently filtered.

### Signature verification fails on the receiver

1. **Ensure you verify the raw body.** Do not parse the JSON and re-serialize it. JSON key ordering and whitespace may differ, producing a different HMAC.

2. **Check encoding.** The signature is a lowercase hex string. Make sure your comparison is also lowercase hex-to-hex.

3. **Use timing-safe comparison.** While not the cause of verification failure, using standard `===` equality can leak information about the secret. Always use `crypto.timingSafeEqual` (Node.js), `hmac.compare_digest` (Python), or `hmac.Equal` (Go).

### Events arrive more than once

This is expected behavior. Retries can cause duplicate delivery when the first attempt succeeds on the server side but the response is lost (e.g., timeout). Use the `id` field in the payload envelope to deduplicate.

### Events are missing after server shutdown

The `session_end` event is emitted synchronously before a 500ms grace period. If the webhook endpoint is slow to respond, the process may exit before delivery completes. Ensure your endpoint responds within a few hundred milliseconds.

### Delivery errors in stderr

Messages like the following indicate delivery failures:

```
[EVOKORE] Webhook delivery attempt 1/3 to https://example.com/hooks failed: HTTP 503
[EVOKORE] Webhook delivery to https://example.com/hooks failed after retries: HTTP 503
```

Check that your endpoint is reachable, returns a `2xx` status code, and responds within 10 seconds.

### Plugin events not appearing

Plugin events (`plugin_loaded`, `plugin_unloaded`, `plugin_load_error`) require both:

1. `EVOKORE_WEBHOOKS_ENABLED=true`
2. The relevant event names in your subscription's `events` array

Plugin events are emitted during `loadPlugins()` and `reload_plugins` tool calls.

---

## HTTP Request Details

Every webhook delivery is an HTTP POST request with the following characteristics:

| Header             | Value |
|--------------------|-------|
| `Content-Type`     | `application/json` |
| `User-Agent`       | `EVOKORE-MCP-Webhook/3.0` |
| `X-EVOKORE-Signature` | HMAC-SHA256 hex digest over `${timestamp}.${body}` (only when secret is configured) |
| `X-EVOKORE-Timestamp` | Unix epoch seconds as string (always present) |
| `X-EVOKORE-Nonce`  | UUID v4 matching the payload `id` field (always present) |

The request body is the JSON-serialized `WebhookPayload` envelope. Responses are drained but not inspected beyond the status code. Any `2xx` status code is treated as success.
