import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  GetPromptRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import dotenv from "dotenv";
import path from "path";

// Load Vault Secrets before any proxy spawns
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { SkillManager } from "./SkillManager";
import { ProxyManager } from "./ProxyManager";
import { SecurityManager } from "./SecurityManager";

class EvokoreMCPServer {
  private server: Server;
  private skillManager: SkillManager;
  private securityManager: SecurityManager;
  private proxyManager: ProxyManager;

  constructor() {
    this.server = new Server(
      {
        name: "evokore-mcp",
        version: "2.0.0",
      },
      {
        capabilities: {
          prompts: {},
          resources: {},
          tools: {},
        },
      }
    );

    this.skillManager = new SkillManager();
    this.securityManager = new SecurityManager();
    this.proxyManager = new ProxyManager(this.securityManager);

    this.setupHandlers();
    this.server.onerror = (error) => console.error("[MCP Error]", error);
  }

  private setupHandlers() {
    // 1. Resources (Static File Serving)
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return { resources: this.skillManager.getResources() };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      return this.skillManager.readResource(request.params.uri);
    });

    // 2. Prompts (Deprecated in V2: Exposing via Tool instead to prevent Context Bloat)
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return { prompts: [] }; // Return empty to prevent massive context payloads in V2
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async () => {
      throw new McpError(ErrorCode.MethodNotFound, "Prompts are disabled in EVOKORE v2. Use the 'resolve_workflow' tool instead.");
    });

    // 3. Tools (Dynamic Injection & Proxied Actions)
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const nativeTools = this.skillManager.getTools();
      const proxiedTools = this.proxyManager.getProxiedTools();
      return {
        tools: [...nativeTools, ...proxiedTools]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
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

      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
    });
  }

  async run() {
    // Load all subsystems sequentially
    await this.securityManager.loadPermissions();
    await this.skillManager.loadSkills();
    await this.proxyManager.loadServers();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("[EVOKORE] v2.0 Enterprise Router running on stdio");
  }
}

const server = new EvokoreMCPServer();
server.run().catch(console.error);
