# SkillManager Session Context Gap

**Date:** 2026-03-15
**Status:** Research complete, implementation pending
**Component:** `src/SkillManager.ts`, `src/index.ts`, `src/SecurityManager.ts`

## Problem

Native skill tools (`docs_architect`, `skill_creator`, `execute_skill`) delegate to `ProxyManager.callProxiedTool()` internally to read/write files via child servers. However, `SkillManager.handleToolCall(name, args)` does not receive or forward the caller's session role. The child server call therefore uses no explicit role parameter, which causes `SecurityManager.checkPermission()` to fall back to the global `activeRole` rather than the per-session role stored in `SessionIsolation`.

### Concrete bypass path

```
CallToolRequestSchema handler (index.ts)
  -> source === "native"
  -> skillManager.handleToolCall(toolName, args)   <-- no session context passed
    -> proxyManager.callProxiedTool("fs_read_file", { path })   <-- no role parameter
      -> securityManager.checkPermission("fs_read_file")        <-- falls back to global role
```

In contrast, the direct proxied-tool path already threads session role correctly:

```
CallToolRequestSchema handler (index.ts)
  -> source === "proxied"
  -> proxyManager.callProxiedTool(toolName, args, sessionRole, sessionCounters)
```

## Affected Tools

| Tool | Risk Level | Reason |
|------|-----------|--------|
| `docs_architect` | Medium | Calls `fs_read_file` to read `package.json` from arbitrary `target_dir` |
| `skill_creator` | High | Calls `fs_write_file` to create files at arbitrary `target_dir` |
| `execute_skill` | High | Runs code blocks in a subprocess; should respect caller role for audit |
| `resolve_workflow` | Low | Read-only skill search, no child server delegation |
| `search_skills` | Low | Read-only skill search, no child server delegation |
| `fetch_skill` | Medium | Downloads from URLs, writes to SKILLS/; handled separately in index.ts |

## Proposed Architecture

### 1. SkillExecutionContext interface

```typescript
export interface SkillExecutionContext {
  sessionId?: string;
  role?: string | null;
  rateLimitCounters?: Map<string, { tokens: number; lastRefillAt: number }>;
}
```

This is an optional parameter bag that `handleToolCall` accepts as a third argument. When omitted, behavior is unchanged (backward compatible).

### 2. handleToolCall signature extension

```typescript
// Before
async handleToolCall(name: string, args: any): Promise<any>

// After
async handleToolCall(name: string, args: any, context?: SkillExecutionContext): Promise<any>
```

Inside `handleToolCall`, the `docs_architect` and `skill_creator` branches pass `context?.role` and `context?.rateLimitCounters` through to `this.proxyManager.callProxiedTool()`.

### 3. index.ts forwarding

In the `CallToolRequestSchema` handler, the `source === "native"` branch constructs the context from the session:

```typescript
} else if (source === "native") {
  const sessionId = this.getSessionId(extra);
  const session = this.sessionIsolation.getSession(sessionId);
  result = await this.skillManager.handleToolCall(toolName, args, {
    sessionId,
    role: session?.role ?? undefined,
    rateLimitCounters: session?.rateLimitCounters,
  });
}
```

## Risk Assessment

| Dimension | Assessment |
|-----------|-----------|
| Backward compatibility | No risk. The context parameter is optional. Omission preserves existing behavior (global role fallback). |
| Performance | Negligible. Adds one object allocation per native tool call. |
| Security | Net improvement. Closes a privilege escalation gap where a `readonly` session could write files through `skill_creator`. |
| Test surface | Existing SkillManager tests pass unchanged. New tests should verify role forwarding for `docs_architect` and `skill_creator`. |

## Implementation Checklist

- [ ] Define `SkillExecutionContext` interface in `SkillManager.ts`
- [ ] Extend `handleToolCall` signature with optional context parameter
- [ ] Thread `context.role` and `context.rateLimitCounters` into `callProxiedTool` calls within `docs_architect` and `skill_creator`
- [ ] Update `index.ts` native tool dispatch to construct and pass context
- [ ] Add unit test: `skill_creator` with `readonly` role should be denied by `SecurityManager`
- [ ] Add unit test: `docs_architect` with explicit session role should forward to `checkPermission`

## Notes

- `execute_skill` does not currently call `ProxyManager` (it uses `child_process.execFileSync` directly), but the context should still be threaded for audit logging and future sandbox role enforcement.
- `fetch_skill` is handled as a special builtin in `index.ts` (not through the generic native path), so it would need separate context threading if role enforcement is desired there.
- The `resolve_workflow` and `search_skills` tools are read-only in-memory operations that do not touch child servers, so they do not need session context forwarding.
