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

export class SecurityManager {
  private rules: Record<string, string> = {};
  private pendingTokens: Map<string, { toolName: string; argsHash: string; expiresAt: number }> = new Map();
  private static readonly TOKEN_TTL_MS = 5 * 60 * 1000;

  async loadPermissions() {
    try {
      const content = await fs.readFile(PERMISSIONS_FILE, "utf-8");
      const config = yaml.parse(content);
      if (config && config.rules) {
        this.rules = config.rules;
        console.error(`[EVOKORE] Loaded ${Object.keys(this.rules).length} security rules.`);
      }
    } catch (e) {
      console.error("[EVOKORE] No permissions.yml found or error parsing it. Defaulting to 'allow' for all proxied tools.");
    }
  }

  /**
   * Check if a tool call is allowed.
   * Returns:
   *  "allow" - Execution proceeds normally.
   *  "require_approval" - The MCP server intercepts and returns an error forcing HITL.
   *  "deny" - Blocked entirely.
   */
  checkPermission(toolName: string): "allow" | "require_approval" | "deny" {
    const rule = this.rules[toolName];
    if (!rule) return "allow"; // Default permissive if not explicitly ruled
    
    if (rule === "require_approval" || rule === "deny") {
      return rule;
    }

    return "allow";
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
    this.pendingTokens.set(token, {
      toolName,
      argsHash: this.hashArgs(args),
      expiresAt: Date.now() + SecurityManager.TOKEN_TTL_MS
    });
    this.persistPendingApprovals();
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
    this.pendingTokens.delete(token);
    this.persistPendingApprovals();
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
