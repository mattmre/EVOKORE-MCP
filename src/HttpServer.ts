import http from "http";
import { randomUUID } from "crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const DEFAULT_HTTP_PORT = 3100;
const DEFAULT_HTTP_HOST = "127.0.0.1";

export interface HttpServerOptions {
  port?: number;
  host?: string;
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

  constructor(mcpServer: Server, options?: HttpServerOptions) {
    this.mcpServer = mcpServer;
    const envPort = Number(process.env.EVOKORE_HTTP_PORT);
    this.port = options?.port ?? (Number.isFinite(envPort) && envPort > 0 ? envPort : DEFAULT_HTTP_PORT);
    this.host = options?.host ?? process.env.EVOKORE_HTTP_HOST ?? DEFAULT_HTTP_HOST;
  }

  /**
   * Starts the HTTP server and begins accepting connections.
   * Returns a promise that resolves once the server is listening.
   */
  async start(): Promise<void> {
    this.httpServer = http.createServer(async (req, res) => {
      await this.handleRequest(req, res);
    });

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

    // Health check endpoint
    if (url === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", transport: "streamable-http" }));
      return;
    }

    // MCP endpoint
    if (url === "/mcp") {
      await this.handleMcpRequest(req, res);
      return;
    }

    // Anything else: 404
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }

  private async handleMcpRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
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
        console.error(`[EVOKORE-HTTP] Session initialized: ${newSessionId}`);
      },
    });

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) {
        this.transports.delete(sid);
        console.error(`[EVOKORE-HTTP] Session closed: ${sid}`);
      }
    };

    // Connect the MCP server to this new transport
    await this.mcpServer.connect(transport);
    await transport.handleRequest(req, res);
  }
}
