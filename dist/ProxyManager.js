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
const resolveCommandForPlatform_1 = require("./utils/resolveCommandForPlatform");
const CONFIG_FILE = path_1.default.resolve(__dirname, "../mcp.config.json");
const ENV_PLACEHOLDER_REGEX = /\$\{(\w+)\}/g;
class ProxyManager {
    clients = new Map();
    transports = new Map();
    toolRegistry = new Map();
    cachedTools = [];
    security;
    serverRegistry = new Map();
    toolCooldowns = new Map();
    constructor(security) {
        this.security = security;
    }
    resolveServerEnv(serverId, serverEnv) {
        const resolvedEnv = {};
        if (!serverEnv)
            return resolvedEnv;
        for (const [key, value] of Object.entries(serverEnv)) {
            const missingVars = new Set();
            const resolvedValue = value.replace(ENV_PLACEHOLDER_REGEX, (_match, varName) => {
                const envValue = process.env[varName];
                if (envValue === undefined) {
                    missingVars.add(varName);
                    return "";
                }
                return envValue;
            });
            if (missingVars.size > 0) {
                const missingList = Array.from(missingVars).map((varName) => `\${${varName}}`).join(", ");
                throw new Error(`Unresolved env placeholder(s) for child server '${serverId}' key '${key}': ${missingList}`);
            }
            resolvedEnv[key] = resolvedValue;
        }
        return resolvedEnv;
    }
    async loadServers() {
        this.clients.clear();
        this.transports.clear();
        this.toolRegistry.clear();
        this.cachedTools = [];
        this.serverRegistry.clear();
        try {
            const content = await promises_1.default.readFile(CONFIG_FILE, "utf-8");
            const config = JSON.parse(content);
            if (!config.servers)
                return;
            for (const [serverId, serverConfig] of Object.entries(config.servers)) {
                try {
                    console.error(`[EVOKORE] Booting child server: ${serverId}`);
                    this.serverRegistry.set(serverId, {
                        id: serverId,
                        status: 'booting',
                        connectionType: 'stdio',
                        errorCount: 0,
                        lastPing: Date.now()
                    });
                    const cmd = (0, resolveCommandForPlatform_1.resolveCommandForPlatform)(serverConfig.command);
                    // Resolve ${VAR} references in env values from process.env
                    const resolvedEnv = this.resolveServerEnv(serverId, serverConfig.env);
                    const env = { ...process.env, ...resolvedEnv };
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
                    const serverState = this.serverRegistry.get(serverId);
                    if (serverState) {
                        serverState.status = 'connected';
                        serverState.lastPing = Date.now();
                    }
                    // Fetch tools from child and register them
                    const { tools } = await client.listTools();
                    let registeredCount = 0;
                    let skippedDuplicates = 0;
                    for (const tool of tools) {
                        const prefixedName = `${serverId}_${tool.name}`;
                        if (this.toolRegistry.has(prefixedName)) {
                            console.error(`[EVOKORE] Skipping duplicate proxied tool '${prefixedName}' from server '${serverId}' (already registered).`);
                            skippedDuplicates++;
                            continue;
                        }
                        this.toolRegistry.set(prefixedName, { serverId, originalName: tool.name });
                        // Clone tool to modify input schema safely
                        const modifiedTool = JSON.parse(JSON.stringify(tool));
                        modifiedTool.name = prefixedName;
                        if (modifiedTool.inputSchema && modifiedTool.inputSchema.properties) {
                            modifiedTool.inputSchema.properties._evokore_approval_token = {
                                type: "string",
                                description: "If this tool requires approval, the server will return an error with a token. Ask the user for permission, and if granted, retry the tool call with this token."
                            };
                        }
                        this.cachedTools.push(modifiedTool);
                        registeredCount++;
                    }
                    const duplicateSuffix = skippedDuplicates > 0 ? ` (${skippedDuplicates} duplicate(s) skipped)` : "";
                    console.error(`[EVOKORE] Proxied ${registeredCount} tools from '${serverId}'${duplicateSuffix}`);
                    if (skippedDuplicates > 0) {
                        console.error(`[EVOKORE] Duplicate collision summary: ${JSON.stringify({
                            serverId,
                            skippedDuplicates,
                            policy: "first_registration_wins"
                        })}`);
                    }
                }
                catch (e) {
                    console.error(`[EVOKORE] Failed to boot child server '${serverId}': ${e.message}`);
                    const serverState = this.serverRegistry.get(serverId);
                    if (serverState) {
                        serverState.status = 'error';
                        serverState.errorCount++;
                    }
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
        const toolArgs = { ...(args || {}) };
        // Extract and remove the EVOKORE approval token so the child server doesn't complain about unknown args
        const providedToken = toolArgs._evokore_approval_token;
        delete toolArgs._evokore_approval_token;
        // 1. Security Interceptor Check
        const permission = this.security.checkPermission(toolName);
        if (permission === "deny") {
            throw new types_js_1.McpError(types_js_1.ErrorCode.InvalidRequest, `Execution of '${toolName}' is strictly denied by EVOKORE-MCP security policies.`);
        }
        if (permission === "require_approval") {
            if (!providedToken || !this.security.validateToken(toolName, providedToken, toolArgs)) {
                const newToken = this.security.generateToken(toolName, toolArgs);
                return {
                    content: [{
                            type: "text",
                            text: `[EVOKORE-MCP SECURITY INTERCEPTOR] ACTION REQUIRES HUMAN APPROVAL.\n\nYou attempted to call '${toolName}'. You must stop right now and ask the user for explicit permission to execute this tool with these arguments. DO NOT proceed until they say YES.\n\nIf they approve, retry this exact same tool call but add the argument '_evokore_approval_token' with the value '${newToken}'.`
                        }],
                    isError: true
                };
            }
            // Valid token provided. Consume it so it can't be reused, then proceed.
            this.security.consumeToken(providedToken);
        }
        // 2. Cooldown Check
        const cooldownExpires = this.toolCooldowns.get(toolName);
        if (cooldownExpires && Date.now() < cooldownExpires) {
            const remainingSeconds = Math.ceil((cooldownExpires - Date.now()) / 1000);
            return {
                content: [{
                        type: "text",
                        text: `[EVOKORE COOLDOWN] Tool '${toolName}' is currently on cooldown to prevent infinite loops. Please wait ${remainingSeconds} seconds or try a different approach.`
                    }],
                isError: true
            };
        }
        const client = this.clients.get(serverId);
        if (!client) {
            throw new types_js_1.McpError(types_js_1.ErrorCode.InternalError, `Client for server '${serverId}' is not connected.`);
        }
        const serverState = this.serverRegistry.get(serverId);
        if (serverState) {
            serverState.lastPing = Date.now();
        }
        try {
            const result = await client.callTool({ name: originalName, arguments: toolArgs });
            // Analyze Result for Cooldown
            let shouldCooldown = false;
            if (result.isError) {
                shouldCooldown = true;
            }
            else if (!result.content || result.content.length === 0) {
                shouldCooldown = true;
            }
            else if (result.content[0].type === "text" && result.content[0].text.length < 15) {
                shouldCooldown = true;
            }
            if (shouldCooldown) {
                this.toolCooldowns.set(toolName, Date.now() + 10000); // 10 seconds
            }
            return result;
        }
        catch (e) {
            if (serverState) {
                serverState.errorCount++;
                if (serverState.errorCount >= 5) {
                    serverState.status = 'error';
                }
            }
            this.toolCooldowns.set(toolName, Date.now() + 10000); // 10 seconds cooldown on throw
            throw e;
        }
    }
}
exports.ProxyManager = ProxyManager;
