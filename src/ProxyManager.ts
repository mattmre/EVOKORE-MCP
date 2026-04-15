// @AI:NAV[SEC:imports] Import declarations
import fs from "fs/promises";
import path from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Tool, CallToolRequestSchema, McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { SecurityManager } from "./SecurityManager";
import { WebhookManager } from "./WebhookManager";
import { resolveCommandForPlatform } from "./utils/resolveCommandForPlatform";
// @AI:NAV[END:imports]

const DEFAULT_CONFIG_FILE = path.resolve(__dirname, "../mcp.config.json");
const ENV_PLACEHOLDER_REGEX = /\$\{(\w+)\}/g;
const DEFAULT_CHILD_SERVER_BOOT_TIMEOUT_MS = 15000;
const DEFAULT_PROXY_REQUEST_TIMEOUT_MS = 60000;

// @AI:NAV[SEC:interface-ratelimitconfig] interface RateLimitConfig
interface RateLimitConfig {
  requestsPerMinute?: number;       // per-server limit
  toolLimits?: Record<string, number>;  // per-tool overrides (requests per minute)
}
// @AI:NAV[END:interface-ratelimitconfig]

// @AI:NAV[SEC:interface-serverconfig] interface ServerConfig
interface ServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: "stdio" | "http";
  url?: string;
  cwd?: string;
  disabled?: boolean;
  rateLimit?: RateLimitConfig;
}
// @AI:NAV[END:interface-serverconfig]

// @AI:NAV[SEC:interface-serverstate] interface ServerState
export interface ServerState {
  id: string;
  status: 'booting' | 'connected' | 'error' | 'disconnected';
  connectionType: 'stdio' | 'sse' | 'http';
  errorCount: number;
  lastPing: number;
  registeredToolCount: number;
}
// @AI:NAV[END:interface-serverstate]

// @AI:NAV[SEC:class-tokenbucket] class TokenBucket
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private maxTokens: number;
  private refillRatePerMs: number;

  constructor(requestsPerMinute: number) {
    this.maxTokens = requestsPerMinute;
    this.tokens = requestsPerMinute;
    this.lastRefill = Date.now();
    this.refillRatePerMs = requestsPerMinute / 60000;
  }

  tryConsume(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  getRetryAfterMs(): number {
    this.refill();
    if (this.tokens >= 1) return 0;
    return Math.ceil((1 - this.tokens) / this.refillRatePerMs);
  }

  getCapacity(): number {
    return this.maxTokens;
  }

  getRefillRatePerMs(): number {
    return this.refillRatePerMs;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRatePerMs);
    this.lastRefill = now;
  }
}
// @AI:NAV[END:class-tokenbucket]

// @AI:NAV[SEC:class-proxymanager] class ProxyManager
export class ProxyManager {
  private clients: Map<string, Client> = new Map();
  private transports: Map<string, StdioClientTransport | StreamableHTTPClientTransport> = new Map();
  private toolRegistry: Map<string, { serverId: string; originalName: string }> = new Map();
  private cachedTools: Tool[] = [];
  private security: SecurityManager;
  private webhookManager: WebhookManager | null;
  private serverRegistry: Map<string, ServerState> = new Map();
  private toolCooldowns: Map<string, number> = new Map();
  private rateLimitBuckets: Map<string, TokenBucket> = new Map();
  private cooldownSweepInterval: ReturnType<typeof setInterval> | null = null;

  constructor(security: SecurityManager, webhookManager?: WebhookManager) {
    this.security = security;
    this.webhookManager = webhookManager ?? null;
    this.startCooldownSweep();
  }

