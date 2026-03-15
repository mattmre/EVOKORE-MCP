import http from "http";
import { randomUUID } from "crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SessionIsolation } from "./SessionIsolation";
import {
  authenticateRequest,
  sendUnauthorizedResponse,
  isPublicPath,
  AuthConfig,
} from "./auth/OAuthProvider";

const DEFAULT_HTTP_PORT = 3100;
const DEFAULT_HTTP_HOST = "127.0.0.1";

export interface HttpServerOptions {
  port?: number;
  host?: string;
  sessionIsolation?: SessionIsolation;
  authConfig?: AuthConfig;
}

/**
 * Wraps an MCP Server instance behind a Node.js HTTP server using
 * StreamableHTTPServerTransport from the MCP SDK.
 *
 * Each incoming session gets its own transport instance so multiple
 * clients can connect concurrently. A lightweight /health endpoint
 * is provided for load-balancer probes.
 */
export class HttpServer {
  private httpServer: http.Server | null = null;
  private mcpServer: Server;
  private port: number;
  private host: string;
  private transports: Map<string, StreamableHTTPServerTransport> = new Map();
  private sessionIsolation: SessionIsolation | null;
  private authConfig: AuthConfig | null;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(mcpServer: Server, options?: HttpServerOptions) {
    this.mcpServer = mcpServer;
    const envPort = Number(process.env.EVOKORE_HTTP_PORT);
    this.port = options?.port ?? (Number.isFinite(envPort) && envPort > 0 ? envPort : DEFAULT_HTTP_PORT);
    this.host = options?.host ?? process.env.EVOKORE_HTTP_HOST ?? DEFAULT_HTTP_HOST;
    this.sessionIsolation = options?.sessionIsolation ?? null;
    this.authConfig = options?.authConfig ?? null;
  }

  /**
   * Returns the SessionIsolation instance, if one was provided.
   */
  getSessionIsolation(): SessionIsolation | null {
    return this.sessionIsolation;
  }

  /**
   * Returns the AuthConfig instance, if one was provided.
   */
  getAuthConfig(): AuthConfig | null {
    return this.authConfig;
  }

  /**
   * Starts the HTTP server and begins accepting connections.
   * Returns a promise that resolves once the server is listening.
   */
  async start(): Promise<void> {
    this.httpServer = http.createServer(async (req, res) => {
      await this.handleRequest(req, res);
    });

    // Periodically clean expired sessions (every 60 seconds)
    if (this.sessionIsolation) {
      this.cleanupInterval = setInterval(() => {
        this.sessionIsolation?.cleanExpired();
      }, 60_000);
      // Allow the process to exit even if this interval is pending
      if (this.cleanupInterval.unref) {
        this.cleanupInterval.unref();
      }
    }

    return new Promise<void>((resolve, reject) => {
      this.httpServer!.on("error", (err) => {
        console.error("[EVOKORE-HTTP] Server error:", err.message);
        reject(err);
      });

      this.httpServer!.listen(this.port, this.host, () => {
        console.error(`[EVOKORE-HTTP] Listening on http://${this.host}:${this.port}`);
        resolve();
      });
    });
  }

  /**
   * Gracefully shuts down the HTTP server and all active transports.
   */
  async stop(): Promise<void> {
    // Clear the session cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Destroy all sessions in SessionIsolation before closing transports
    if (this.sessionIsolation) {
      for (const sessionId of this.transports.keys()) {
        this.sessionIsolation.destroySession(sessionId);
      }
    }

    // Close all active transports
    const closePromises: Promise<void>[] = [];
    for (const [sessionId, transport] of this.transports.entries()) {
      closePromises.push(
        transport.close().catch((err) => {
          console.error(`[EVOKORE-HTTP] Error closing transport for session ${sessionId}:`, err.message);
        })
      );
    }
    await Promise.all(closePromises);
    this.transports.clear();

    // Close the HTTP server
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => {
          console.error("[EVOKORE-HTTP] Server stopped.");
          resolve();
        });
      });
      this.httpServer = null;
    }
  }

  getAddress(): { host: string; port: number } {
    if (this.httpServer) {
      const addr = this.httpServer.address();
      if (addr && typeof addr === "object") {
        return { host: addr.address, port: addr.port };
      }
    }
    return { host: this.host, port: this.port };
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = req.url ?? "/";

    // Health check endpoint -- always public, bypasses auth
    if (url === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", transport: "streamable-http" }));
      return;
    }

    // Authentication middleware: reject unauthenticated requests before routing
    let authClaims: Record<string, unknown> | undefined;
    if (this.authConfig && this.authConfig.required) {
      if (!isPublicPath(url)) {
        const authResult = await authenticateRequest(req, this.authConfig);
        if (!authResult.authorized) {
          sendUnauthorizedResponse(res, authResult.error || "Unauthorized");
          return;
        }
        authClaims = authResult.claims;
      }
    }

    // MCP endpoint
    if (url === "/mcp") {
      const roleOverride = (authClaims?.role as string | undefined) ?? undefined;
      await this.handleMcpRequest(req, res, roleOverride);
      return;
    }

    // Anything else: 404
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }

  private async handleMcpRequest(req: http.IncomingMessage, res: http.ServerResponse, roleOverride?: string): Promise<void> {
    // Look up existing session from header
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && this.transports.has(sessionId)) {
      // Route to existing transport
      const transport = this.transports.get(sessionId)!;
      await transport.handleRequest(req, res);
      return;
    }

    if (sessionId && !this.transports.has(sessionId)) {
      // Unknown session ID: reject with 404
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session not found" }));
      return;
    }

    // No session header: create a new transport for this connection.
    // Only POST requests can initialize a new session.
    if (req.method !== "POST") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "New sessions must be initialized with a POST request" }));
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newSessionId: string) => {
        this.transports.set(newSessionId, transport);
        const role = roleOverride ?? process.env.EVOKORE_ROLE ?? null;
        this.sessionIsolation?.createSession(newSessionId, role);
        console.error(`[EVOKORE-HTTP] Session initialized: ${newSessionId}`);
      },
    });

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) {
        this.transports.delete(sid);
        this.sessionIsolation?.destroySession(sid);
        console.error(`[EVOKORE-HTTP] Session closed: ${sid}`);
      }
    };

    // Connect the MCP server to this new transport
    await this.mcpServer.connect(transport);
    await transport.handleRequest(req, res);
  }
}
