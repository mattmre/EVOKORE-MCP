import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Tool, CallToolRequestSchema, McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { SecurityManager } from "./SecurityManager";
import { resolveCommandForPlatform } from "./utils/resolveCommandForPlatform";

const DEFAULT_CONFIG_FILE = path.resolve(__dirname, "../mcp.config.json");
const ENV_PLACEHOLDER_REGEX = /\$\{(\w+)\}/g;

interface ServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface ServerState {
  id: string;
  status: 'booting' | 'connected' | 'error' | 'disconnected';
  connectionType: 'stdio' | 'sse';
  errorCount: number;
  lastPing: number;
}

export class ProxyManager {
  private clients: Map<string, Client> = new Map();
  private transports: Map<string, StdioClientTransport> = new Map();
  private toolRegistry: Map<string, { serverId: string; originalName: string }> = new Map();
  private cachedTools: Tool[] = [];
  private security: SecurityManager;
  private serverRegistry: Map<string, ServerState> = new Map();
  private toolCooldowns: Map<string, number> = new Map();

  constructor(security: SecurityManager) {
    this.security = security;
  }

  private getConfigFilePath(): string {
    const overridePath = process.env.EVOKORE_MCP_CONFIG_PATH;
    return overridePath ? path.resolve(overridePath) : DEFAULT_CONFIG_FILE;
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

  private getCooldownKey(toolName: string, args: any): string {
    const normalizedArgs = this.normalizeCooldownArgs(args ?? {});
    return `${toolName}:${JSON.stringify(normalizedArgs)}`;
  }

  private recordServerError(serverState?: ServerState) {
    if (!serverState) return;

    serverState.errorCount++;
    if (serverState.errorCount >= 5) {
      serverState.status = 'error';
    }
  }

  private resolveServerEnv(serverId: string, serverEnv?: Record<string, string>): Record<string, string> {
    const resolvedEnv: Record<string, string> = {};
    if (!serverEnv) return resolvedEnv;

    for (const [key, value] of Object.entries(serverEnv)) {
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
      const configFile = this.getConfigFilePath();
      const content = await fs.readFile(configFile, "utf-8");
      const config = JSON.parse(content);
      
      if (!config.servers) return;

      for (const [serverId, serverConfig] of Object.entries(config.servers as Record<string, ServerConfig>)) {
        try {
          console.error(`[EVOKORE] Booting child server: ${serverId}`);
          
          this.serverRegistry.set(serverId, {
            id: serverId,
            status: 'booting',
            connectionType: 'stdio',
            errorCount: 0,
            lastPing: Date.now()
          });

          const cmd = resolveCommandForPlatform(serverConfig.command);
          
          // Resolve ${VAR} references in env values from process.env
          const resolvedEnv = this.resolveServerEnv(serverId, serverConfig.env);
          const env = { ...process.env, ...resolvedEnv };

          const transport = new StdioClientTransport({
            command: cmd,
            args: serverConfig.args || [],
            env: env as Record<string, string>,
            stderr: "inherit"
          });

          // Redirect stderr from child to parent's stderr so we can see MCP logs
          // stderr is piped

          const client = new Client(
            { name: `evokore-proxy-${serverId}`, version: "2.0.0" },
            { capabilities: {} }
          );

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
            console.error(
              `[EVOKORE] Duplicate collision summary: ${JSON.stringify({
                serverId,
                skippedDuplicates,
                policy: "first_registration_wins"
              })}`
            );
          }
        } catch (e: any) {
          console.error(`[EVOKORE] Failed to boot child server '${serverId}': ${e.message}`);
          const serverState = this.serverRegistry.get(serverId);
          if (serverState) {
            serverState.status = 'error';
            serverState.errorCount++;
          }
        }
      }
    } catch (e) {
      console.error("[EVOKORE] No mcp.config.json found. Running EVOKORE without proxy execution tools.");
    }
  }

  getProxiedTools(): Tool[] {
    return this.cachedTools;
  }

  canHandle(toolName: string): boolean {
    return this.toolRegistry.has(toolName);
  }

  async callProxiedTool(toolName: string, args: any): Promise<any> {
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
    const permission = this.security.checkPermission(toolName);
    
    if (permission === "deny") {
      throw new McpError(ErrorCode.InvalidRequest, `Execution of '${toolName}' is strictly denied by EVOKORE-MCP security policies.`);
    }

    let approvalTokenToConsume: string | undefined;
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
      // Only consume a valid token once the call is about to be dispatched upstream.
      approvalTokenToConsume = providedToken;
    }

    // 2. Cooldown Check
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

    const client = this.clients.get(serverId);
    if (!client) {
      throw new McpError(ErrorCode.InternalError, `Client for server '${serverId}' is not connected.`);
    }

    const serverState = this.serverRegistry.get(serverId);
    if (serverState) {
      serverState.lastPing = Date.now();
    }

    try {
      if (approvalTokenToConsume) {
        this.security.consumeToken(approvalTokenToConsume);
      }
      const result: any = await client.callTool({ name: originalName, arguments: toolArgs });
      
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
