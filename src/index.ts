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
  McpError,
  Resource
} from "@modelcontextprotocol/sdk/types.js";
import dotenv from "dotenv";
import path from "path";

// Load Vault Secrets before any proxy spawns
dotenv.config({ path: path.resolve(__dirname, "../.env"), quiet: true });

import { SkillManager } from "./SkillManager";
import { ProxyManager } from "./ProxyManager";
import { SecurityManager } from "./SecurityManager";
import { ToolCatalogIndex } from "./ToolCatalogIndex";
import { HttpServer } from "./HttpServer";

type ToolDiscoveryMode = "legacy" | "dynamic";
type RequestExtra = { sessionId?: string };
type ActivatedToolSessionState = {
  tools: Set<string>;
  lastTouchedAt: number;
};

const DEFAULT_SESSION_ID = "__stdio_default_session__";
const ACTIVATED_TOOL_SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_ACTIVATED_TOOL_SESSIONS = 100;

const SERVER_VERSION = "3.0.0";

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

  private getListedToolNames(extra?: RequestExtra): string[] {
    const tools = this.discoveryMode === "dynamic"
      ? this.toolCatalog.getProjectedTools(this.getActivatedTools(extra))
      : this.toolCatalog.getAllTools();

    return tools.map((tool) => tool.name).sort();
  }

  private didListedToolSetChange(previous: string[], next: string[]): boolean {
    if (previous.length !== next.length) {
      return true;
    }

    return previous.some((name, index) => name !== next[index]);
  }

  private async bootProxyServersInBackground(): Promise<void> {
    const listedToolsBeforeBoot = this.getListedToolNames();

    try {
      await this.proxyManager.loadServers();
      this.rebuildToolCatalog();

      const listedToolsAfterBoot = this.getListedToolNames();
      const listedToolsChanged = this.didListedToolSetChange(listedToolsBeforeBoot, listedToolsAfterBoot);
      const proxiedToolCount = this.proxyManager.getProxiedTools().length;

      console.error(`[EVOKORE] Proxy bootstrap complete: ${proxiedToolCount} proxied tool(s) registered.`);

      if (listedToolsChanged) {
        try {
          await this.server.sendToolListChanged();
        } catch (error: any) {
          console.error(`[EVOKORE] sendToolListChanged() failed after proxy bootstrap: ${error?.message || error}`);
        }
      }
    } catch (error: any) {
      console.error(`[EVOKORE] Background proxy bootstrap failed: ${error?.message || error}`);
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

  private async handleRefreshSkills(): Promise<any> {
    const result = await this.skillManager.refreshSkills();
    this.rebuildToolCatalog();

    try {
      await this.server.sendToolListChanged();
    } catch (error: any) {
      console.error(`[EVOKORE] sendToolListChanged() failed after skill refresh: ${error?.message || error}`);
    }

    return {
      content: [{
        type: "text",
        text: `Skills refreshed in ${result.refreshTimeMs}ms: ${result.added} added, ${result.removed} removed, ${result.updated} unchanged/updated, ${result.total} total skills indexed.`
      }]
    };
  }

  private async handleFetchSkill(args: any): Promise<any> {
    // Delegate to SkillManager for the fetch, then auto-refresh the index
    const result = await this.skillManager.handleToolCall("fetch_skill", args);

    // If the fetch succeeded (no isError), auto-refresh the skill index
    if (!result.isError) {
      try {
        await this.skillManager.refreshSkills();
        this.rebuildToolCatalog();
        await this.server.sendToolListChanged();

        // Append a refresh note to the response
        const originalText = result.content?.[0]?.text || "";
        result.content = [{
          type: "text",
          text: originalText + " Index auto-refreshed."
        }];
      } catch (error: any) {
        console.error(`[EVOKORE] Auto-refresh after fetch_skill failed: ${error?.message || error}`);
      }
    }

    return result;
  }

  private getServerResources(): Resource[] {
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

  private async readServerResource(uri: string): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
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

    throw new McpError(ErrorCode.InvalidParams, "Unknown evokore resource: " + uri);
  }

  private setupHandlers() {
    // 1. Resources (Skills + Server-level)
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const skillResources = this.skillManager.getResources();
      const serverResources = this.getServerResources();
      return { resources: [...serverResources, ...skillResources] };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;
      if (uri.startsWith("evokore://")) {
        return await this.readServerResource(uri);
      }
      return this.skillManager.readResource(uri);
    });

    // 2. Prompts (Skill-backed prompt templates)
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
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

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case "resolve-workflow": {
          const objective = args?.objective;
          if (!objective) {
            throw new McpError(ErrorCode.InvalidParams, "The 'objective' argument is required for the resolve-workflow prompt.");
          }
          const resultText = this.skillManager.resolveWorkflowText(objective);
          return {
            messages: [
              {
                role: "user" as const,
                content: { type: "text" as const, text: "Find workflows for: " + objective }
              },
              {
                role: "assistant" as const,
                content: { type: "text" as const, text: resultText }
              }
            ]
          };
        }

        case "skill-help": {
          const skillName = args?.skill_name;
          if (!skillName) {
            throw new McpError(ErrorCode.InvalidParams, "The 'skill_name' argument is required for the skill-help prompt.");
          }
          const helpText = this.skillManager.getSkillHelpText(skillName);
          return {
            messages: [
              {
                role: "user" as const,
                content: { type: "text" as const, text: "Help for skill: " + skillName }
              },
              {
                role: "assistant" as const,
                content: { type: "text" as const, text: helpText }
              }
            ]
          };
        }

        case "server-overview": {
          const toolCount = this.toolCatalog.getAllTools().length;
          const skillCount = this.skillManager.getSkillCount();
          const serverStates = this.proxyManager.getServerStatusSnapshot();
          const categorySummary = this.skillManager.getCategorySummary();

          const childServerLines = serverStates.map(s =>
            "  - " + s.id + ": " + s.status + " (" + s.connectionType + ", " + s.registeredToolCount + " tools)"
          );

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
                role: "assistant" as const,
                content: { type: "text" as const, text: overviewText }
              }
            ]
          };
        }

        default:
          throw new McpError(ErrorCode.MethodNotFound, "Unknown prompt: " + name);
      }
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

      if (toolName === "refresh_skills") {
        return await this.handleRefreshSkills();
      }

      if (toolName === "fetch_skill") {
        return await this.handleFetchSkill(args);
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

  private async loadSubsystems(): Promise<void> {
    await this.securityManager.loadPermissions();
    await this.skillManager.loadSkills();
    const skillStats = this.skillManager.getStats();
    console.error(`[EVOKORE] Skill stats: ${skillStats.totalSkills} skills, ${skillStats.categories.length} categories, loaded in ${skillStats.loadTimeMs}ms, index ~${skillStats.fuseIndexSizeKb}KB`);
    this.rebuildToolCatalog();

    // Opt-in filesystem watcher for auto-refreshing skills
    if (process.env.EVOKORE_SKILL_WATCHER === "true") {
      this.skillManager.setOnRefreshCallback(() => {
        this.rebuildToolCatalog();
        this.server.sendToolListChanged().catch((err: any) => {
          console.error(`[EVOKORE] sendToolListChanged() failed after watcher refresh: ${err?.message || err}`);
        });
      });
      this.skillManager.enableWatcher();
    }
  }

  async run() {
    // Load all subsystems sequentially
    await this.loadSubsystems();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`[EVOKORE] v${SERVER_VERSION} Enterprise Router running on stdio (tool discovery mode: ${this.discoveryMode})`);
    this.bootProxyServersInBackground().catch((err) =>
      console.error('[EVOKORE] Fatal: background proxy boot threw unexpectedly:', err)
    );
  }

  async runHttp(): Promise<HttpServer> {
    await this.loadSubsystems();

    const httpServer = new HttpServer(this.server);
    await httpServer.start();

    const addr = httpServer.getAddress();
    console.error(`[EVOKORE] v${SERVER_VERSION} Enterprise Router running on HTTP at http://${addr.host}:${addr.port} (tool discovery mode: ${this.discoveryMode})`);

    this.bootProxyServersInBackground().catch((err) =>
      console.error('[EVOKORE] Fatal: background proxy boot threw unexpectedly:', err)
    );

    // Graceful shutdown
    const shutdown = async () => {
      console.error("[EVOKORE] Shutting down HTTP server...");
      await httpServer.stop();
      process.exit(0);
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);

    return httpServer;
  }
}

if (require.main === module) {
  const server = new EvokoreMCPServer();
  const isHttpMode = process.env.EVOKORE_HTTP_MODE === "true" || process.argv.includes("--http");

  if (isHttpMode) {
    server.runHttp().catch(console.error);
  } else {
    server.run().catch(console.error);
  }
}
