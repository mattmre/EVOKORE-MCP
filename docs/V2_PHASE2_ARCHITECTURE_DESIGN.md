# EVOKORE-MCP Phase 2 Architecture Design

**Date:** 2026-03-05
**Focus:** Hypervisor Registry & Cooldown Wrapper
**Target File:** `src/ProxyManager.ts`

## 1. Goal
Implement two key patterns extracted from the Phase 1 Ecosystem Sprint:
1. **Stateful Hypervisor Registry:** Track the health, connection type, and state of proxied child servers.
2. **Infinite Loop Cooldown Wrapper:** Prevent agents from getting stuck in infinite loops when a tool returns empty or non-actionable status messages.

These changes must be injected into `src/ProxyManager.ts` without breaking the existing Human-in-the-Loop (HITL) `_evokore_approval_token` workflows.

## 2. Design: Stateful Hypervisor Registry

### Current Architecture
`ProxyManager.ts` currently maps `serverId` directly to a `Client` and `StdioClientTransport`. It lacks introspection into the server's health or state after the initial boot.

### New Architecture
Introduce a `ServerRegistry` tracking object for each server:
```typescript
interface ServerState {
  id: string;
  status: 'booting' | 'connected' | 'error' | 'disconnected';
  connectionType: 'stdio' | 'sse'; // Currently hardcoded to stdio, but planned for expansion
  errorCount: number;
  lastPing: number;
}
```
*   `loadServers()` will initialize this state.
*   If a tool call fails repeatedly (e.g., `McpError`), the `errorCount` increments. If it exceeds a threshold, the server status is marked as `error`.

## 3. Design: Infinite Loop Cooldown Wrapper

### The Problem
Agents often call a tool, receive an empty string `""` or a generic `"Success"` without the data they expected, and then immediately call the *exact same tool* again with the *exact same arguments*, burning through tokens in an infinite loop.

### The Solution
Implement a Cooldown map in `ProxyManager.ts`:
```typescript
// Maps toolName -> timestamp when cooldown expires
private toolCooldowns: Map<string, number> = new Map();
```

**Execution Flow in `callProxiedTool`:**
1.  **Check HITL Token:** (Existing logic).
2.  **Check Cooldown:**
    *   If `Date.now() < toolCooldowns.get(toolName)`, return an immediate error to the agent: `[EVOKORE COOLDOWN] Tool '${toolName}' is currently on cooldown to prevent infinite loops. Please wait X seconds or try a different approach.`
3.  **Execute Tool:** `client.callTool(...)`
4.  **Analyze Result:**
    *   If the result is an error, OR
    *   If `result.content` is empty, OR
    *   If `result.content[0].text` is extremely short (e.g., `< 15` chars like "OK", "Success", "Done") and lacks actionable data...
    *   **Action:** Apply a 10-second cooldown to this tool.

### Security & HITL Considerations
The Cooldown check *must* occur after the HITL token validation so that if an agent gets approval, it isn't blocked by a cooldown triggered by the previous (denied/approval-required) attempt.

## 4. Next Implementation Steps
1. Refactor `ProxyManager.ts` to include the `ServerState` map.
2. Add the `toolCooldowns` map and logic to `callProxiedTool`.
3. Add unit tests (e.g., `test-proxy-cooldown.js`) to ensure the cooldown properly rejects rapid repeated calls but allows valid calls after expiration.