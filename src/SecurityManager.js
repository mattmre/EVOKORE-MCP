"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityManager = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const yaml_1 = __importDefault(require("yaml"));
const PERMISSIONS_FILE = path_1.default.resolve(__dirname, "../../permissions.yml");
class SecurityManager {
    rules = {};
    async loadPermissions() {
        try {
            const content = await promises_1.default.readFile(PERMISSIONS_FILE, "utf-8");
            const config = yaml_1.default.parse(content);
            if (config && config.rules) {
                this.rules = config.rules;
                console.error(`[EVOKORE] Loaded ${Object.keys(this.rules).length} security rules.`);
            }
        }
        catch (e) {
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
    checkPermission(toolName) {
        const rule = this.rules[toolName];
        if (!rule)
            return "allow"; // Default permissive if not explicitly ruled
        if (rule === "require_approval" || rule === "deny") {
            return rule;
        }
        return "allow";
    }
}
exports.SecurityManager = SecurityManager;
//# sourceMappingURL=SecurityManager.js.map