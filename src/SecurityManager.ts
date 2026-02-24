import fs from "fs/promises";
import path from "path";
import yaml from "yaml";

import crypto from "crypto";

const PERMISSIONS_FILE = path.resolve(__dirname, "../permissions.yml");

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
    return token;
  }

  validateToken(toolName: string, token: string, args: any): boolean {
    this.purgeExpiredTokens();
    const metadata = this.pendingTokens.get(token);
    if (!metadata) return false;
    if (metadata.toolName !== toolName) return false;
    if (metadata.expiresAt < Date.now()) return false;
    return metadata.argsHash === this.hashArgs(args);
  }

  consumeToken(token: string) {
    this.pendingTokens.delete(token);
  }
}
