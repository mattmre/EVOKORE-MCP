---
name: pr-merge-platform-wiring-findings
description: Findings and decisions from the PR merge and platform wiring sprint.
---

# Findings & Decisions

## Session: 2026-03-15 — PR Merge & Platform Wiring Sprint

### PR #134 Code Review Findings
- **HMAC timing attack**: No `timingSafeEqual` helper provided for webhook signature verification. Fixed with `verifySignature()` static method.
- **Argument leakage**: Tool arguments (including approval tokens, credentials) were sent unredacted to external webhook endpoints. Fixed with `redactSensitiveArgs()`.
- **Secret exposure**: `getWebhooks()` returned raw webhook secrets. Fixed to return `hasSecret: boolean`.
- **URL validation**: No scheme validation — ftp://, file:// URLs accepted. Fixed to HTTP/HTTPS only.
- **Double-resolve**: Promise in `deliver` method could resolve twice. Fixed with `settled` guard.
- **Event semantics**: `tool_call` fired after success, not on invocation. Fixed to emit before execution.

### Architecture Decisions
| Decision | Rationale |
|----------|-----------|
| Sequential PR merges | User requested minimal drift between PRs |
| Fresh agent per phase | Prevents context rot across boundaries |
| Research before implementation | Each phase gets dedicated research agent |
| Session-scoped everything | HTTP mode needs isolation: state, auth, RBAC, rate limits |
| Optional parameters for backward compat | All new params default to undefined, falling back to global behavior |
| No middleware framework | Raw `handleRequest` dispatch is sufficient for auth + MCP |
| Emit-only plugin webhooks | Plugins can emit events via `emitWebhook()` but not subscribe (deferred) |
| LRU eviction for sessions | Max 100 sessions with oldest-access eviction, matching prior limit |
| Dual-bucket rate limiting | Session counters override when available, global fallback for stdio |

### Technical Debt Identified
1. Three webhook event types never emitted: `session_end`, `approval_requested`, `approval_granted`
2. OAuthProvider is static-token only — no JWT/JWKS despite CLAUDE.md mention
3. No end-to-end test across the full wired pipeline (HTTP + auth + session + RBAC + rate limit)
4. SkillManager internal calls bypass session context (acceptable but worth noting)
5. No periodic cleanup timer for session counters themselves (only session objects are cleaned)

## Resources
- Session log: `docs/session-logs/session-2026-03-15-pr-merge-platform-wiring.md`
- 5 new research docs in `docs/research/` (dated 2026-03-15)

---

## Session: 2026-03-15 (Part 2) — v3.0.0 Hardening Sprint

### PR #146 Code Review Findings
- **Test isolation**: E2E tests shared server state between cases, causing flaky failures on repeated runs. Fixed with per-test server lifecycle.
- **Assertion accuracy**: Some assertions checked for response existence rather than specific expected values. Tightened to exact match.
- **Cleanup ordering**: Transport teardown occurred before server shutdown, leaving dangling connections. Reordered to server-first.
- **Timeout handling**: Missing timeout configuration on HTTP requests caused tests to hang on failure. Added explicit timeouts.
- **Transport teardown**: Incomplete cleanup of SSE connections in error paths. Added finally blocks.
- **Error message matching**: Assertions used substring matching that could pass on unrelated errors. Switched to exact error code checks.

### SkillManager RBAC Bypass
- Internal tool calls from `docs_architect` and `skill_creator` native tools delegated to SkillManager without passing session role context.
- This meant skill execution from these tools bypassed RBAC permission checks entirely.
- Fix: Session context (including role) now flows through to SkillManager on all internal call paths.
- Impact: Low (only affects HTTP multi-tenant mode where RBAC is active), but a correctness gap.

### Damage Control Regex Analysis
- 29 rules validated with both positive match and negative (should-not-match) cases.
- Fork bomb regex was previously fixed (from `:(\\){0}){2,}` to `:\(\)\s*\{`), now covered by dedicated tests.
- **DC-21 risk**: Rule matching `chmod.*777` could false-positive on documentation strings mentioning the pattern. Acceptable trade-off for security.
- **DC-12 risk**: Rule matching `curl.*\|.*sh` could catch legitimate curl-to-file piped through shell inspection. Low practical risk in MCP context.

### Plugin Webhook Subscriptions
- Previous model was emit-only: plugins could fire events via `emitWebhook()` but could not listen.
- Extended with `subscribe(eventType, handler)` and `unsubscribe(eventType, handler)` on PluginContext.
- Handlers receive the same payload shape as external webhook endpoints (minus HMAC signature).
- Design decision: subscriptions are in-process callbacks, not HTTP. This avoids plugins needing to run their own HTTP servers.

### Repo Audit Hook Default Enablement
- Previously opt-in via `EVOKORE_REPO_AUDIT_HOOK=true` environment variable.
- Changed to enabled-by-default: runs unless `EVOKORE_REPO_AUDIT_HOOK=false` is explicitly set.
- Rationale: The hook catches branch drift and stale worktrees early. The cost of a false negative (missing drift) outweighs the cost of one extra check per session.

### Architecture Decisions (Session 2)
| Decision | Rationale |
|----------|-----------|
| In-process plugin subscriptions | Avoid HTTP overhead; plugins are already loaded in-process |
| Repo audit hook default-on | Drift detection value exceeds startup cost |
| Session context passthrough | RBAC must apply uniformly regardless of call origin |
| Boundary tests for log rotation | Edge cases (exact size, off-by-one) are where rotation bugs hide |

### Technical Debt Remaining
1. npm publish v3.0.0 not yet executed (tag + push pending)
2. STT voice input implementation deferred to v3.1.0
3. Live Supabase integration test not yet written
4. No performance benchmarks for the full wired HTTP pipeline

## Resources
- Session log: `docs/session-logs/session-2026-03-15-v3-hardening-sprint-2.md`
