export declare class SecurityManager {
    private rules;
    loadPermissions(): Promise<void>;
    /**
     * Check if a tool call is allowed.
     * Returns:
     *  "allow" - Execution proceeds normally.
     *  "require_approval" - The MCP server intercepts and returns an error forcing HITL.
     *  "deny" - Blocked entirely.
     */
    checkPermission(toolName: string): "allow" | "require_approval" | "deny";
}
//# sourceMappingURL=SecurityManager.d.ts.map