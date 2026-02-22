"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load Vault Secrets before any proxy spawns
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, "../../.env") });
const SkillManager_1 = require("./SkillManager");
const ProxyManager_1 = require("./ProxyManager");
const SecurityManager_1 = require("./SecurityManager");
class EvokoreMCPServer {
    server;
    skillManager;
    securityManager;
    proxyManager;
    constructor() {
        this.server = new index_js_1.Server({
            name: "evokore-mcp",
            version: "2.0.0",
        }, {
            capabilities: {
                prompts: {},
                resources: {},
                tools: {},
            },
        });
        this.skillManager = new SkillManager_1.SkillManager();
        this.securityManager = new SecurityManager_1.SecurityManager();
        this.proxyManager = new ProxyManager_1.ProxyManager(this.securityManager);
        this.setupHandlers();
        this.server.onerror = (error) => console.error("[MCP Error]", error);
    }
    setupHandlers() {
        // 1. Resources (Static File Serving)
        this.server.setRequestHandler(types_js_1.ListResourcesRequestSchema, async () => {
            return { resources: this.skillManager.getResources() };
        });
        this.server.setRequestHandler(types_js_1.ReadResourceRequestSchema, async (request) => {
            return this.skillManager.readResource(request.params.uri);
        });
        // 2. Prompts (Deprecated in V2: Exposing via Tool instead to prevent Context Bloat)
        this.server.setRequestHandler(types_js_1.ListPromptsRequestSchema, async () => {
            return { prompts: [] }; // Return empty to prevent massive context payloads in V2
        });
        this.server.setRequestHandler(types_js_1.GetPromptRequestSchema, async () => {
            throw new types_js_1.McpError(types_js_1.ErrorCode.MethodNotFound, "Prompts are disabled in EVOKORE v2. Use the 'resolve_workflow' tool instead.");
        });
        // 3. Tools (Dynamic Injection & Proxied Actions)
        this.server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => {
            const nativeTools = this.skillManager.getTools();
            const proxiedTools = this.proxyManager.getProxiedTools();
            return {
                tools: [...nativeTools, ...proxiedTools]
            };
        });
        this.server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
            const toolName = request.params.name;
            const args = request.params.arguments || {};
            // Handle Native Skill Tools
            if (["resolve_workflow", "search_skills", "get_skill_help"].includes(toolName)) {
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
        await this.proxyManager.loadServers();
        const transport = new stdio_js_1.StdioServerTransport();
        await this.server.connect(transport);
        console.error("[EVOKORE] v2.0 Enterprise Router running on stdio");
    }
}
const server = new EvokoreMCPServer();
server.run().catch(console.error);
//# sourceMappingURL=index.js.map