"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProxyManager = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const index_js_1 = require("@modelcontextprotocol/sdk/client/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/client/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const CONFIG_FILE = path_1.default.resolve(__dirname, "../mcp.config.json");
class ProxyManager {
    clients = new Map();
    transports = new Map();
    toolRegistry = new Map();
    cachedTools = [];
    security;
    constructor(security) {
        this.security = security;
    }
    async loadServers() {
        this.clients.clear();
        this.transports.clear();
        this.toolRegistry.clear();
        this.cachedTools = [];
        try {
            const content = await promises_1.default.readFile(CONFIG_FILE, "utf-8");
            const config = JSON.parse(content);
            if (!config.servers)
                return;
            const isWindows = process.platform === "win32";
            for (const [serverId, serverConfig] of Object.entries(config.servers)) {
                try {
                    console.error(`[EVOKORE] Booting child server: ${serverId}`);
                    let cmd = serverConfig.command;
                    // Apply Windows executable fallback
                    if (isWindows && cmd === "npx") {
                        cmd = "npx.cmd";
                    }
                    const env = { ...process.env, ...serverConfig.env };
                    const transport = new stdio_js_1.StdioClientTransport({
                        command: cmd,
                        args: serverConfig.args || [],
                        env: env,
                        stderr: "inherit"
                    });
                    // Redirect stderr from child to parent's stderr so we can see MCP logs
                    // stderr is piped
                    const client = new index_js_1.Client({ name: `evokore-proxy-${serverId}`, version: "2.0.0" }, { capabilities: {} });
                    await client.connect(transport);
                    this.clients.set(serverId, client);
                    this.transports.set(serverId, transport);
                    // Fetch tools from child and register them
                    const { tools } = await client.listTools();
                    for (const tool of tools) {
                        const prefixedName = `${serverId}_${tool.name}`;
                        this.toolRegistry.set(prefixedName, { serverId, originalName: tool.name });
                        this.cachedTools.push({ ...tool, name: prefixedName });
                    }
                    console.error(`[EVOKORE] Proxied ${tools.length} tools from '${serverId}'`);
                }
                catch (e) {
                    console.error(`[EVOKORE] Failed to boot child server '${serverId}': ${e.message}`);
                }
            }
        }
        catch (e) {
            console.error("[EVOKORE] No mcp.config.json found. Running EVOKORE without proxy execution tools.");
        }
    }
    getProxiedTools() {
        return this.cachedTools;
    }
    canHandle(toolName) {
        return this.toolRegistry.has(toolName);
    }
    async callProxiedTool(toolName, args) {
        const registryEntry = this.toolRegistry.get(toolName);
        if (!registryEntry) {
            throw new types_js_1.McpError(types_js_1.ErrorCode.MethodNotFound, `Tool not found in proxy registry: ${toolName}`);
        }
        const { serverId, originalName } = registryEntry;
        // 1. Security Interceptor Check
        const permission = this.security.checkPermission(toolName);
        if (permission === "deny") {
            throw new types_js_1.McpError(types_js_1.ErrorCode.InvalidRequest, `Execution of '${toolName}' is strictly denied by EVOKORE-MCP security policies.`);
        }
        if (permission === "require_approval") {
            // Return a structured message that forces the LLM to pause and ask the user
            return {
                content: [{
                        type: "text",
                        text: `[EVOKORE-MCP SECURITY INTERCEPTOR] ACTION REQUIRES HUMAN APPROVAL.\n\nYou attempted to call '${toolName}', which modifies the system. You must stop right now and ask the user for explicit permission to execute this tool with these arguments. DO NOT proceed until they say YES.`
                    }],
                isError: true
            };
        }
        const client = this.clients.get(serverId);
        if (!client) {
            throw new types_js_1.McpError(types_js_1.ErrorCode.InternalError, `Client for server '${serverId}' is not connected.`);
        }
        const result = await client.callTool({ name: originalName, arguments: args });
        return result;
    }
}
exports.ProxyManager = ProxyManager;
