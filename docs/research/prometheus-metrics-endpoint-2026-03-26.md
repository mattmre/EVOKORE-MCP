# Prometheus Metrics Endpoint — 2026-03-26

## Objective

Add the queued S3.6 pull-oriented Prometheus scrape surface on top of the
existing aggregate telemetry model without changing the shipped JSON push-export
contract from M3.2.

## Scope Decision

Expose a narrow `GET /metrics` endpoint from `HttpServer` that renders the
current `TelemetryManager` snapshot in Prometheus text exposition format.

This slice does **not**:

- change the telemetry schema
- replace or remove the existing `TelemetryExporter` push path
- add per-tool, per-user, or per-session-id labels
- create a second public auth bypass alongside `/health`

## Security Decision

`/metrics` should follow the existing HTTP auth middleware.

Rationale:

- `/health` remains the only public-path bypass for lightweight liveness probes.
- Prometheus can scrape authenticated targets with a bearer token when
  `EVOKORE_AUTH_REQUIRED=true`.
- Keeping `/metrics` behind the normal middleware avoids creating a new
  unauthenticated operator surface by default.

Practical behavior:

- auth disabled: `GET /metrics` is available without credentials
- auth enabled: `GET /metrics` requires the same bearer token used for `/mcp`
- authenticated and rejected `/metrics` scrapes do not increment the auth
  success/failure telemetry they expose

## Telemetry / Disabled-State Decision

`/metrics` should return `503` when telemetry is not enabled.

Rationale:

- The endpoint is intentionally layered on top of the existing opt-in telemetry
  system rather than silently enabling collection as a side effect of scraping.
- A non-200 response makes the operator state explicit instead of exposing an
  apparently healthy scrape target with meaningless zeroes.

## Metric Mapping

The Prometheus surface maps directly from the existing aggregate snapshot:

- `evokore_telemetry_enabled`
- `evokore_telemetry_schema_version`
- `evokore_tool_calls_total`
- `evokore_tool_errors_total`
- `evokore_tool_latency_average_milliseconds`
- `evokore_sessions_started_total`
- `evokore_sessions_active`
- `evokore_sessions_created_total`
- `evokore_sessions_resumed_total`
- `evokore_sessions_expired_total`
- `evokore_auth_success_total`
- `evokore_auth_failure_total`
- `evokore_auth_rate_limited_total`
- `evokore_process_start_time_seconds`
- `evokore_uptime_milliseconds`

No labels are added in this slice because the current telemetry model is
aggregate-only and privacy-first.

## Validation Plan

1. Extend `TelemetryManager` tests to validate Prometheus exposition output.
2. Extend `HttpServer` tests to validate:
   - `503` when telemetry is disabled or unavailable
   - `200` text exposition when telemetry is enabled
3. Extend auth wiring tests to validate `/metrics` remains protected when
   auth is enabled.
4. Run targeted Vitest coverage, then full repo validation before merge.