  private startCooldownSweep(): void {
    this.cooldownSweepInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, expiry] of this.toolCooldowns.entries()) {
        if (now >= expiry) this.toolCooldowns.delete(key);
      }
    }, 60_000);
    this.cooldownSweepInterval.unref();
  }

  private getConfigFilePath(): string {
    const overridePath = process.env.EVOKORE_MCP_CONFIG_PATH;
    return overridePath ? path.resolve(overridePath) : DEFAULT_CONFIG_FILE;
  }

  private getChildServerBootTimeoutMs(): number {
    const configuredTimeoutMs = Number(process.env.EVOKORE_CHILD_SERVER_BOOT_TIMEOUT_MS);
    if (Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0) {
      return configuredTimeoutMs;
    }

    return DEFAULT_CHILD_SERVER_BOOT_TIMEOUT_MS;
  }

  private getProxyRequestTimeoutMs(): number {
    const configuredTimeoutMs = Number(process.env.EVOKORE_PROXY_REQUEST_TIMEOUT_MS);
    if (Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0) {
      return configuredTimeoutMs;
    }
    return DEFAULT_PROXY_REQUEST_TIMEOUT_MS;
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
    let timeoutHandle: NodeJS.Timeout | undefined;

    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeoutHandle = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
        })
      ]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private normalizeCooldownArgs(value: any): any {
    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeCooldownArgs(item));
    }

    if (value && typeof value === "object") {
      const normalized: Record<string, any> = {};
      for (const key of Object.keys(value).sort()) {
        normalized[key] = this.normalizeCooldownArgs(value[key]);
      }
      return normalized;
    }

    return value;
  }

  private resolveConfigString(serverId: string, key: string, value?: string): string | undefined {
    if (value === undefined) {
      return value;
    }

    const missingVars = new Set<string>();
    const resolvedValue = value.replace(ENV_PLACEHOLDER_REGEX, (_match, varName: string) => {
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

    return resolvedValue;
  }

  private resolveConfigArgs(serverId: string, args?: string[]): string[] {
    if (!args) {
      return [];
    }

    return args.map((value, index) => this.resolveConfigString(serverId, `args[${index}]`, value) as string);
  }

  private getCooldownKey(toolName: string, args: any): string {
    const normalizedArgs = this.normalizeCooldownArgs(args ?? {});
    return `${toolName}:${JSON.stringify(normalizedArgs)}`;
  }

  private reconnecting = new Set<string>();

  private recordServerError(serverState?: ServerState) {
    if (!serverState) return;

    serverState.errorCount++;
    if (serverState.errorCount >= 5) {
      serverState.status = 'error';
      // Trigger background reconnect for persistently failing servers
      this.reconnectServer(serverState.id).catch(() => {});
    }
  }

  /**
   * Re-boot a single crashed child server without affecting other servers.
   * Guarded by a reconnecting Set to prevent concurrent reconnect attempts
   * for the same server.
   */
  private async reconnectServer(serverId: string): Promise<void> {
    if (this.reconnecting.has(serverId)) return;
    this.reconnecting.add(serverId);

    try {
      // Close existing client/transport if any
      const oldClient = this.clients.get(serverId);
      if (oldClient) {
        await oldClient.close().catch(() => {});
        this.clients.delete(serverId);
      }
      const oldTransport = this.transports.get(serverId);
      if (oldTransport) {
        await oldTransport.close().catch(() => {});
        this.transports.delete(serverId);
      }

      // Remove stale tool entries for this server
      for (const [prefixedName, entry] of this.toolRegistry) {
        if (entry.serverId === serverId) {
          this.toolRegistry.delete(prefixedName);
        }
      }
      this.cachedTools = this.cachedTools.filter(
        t => !t.name.startsWith(`${serverId}_`)
      );

      // Re-read config to get the server's current definition
      const configFile = this.getConfigFilePath();
      const content = await fs.readFile(configFile, "utf-8");
      const config = JSON.parse(content);
      const serverConfig = config?.servers?.[serverId] as ServerConfig | undefined;
      if (!serverConfig) {
        throw new Error(`Server '${serverId}' not found in config`);
      }

      await this.bootSingleServer(serverId, serverConfig);
      console.error(`[EVOKORE] Server '${serverId}' reconnected successfully`);
    } catch (err: any) {
      console.error(`[EVOKORE] Server '${serverId}' reconnect failed: ${err.message}`);
      const state = this.serverRegistry.get(serverId);
      if (state) state.status = 'error';
    } finally {
      this.reconnecting.delete(serverId);
    }
  }

  private initRateLimitBuckets(serverId: string, rateLimitConfig?: RateLimitConfig): void {
    if (!rateLimitConfig) return;

    if (rateLimitConfig.requestsPerMinute && rateLimitConfig.requestsPerMinute > 0) {
      this.rateLimitBuckets.set(serverId, new TokenBucket(rateLimitConfig.requestsPerMinute));
    }

    if (rateLimitConfig.toolLimits) {
      for (const [toolName, rpm] of Object.entries(rateLimitConfig.toolLimits)) {
        if (rpm > 0) {
          this.rateLimitBuckets.set(`${serverId}/${toolName}`, new TokenBucket(rpm));
        }
      }
    }
  }

  /**
   * Try to consume a token from a session-scoped counter entry.
   * Returns true if the request is allowed, false if rate-limited.
   * Initializes the counter lazily from the global bucket's capacity when first accessed.
   */
  private tryConsumeSessionCounter(
    key: string,
    sessionCounters: Map<string, { tokens: number; lastRefillAt: number }>,
    globalBucket: TokenBucket
  ): boolean {
    let counter = sessionCounters.get(key);
    if (!counter) {
      // Lazy initialization: mirror the global bucket's capacity
      counter = { tokens: globalBucket.getCapacity(), lastRefillAt: Date.now() };
      sessionCounters.set(key, counter);
    }

    // Refill tokens based on elapsed time
    const now = Date.now();
    const elapsed = now - counter.lastRefillAt;
    const capacity = globalBucket.getCapacity();
    const refillRate = globalBucket.getRefillRatePerMs();
    counter.tokens = Math.min(capacity, counter.tokens + elapsed * refillRate);
    counter.lastRefillAt = now;

    if (counter.tokens >= 1) {
      counter.tokens -= 1;
      return true;
    }
    return false;
  }

  /**
   * Compute retry-after duration for a session-scoped counter entry.
   */
  private getSessionCounterRetryAfterMs(
    key: string,
    sessionCounters: Map<string, { tokens: number; lastRefillAt: number }>,
    globalBucket: TokenBucket
  ): number {
    const counter = sessionCounters.get(key);
    if (!counter) return 0;

    // Refill first
    const now = Date.now();
    const elapsed = now - counter.lastRefillAt;
    const capacity = globalBucket.getCapacity();
    const refillRate = globalBucket.getRefillRatePerMs();
    counter.tokens = Math.min(capacity, counter.tokens + elapsed * refillRate);
    counter.lastRefillAt = now;

    if (counter.tokens >= 1) return 0;
    return Math.ceil((1 - counter.tokens) / refillRate);
  }

  private checkRateLimit(
    serverId: string,
    originalToolName: string,
    sessionCounters?: Map<string, { tokens: number; lastRefillAt: number }>
  ): void {
    // Check tool-level bucket first (more specific)
    const toolBucketKey = `${serverId}/${originalToolName}`;
    const toolBucket = this.rateLimitBuckets.get(toolBucketKey);
    if (toolBucket) {
      if (sessionCounters) {
        if (!this.tryConsumeSessionCounter(toolBucketKey, sessionCounters, toolBucket)) {
          const retryMs = this.getSessionCounterRetryAfterMs(toolBucketKey, sessionCounters, toolBucket);
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Rate limit exceeded for ${serverId}/${originalToolName}. Retry after ${Math.ceil(retryMs / 1000)}s.`
          );
        }
      } else if (!toolBucket.tryConsume()) {
        const retryMs = toolBucket.getRetryAfterMs();
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Rate limit exceeded for ${serverId}/${originalToolName}. Retry after ${Math.ceil(retryMs / 1000)}s.`
        );
      }
    }

    // Check server-level bucket
    const serverBucket = this.rateLimitBuckets.get(serverId);
    if (serverBucket) {
      if (sessionCounters) {
        if (!this.tryConsumeSessionCounter(serverId, sessionCounters, serverBucket)) {
          const retryMs = this.getSessionCounterRetryAfterMs(serverId, sessionCounters, serverBucket);
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Rate limit exceeded for server '${serverId}'. Retry after ${Math.ceil(retryMs / 1000)}s.`
          );
        }
      } else if (!serverBucket.tryConsume()) {
        const retryMs = serverBucket.getRetryAfterMs();
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Rate limit exceeded for server '${serverId}'. Retry after ${Math.ceil(retryMs / 1000)}s.`
        );
      }
    }
  }

  private resolveServerEnv(serverId: string, serverEnv?: Record<string, string>): Record<string, string> {
    const resolvedEnv: Record<string, string> = {};
    if (!serverEnv) return resolvedEnv;

    for (const [key, value] of Object.entries(serverEnv)) {
      resolvedEnv[key] = this.resolveConfigString(serverId, key, value) as string;
    }

    return resolvedEnv;
  }

  private async bootSingleServer(serverId: string, serverConfig: ServerConfig): Promise<void> {
    let client: Client | undefined;
    let transport: StdioClientTransport | StreamableHTTPClientTransport | undefined;

    try {
      const resolvedUrl = this.resolveConfigString(serverId, "url", serverConfig.url);
      const resolvedCommand = this.resolveConfigString(serverId, "command", serverConfig.command);
      const resolvedArgs = this.resolveConfigArgs(serverId, serverConfig.args);
      const resolvedCwd = this.resolveConfigString(serverId, "cwd", serverConfig.cwd);
      const isHttpTransport = serverConfig.transport === "http";
      if (isHttpTransport && !resolvedUrl) {
        throw new Error(`HTTP server '${serverId}' requires a 'url' field`);
      }
      const connectionType = isHttpTransport ? "http" : "stdio";
      const childServerBootTimeoutMs = this.getChildServerBootTimeoutMs();

      console.error(`[EVOKORE] Booting child server: ${serverId} (${connectionType})`);

      this.serverRegistry.set(serverId, {
        id: serverId,
        status: 'booting',
        connectionType,
        errorCount: 0,
        lastPing: Date.now(),
        registeredToolCount: 0
      });

      this.initRateLimitBuckets(serverId, serverConfig.rateLimit);

      client = new Client(
        { name: `evokore-proxy-${serverId}`, version: "3.0.0" },
        { capabilities: {} }
      );

      if (isHttpTransport) {
        transport = new StreamableHTTPClientTransport(new URL(resolvedUrl!));
      } else {
        if (!resolvedCommand) {
          throw new Error(`Stdio server '${serverId}' requires a 'command' field`);
        }

        const cmd = resolveCommandForPlatform(resolvedCommand);

        // Resolve ${VAR} references in env values from process.env
        const resolvedEnv = this.resolveServerEnv(serverId, serverConfig.env);
        const env = { ...process.env, ...resolvedEnv };

        transport = new StdioClientTransport({
          command: cmd,
          args: resolvedArgs,
          env: env as Record<string, string>,
          stderr: "inherit",
          cwd: resolvedCwd
        });
      }

      await this.withTimeout(
        client.connect(transport),
        childServerBootTimeoutMs,
        `Timed out connecting to child server '${serverId}' after ${childServerBootTimeoutMs}ms`
      );

      this.clients.set(serverId, client);
      this.transports.set(serverId, transport);

      const serverState = this.serverRegistry.get(serverId);
      if (serverState) {
        serverState.status = 'connected';
        serverState.lastPing = Date.now();
      }

      // Fetch tools from child and register them
      const { tools } = await this.withTimeout(
        client.listTools(),
        childServerBootTimeoutMs,
        `Timed out listing tools from child server '${serverId}' after ${childServerBootTimeoutMs}ms`
      );
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

        if (!modifiedTool.inputSchema || typeof modifiedTool.inputSchema !== "object") {
          modifiedTool.inputSchema = { type: "object" };
        }
        if (!modifiedTool.inputSchema.type) {
          modifiedTool.inputSchema.type = "object";
        }
        if (!modifiedTool.inputSchema.properties || typeof modifiedTool.inputSchema.properties !== "object") {
          modifiedTool.inputSchema.properties = {};
        }
        modifiedTool.inputSchema.properties._evokore_approval_token = {
          type: "string",
          description: "If this tool requires approval, the server will return an error with a token. Ask the user for permission, and if granted, retry the tool call with this token."
        };

        this.cachedTools.push(modifiedTool);
        registeredCount++;
      }

      if (serverState) {
        serverState.registeredToolCount = registeredCount;
      }

      const duplicateSuffix = skippedDuplicates > 0 ? ` (${skippedDuplicates} duplicate(s) skipped)` : "";
      console.error(`[EVOKORE] Proxied ${registeredCount} tools from '${serverId}'${duplicateSuffix}`);
      if (skippedDuplicates > 0) {
        console.error(
          `[EVOKORE] Duplicate collision summary: ${JSON.stringify({
            serverId,
            skippedDuplicates,
            policy: "first_registration_wins"
          })}`
        );
      }
    } catch (e: any) {
// @AI:NAV[END:class-proxymanager]
      console.error(`[EVOKORE] Failed to boot child server '${serverId}': ${e.message}`);
      if (transport) {
        try {
          await transport.close();
        } catch {
          // Best-effort cleanup for timed-out or failed child transports.
        }
      }
      if (client) {
        try {
          await client.close();
        } catch {
          // Best-effort cleanup for timed-out or failed child clients.
        }
      }
      const serverState = this.serverRegistry.get(serverId);
      if (serverState) {
        serverState.status = 'error';
        serverState.errorCount++;
      }
    }
  }

  async loadServers() {
    // Reset cooldown sweep before reload
    if (this.cooldownSweepInterval) {
      clearInterval(this.cooldownSweepInterval);
      this.cooldownSweepInterval = null;
    }

    // Atomic swap: save old state, build into fresh containers via bootSingleServer(),
    // then swap. This eliminates the empty-registry window during reload.
    const oldClients = this.clients;
    const oldTransports = this.transports;

    // Prepare fresh containers that bootSingleServer() will populate
    this.clients = new Map();
    this.transports = new Map();
    this.toolRegistry = new Map();
    this.cachedTools = [];
    this.serverRegistry = new Map();
    this.rateLimitBuckets = new Map();

    try {
      const configFile = this.getConfigFilePath();
      const content = await fs.readFile(configFile, "utf-8");
      const config = JSON.parse(content);

      if (!config.servers) {
        // No servers configured — clean up old clients and return with empty state
        this.cleanupOldClients(oldClients, oldTransports);
        return;
      }

      const serverEntries = Object.entries(config.servers as Record<string, ServerConfig>)
        .filter(([, serverConfig]) => !serverConfig.disabled);
      const bootResults = await Promise.allSettled(
        serverEntries.map(([serverId, serverConfig]) =>
          this.bootSingleServer(serverId, serverConfig)
        )
      );
      const unexpectedRejections = bootResults.filter(r => r.status === 'rejected');
      if (unexpectedRejections.length > 0) {
        console.error(`[EVOKORE] ${unexpectedRejections.length} server boot(s) threw unexpectedly (should not happen)`);
      }
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        console.error("[EVOKORE] No mcp.config.json found. Running EVOKORE without proxy execution tools.");
      } else {
        console.error(`[EVOKORE] Failed to load mcp.config.json: ${e.message}`);
      }
    }

    // Clean up old clients after the new state is fully populated
    this.cleanupOldClients(oldClients, oldTransports);

    // Restart cooldown sweep after reload
    this.startCooldownSweep();
  }

  /**
   * Best-effort cleanup of old client and transport references after a reload swap.
   */
  private cleanupOldClients(
    oldClients: Map<string, Client>,
    oldTransports: Map<string, StdioClientTransport | StreamableHTTPClientTransport>
  ): void {
    for (const [id, client] of oldClients) {
      // Skip clients that were re-registered in the new set (same object reference)
      if (this.clients.get(id) === client) continue;
      client.close().catch(() => {});
    }
    for (const [id, transport] of oldTransports) {
      if (this.transports.get(id) === transport) continue;
      transport.close().catch(() => {});
    }
  }

  getProxiedTools(): Tool[] {
    return this.cachedTools;
  }

  getServerStatusSnapshot(serverId?: string): ServerState[] {
    return Array.from(this.serverRegistry.values())
      .filter((state) => !serverId || state.id === serverId)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((state) => ({ ...state }));
  }

  async getSanitizedConfig(): Promise<Record<string, any>> {
    try {
      const configFile = this.getConfigFilePath();
      const content = await fs.readFile(configFile, "utf-8");
      const config = JSON.parse(content);

      if (!config.servers) return { servers: {} };

      const sanitized: Record<string, any> = { servers: {} };
      for (const [serverId, serverConfig] of Object.entries(config.servers as Record<string, ServerConfig>)) {
        const sanitizedServer: Record<string, any> = {};
        if (serverConfig.command) sanitizedServer.command = serverConfig.command;
        if (serverConfig.args) sanitizedServer.args = serverConfig.args;
        if (serverConfig.transport) sanitizedServer.transport = serverConfig.transport;
        if (serverConfig.url) sanitizedServer.url = serverConfig.url;
        if (serverConfig.cwd) sanitizedServer.cwd = serverConfig.cwd;
        if (serverConfig.disabled !== undefined) sanitizedServer.disabled = serverConfig.disabled;
        if (serverConfig.env) {
          const redactedEnv: Record<string, string> = {};
          for (const key of Object.keys(serverConfig.env)) {
            redactedEnv[key] = "[REDACTED]";
          }
          sanitizedServer.env = redactedEnv;
        }
        sanitized.servers[serverId] = sanitizedServer;
      }

      return sanitized;
    } catch {
      return { servers: {}, error: "Could not read config file" };
    }
  }

  canHandle(toolName: string): boolean {
    return this.toolRegistry.has(toolName);
  }

  async callProxiedTool(toolName: string, args: any, role?: string | null, sessionCounters?: Map<string, { tokens: number; lastRefillAt: number }>): Promise<any> {
    const registryEntry = this.toolRegistry.get(toolName);
    if (!registryEntry) {
      throw new McpError(ErrorCode.MethodNotFound, `Tool not found in proxy registry: ${toolName}`);
    }

    const { serverId, originalName } = registryEntry;
    
    const toolArgs = { ...(args || {}) };
    
    // Extract and remove the EVOKORE approval token so the child server doesn't complain about unknown args
    const providedToken = toolArgs._evokore_approval_token;
    delete toolArgs._evokore_approval_token;
    
    // 1. Security Interceptor Check
    const permission = this.security.checkPermission(toolName, role);
    
    if (permission === "deny") {
      throw new McpError(ErrorCode.InvalidRequest, `Execution of '${toolName}' is strictly denied by EVOKORE-MCP security policies.`);
    }

    let approvalTokenToConsume: string | undefined;
    if (permission === "require_approval") {
      if (!providedToken || !this.security.validateToken(toolName, providedToken, toolArgs)) {
        const newToken = this.security.generateToken(toolName, toolArgs);
        this.webhookManager?.emit("approval_requested", {
          tool: toolName,
          server: serverId,
          tokenPrefix: newToken.substring(0, 8) + "..."
        });
        return {
          content: [{
            type: "text",
            text: `[EVOKORE-MCP SECURITY INTERCEPTOR] ACTION REQUIRES HUMAN APPROVAL.\n\nYou attempted to call '${toolName}'. You must stop right now and ask the user for explicit permission to execute this tool with these arguments. DO NOT proceed until they say YES.\n\nIf they approve, retry this exact same tool call but add the argument '_evokore_approval_token' with the value '${newToken}'.`
          }],
          isError: true
        };
      }
      // Only consume a valid token once the call is about to be dispatched upstream.
      approvalTokenToConsume = providedToken;
      this.webhookManager?.emit("approval_granted", {
        tool: toolName,
        server: serverId
      });
    }

    // 2. Rate Limit Check (proactive, before the call)
    this.checkRateLimit(serverId, originalName, sessionCounters);

    // 3. Cooldown Check (reactive, after previous errors)
    const cooldownKey = this.getCooldownKey(toolName, toolArgs);
    const cooldownExpires = this.toolCooldowns.get(cooldownKey);
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

    let client = this.clients.get(serverId);

    // If the server is in error state, kick off a background reconnect and
    // return an immediate retryable error — never block the MCP caller for
    // up to 15s waiting for child server reboot.
    const serverState = this.serverRegistry.get(serverId);
    if (serverState?.status === 'error') {
      if (!this.reconnecting.has(serverId)) {
        // Fire-and-forget: reconnectServer() guards against concurrent attempts
        // via this.reconnecting and logs its own errors.
        this.reconnectServer(serverId).catch(() => {});
      }
      throw new McpError(
        ErrorCode.InternalError,
        `Child server '${serverId}' is reconnecting. Please retry in a moment.`
      );
    }

    if (!client) {
      throw new McpError(ErrorCode.InternalError, `Client for server '${serverId}' is not connected.`);
    }

    if (serverState) {
      serverState.lastPing = Date.now();
    }

    try {
      if (approvalTokenToConsume) {
        this.security.consumeToken(approvalTokenToConsume);
      }
      const requestTimeoutMs = this.getProxyRequestTimeoutMs();
      const result: any = await this.withTimeout(
        client.callTool({ name: originalName, arguments: toolArgs }),
        requestTimeoutMs,
        `Proxied tool '${toolName}' on server '${serverId}' timed out after ${requestTimeoutMs}ms`
      );

      // Analyze Result for Cooldown
      let shouldCooldown = false;
      if (result.isError) {
        this.recordServerError(serverState);
        shouldCooldown = true;
      } else if (!result.content || result.content.length === 0) {
        shouldCooldown = true;
      } else if (result.content[0].type === "text" && result.content[0].text.length < 15) {
        shouldCooldown = true;
      }

      if (shouldCooldown) {
        this.toolCooldowns.set(cooldownKey, Date.now() + 10000); // 10 seconds
      }

      return result;
    } catch (e: any) {
      this.recordServerError(serverState);
      this.toolCooldowns.set(cooldownKey, Date.now() + 10000); // 10 seconds cooldown on throw
      throw e;
    }
  }
}
