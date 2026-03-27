# S3.8 Audit Event Export Research

**Date:** 2026-03-27  
**Status:** Implementing  
**Milestone:** S3.8

## Summary

S3.8 should export structured audit events as a dedicated external stream
without weakening the existing M3.2 privacy boundary that keeps telemetry
metrics-only.

## Current Architecture

- `src/AuditLog.ts` persists structured `AuditEntry` records to
  `~/.evokore/audit/audit.jsonl`.
- `src/index.ts` and `src/HttpServer.ts` already emit the authoritative audit
  events for tool calls, auth outcomes, and session lifecycle changes.
- `scripts/dashboard.js` exposes local read-only audit views through
  `/api/audit` and `/api/audit/summary`.
- `src/TelemetryExporter.ts` already defines the preferred external export
  operational pattern:
  - opt-in gating
  - HTTP(S) POST delivery
  - HMAC signing
  - bounded retries/backoff
  - unref'd timer

## Design Decision

Implement a dedicated `AuditExporter` instead of extending
`TelemetryExporter`.

This preserves three existing contracts:

1. **Telemetry remains aggregate-only.**
2. **Audit export reuses the existing `AuditEntry` schema.**
3. **Local dashboard audit views keep reading the same local audit file.**

## Minimal Scope

- add `src/AuditExporter.ts`
- add chronological read support to `AuditLog`
- wire exporter lifecycle into `src/index.ts`
- document audit export env vars in `.env.example`
- add focused integration validation in
  `tests/integration/audit-export-validation.test.ts`

## Delivery Model

- Double opt-in:
  - `EVOKORE_AUDIT_LOG=true`
  - `EVOKORE_AUDIT_EXPORT=true`
- POST JSON payloads to `EVOKORE_AUDIT_EXPORT_URL`
- HMAC-SHA256 signing uses the same `WebhookManager` signature pattern as
  telemetry export
- Export is forward-looking by default:
  - on startup, the exporter snapshots the current audit entry count
  - only entries created after startup are exported
- Export drains entries in chronological batches

## Payload Shape

```json
{
  "id": "<UUID v4>",
  "timestamp": "<ISO 8601>",
  "event": "audit_export",
  "version": 1,
  "entries": [
    {
      "timestamp": 1710000000000,
      "eventType": "auth_failure",
      "outcome": "failure",
      "metadata": {
        "path": "/ws/approvals"
      }
    }
  ],
  "instanceId": "<stable per-process UUID>"
}
```

## Known Boundaries

- Audit export is intentionally **not** merged into the telemetry payload.
- The exporter reads from the active audit log contract and does not introduce a
  second storage backend.
- Rotation remains best-effort for export continuity; the local audit log stays
  the source of truth.

## Validation Targets

- module structure and source wiring
- opt-in gating and URL validation
- startup backlog is skipped by default
- new entries export in chronological order and respect batch size
- signing path reuses `WebhookManager.computeSignature`
- `.env.example` documents all audit export variables
