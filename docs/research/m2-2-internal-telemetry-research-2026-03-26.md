# M2.2 Internal Telemetry & Auditability Research

**Date:** 2026-03-26
**Status:** Implemented
**Milestone:** M2.2 (Production hardening)

## Objective

Extend EVOKORE-MCP's existing telemetry and webhook infrastructure into
structured internal telemetry for operator observability: a persistent audit
log, enhanced session/auth metrics, and a dashboard view.

## Prior Art in Codebase

| Component | Location | Role |
|-----------|----------|------|
| TelemetryManager | `src/TelemetryManager.ts` | Aggregate counters: tool calls, errors, sessions, latency. Opt-in via `EVOKORE_TELEMETRY=true`. |
| WebhookManager | `src/WebhookManager.ts` | Fire-and-forget event emission with HMAC signatures and retry. |
| Evidence Capture | `scripts/hooks/evidence-capture.js` | Per-session JSONL evidence log for Claude Code hooks. |
| Session Replay | `scripts/hooks/session-replay.js` | Per-session JSONL replay log. |
| Dashboard | `scripts/dashboard.js` | Zero-dependency web UI at `:8899` for session/approval viewing. |

## Design Decisions

### 1. Audit Log Format

JSONL was chosen over SQLite or structured binary formats because:
- Append-only writes are lock-free and fail-safe.
- Tools like `grep`, `jq`, `tail -f` work natively.
- The existing evidence-capture and replay hooks already use JSONL.
- No new dependencies required.

### 2. Opt-in Gate

`EVOKORE_AUDIT_LOG=true` was chosen as the opt-in mechanism, mirroring the
`EVOKORE_TELEMETRY=true` pattern. The audit log disabled by default avoids
unexpected disk writes in development environments.

### 3. Selective Tool Auditing

Not every tool call is audited. Only admin-scope and configuration-mutating
tools (`reload_plugins`, `reset_telemetry`, `refresh_skills`, `fetch_skill`,
approval-related) are logged. This keeps the audit log focused on security-
relevant actions and avoids noise from high-frequency read-only tools.

### 4. Rotation

The log-rotation pattern from `scripts/log-rotation.js` was replicated inside
`AuditLog.ts` rather than importing the JavaScript module into TypeScript. This
keeps the TypeScript build self-contained while using the exact same algorithm
(size-based rotation with numbered backups).

### 5. Telemetry Schema Versioning

A `telemetryVersion` field (initially `2`) was added to `TelemetryMetrics`.
This allows consumers to detect schema changes without breaking backward
compatibility. Version `1` was the implicit original shape.

### 6. Dashboard Audit View

The `/api/audit` and `/api/audit/summary` endpoints require `admin` role,
since audit entries may contain operational metadata that should not be
exposed to read-only dashboard consumers.

## New Components

### `src/AuditLog.ts`

- `AuditEntry` interface with `timestamp`, `eventType`, `sessionId`, `actor`,
  `resource`, `outcome`, `metadata`.
- `AuditLog` class with `write()`, `log()`, `getEntries()`, `getSummary()`.
- `redactForAudit()` helper strips sensitive keys before metadata logging.
- Singleton pattern via `AuditLog.getInstance()`.
- Writes to `~/.evokore/audit/audit.jsonl`.
- Size-based rotation (5 MB default, 3 rotations).

### Enhanced `TelemetryMetrics`

New fields added to `get_telemetry` response:

```json
{
  "telemetryVersion": 2,
  "sessions": {
    "activeCount": 1,
    "totalCreated": 5,
    "totalResumed": 2,
    "totalExpired": 3
  },
  "auth": {
    "successCount": 10,
    "failureCount": 1,
    "rateLimitedCount": 0
  }
}
```

### Dashboard Endpoints

| Endpoint | Method | Role | Description |
|----------|--------|------|-------------|
| `/api/audit` | GET | admin | Paginated audit entries (`?limit=&offset=`) |
| `/api/audit/summary` | GET | admin | Event type counts |

### Audit Event Integration Points

| Location | Event Types |
|----------|-------------|
| `src/index.ts` tool handler | `tool_call` (selective) |
| `src/index.ts` session lifecycle | `session_create` |
| `src/HttpServer.ts` auth middleware | `auth_success`, `auth_failure` |
| `src/HttpServer.ts` session init | `session_create` |
| `src/HttpServer.ts` session reattach | `session_resume` |
| `src/HttpServer.ts` session cleanup | `session_expire` |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `EVOKORE_AUDIT_LOG` | `false` | Enable structured audit logging |

## Security Considerations

- No PII or secrets are ever written to the audit log.
- `redactForAudit()` strips known sensitive keys (`token`, `password`, `api_key`, etc.).
- Dashboard audit endpoints require `admin` role.
- Audit file lives in `~/.evokore/audit/`, which is user-scoped.

## Test Coverage

`tests/integration/internal-telemetry-validation.test.ts` covers:
- AuditLog write/read/rotation/pagination
- Opt-in gating
- Entry field validation
- Sensitive data redaction
- TelemetryMetrics schema version
- Session/auth metric tracking
- Dashboard `/api/audit` and `/api/audit/summary` endpoints
- Role-based access control on audit endpoints
