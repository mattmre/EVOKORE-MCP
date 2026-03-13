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
dotenv.config({ path: path.resolve(__dirname, "../.env"), quiet: true });

import { SkillManager } from "./SkillManager";
import { ProxyManager } from "./ProxyManager";
import { SecurityManager } from "./SecurityManager";
import { ToolCatalogIndex } from "./ToolCatalogIndex";

type ToolDiscoveryMode = "legacy" | "dynamic";
type RequestExtra = { sessionId?: string };
type ActivatedToolSessionState = {
  tools: Set<string>;
  lastTouchedAt: number;
};

const DEFAULT_SESSION_ID = "__stdio_default_session__";
const ACTIVATED_TOOL_SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_ACTIVATED_TOOL_SESSIONS = 100;

const SERVER_VERSION = "2.0.2";

export class EvokoreMCPServer {
  private server: Server;
  private skillManager: SkillManager;
  private securityManager: SecurityManager;
  private proxyManager: ProxyManager;
  private toolCatalog: ToolCatalogIndex;
  private discoveryMode: ToolDiscoveryMode;
  private activatedToolSessionsBySession: Map<string, ActivatedToolSessionState>;

  constructor() {
    this.discoveryMode = this.parseToolDiscoveryMode(process.env.EVOKORE_TOOL_DISCOVERY_MODE);
    this.server = new Server(
      {
        name: "evokore-mcp",
        version: SERVER_VERSION,
      },
      {
        capabilities: {
          prompts: {},
          resources: {},
          tools: {
            listChanged: true
          },
        },
        instructions: "EVOKORE-MCP is a multi-server MCP aggregator. Use discover_tools to find available tools, resolve_workflow for skill-based workflows, and proxy_server_status to check child server health.",
      }
    );

    this.securityManager = new SecurityManager();
    this.proxyManager = new ProxyManager(this.securityManager);
    this.skillManager = new SkillManager(this.proxyManager);
    this.toolCatalog = new ToolCatalogIndex(this.skillManager.getTools(), []);
    this.activatedToolSessionsBySession = new Map();

    this.setupHandlers();
    this.server.onerror = (error) => console.error("[MCP Error]", error);
  }

  private parseToolDiscoveryMode(value?: string): ToolDiscoveryMode {
    if (value === "dynamic") {
      return "dynamic";
    }

    if (!value || value === "legacy") {
      return "legacy";
    }

    console.error(`[EVOKORE] Unknown EVOKORE_TOOL_DISCOVERY_MODE '${value}'. Falling back to legacy mode.`);
    return "legacy";
  }

  private rebuildToolCatalog() {
    this.toolCatalog = new ToolCatalogIndex(this.skillManager.getTools(), this.proxyManager.getProxiedTools());
  }

  private getSessionId(extra?: RequestExtra): string {
    return extra?.sessionId ?? DEFAULT_SESSION_ID;
  }

  private isSessionStateStale(state: ActivatedToolSessionState, now = Date.now()): boolean {
    return (now - state.lastTouchedAt) > ACTIVATED_TOOL_SESSION_TTL_MS;
  }

  private pruneActivatedToolSessions(now = Date.now(), reservedSessionId?: string) {
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

  private getActivatedToolSession(extra?: RequestExtra): ActivatedToolSessionState {
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

    const createdState: ActivatedToolSessionState = {
      tools: new Set<string>(),
      lastTouchedAt: now
    };

    this.activatedToolSessionsBySession.set(sessionId, createdState);
    return createdState;
  }

  private getActivatedTools(extra?: RequestExtra): Set<string> {
    return this.getActivatedToolSession(extra).tools;
  }

  private async notifyToolListChangedIfNeeded(changed: boolean) {
    if (!changed || this.discoveryMode !== "dynamic") {
      return;
    }

    try {
      await this.server.sendToolListChanged();
    } catch (error: any) {
      console.error(`[EVOKORE] sendToolListChanged() failed in best-effort mode: ${error?.message || error}`);
    }
  }

  private async handleDiscoverTools(args: any, extra?: RequestExtra): Promise<any> {
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
      lines.push(
        activatedCount > 0
          ? `Activated ${activatedCount} proxied tool(s) for this session.`
          : "No new proxied tools needed activation for this session."
      );
    } else {
      lines.push("Legacy mode already exposes the full tool list, so discovery does not change tool visibility.");
    }

    lines.push("");
    for (const match of matches) {
      const statusParts: string[] = [match.entry.source];
      const isVisible = this.discoveryMode === "legacy" || match.entry.alwaysVisible || activatedTools.has(match.entry.name);
      if (match.entry.serverId) {
        statusParts.push(`server=${match.entry.serverId}`);
      }
      statusParts.push(
        isVisible ? "visible" : "callable-by-exact-name"
      );
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
    this.server.setRequestHandler(ListToolsRequestSchema, async (_request, extra) => {
      return {
        tools: this.discoveryMode === "dynamic"
          ? this.toolCatalog.getProjectedTools(this.getActivatedTools(extra))
          : this.toolCatalog.getAllTools()
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const toolName = request.params.name;
      const args = request.params.arguments || {};

      if (toolName === "discover_tools") {
        return await this.handleDiscoverTools(args, extra);
      }

      // Handle Native Skill Tools
      if (this.toolCatalog.isNativeTool(toolName)) {
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
    const skillStats = this.skillManager.getStats();
    console.error(`[EVOKORE] Skill stats: ${skillStats.totalSkills} skills, ${skillStats.categories.length} categories, loaded in ${skillStats.loadTimeMs}ms, index ~${skillStats.fuseIndexSizeKb}KB`);
    await this.proxyManager.loadServers();
    this.rebuildToolCatalog();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
        console.error(`[EVOKORE] v${SERVER_VERSION} Enterprise Router running on stdio (tool discovery mode: ${this.discoveryMode})`);
  }
}

if (require.main === module) {
  const server = new EvokoreMCPServer();
  server.run().catch(console.error);
}
