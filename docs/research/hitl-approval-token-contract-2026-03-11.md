# HITL Approval Token Contract Research

## Date
- 2026-03-11

## Objective
- Close `T12` by verifying whether EVOKORE already satisfies the Agent33-style HITL token contract and tightening any remaining gaps.

## Current-State Findings
- EVOKORE already implemented the core token flow before this slice:
  - permission policies support `require_approval`
  - tokens are generated server-side
  - tokens are one-time use
  - tokens are bound to the exact normalized argument payload
  - the token field is stripped before dispatch to child servers
- Existing tests already covered:
  - base approval flow
  - one-time token consumption
  - arg-bound token validation

## Remaining Gap
- Schema injection was not fully universal.
- `ProxyManager` only advertised `_evokore_approval_token` when a proxied tool already exposed `inputSchema.properties`.
- That meant tools with an object schema but no declared properties could still require approval while failing to advertise the retry field in `listTools()`.

## Decision
- Treat `T12` as a contract-hardening slice, not a net-new HITL implementation.
- Make approval-token schema injection unconditional for proxied object tools by ensuring:
  - `inputSchema` exists
  - `inputSchema.properties` exists
  - `_evokore_approval_token` is always injected as an optional string property

## Validation Strategy
- Keep the existing HITL and hardening tests.
- Add a dedicated schema-injection regression test using a mock proxied tool with an object schema and no `properties`.
