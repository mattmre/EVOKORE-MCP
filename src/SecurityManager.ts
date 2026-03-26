import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import os from "os";
import yaml from "yaml";

import crypto from "crypto";

const PERMISSIONS_FILE = path.resolve(__dirname, "../permissions.yml");
const EVOKORE_STATE_DIR = path.join(os.homedir(), ".evokore");
const PENDING_APPROVALS_FILE = path.join(EVOKORE_STATE_DIR, "pending-approvals.json");
const DENIED_TOKENS_FILE = path.join(EVOKORE_STATE_DIR, "denied-tokens.json");

type PermissionLevel = "allow" | "require_approval" | "deny";

export interface RoleDefinition {
  description: string;
  default_permission: PermissionLevel;
  overrides?: Record<string, PermissionLevel>;
}

export interface ApprovalEvent {
  type: "approval_requested" | "approval_granted" | "approval_denied";
  data: unknown;
}

export class SecurityManager {
  private rules: Record<string, string> = {};
  private roles: Map<string, RoleDefinition> = new Map();
  private activeRole: string | null = null;
  private pendingTokens: Map<string, { toolName: string; argsHash: string; expiresAt: number }> = new Map();
  private static readonly TOKEN_TTL_MS = 5 * 60 * 1000;
  private approvalCallback?: (event: ApprovalEvent) => void;

  async loadPermissions() {
    try {
      const content = await fs.readFile(PERMISSIONS_FILE, "utf-8");
      const config = yaml.parse(content);
      if (config && config.rules) {
        this.rules = config.rules;
        console.error(`[EVOKORE] Loaded ${Object.keys(this.rules).length} security rules.`);
      }

      // Load role definitions
      if (config && config.roles && typeof config.roles === "object") {
        for (const [name, def] of Object.entries(config.roles)) {
          this.roles.set(name, def as RoleDefinition);
        }
        if (this.roles.size > 0) {
          console.error(`[EVOKORE] Loaded ${this.roles.size} RBAC role(s): ${Array.from(this.roles.keys()).join(", ")}`);
        }
      }

      // Determine active role: env var takes precedence, then config file
      this.activeRole = process.env.EVOKORE_ROLE || config?.active_role || null;
      if (this.activeRole) {
        if (this.roles.has(this.activeRole)) {
          console.error(`[EVOKORE] Active role: ${this.activeRole}`);
        } else {
          console.error(`[EVOKORE] Warning: active role '${this.activeRole}' not found in role definitions. Falling back to flat permissions.`);
          this.activeRole = null;
        }
      }
    } catch (e) {
      console.error("[EVOKORE] No permissions.yml found or error parsing it. Defaulting to 'allow' for all proxied tools.");
    }
  }

  /**
   * Check if a tool call is allowed.
   *
   * When a role is active, the resolution order is:
   *   1. Role-specific overrides for this tool
   *   2. Flat per-tool rules (act as additional overrides layered on top of the role)
   *   3. Role default_permission
   *
   * When no role is active, flat per-tool rules are used directly (original behavior).
   *
   * Returns:
   *  "allow" - Execution proceeds normally.
   *  "require_approval" - The MCP server intercepts and returns an error forcing HITL.
   *  "deny" - Blocked entirely.
   */
  checkPermission(toolName: string, role?: string | null): PermissionLevel {
    // Resolve effective role: explicit parameter takes precedence, then global activeRole
    const effectiveRole = role !== undefined ? role : this.activeRole;

    // If a role is active, use role-based permissions
    if (effectiveRole && this.roles.has(effectiveRole)) {
      const roleDef = this.roles.get(effectiveRole)!;

      // Check role overrides first
      if (roleDef.overrides && toolName in roleDef.overrides) {
        return roleDef.overrides[toolName];
      }

      // Then check flat per-tool rules (they act as additional overrides)
      const flatRule = this.rules[toolName];
      if (flatRule === "allow" || flatRule === "require_approval" || flatRule === "deny") {
        return flatRule;
      }

      // Fall back to role default
      return roleDef.default_permission;
    }

    // No role active -- use flat permissions (existing behavior)
    const rule = this.rules[toolName];
    if (!rule) return "allow"; // Default permissive if not explicitly ruled

    if (rule === "require_approval" || rule === "deny") {
      return rule;
    }

    return "allow";
  }

  /**
   * Get the currently active role name, or null if no role is active.
   */
  getActiveRole(): string | null {
    return this.activeRole;
  }

  /**
   * Set the active role at runtime.
   * Pass null to deactivate role-based permissions and revert to flat rules.
   * Returns true if the role was set successfully, false if the role name is unknown.
   */
  setActiveRole(role: string | null): boolean {
    if (role === null) {
      this.activeRole = null;
      return true;
    }
    if (this.roles.has(role)) {
      this.activeRole = role;
      return true;
    }
    return false;
  }

  /**
   * List all defined roles with their descriptions and active status.
   */
  listRoles(): Array<{ name: string; description: string; isActive: boolean }> {
    return Array.from(this.roles.entries()).map(([name, def]) => ({
      name,
      description: def.description,
      isActive: name === this.activeRole,
    }));
  }

  /**
   * Register a callback that is invoked whenever an approval lifecycle event occurs.
   * Used by HttpServer to broadcast real-time WebSocket events.
   */
  setApprovalCallback(cb: (event: ApprovalEvent) => void): void {
    this.approvalCallback = cb;
  }

  /**
   * Safely invoke the approval callback, swallowing any errors to avoid
   * disrupting the token lifecycle.
   */
  private emitApprovalEvent(event: ApprovalEvent): void {
    if (!this.approvalCallback) return;
    try {
      this.approvalCallback(event);
    } catch {
      // Callback failure must not break token lifecycle
    }
  }

