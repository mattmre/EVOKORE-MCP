# Webhook Event System Research

**Date:** 2026-03-14
**Status:** Implemented
**Tracking:** T29

## Problem Statement

EVOKORE-MCP needed a way to notify external systems when significant events occur within the MCP server runtime. This includes tool calls, errors, session lifecycle events, and HITL approval actions. Without this capability, observability and integration with external monitoring, alerting, or automation systems required polling or log parsing.

## Design Decisions

### Event Types

Six event types cover the core observable actions:

| Event | Trigger |
|---|---|
| `tool_call` | Any tool invocation begins |
| `tool_error` | A tool returns an error (in-band or thrown) |
| `session_start` | Server starts on stdio or HTTP transport |
| `session_end` | Reserved for future shutdown hooks |
| `approval_requested` | Reserved for HITL token generation |
| `approval_granted` | Reserved for HITL token validation |

### Configuration

Webhooks are configured in `mcp.config.json` under a top-level `webhooks` key:

```json
{
  "webhooks": [
    {
      "url": "https://example.com/hook",
      "events": ["tool_call", "tool_error"],
      "secret": "whsec_abc123"
    }
  ]
}
```

Each subscription specifies which events it listens to. Events not in the subscription's `events` array are not delivered.

### Security

- Payloads are signed with HMAC-SHA256 using the webhook's `secret`.
- The signature is included in the `X-EVOKORE-Signature` header.
- Consumers verify using `WebhookManager.verifySignature(body, secret, receivedSignature)`, which uses `crypto.timingSafeEqual` for constant-time comparison to prevent timing attacks.
- Sensitive tool arguments (tokens, passwords, secrets, API keys, credentials) are automatically redacted to `[REDACTED]` in webhook payloads before delivery.
- The `getWebhooks()` diagnostic method returns sanitized copies with `hasSecret: boolean` instead of exposing raw secret values.

### Delivery Model

- **Fire-and-forget**: `emit()` never blocks the caller. Delivery runs in the background.
- **Retry**: Up to 3 attempts per delivery with exponential backoff (500ms, 1000ms, 2000ms).
- **Timeout**: Each delivery attempt times out after 10 seconds.
- **Failure logging**: All delivery failures are logged to stderr with the `[EVOKORE]` prefix.

### Opt-in Activation

Webhooks are disabled by default. Set `EVOKORE_WEBHOOKS_ENABLED=true` in the environment to activate them. This ensures zero runtime overhead when webhooks are not needed.

## Payload Format

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-03-14T12:00:00.000Z",
  "event": "tool_call",
  "data": {
    "tool": "github_search_repositories",
    "arguments": { "query": "evokore" },
    "sessionId": "__stdio_default_session__"
  }
}
```

**Note:** Arguments containing sensitive keys (e.g., `_evokore_approval_token`, `password`, `secret`, `token`, `key`, `credential`, `api_key`, `apiKey`, `access_token`, `accessToken`) are automatically replaced with `[REDACTED]` before inclusion in webhook payloads.

## Architecture

```
index.ts (CallToolRequest handler)
  |
  +-- webhookManager.emit("tool_call", data)  // fire-and-forget
  |     |
  |     +-- for each matching webhook subscription:
  |           deliverWithRetry(webhook, payload)
  |             |
  |             +-- attempt 1: HTTP POST with HMAC signature
  |             +-- attempt 2: after 500ms backoff
  |             +-- attempt 3: after 1000ms backoff
  |
  +-- (normal tool execution continues unblocked)
```

## Implementation Files

- `src/WebhookManager.ts` -- Core module with WebhookManager class
- `src/index.ts` -- Integration points (emit calls in CallToolRequest handler, loadSubsystems, run/runHttp)
- `tests/integration/webhook-events.test.ts` -- Integration tests

## Dependencies

No new dependencies. Uses Node.js built-in `http`, `https`, and `crypto` modules.

## Future Work

- Emit `session_end` on graceful shutdown (requires process signal handling integration)
- Emit `approval_requested` and `approval_granted` from SecurityManager
- Webhook delivery metrics (success/failure counts) exposed via `evokore://server/status` resource
- Dead letter queue for persistently failing webhooks
