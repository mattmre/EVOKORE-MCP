# M3.2 External Telemetry Export - Research & Design

**Date:** 2026-03-26
**Status:** Implementing
**Milestone:** M3 - Observability & Operations

## Summary

Add an opt-in external telemetry exporter that periodically pushes aggregate
`TelemetryMetrics` snapshots to a configurable HTTP(S) endpoint. The exporter
reuses the HMAC-SHA256 signing pattern from `WebhookManager` and requires
**double opt-in** to activate.

## Design Decisions

### 1. JSON Push Format with HMAC Signing

The exporter POSTs a JSON envelope to the configured URL:

```json
{
  "id": "<UUID v4>",
  "timestamp": "<ISO 8601>",
  "event": "telemetry_export",
  "version": 2,
  "metrics": { /* TelemetryMetrics snapshot */ },
  "instanceId": "<stable per-process UUID>"
}
```

Signing follows the same WebhookManager pattern:
- HMAC-SHA256 over `${unixTimestamp}.${jsonBody}` using a shared secret.
- Signature sent as `X-EVOKORE-Signature` header.
- Timestamp sent as `X-EVOKORE-Timestamp` for replay protection.

### 2. Double Opt-In Model

Both environment variables must be `"true"` for the exporter to activate:

1. `EVOKORE_TELEMETRY=true` - enables local telemetry collection
2. `EVOKORE_TELEMETRY_EXPORT=true` - enables external push

If `EVOKORE_TELEMETRY_EXPORT=true` but `EVOKORE_TELEMETRY` is not `true`, the
exporter logs a warning and stays disabled.

### 3. Metrics-Only Scope

The exporter sends **only** `TelemetryMetrics` snapshots (aggregate counters).
It does NOT export:

- Audit log entries (`AuditLog` is not imported)
- Individual tool call details (tool names, arguments)
- Session identifiers
- Webhook payloads

### 4. Backpressure via In-Flight Detection

A boolean `inFlight` flag prevents overlapping export cycles. If a previous
HTTP delivery is still pending when the interval timer fires, the cycle is
skipped silently. This avoids request pile-up when the remote endpoint is slow.

### 5. Privacy Guarantees

The exported payload contains only aggregate counters:
- Tool call/error counts
- Session lifecycle counts (created, resumed, expired, active)
- Auth success/failure/rate-limited counts
- Average latency (ms)
- Uptime and start time

**No PII is ever included.** No tool names, no arguments, no session IDs, no
user identifiers, no environment variable values.

## Configuration

| Env Variable | Required | Default | Description |
|---|---|---|---|
| `EVOKORE_TELEMETRY` | Yes (prerequisite) | `false` | Enable local telemetry |
| `EVOKORE_TELEMETRY_EXPORT` | Yes | `false` | Enable external push |
| `EVOKORE_TELEMETRY_EXPORT_URL` | Yes (when enabled) | none | HTTP(S) endpoint URL |
| `EVOKORE_TELEMETRY_EXPORT_INTERVAL_MS` | No | `60000` | Push interval (min 10000) |
| `EVOKORE_TELEMETRY_EXPORT_SECRET` | No | none | HMAC signing secret |

## Retry & Resilience

- 3 attempts per export cycle with exponential backoff (500ms, 1s, 2s).
- 10-second HTTP timeout per request.
- Timer is `unref()`'d so it does not prevent Node process exit.
- `shutdown()` performs a final flush before clearing the timer.

## Files Changed

- `src/TelemetryExporter.ts` - New file
- `src/index.ts` - Wire exporter into server lifecycle
- `.env.example` - Document new env vars
- `tests/integration/telemetry-export-validation.test.ts` - Validation tests