  private normalizeValue(value: any): any {
    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeValue(item));
    }

    if (value && typeof value === "object") {
      const normalized: Record<string, any> = {};
      for (const key of Object.keys(value).sort()) {
        normalized[key] = this.normalizeValue(value[key]);
      }
      return normalized;
    }

    return value;
  }

  private hashArgs(args: any): string {
    const normalizedArgs = this.normalizeValue(args ?? {});
    return crypto.createHash("sha256").update(JSON.stringify(normalizedArgs)).digest("hex");
  }

  private purgeExpiredTokens() {
    const now = Date.now();
    for (const [token, metadata] of this.pendingTokens.entries()) {
      if (metadata.expiresAt < now) {
        this.pendingTokens.delete(token);
      }
    }
  }

  generateToken(toolName: string, args: any): string {
    this.purgeExpiredTokens();
    const token = crypto.randomBytes(16).toString("hex");
    const expiresAt = Date.now() + SecurityManager.TOKEN_TTL_MS;
    this.pendingTokens.set(token, {
      toolName,
      argsHash: this.hashArgs(args),
      expiresAt,
    });
    this.persistPendingApprovals();
    this.emitApprovalEvent({
      type: "approval_requested",
      data: {
        token: token.substring(0, 8) + "...",
        toolName,
        expiresAt,
        createdAt: expiresAt - SecurityManager.TOKEN_TTL_MS,
      },
    });
    return token;
  }

  validateToken(toolName: string, token: string, args: any): boolean {
    this.purgeExpiredTokens();
    // Check if the token has been denied via the UI
    if (this.checkDeniedTokens(token)) {
      this.pendingTokens.delete(token);
      this.persistPendingApprovals();
      return false;
    }
    const metadata = this.pendingTokens.get(token);
    if (!metadata) return false;
    if (metadata.toolName !== toolName) return false;
    if (metadata.expiresAt < Date.now()) return false;
    return metadata.argsHash === this.hashArgs(args);
  }

  consumeToken(token: string) {
    const meta = this.pendingTokens.get(token);
    this.pendingTokens.delete(token);
    this.persistPendingApprovals();
    if (meta) {
      this.emitApprovalEvent({
        type: "approval_granted",
        data: {
          token: token.substring(0, 8) + "...",
          toolName: meta.toolName,
        },
      });
    }
  }

  /**
   * Returns a list of pending (non-expired) approval tokens for display in the UI.
   * Token values are truncated for security — only the first 8 characters are exposed.
   */
  getPendingApprovals(): Array<{
    token: string;
    toolName: string;
    expiresAt: number;
    createdAt: number;
  }> {
    const now = Date.now();
    return Array.from(this.pendingTokens.entries())
      .filter(([, meta]) => meta.expiresAt > now)
      .map(([token, meta]) => ({
        token: token.substring(0, 8) + "...",
        toolName: meta.toolName,
        expiresAt: meta.expiresAt,
        createdAt: meta.expiresAt - SecurityManager.TOKEN_TTL_MS,
      }));
  }

  /**
   * Deny a token by its prefix (first 8 characters).
   * Marks the token as consumed so it cannot be used for approval.
   */
  denyToken(tokenPrefix: string): boolean {
    for (const [token, meta] of this.pendingTokens.entries()) {
      if (token.startsWith(tokenPrefix) && meta.expiresAt > Date.now()) {
        this.pendingTokens.delete(token);
        this.persistPendingApprovals();
        this.emitApprovalEvent({
          type: "approval_denied",
          data: { prefix: tokenPrefix },
        });
        return true;
      }
    }
    return false;
  }

  /**
   * Persist pending approvals to a shared JSON file so the dashboard
   * (a separate process) can read and display them.
   * Uses atomic write (write to .tmp then rename) to avoid partial reads.
   */
  private persistPendingApprovals(): void {
    try {
      if (!fsSync.existsSync(EVOKORE_STATE_DIR)) {
        fsSync.mkdirSync(EVOKORE_STATE_DIR, { recursive: true });
      }
      const pending = this.getPendingApprovals();
      const tmpPath = PENDING_APPROVALS_FILE + ".tmp";
      fsSync.writeFileSync(tmpPath, JSON.stringify(pending, null, 2));
      fsSync.renameSync(tmpPath, PENDING_APPROVALS_FILE);
    } catch {
      // Fail silently — the UI is a convenience, not critical path
    }
  }

  /**
   * Check if a token has been denied via the dashboard UI.
   * The dashboard writes denied token prefixes to a JSON file.
   */
  private checkDeniedTokens(token: string): boolean {
    try {
      if (!fsSync.existsSync(DENIED_TOKENS_FILE)) return false;
      const content = fsSync.readFileSync(DENIED_TOKENS_FILE, "utf8");
      const denied = JSON.parse(content);
      if (!Array.isArray(denied)) return false;
      const isDenied = denied.some(
        (entry: { prefix: string; deniedAt: number }) =>
          typeof entry.prefix === "string" && token.startsWith(entry.prefix)
      );
      if (isDenied) {
        // Clean up: remove this entry from the denied file since we've consumed it
        const remaining = denied.filter(
          (entry: { prefix: string; deniedAt: number }) =>
            typeof entry.prefix !== "string" || !token.startsWith(entry.prefix)
        );
        const tmpPath = DENIED_TOKENS_FILE + ".tmp";
        fsSync.writeFileSync(tmpPath, JSON.stringify(remaining, null, 2));
        fsSync.renameSync(tmpPath, DENIED_TOKENS_FILE);
      }
      return isDenied;
    } catch {
      return false;
    }
  }
}
