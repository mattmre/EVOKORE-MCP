"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EvokoreMCPServer = void 0;
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load Vault Secrets before any proxy spawns
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, "../.env"), quiet: true });
const SkillManager_1 = require("./SkillManager");
const ProxyManager_1 = require("./ProxyManager");
const SecurityManager_1 = require("./SecurityManager");
const ToolCatalogIndex_1 = require("./ToolCatalogIndex");
const DEFAULT_SESSION_ID = "__stdio_default_session__";
const ACTIVATED_TOOL_SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_ACTIVATED_TOOL_SESSIONS = 100;
const SERVER_VERSION = "2.0.2";
class EvokoreMCPServer {
    server;
    skillManager;
    securityManager;
    proxyManager;
    toolCatalog;
    discoveryMode;
    activatedToolSessionsBySession;
    constructor() {
        this.discoveryMode = this.parseToolDiscoveryMode(process.env.EVOKORE_TOOL_DISCOVERY_MODE);
        this.server = new index_js_1.Server({
            name: "evokore-mcp",
            version: SERVER_VERSION,
        }, {
            capabilities: {
                prompts: {},
                resources: {},
                tools: {
                    listChanged: true
                },
            },
            instructions: "EVOKORE-MCP is a multi-server MCP aggregator. Use discover_tools to find available tools, resolve_workflow for skill-based workflows, and proxy_server_status to check child server health.",
        });
        this.securityManager = new SecurityManager_1.SecurityManager();
        this.proxyManager = new ProxyManager_1.ProxyManager(this.securityManager);
        this.skillManager = new SkillManager_1.SkillManager(this.proxyManager);
        this.toolCatalog = new ToolCatalogIndex_1.ToolCatalogIndex(this.skillManager.getTools(), []);
        this.activatedToolSessionsBySession = new Map();
        this.setupHandlers();
        this.server.onerror = (error) => console.error("[MCP Error]", error);
    }
    parseToolDiscoveryMode(value) {
        if (value === "dynamic") {
            return "dynamic";
        }
        if (!value || value === "legacy") {
            return "legacy";
        }
        console.error(`[EVOKORE] Unknown EVOKORE_TOOL_DISCOVERY_MODE '${value}'. Falling back to legacy mode.`);
        return "legacy";
    }
    rebuildToolCatalog() {
        this.toolCatalog = new ToolCatalogIndex_1.ToolCatalogIndex(this.skillManager.getTools(), this.proxyManager.getProxiedTools());
    }
    getSessionId(extra) {
        return extra?.sessionId ?? DEFAULT_SESSION_ID;
    }
    isSessionStateStale(state, now = Date.now()) {
        return (now - state.lastTouchedAt) > ACTIVATED_TOOL_SESSION_TTL_MS;
    }
    pruneActivatedToolSessions(now = Date.now(), reservedSessionId) {
        for (const [sessionId, state] of this.activatedToolSessionsBySession.entries()) {
            if (sessionId !== reservedSessionId && this.isSessionStateStale(state, now)) {
                this.activatedToolSessionsBySession.delete(sessionId);
            }
        }
        const overflow = this.activatedToolSessionsBySession.size - MAX_ACTIVATED_TOOL_SESSIONS + 1;
        if (overflow <= 0) {
            return;
        }
        const evictableSessions = Array.from(this.activatedToolSessionsBySession.entries())
            .filter(([sessionId]) => sessionId !== reservedSessionId)
            .sort((left, right) => left[1].lastTouchedAt - right[1].lastTouchedAt);
        for (let index = 0; index < overflow && index < evictableSessions.length; index += 1) {
            this.activatedToolSessionsBySession.delete(evictableSessions[index][0]);
        }
    }
    getActivatedToolSession(extra) {
        const sessionId = this.getSessionId(extra);
        const now = Date.now();
        const existingState = this.activatedToolSessionsBySession.get(sessionId);
        if (existingState && !this.isSessionStateStale(existingState, now)) {
            existingState.lastTouchedAt = now;
            return existingState;
        }
        if (existingState) {
            this.activatedToolSessionsBySession.delete(sessionId);
        }
        this.pruneActivatedToolSessions(now, sessionId);
        const createdState = {
            tools: new Set(),
            lastTouchedAt: now
        };
        this.activatedToolSessionsBySession.set(sessionId, createdState);
        return createdState;
    }
    getActivatedTools(extra) {
        return this.getActivatedToolSession(extra).tools;
    }
    async notifyToolListChangedIfNeeded(changed) {
        if (!changed || this.discoveryMode !== "dynamic") {
            return;
        }
        try {
            await this.server.sendToolListChanged();
        }
        catch (error) {
            console.error(`[EVOKORE] sendToolListChanged() failed in best-effort mode: ${error?.message || error}`);
        }
    }
    async handleDiscoverTools(args, extra) {
        const query = String(args?.query ?? "").trim();
        const limitValue = typeof args?.limit === "number" ? args.limit : Number(args?.limit);
        const limit = Number.isFinite(limitValue) ? limitValue : 8;
        if (!query) {
            return {
                content: [{ type: "text", text: "Please provide a non-empty discovery query." }],
                isError: true
            };
        }
        const activatedTools = this.getActivatedTools(extra);
        const matches = this.toolCatalog.discover(query, activatedTools, limit);
        if (matches.length === 0) {
            return {
                content: [{
                        type: "text",
                        text: `[EVOKORE TOOL DISCOVERY] No tools matched '${query}'. Hidden proxied tools remain callable by exact name even when they are not listed.`
                    }]
            };
        }
        let activatedCount = 0;
        if (this.discoveryMode === "dynamic") {
            for (const match of matches) {
                if (match.entry.source === "proxy" && !activatedTools.has(match.entry.name)) {
                    activatedTools.add(match.entry.name);
                    activatedCount++;
                }
            }
        }
        const lines = [
            `[EVOKORE TOOL DISCOVERY] mode=${this.discoveryMode}`,
            `Query: ${query}`,
            `Matched ${matches.length} tool(s).`
        ];
        if (this.discoveryMode === "dynamic") {
            lines.push(activatedCount > 0
                ? `Activated ${activatedCount} proxied tool(s) for this session.`
                : "No new proxied tools needed activation for this session.");
        }
        else {
            lines.push("Legacy mode already exposes the full tool list, so discovery does not change tool visibility.");
        }
        lines.push("");
        for (const match of matches) {
            const statusParts = [match.entry.source];
            const isVisible = this.discoveryMode === "legacy" || match.entry.alwaysVisible || activatedTools.has(match.entry.name);
            if (match.entry.serverId) {
                statusParts.push(`server=${match.entry.serverId}`);
            }
            statusParts.push(isVisible ? "visible" : "callable-by-exact-name");
            lines.push(`- ${match.entry.name} [${statusParts.join(", ")}]: ${match.entry.description}`);
        }
        if (this.discoveryMode === "dynamic") {
            lines.push("", "Re-run tools/list to fetch the updated tool projection.");
        }
        await this.notifyToolListChangedIfNeeded(activatedCount > 0);
        return {
            content: [{ type: "text", text: lines.join("\n") }]
        };
    }
    async handleRefreshSkills() {
        const result = await this.skillManager.refreshSkills();
        this.rebuildToolCatalog();
        try {
            await this.server.sendToolListChanged();
        }
        catch (error) {
            console.error(`[EVOKORE] sendToolListChanged() failed after skill refresh: ${error?.message || error}`);
        }
        return {
            content: [{
                    type: "text",
                    text: `Skills refreshed in ${result.refreshTimeMs}ms: ${result.added} added, ${result.removed} removed, ${result.updated} unchanged/updated, ${result.total} total skills indexed.`
                }]
        };
    }
    getServerResources() {
        return [
            {
                uri: "evokore://server/status",
                name: "Server Status",
                mimeType: "application/json",
                description: "Live EVOKORE-MCP server status including version, discovery mode, child server states, and tool counts."
            },
            {
                uri: "evokore://server/config",
                name: "Server Config (Sanitized)",
                mimeType: "application/json",
                description: "EVOKORE-MCP server configuration from mcp.config.json with environment values redacted."
            },
            {
                uri: "evokore://skills/categories",
                name: "Skill Categories",
                mimeType: "application/json",
                description: "Summary of all skill categories with skill counts per category."
            }
        ];
    }
    async readServerResource(uri) {
        if (uri === "evokore://server/status") {
            const serverStates = this.proxyManager.getServerStatusSnapshot();
            const status = {
                version: SERVER_VERSION,
                discoveryMode: this.discoveryMode,
                toolCount: this.toolCatalog.getAllTools().length,
                skillCount: this.skillManager.getSkillCount(),
                childServers: serverStates.map(s => ({
                    id: s.id,
                    status: s.status,
                    connectionType: s.connectionType,
                    registeredToolCount: s.registeredToolCount,
                    errorCount: s.errorCount
                }))
            };
            return {
                contents: [{ uri, mimeType: "application/json", text: JSON.stringify(status, null, 2) }]
            };
        }
        if (uri === "evokore://server/config") {
            const sanitizedConfig = await this.proxyManager.getSanitizedConfig();
            return {
                contents: [{ uri, mimeType: "application/json", text: JSON.stringify(sanitizedConfig, null, 2) }]
            };
        }
        if (uri === "evokore://skills/categories") {
            const categorySummary = this.skillManager.getCategorySummary();
            const result = {
                totalSkills: this.skillManager.getSkillCount(),
                categories: Object.entries(categorySummary)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([name, count]) => ({ name, count }))
            };
            return {
                contents: [{ uri, mimeType: "application/json", text: JSON.stringify(result, null, 2) }]
            };
        }
        throw new types_js_1.McpError(types_js_1.ErrorCode.InvalidParams, "Unknown evokore resource: " + uri);
    }
    setupHandlers() {
        // 1. Resources (Skills + Server-level)
        this.server.setRequestHandler(types_js_1.ListResourcesRequestSchema, async () => {
            const skillResources = this.skillManager.getResources();
            const serverResources = this.getServerResources();
            return { resources: [...serverResources, ...skillResources] };
        });
        this.server.setRequestHandler(types_js_1.ReadResourceRequestSchema, async (request) => {
            const uri = request.params.uri;
            if (uri.startsWith("evokore://")) {
                return await this.readServerResource(uri);
            }
            return this.skillManager.readResource(uri);
        });
        // 2. Prompts (Skill-backed prompt templates)
        this.server.setRequestHandler(types_js_1.ListPromptsRequestSchema, async () => {
            return {
                prompts: [
                    {
                        name: "resolve-workflow",
                        description: "Find the best matching skill/workflow for a given objective",
                        arguments: [
                            { name: "objective", description: "What you want to accomplish", required: true }
                        ]
                    },
                    {
                        name: "skill-help",
                        description: "Get detailed help for a specific skill",
                        arguments: [
                            { name: "skill_name", description: "Name of the skill", required: true }
                        ]
                    },
                    {
                        name: "server-overview",
                        description: "Get an overview of this EVOKORE-MCP server instance",
                        arguments: []
                    }
                ]
            };
        });
        this.server.setRequestHandler(types_js_1.GetPromptRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            switch (name) {
                case "resolve-workflow": {
                    const objective = args?.objective;
                    if (!objective) {
                        throw new types_js_1.McpError(types_js_1.ErrorCode.InvalidParams, "The 'objective' argument is required for the resolve-workflow prompt.");
                    }
                    const resultText = this.skillManager.resolveWorkflowText(objective);
                    return {
                        messages: [
                            {
                                role: "user",
                                content: { type: "text", text: "Find workflows for: " + objective }
                            },
                            {
                                role: "assistant",
                                content: { type: "text", text: resultText }
                            }
                        ]
                    };
                }
                case "skill-help": {
                    const skillName = args?.skill_name;
                    if (!skillName) {
                        throw new types_js_1.McpError(types_js_1.ErrorCode.InvalidParams, "The 'skill_name' argument is required for the skill-help prompt.");
                    }
                    const helpText = this.skillManager.getSkillHelpText(skillName);
                    return {
                        messages: [
                            {
                                role: "user",
                                content: { type: "text", text: "Help for skill: " + skillName }
                            },
                            {
                                role: "assistant",
                                content: { type: "text", text: helpText }
                            }
                        ]
                    };
                }
                case "server-overview": {
                    const toolCount = this.toolCatalog.getAllTools().length;
                    const skillCount = this.skillManager.getSkillCount();
                    const serverStates = this.proxyManager.getServerStatusSnapshot();
                    const categorySummary = this.skillManager.getCategorySummary();
                    const childServerLines = serverStates.map(s => "  - " + s.id + ": " + s.status + " (" + s.connectionType + ", " + s.registeredToolCount + " tools)");
                    const categoryLines = Object.entries(categorySummary)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([cat, count]) => "  - " + cat + ": " + count + " skills");
                    const overviewText = [
                        "EVOKORE-MCP v" + SERVER_VERSION,
                        "Discovery mode: " + this.discoveryMode,
                        "Total tools: " + toolCount,
                        "Total skills: " + skillCount,
                        "",
                        "Child servers (" + serverStates.length + "):",
                        ...(childServerLines.length > 0 ? childServerLines : ["  (none connected)"]),
                        "",
                        "Skill categories:",
                        ...(categoryLines.length > 0 ? categoryLines : ["  (none loaded)"])
                    ].join("\n");
                    return {
                        messages: [
                            {
                                role: "assistant",
                                content: { type: "text", text: overviewText }
                            }
                        ]
                    };
                }
                default:
                    throw new types_js_1.McpError(types_js_1.ErrorCode.MethodNotFound, "Unknown prompt: " + name);
            }
        });
        // 3. Tools (Dynamic Injection & Proxied Actions)
        this.server.setRequestHandler(types_js_1.ListToolsRequestSchema, async (_request, extra) => {
            return {
                tools: this.discoveryMode === "dynamic"
                    ? this.toolCatalog.getProjectedTools(this.getActivatedTools(extra))
                    : this.toolCatalog.getAllTools()
            };
        });
        this.server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request, extra) => {
            const toolName = request.params.name;
            const args = request.params.arguments || {};
            if (toolName === "discover_tools") {
                return await this.handleDiscoverTools(args, extra);
            }
            if (toolName === "refresh_skills") {
                return await this.handleRefreshSkills();
            }
            // Handle Native Skill Tools
            if (this.toolCatalog.isNativeTool(toolName)) {
                return await this.skillManager.handleToolCall(toolName, args);
            }
            // Handle Proxied Execution Tools
            if (this.proxyManager.canHandle(toolName)) {
                return await this.proxyManager.callProxiedTool(toolName, args);
            }
            throw new types_js_1.McpError(types_js_1.ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
        });
    }
    async run() {
        // Load all subsystems sequentially
        await this.securityManager.loadPermissions();
        await this.skillManager.loadSkills();
        const skillStats = this.skillManager.getStats();
        console.error(`[EVOKORE] Skill stats: ${skillStats.totalSkills} skills, ${skillStats.categories.length} categories, loaded in ${skillStats.loadTimeMs}ms, index ~${skillStats.fuseIndexSizeKb}KB`);
        await this.proxyManager.loadServers();
        this.rebuildToolCatalog();
        // Opt-in filesystem watcher for auto-refreshing skills
        if (process.env.EVOKORE_SKILL_WATCHER === "true") {
            this.skillManager.setOnRefreshCallback(() => {
                this.rebuildToolCatalog();
                this.server.sendToolListChanged().catch((err) => {
                    console.error(`[EVOKORE] sendToolListChanged() failed after watcher refresh: ${err?.message || err}`);
                });
            });
            this.skillManager.enableWatcher();
        }
        const transport = new stdio_js_1.StdioServerTransport();
        await this.server.connect(transport);
        console.error(`[EVOKORE] v${SERVER_VERSION} Enterprise Router running on stdio (tool discovery mode: ${this.discoveryMode})`);
    }
}
exports.EvokoreMCPServer = EvokoreMCPServer;
if (require.main === module) {
    const server = new EvokoreMCPServer();
    server.run().catch(console.error);
}
