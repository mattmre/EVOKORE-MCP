# EVOKORE-MCP Webhook Envelope v1

This document is the authoritative specification for the webhook payload format emitted
by `WebhookManager`. See `docs/adr/0002-webhook-envelope-v1.md` for the architectural
decision record.

**Version:** 1 (stable)  
**Since:** v3.1.0  
**Status:** Frozen — additive extensions allowed; field removal or type changes require v2

---

## Overview

EVOKORE emits signed webhook events to configured HTTP endpoints when
`EVOKORE_WEBHOOKS_ENABLED=true`. Events are delivered fire-and-forget with up to 3
retries and exponential backoff. Each delivery is a single HTTP POST with a JSON body
conforming to the Envelope v1 schema.

---

## Envelope Schema

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-04-14T20:07:27.968Z",
  "event": "tool_call",
  "data": { ... }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | UUIDv4. Unique per delivery attempt. Repeated on retry. |
| `timestamp` | `string` | Yes | ISO 8601 UTC. Time of event emission (not delivery). |
| `event` | `string` | Yes | Event type (see [Event Types](#event-types)). |
| `data` | `object` | Yes | Event-specific payload (see [Event Payloads](#event-payloads)). |

**Versioning note:** The absence of an `envelopeVersion` field means v1. Future v2+
envelopes will include `"envelopeVersion": 2`.

---

## HTTP Request

```
POST {endpoint_url}
Content-Type: application/json
X-EVOKORE-Signature: <hmac-sha256-hex>
X-EVOKORE-Timestamp: <unix-epoch-seconds>
X-EVOKORE-Nonce: <uuid-v4>
```

- `X-EVOKORE-Signature` is always present. See [Signature Verification](#signature-verification).
- `X-EVOKORE-Timestamp` is present when the webhook config includes a `secret`. Its value
  matches the timestamp factor used in the HMAC.
- `X-EVOKORE-Nonce` carries the envelope `id` (UUIDv4). Subscribers may use it for
  idempotency checks alongside the signed timestamp.

---

## Signature Verification

When a webhook endpoint is configured with a `secret`, the payload is signed with
HMAC-SHA256:

```
signature = HMAC-SHA256(secret, "${timestamp_sec}.${json_body}")
```

Where:
- `timestamp_sec` is the Unix epoch seconds value sent in `X-EVOKORE-Timestamp`
- `json_body` is the raw POST body string (before any parsing)

**Subscriber verification steps:**

1. Extract `X-EVOKORE-Timestamp` header. Reject if absent or unparseable.
2. Check `|Math.floor(Date.now() / 1000) - timestamp_sec| <= 300` (5-minute replay window). Reject if stale.
3. Compute `expected = HMAC-SHA256(your_secret, "${timestamp_sec}.${body}")`.
4. Compare `X-EVOKORE-Signature` with `expected` using timing-safe equality.
5. Accept only if signatures match.

**Node.js example:**

```js
const crypto = require('crypto');

function verifyEvokoreWebhook(body, headers, secret) {
  const sigHeader = headers['x-evokore-signature'];
  const tsHeader  = headers['x-evokore-timestamp'];
  if (!sigHeader || !tsHeader) return false;

  const ts = parseInt(tsHeader, 10);
  if (isNaN(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > 300) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${ts}.${body}`, 'utf8')
    .digest('hex');

  const sigBuf = Buffer.from(sigHeader, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expectedBuf.length) return false;

  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}
```

---

## Data Redaction

Before signing and delivery, `data` fields whose keys match any of the following
patterns are replaced with `"[REDACTED]"`:

- `token`, `secret`, `password`, `key`, `credential`

Redaction is case-insensitive and applies recursively to nested objects.

> **Note:** Argument redaction for sensitive keys is planned but not yet implemented in `WebhookManager.ts`. Until implemented, raw tool arguments are forwarded in the payload.

---

## Event Types

EVOKORE emits 10 event types:

| Event | Trigger |
|-------|---------|
| `tool_call` | A tool was invoked and returned a result |
| `tool_error` | A tool invocation returned an error |
| `session_start` | A new session was created (HTTP transport) |
| `session_end` | A session ended (TTL expiry or explicit close) |
| `session_resumed` | An existing session was reattached via HTTP |
| `approval_requested` | A restricted tool requested HITL approval |
| `approval_granted` | An approval token was submitted |
| `plugin_loaded` | A plugin was loaded successfully |
| `plugin_unloaded` | A plugin was unloaded |
| `plugin_load_error` | A plugin failed to load |

Subscribe to specific event types in `mcp.config.json`:

```json
{
  "webhooks": [
    {
      "url": "https://your-endpoint.example.com/evokore",
      "events": ["tool_call", "tool_error", "session_start"],
      "secret": "${WEBHOOK_SECRET}"
    }
  ]
}
```

---

## Event Payloads

### `tool_call`

```json
{
  "toolName": "resolve_workflow",
  "sessionId": "abc123",
  "durationMs": 42,
  "result": "truncated-result-string"
}
```

### `tool_error`

```json
{
  "toolName": "execute_skill",
  "sessionId": "abc123",
  "error": "Timeout after 30s"
}
```

### `session_start`

```json
{
  "sessionId": "abc123",
  "remoteAddress": "127.0.0.1"
}
```

### `session_end`

```json
{
  "sessionId": "abc123",
  "reason": "ttl_expired"
}
```

Reason values: `ttl_expired`, `explicit_close`, `connection_lost`.

### `session_resumed`

```json
{
  "sessionId": "abc123",
  "remoteAddress": "127.0.0.1"
}
```

### `approval_requested`

```json
{
  "toolName": "execute_skill",
  "sessionId": "abc123",
  "approvalToken": "[REDACTED]"
}
```

### `approval_granted`

```json
{
  "toolName": "execute_skill",
  "sessionId": "abc123"
}
```

### `plugin_loaded`

```json
{
  "pluginId": "my-plugin",
  "toolCount": 3
}
```

### `plugin_unloaded`

```json
{
  "pluginId": "my-plugin"
}
```

### `plugin_load_error`

```json
{
  "pluginId": "my-plugin",
  "error": "Cannot find module './my-plugin'"
}
```

---

## Retry Policy

Failed deliveries (non-2xx response, connection timeout, network error) are retried:

| Attempt | Delay |
|---------|-------|
| 1st retry | 500 ms |
| 2nd retry | 1,000 ms |
| 3rd retry | 2,000 ms |

After 3 failures the delivery is abandoned and logged to stderr. Delivery timeout per
attempt: 10 seconds.

The `id` field is identical across all attempts for the same event, allowing subscribers
to implement idempotency checks.

---

## mcp.config.json Reference

```json
{
  "webhooks": [
    {
      "url": "https://example.com/hooks/evokore",
      "events": ["tool_call", "tool_error", "session_start", "session_end"],
      "secret": "${WEBHOOK_SECRET}"
    }
  ]
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `url` | `string` | Yes | Must be `https://` or `http://` (no other schemes) |
| `events` | `string[]` | Yes | Subset of the 10 defined event types |
| `secret` | `string` | No | Enables HMAC signing. Supports `${ENV_VAR}` interpolation. |

`EVOKORE_WEBHOOKS_ENABLED=true` must be set; otherwise the webhook subsystem is
disabled regardless of config.

---

## Changelog

| Version | Date | Change |
|---------|------|--------|
| v1 | 2026-04-14 | Initial frozen spec — id, timestamp, event, data envelope; 10 event types; HMAC-SHA256 + replay protection |
