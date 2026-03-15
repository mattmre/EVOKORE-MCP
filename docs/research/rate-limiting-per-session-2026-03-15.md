# Per-Session Rate Limiting for HttpServer

**Date:** 2026-03-15
**Status:** Implemented
**Related:** ProxyManager.ts, index.ts, SessionIsolation.ts

## Problem

ProxyManager's token bucket rate limiting was global -- shared across all sessions. In HTTP mode with multiple concurrent clients, a single client could exhaust the rate limit quota and starve other sessions. The `SessionState.rateLimitCounters` field existed but was never wired into the rate limiting path.

## Architecture: Dual-Bucket System

The implementation uses a **dual-bucket architecture** with session-scoped counters that override the global buckets when present:

### Global Buckets (Fallback)
- Stored in `ProxyManager.rateLimitBuckets` as `Map<string, TokenBucket>`.
- Initialized from `mcp.config.json` `rateLimit` config during `loadServers()`.
- Used when no `sessionCounters` parameter is provided (stdio mode, SkillManager internal calls).

### Session Counters (Override)
- Stored in `SessionState.rateLimitCounters` as `Map<string, { tokens: number; lastRefillAt: number }>`.
- Passed to `callProxiedTool` and `checkRateLimit` as an optional parameter.
- Initialized lazily: when a session first hits a rate-limited endpoint, the counter is seeded from the global bucket's capacity (same `requestsPerMinute`).
- Each session gets independent counters, so one client cannot exhaust another's quota.

### Why Lazy Initialization?

Session counters are initialized on first access rather than at session creation because:

1. **Memory efficiency:** Most sessions may never hit rate-limited tools, so pre-allocating all possible bucket keys wastes memory.
2. **Config coupling:** The global bucket stores the `requestsPerMinute` config. By deferring initialization, session counters automatically adopt whatever capacity the global bucket was configured with -- no need to duplicate config parsing.
3. **Dynamic proxy boot:** Child servers boot asynchronously after the session is created. Rate limit buckets may not exist yet when the session is first created.

## Data Flow

```
CallToolRequest (HTTP)
  -> index.ts: look up session via SessionIsolation
  -> extract session.rateLimitCounters
  -> ProxyManager.callProxiedTool(toolName, args, role, sessionCounters)
    -> checkRateLimit(serverId, originalToolName, sessionCounters)
      -> if sessionCounters provided:
           tryConsumeSessionCounter(key, sessionCounters, globalBucket)
         else:
           globalBucket.tryConsume()
```

## Backward Compatibility

- **stdio mode:** The default `__stdio_default_session__` session has `rateLimitCounters` initialized as an empty Map. Since `index.ts` passes `session?.rateLimitCounters`, and the session exists, session counters ARE passed in stdio mode as well. However, since there is only one session in stdio mode, the behavior is equivalent to global buckets but scoped to that single session.
- **SkillManager internal calls:** `SkillManager` calls `callProxiedTool` without the `sessionCounters` parameter, so it uses the global buckets as before.
- **No sessionCounters parameter:** When the parameter is omitted or undefined, `checkRateLimit` falls through to the global `TokenBucket.tryConsume()` path, preserving existing behavior.

## TokenBucket Additions

Two getter methods were added to `TokenBucket` to expose configuration:
- `getCapacity()`: returns `maxTokens` (the `requestsPerMinute` value).
- `getRefillRatePerMs()`: returns the refill rate for the token bucket algorithm.

These are used by session counter initialization to mirror the global bucket's configuration without duplicating the config parsing logic.

## Future Enhancements

- **Per-session rate limit config overrides:** Allow different sessions to have different rate limits (e.g., premium vs free tier) by accepting a `rateLimitOverrides` parameter in `createSession()`.
- **JWT claim-based limits:** Extract rate limit tier from JWT claims in OAuth-authenticated sessions.
- **Persistent counters:** For long-lived sessions, persist rate limit state to avoid reset on server restart.
