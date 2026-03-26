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

import { SkillManager, SkillExecutionContext } from "./SkillManager";
import { ProxyManager } from "./ProxyManager";
import { SecurityManager } from "./SecurityManager";
import { ToolCatalogIndex } from "./ToolCatalogIndex";
import { PluginManager } from "./PluginManager";
import { HttpServer } from "./HttpServer";
import { WebhookManager } from "./WebhookManager";
import { SessionIsolation } from "./SessionIsolation";
import { FileSessionStore } from "./stores/FileSessionStore";
import { loadAuthConfig } from "./auth/OAuthProvider";
import { TelemetryManager } from "./TelemetryManager";
import { RegistryManager } from "./RegistryManager";
import { AuditLog } from "./AuditLog";

type ToolDiscoveryMode = "legacy" | "dynamic";
type RequestExtra = { sessionId?: string };

const DEFAULT_SESSION_ID = "__stdio_default_session__";

const SERVER_VERSION = "3.1.0";

export interface EvokoreMCPServerOptions {
  /** When true, SessionIsolation uses FileSessionStore for persistence. */
  httpMode?: boolean;
}

export class EvokoreMCPServer {
  private server: Server;
  private skillManager: SkillManager;
  private securityManager: SecurityManager;
  private proxyManager: ProxyManager;
  private pluginManager: PluginManager;
  private toolCatalog: ToolCatalogIndex;
  private webhookManager: WebhookManager;
  private telemetryManager: TelemetryManager;
  private registryManager: RegistryManager;
  private auditLog: AuditLog;
  private discoveryMode: ToolDiscoveryMode;
  private sessionIsolation: SessionIsolation;

  constructor(options?: EvokoreMCPServerOptions) {
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
    this.webhookManager = new WebhookManager();
    this.proxyManager = new ProxyManager(this.securityManager, this.webhookManager);
    this.pluginManager = new PluginManager(this.webhookManager);
    this.telemetryManager = new TelemetryManager();
    this.registryManager = new RegistryManager();
    this.auditLog = AuditLog.getInstance();
    this.skillManager = new SkillManager(this.proxyManager, this.registryManager);
    this.toolCatalog = new ToolCatalogIndex(this.skillManager.getTools(), []);

    // In HTTP mode, use FileSessionStore for persistence unless explicitly overridden
    const storeOverride = process.env.EVOKORE_SESSION_STORE;
    if (options?.httpMode && storeOverride !== "memory") {
      const ttlMs = parseInt(process.env.EVOKORE_SESSION_TTL_MS || "3600000", 10);
      this.sessionIsolation = new SessionIsolation({
        store: new FileSessionStore(),
        ttlMs: Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : undefined,
      });
    } else {
      this.sessionIsolation = new SessionIsolation();
    }

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
    const nativeTools = [
      ...this.skillManager.getTools(),
      ...this.pluginManager.getTools(),
      ...this.telemetryManager.getTools(),
    ];
    this.toolCatalog = new ToolCatalogIndex(nativeTools, this.proxyManager.getProxiedTools());
  }

  private getSessionId(extra?: RequestExtra): string {
    return extra?.sessionId ?? DEFAULT_SESSION_ID;
  }

