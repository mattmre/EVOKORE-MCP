import fs from "fs/promises";
import path from "path";
import yaml from "yaml";

const PERMISSIONS_FILE = path.resolve(__dirname, "../permissions.yml");

export class SecurityManager {
  private rules: Record<string, string> = {};

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
}
