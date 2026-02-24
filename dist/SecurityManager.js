"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityManager = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const yaml_1 = __importDefault(require("yaml"));
const crypto_1 = __importDefault(require("crypto"));
const PERMISSIONS_FILE = path_1.default.resolve(__dirname, "../permissions.yml");
class SecurityManager {
    rules = {};
    pendingTokens = new Map();
    static TOKEN_TTL_MS = 5 * 60 * 1000;
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
    normalizeValue(value) {
        if (Array.isArray(value)) {
            return value.map((item) => this.normalizeValue(item));
        }
        if (value && typeof value === "object") {
            const normalized = {};
            for (const key of Object.keys(value).sort()) {
                normalized[key] = this.normalizeValue(value[key]);
            }
            return normalized;
        }
        return value;
    }
    hashArgs(args) {
        const normalizedArgs = this.normalizeValue(args ?? {});
        return crypto_1.default.createHash("sha256").update(JSON.stringify(normalizedArgs)).digest("hex");
    }
    purgeExpiredTokens() {
        const now = Date.now();
        for (const [token, metadata] of this.pendingTokens.entries()) {
            if (metadata.expiresAt < now) {
                this.pendingTokens.delete(token);
            }
        }
    }
    generateToken(toolName, args) {
        this.purgeExpiredTokens();
        const token = crypto_1.default.randomBytes(16).toString("hex");
        this.pendingTokens.set(token, {
            toolName,
            argsHash: this.hashArgs(args),
            expiresAt: Date.now() + SecurityManager.TOKEN_TTL_MS
        });
        return token;
    }
    validateToken(toolName, token, args) {
        this.purgeExpiredTokens();
        const metadata = this.pendingTokens.get(token);
        if (!metadata)
            return false;
        if (metadata.toolName !== toolName)
            return false;
        if (metadata.expiresAt < Date.now())
            return false;
        return metadata.argsHash === this.hashArgs(args);
    }
    consumeToken(token) {
        this.pendingTokens.delete(token);
    }
}
exports.SecurityManager = SecurityManager;