  /**
   * Returns the activated tools set for the given session.
   * If the session does not exist yet (e.g. first access in stdio mode),
   * it is created on-demand via SessionIsolation.
   */
  private getActivatedTools(extra?: RequestExtra): Set<string> {
    const sessionId = this.getSessionId(extra);
    let session = this.sessionIsolation.getSession(sessionId);
    if (!session) {
      session = this.sessionIsolation.createSession(sessionId);
    }
    return session.activatedTools;
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

    // Persist session state if tool activation changed
    if (activatedCount > 0) {
      const sessionId = this.getSessionId(extra);
      this.sessionIsolation.persistSession(sessionId).catch(() => {
        // Best-effort persistence; errors are non-fatal
      });
    }

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

  private async handleReloadPlugins(): Promise<any> {
    const result = await this.pluginManager.loadPlugins();
    this.rebuildToolCatalog();

    try {
      await this.server.sendToolListChanged();
    } catch (error: any) {
      console.error(`[EVOKORE] sendToolListChanged() failed after plugin reload: ${error?.message || error}`);
    }

    const lines = [
      `Plugins reloaded in ${result.loadTimeMs}ms: ${result.loaded} loaded, ${result.failed} failed, ${result.totalTools} tools, ${result.totalResources} resources.`
    ];

    if (result.errors.length > 0) {
      lines.push("");
      lines.push("Errors:");
      for (const err of result.errors) {
        lines.push(`  - ${err.file}: ${err.error}`);
      }
    }

    const loadedPlugins = this.pluginManager.getLoadedPlugins();
    if (loadedPlugins.length > 0) {
      lines.push("");
      lines.push("Loaded plugins:");
      for (const p of loadedPlugins) {
        lines.push(`  - ${p.name} v${p.version} (${p.toolCount} tools, ${p.resourceCount} resources)`);
      }
    }

    return {
      content: [{ type: "text", text: lines.join("\n") }]
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

  private redactSensitiveArgs(args: Record<string, unknown>): Record<string, unknown> {
    const sensitiveKeys = ['_evokore_approval_token', 'password', 'secret', 'token', 'key', 'credential', 'api_key', 'apiKey', 'access_token', 'accessToken'];
    const redacted: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(args)) {
      redacted[k] = sensitiveKeys.some(sk => k.toLowerCase().includes(sk.toLowerCase())) ? '[REDACTED]' : v;
    }
    return redacted;
  }

  private setupHandlers() {
    // 1. Resources (Skills + Server-level)
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const skillResources = this.skillManager.getResources();
      const serverResources = this.getServerResources();
      const pluginResources = this.pluginManager.getResources();
      return { resources: [...serverResources, ...pluginResources, ...skillResources] };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;
      if (uri.startsWith("evokore://")) {
        return await this.readServerResource(uri);
      }
      // Check if a plugin owns this resource
      if (this.pluginManager.isPluginResource(uri)) {
        const pluginResult = await this.pluginManager.handleResourceRead(uri);
        if (pluginResult) {
          return pluginResult;
        }
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

      // Selective audit logging for admin/config/approval tools
      const AUDITED_TOOLS = new Set(["reload_plugins", "reset_telemetry", "refresh_skills", "fetch_skill"]);
      const shouldAudit = AUDITED_TOOLS.has(toolName) || toolName.includes("approval");

      // Determine tool source for webhook metadata
      let source: string;
      if (toolName === "discover_tools" || toolName === "refresh_skills" || toolName === "fetch_skill" || toolName === "reload_plugins") {
        source = "builtin";
      } else if (this.telemetryManager.isTelemetryTool(toolName)) {
        source = "builtin";
      } else if (this.pluginManager.isPluginTool(toolName)) {
        source = "plugin";
      } else if (this.toolCatalog.isNativeTool(toolName)) {
        source = "native";
      } else if (this.proxyManager.canHandle(toolName)) {
        source = "proxied";
      } else {
        source = "unknown";
      }

      try {
        this.webhookManager.emit("tool_call", { tool: toolName, source, arguments: this.redactSensitiveArgs(args as Record<string, unknown>) });

        const callStartTime = Date.now();
        let result: any;

        if (toolName === "discover_tools") {
          result = await this.handleDiscoverTools(args, extra);
        } else if (toolName === "refresh_skills") {
          result = await this.handleRefreshSkills();
        } else if (toolName === "fetch_skill") {
          result = await this.handleFetchSkill(args);
        } else if (toolName === "reload_plugins") {
          result = await this.handleReloadPlugins();
        } else if (this.telemetryManager.isTelemetryTool(toolName)) {
          result = this.telemetryManager.handleToolCall(toolName);
        } else if (source === "plugin") {
          result = await this.pluginManager.handleToolCall(toolName, args);
        } else if (source === "native") {
          const nativeSessionId = this.getSessionId(extra);
          const nativeSession = this.sessionIsolation.getSession(nativeSessionId);
          const skillContext: SkillExecutionContext = {
            sessionId: nativeSessionId,
            role: nativeSession?.role ?? null,
            metadata: nativeSession?.metadata ?? new Map(),
          };
          result = await this.skillManager.handleToolCall(toolName, args, skillContext);
        } else if (source === "proxied") {
          const sessionId = this.getSessionId(extra);
          const session = this.sessionIsolation.getSession(sessionId);
          const sessionRole = session?.role ?? undefined;
          const sessionCounters = session?.rateLimitCounters;
          result = await this.proxyManager.callProxiedTool(toolName, args, sessionRole, sessionCounters);
        } else {
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
        }

        this.telemetryManager.recordToolCall(Date.now() - callStartTime);

        if (shouldAudit) {
          this.auditLog.log("tool_call", "success", {
            sessionId: this.getSessionId(extra),
            resource: toolName,
            metadata: { source, latencyMs: Date.now() - callStartTime },
          });
        }

        return result;
      } catch (error: any) {
        this.telemetryManager.recordToolCall();
        this.telemetryManager.recordToolError();
        this.webhookManager.emit("tool_error", { tool: toolName, arguments: this.redactSensitiveArgs(args as Record<string, unknown>), error: error?.message || String(error) });

        if (shouldAudit) {
          this.auditLog.log("tool_call", "failure", {
            sessionId: this.getSessionId(extra),
            resource: toolName,
            metadata: { source, error: error?.message || String(error) },
          });
        }

        throw error;
      }
    });
  }

  private async loadSubsystems(): Promise<void> {
    await this.securityManager.loadPermissions();
    await this.skillManager.loadSkills();
    const skillStats = this.skillManager.getStats();
    console.error(`[EVOKORE] Skill stats: ${skillStats.totalSkills} skills, ${skillStats.categories.length} categories, loaded in ${skillStats.loadTimeMs}ms, index ~${skillStats.fuseIndexSizeKb}KB`);

    // Load webhook subscriptions
    this.webhookManager.loadWebhooks();

    // Load plugins after skills but before proxy boot
    const pluginResult = await this.pluginManager.loadPlugins();
    if (pluginResult.loaded > 0) {
      console.error(`[EVOKORE] Plugin stats: ${pluginResult.loaded} plugins, ${pluginResult.totalTools} tools, ${pluginResult.totalResources} resources, loaded in ${pluginResult.loadTimeMs}ms`);
    }

    // Initialize telemetry (no-ops if EVOKORE_TELEMETRY is not "true")
    this.telemetryManager.initialize();

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

    // Pre-create the default session for stdio mode
    this.sessionIsolation.createSession(DEFAULT_SESSION_ID);

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`[EVOKORE] v${SERVER_VERSION} Enterprise Router running on stdio (tool discovery mode: ${this.discoveryMode})`);
    this.webhookManager.emit("session_start", { transport: "stdio" });
    this.telemetryManager.recordSessionStart();
    this.auditLog.log("session_create", "success", { metadata: { transport: "stdio" } });
    this.bootProxyServersInBackground().catch((err) =>
      console.error('[EVOKORE] Fatal: background proxy boot threw unexpectedly:', err)
    );

    // Graceful shutdown for stdio mode
    const shutdown = () => {
      this.webhookManager.emit("session_end", { transport: "stdio", reason: "shutdown" });
      this.telemetryManager.shutdown();
      // Grace period to allow fire-and-forget webhook delivery
      setTimeout(() => process.exit(0), 500);
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  }

  async runHttp(): Promise<HttpServer> {
    await this.loadSubsystems();

    const authConfig = loadAuthConfig();
    const httpServer = new HttpServer(this.server, {
      sessionIsolation: this.sessionIsolation,
      authConfig,
      webhookManager: this.webhookManager,
      auditLog: this.auditLog,
      telemetryManager: this.telemetryManager,
    });
    await httpServer.start();

    const addr = httpServer.getAddress();
    console.error(`[EVOKORE] v${SERVER_VERSION} Enterprise Router running on HTTP at http://${addr.host}:${addr.port} (tool discovery mode: ${this.discoveryMode})`);
    this.webhookManager.emit("session_start", { transport: "http", host: addr.host, port: addr.port });
    this.telemetryManager.recordSessionStart();
    this.auditLog.log("session_create", "success", { metadata: { transport: "http", host: addr.host, port: addr.port } });

    this.bootProxyServersInBackground().catch((err) =>
      console.error('[EVOKORE] Fatal: background proxy boot threw unexpectedly:', err)
    );

    // Graceful shutdown
    const shutdown = async () => {
      console.error("[EVOKORE] Shutting down HTTP server...");
      this.webhookManager.emit("session_end", { transport: "http", reason: "shutdown" });
      this.telemetryManager.shutdown();
      // Grace period to allow fire-and-forget webhook delivery
      await new Promise(resolve => setTimeout(resolve, 500));
      await httpServer.stop();
      process.exit(0);
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);

    return httpServer;
  }
}

if (require.main === module) {
  const isHttpMode = process.env.EVOKORE_HTTP_MODE === "true" || process.argv.includes("--http");
  const server = new EvokoreMCPServer({ httpMode: isHttpMode });

  if (isHttpMode) {
    server.runHttp().catch(console.error);
  } else {
    server.run().catch(console.error);
  }
}
