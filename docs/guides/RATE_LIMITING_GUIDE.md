# Rate Limiting Guide

EVOKORE-MCP v3.0 supports configurable rate limiting for proxied child servers using a token bucket algorithm. This is separate from the error-triggered cooldown mechanism (which applies a 10-second backoff after tool errors).

## How It Works

### Token Bucket Algorithm

Rate limiting uses a **token bucket** model implemented in the `TokenBucket` class:

- Each bucket starts full with `requestsPerMinute` tokens.
- Every tool call consumes 1 token.
- Tokens refill continuously at a rate of `requestsPerMinute / 60000` tokens per millisecond.
- When the bucket is empty, the call is rejected with a retry-after time.

This model allows short bursts up to the configured limit while enforcing the average rate over time.

### Two Levels of Rate Limiting

1. **Per-server limits** -- A single bucket shared by all tools from that server.
2. **Per-tool limits** -- Individual buckets for specific tools, checked before the server bucket.

When both are configured, the per-tool limit is checked first (more specific), then the per-server limit.

### Rate Limiting vs. Cooldown

| Feature | Rate Limiting | Cooldown |
|---------|--------------|----------|
| Trigger | Proactive (before call) | Reactive (after error) |
| Scope | Per-server or per-tool | Per-tool + args combo |
| Duration | Continuous token refill | Fixed 10-second window |
| Configuration | `mcp.config.json` | Automatic |
| Purpose | Prevent API overload | Prevent infinite retry loops |

## Configuration

Add a `rateLimit` block to any server definition in `mcp.config.json`:

```json
{
  "servers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}"
      },
      "rateLimit": {
        "requestsPerMinute": 30,
        "toolLimits": {
          "create_issue": 5,
          "push_files": 10
        }
      }
    }
  }
}
```

### Configuration Format

```typescript
interface RateLimitConfig {
  requestsPerMinute?: number;              // Per-server limit (all tools combined)
  toolLimits?: Record<string, number>;     // Per-tool overrides (requests per minute)
}
```

- `requestsPerMinute` -- The maximum requests per minute across all tools from this server. Omit or set to 0 to disable the server-level limit.
- `toolLimits` -- Per-tool overrides using the **original** (unprefixed) tool name. Each value is the maximum requests per minute for that specific tool. Omit or set to 0 to disable.

## Common Configuration Examples

### Conservative GitHub Usage

Limit GitHub API calls to avoid hitting rate limits:

```json
{
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "rateLimit": {
      "requestsPerMinute": 20,
      "toolLimits": {
        "push_files": 5,
        "create_pull_request": 3,
        "create_issue": 5
      }
    }
  }
}
```

### ElevenLabs Voice API Protection

Protect against excessive API calls to a paid service:

```json
{
  "elevenlabs": {
    "command": "uvx",
    "args": ["elevenlabs-mcp"],
    "rateLimit": {
      "requestsPerMinute": 10,
      "toolLimits": {
        "text_to_speech": 5,
        "create_voice": 2
      }
    }
  }
}
```

### Supabase Read-Heavy Workload

Allow frequent reads but limit writes:

```json
{
  "supabase": {
    "command": "npx",
    "args": ["-y", "@supabase/mcp-server-supabase"],
    "rateLimit": {
      "requestsPerMinute": 60,
      "toolLimits": {
        "execute_sql": 10,
        "apply_migration": 2,
        "deploy_edge_function": 3
      }
    }
  }
}
```

### No Rate Limiting (Default)

If no `rateLimit` block is present, the server has no proactive rate limiting. Only the reactive cooldown mechanism (10-second backoff after errors) applies.

## Error Messages

When a rate limit is exceeded, the AI receives an MCP error with a retry-after time:

**Per-tool limit exceeded:**
```
Rate limit exceeded for github/push_files. Retry after 12s.
```

**Per-server limit exceeded:**
```
Rate limit exceeded for server 'github'. Retry after 5s.
```

The error code is `InvalidRequest` so the AI knows to wait rather than retry immediately.

## Monitoring and Debugging

### Startup Logs

Rate limit buckets are initialized during server boot. Check stderr for server connection messages:

```
[EVOKORE] Booting child server: github (stdio)
[EVOKORE] Proxied 15 tools from 'github'
```

### Diagnosing Rate Limit Issues

1. **Check the config** -- Verify `rateLimit` is inside the correct server block in `mcp.config.json`.
2. **Tool name matching** -- `toolLimits` keys use the **original** tool name (e.g., `push_files`), not the prefixed name (e.g., `github_push_files`).
3. **Burst behavior** -- If the AI makes many calls in quick succession, the bucket drains fast. The refill is continuous, so waiting a few seconds usually resolves it.
4. **Interaction with HITL** -- Rate limiting is checked after security/permission checks. If a tool requires approval, the rate limit token is consumed only when the actual call is dispatched.

### Runtime Inspection

The `TokenBucket` class is exported from `ProxyManager.ts` and exposes:

- `tryConsume()` -- Attempts to consume a token. Returns `true` if allowed, `false` if rate-limited.
- `getRetryAfterMs()` -- Returns the number of milliseconds until the next token is available.

### Running Validation Tests

```bash
npx vitest run test-rate-limiting-validation
```

## Best Practices

1. **Start permissive, tighten as needed.** Only add rate limits when you observe actual problems with API overuse.
2. **Use per-tool limits for expensive operations.** Write/create/delete operations are usually more costly than reads.
3. **Match upstream API limits.** If a service has a known rate limit (e.g., GitHub's 5000 requests/hour for authenticated users), set your EVOKORE limit below that threshold.
4. **Monitor cooldown triggers.** If tools are frequently hitting the reactive 10-second cooldown, adding proactive rate limits can provide smoother behavior.
