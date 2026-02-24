import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Tool, CallToolRequestSchema, McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { SecurityManager } from "./SecurityManager";

const CONFIG_FILE = path.resolve(__dirname, "../mcp.config.json");

interface ServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export class ProxyManager {
  private clients: Map<string, Client> = new Map();
  private transports: Map<string, StdioClientTransport> = new Map();
  private toolRegistry: Map<string, { serverId: string; originalName: string }> = new Map();
  private cachedTools: Tool[] = [];
  private security: SecurityManager;

  constructor(security: SecurityManager) {
    this.security = security;
  }

  async loadServers() {
    this.clients.clear();
    this.transports.clear();
    this.toolRegistry.clear();
    this.cachedTools = [];

    try {
      const content = await fs.readFile(CONFIG_FILE, "utf-8");
      const config = JSON.parse(content);
      
      if (!config.servers) return;

      const isWindows = process.platform === "win32";

      for (const [serverId, serverConfig] of Object.entries(config.servers as Record<string, ServerConfig>)) {
        try {
          console.error(`[EVOKORE] Booting child server: ${serverId}`);
          
          let cmd = serverConfig.command;
          
          // Apply Windows executable fallback
          // npx needs .cmd extension on Windows; uvx/uv install as .exe and resolve via PATH
          if (isWindows && cmd === "npx") {
             cmd = "npx.cmd";
          }
          
          // Resolve ${VAR} references in env values from process.env
          const resolvedEnv: Record<string, string> = {};
          if (serverConfig.env) {
            for (const [key, value] of Object.entries(serverConfig.env)) {
              resolvedEnv[key] = value.replace(/\$\{(\w+)\}/g, (_, varName) => process.env[varName] || "");
            }
          }
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

          // Fetch tools from child and register them
          const { tools } = await client.listTools();
          for (const tool of tools) {
            const prefixedName = `${serverId}_${tool.name}`;
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
          }

          console.error(`[EVOKORE] Proxied ${tools.length} tools from '${serverId}'`);
        } catch (e: any) {
          console.error(`[EVOKORE] Failed to boot child server '${serverId}': ${e.message}`);
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

    const client = this.clients.get(serverId);
    if (!client) {
      throw new McpError(ErrorCode.InternalError, `Client for server '${serverId}' is not connected.`);
    }

    const result = await client.callTool({ name: originalName, arguments: toolArgs });
    return result;
  }
}


