---
title: "S3.7 Dashboard Approve-over-WebSocket Research"
date: 2026-03-27
status: in_progress
phase: S3.7
---

# S3.7 Dashboard Approve-over-WebSocket

## Problem

The follow-up queue after M3 leaves "dashboard approve-over-WebSocket" as the
next approval-surface expansion item. Before adding a new approve action, the
existing live approval channel has to be made real end-to-end.

The current approvals page is served by `scripts/dashboard.js` on the dashboard
port (default `8899`), but the real approval WebSocket endpoint lives on the
EVOKORE HTTP server in `src/HttpServer.ts` (default `3100`).

Today the dashboard page connects to:

- `window.location.host + '/ws/approvals'`

That only works when the approvals page and the MCP HTTP server are on the same
origin, which is not the default local deployment shape.

## Current Contract

The HITL contract remains:

1. EVOKORE generates an approval token.
2. The MCP client asks the user for permission.
3. The MCP client retries with `_evokore_approval_token`.
4. EVOKORE validates and consumes the token.

This slice does **not** change that contract into deferred server-side
execution, and it does **not** make dashboard approval mandatory for token
validation.

## Gaps Found

### 1. WebSocket Topology Mismatch

- Dashboard UI: `scripts/dashboard.js`
- WS server: `src/HttpServer.ts`
- Default ports differ: `8899` vs `3100`

Result: the live approvals page silently falls back to polling in the default
local deployment.

### 2. Auth-Plane Mismatch

- Dashboard auth uses `EVOKORE_DASHBOARD_TOKEN`
- MCP HTTP auth uses `EVOKORE_AUTH_*`

Those are separate operator control planes today. If the approvals page is meant
to connect directly to the MCP HTTP server over WebSocket, that connection needs
an explicit configuration path instead of assuming the dashboard token is always
the right credential.

### 3. Role Propagation Gap

The WebSocket upgrade path in `src/HttpServer.ts` reads `req._evokoreRole` for
action RBAC, but that value is not populated after authentication. In static
token mode that leaves the role blank and causes RBAC checks to become stricter
than intended.

## Design Decision

Split S3.7 into two PR slices:

### S3.7a: WebSocket Alignment

Scope:

- make the approvals page target an explicit/configurable WS endpoint
- default that endpoint to `EVOKORE_HTTP_HOST` / `EVOKORE_HTTP_PORT`
- allow an explicit WS bearer token for operators who keep the dashboard token
  and MCP HTTP token separate
- propagate a usable role onto the WS request after auth so RBAC matches the
  existing HTTP/session model

### S3.7b: Approve Action

Scope:

- add an explicit approve action on top of the now-working live channel
- keep approve as an operator acknowledgment / management action unless and
  until the token contract is deliberately redesigned

Implementation decision:

- dashboard `Approve` sends a WebSocket `approve` message with the token prefix
- `SecurityManager.approveToken()` marks the pending token as acknowledged but
  does **not** consume it
- the original `_evokore_approval_token` retry path remains the only way to
  dispatch the tool call upstream
- the dashboard receives an `approval_acknowledged` event and updates the card
  state to `approved`
- deny remains destructive and admin-only; approve is a live operator-management
  action on top of the existing token flow

## Operator-Facing Behavior After S3.7a

- If `EVOKORE_DASHBOARD_APPROVAL_WS_URL` is set, the approvals page uses it.
- Otherwise, loopback-served dashboards target the current loopback hostname on
  `EVOKORE_HTTP_PORT` (default `3100`).
- Non-loopback dashboards fall back to same-origin `/ws/approvals` unless
  `EVOKORE_HTTP_HOST` is explicitly set.
- If `EVOKORE_DASHBOARD_APPROVAL_WS_TOKEN` is set, it is used for the WS
  connection.
- Otherwise the approvals page falls back to the dashboard session token.
- If the WS endpoint is still unreachable or unauthorized, polling remains the
  fallback.

## Risks

- A direct browser-to-MCP WS connection still assumes the operator has a valid
  credential for the MCP HTTP auth plane.
- Reverse proxy deployments should still set
  `EVOKORE_DASHBOARD_APPROVAL_WS_URL` when the public dashboard origin does not
  directly expose `/ws/approvals`.
- This slice improves the live transport path but does not yet add the actual
  approve action.
