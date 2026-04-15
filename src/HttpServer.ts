// @AI:NAV[SEC:imports] Import declarations
import http from "http";
import { URL } from "url";
import { randomUUID } from "crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { WebSocketServer, WebSocket } from "ws";
import { SessionIsolation } from "./SessionIsolation";
import { SecurityManager, ApprovalEvent } from "./SecurityManager";
import { WebhookManager } from "./WebhookManager";
import { AuditLog } from "./AuditLog";
import { TelemetryManager } from "./TelemetryManager";
import {
// @AI:NAV[END:imports]
  authenticateRequest,
  sendUnauthorizedResponse,
  isPublicPath,
  AuthConfig,
} from "./auth/OAuthProvider";

const DEFAULT_HTTP_PORT = 3100;
const DEFAULT_HTTP_HOST = "127.0.0.1";

// @AI:NAV[SEC:interface-httpserveroptions] interface HttpServerOptions
export interface HttpServerOptions {
  port?: number;
  host?: string;
  sessionIsolation?: SessionIsolation;
  securityManager?: SecurityManager;
  authConfig?: AuthConfig;
  webhookManager?: WebhookManager;
  auditLog?: AuditLog;
  telemetryManager?: TelemetryManager;
}
// @AI:NAV[END:interface-httpserveroptions]

/**
 * Wraps an MCP Server instance behind a Node.js HTTP server using
 * StreamableHTTPServerTransport from the MCP SDK.
 *
 * Each incoming session gets its own transport instance so multiple
 * clients can connect concurrently. A lightweight /health endpoint
 * is provided for load-balancer probes.
 */
// @AI:NAV[SEC:class-httpserver] class HttpServer
export class HttpServer {
  private httpServer: http.Server | null = null;
  private mcpServer: Server;
  private port: number;
  private host: string;
  private transports: Map<string, StreamableHTTPServerTransport> = new Map();
  private sessionIsolation: SessionIsolation | null;
  private securityManager: SecurityManager | null;
  private authConfig: AuthConfig | null;
  private webhookManager: WebhookManager | null;
  private auditLog: AuditLog;
  private telemetryManager: TelemetryManager | null;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private persistInterval: ReturnType<typeof setInterval> | null = null;

  // WebSocket approval streaming (opt-in via EVOKORE_WS_APPROVALS_ENABLED)
  private wss: WebSocketServer | null = null;
  private wsClients: Set<WebSocket> = new Set();
  private wsHeartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor(mcpServer: Server, options?: HttpServerOptions) {
    this.mcpServer = mcpServer;
    const envPort = Number(process.env.EVOKORE_HTTP_PORT);
    this.port = options?.port ?? (Number.isFinite(envPort) && envPort > 0 ? envPort : DEFAULT_HTTP_PORT);
    this.host = options?.host ?? process.env.EVOKORE_HTTP_HOST ?? DEFAULT_HTTP_HOST;
    this.sessionIsolation = options?.sessionIsolation ?? null;
    this.securityManager = options?.securityManager ?? null;
    this.authConfig = options?.authConfig ?? null;
    this.webhookManager = options?.webhookManager ?? null;
    this.auditLog = options?.auditLog ?? AuditLog.getInstance();
    this.telemetryManager = options?.telemetryManager ?? null;
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

    // Initialize WebSocket server for real-time approval events (opt-in)
    if (process.env.EVOKORE_WS_APPROVALS_ENABLED === "true") {
      this.initWebSocketApprovals();
    }

    return new Promise<void>((resolve, reject) => {
      this.httpServer!.on("error", (err) => {
        console.error("[EVOKORE-HTTP] Server error:", err.message);
        reject(err);
      });

      this.httpServer!.listen(this.port, this.host, () => {
        console.error(`[EVOKORE-HTTP] Listening on http://${this.host}:${this.port}`);

        // Start intervals only after the server is confirmed listening.
        // If port binding fails, reject() fires and no intervals are leaked.

        // Periodically clean expired sessions and their orphaned transports (every 60 seconds)
        if (this.sessionIsolation) {
          this.cleanupInterval = setInterval(() => {
            const removed = this.sessionIsolation?.cleanExpired() ?? 0;

            // Close transports whose sessions were just cleaned up.
            // When cleanExpired() removes a SessionState, the transport entry in
            // this.transports becomes orphaned — it holds an open SSE connection
            // and its associated rate limit counters (stored inside SessionState)
            // are already gone. Pruning these prevents unbounded transport and
            // counter accumulation for sessions that expired without an explicit
            // transport close event.
            if (removed > 0) {
              for (const [sessionId, transport] of this.transports.entries()) {
                if (!this.sessionIsolation?.hasSession(sessionId)) {
                  this.auditLog.log("session_expire", "success", { sessionId });
                  this.telemetryManager?.recordSessionExpire();
                  // Remove from map FIRST so concurrent handleMcpRequest() calls
                  // cannot route to a closing transport, then close best-effort.
                  this.transports.delete(sessionId);
                  transport.close().catch((err) => {
                    console.error(`[EVOKORE-HTTP] Error closing expired transport ${sessionId}:`, err.message);
                  });
                }
              }
            }
          }, 60_000);
          // Allow the process to exit even if this interval is pending
          if (this.cleanupInterval.unref) {
            this.cleanupInterval.unref();
          }
        }

        // Periodically persist all active sessions to the backing store (every 30 seconds).
        // This ensures state survives crashes between explicit persist points.
        if (this.sessionIsolation) {
          this.persistInterval = setInterval(() => {
            const sessionIds = this.sessionIsolation?.listSessions() ?? [];
            for (const sid of sessionIds) {
              this.sessionIsolation?.persistSession(sid).catch((err) => {
                console.error(`[EVOKORE-HTTP] Periodic persist failed for session ${sid}:`, err?.message || err);
              });
            }
          }, 30_000);
          if (this.persistInterval.unref) {
            this.persistInterval.unref();
          }
        }

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

    // Clear the periodic persistence interval
    if (this.persistInterval) {
      clearInterval(this.persistInterval);
      this.persistInterval = null;
    }

    // Shut down WebSocket approval server
    if (this.wsHeartbeatInterval) {
      clearInterval(this.wsHeartbeatInterval);
      this.wsHeartbeatInterval = null;
    }
    for (const client of this.wsClients) {
      try { client.close(1001, "Server shutting down"); } catch { /* best effort */ }
    }
    this.wsClients.clear();
    if (this.wss) {
      this.wss.close();
      this.wss = null;
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

  /**
   * Broadcast an approval lifecycle event to all connected WebSocket clients.
   * Called via the SecurityManager approval callback.
   */
  broadcastApprovalEvent(event: ApprovalEvent): void {
    if (this.wsClients.size === 0) return;
    const message = JSON.stringify(event);
    for (const client of this.wsClients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch {
          // Dead connection; will be cleaned up by heartbeat
        }
      }
    }
  }

  /**
   * Initialize the WebSocket server for real-time approval event streaming.
   * Handles upgrade requests on `/ws/approvals` with Bearer token auth via query param.
   */
  private initWebSocketApprovals(): void {
    if (!this.httpServer) return;

    const maxClients = Math.max(
      1,
      parseInt(process.env.EVOKORE_WS_MAX_CLIENTS || "10", 10) || 10
    );
    const heartbeatMs = Math.max(
      5000,
      parseInt(process.env.EVOKORE_WS_HEARTBEAT_MS || "30000", 10) || 30000
    );

    this.wss = new WebSocketServer({ noServer: true });

    // Handle HTTP upgrade requests
    this.httpServer.on("upgrade", async (req, socket, head) => {
      const reqUrl = new URL(req.url ?? "/", `http://${req.headers.host || "localhost"}`);

      // Only handle /ws/approvals
      if (reqUrl.pathname !== "/ws/approvals") {
        socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        socket.destroy();
        return;
      }

      // Enforce max clients
      if (this.wsClients.size >= maxClients) {
        socket.write("HTTP/1.1 503 Service Unavailable\r\nContent-Type: text/plain\r\n\r\nToo many WebSocket clients\r\n");
        socket.destroy();
        return;
      }

      // Authenticate: prefer Authorization header; query-string fallback is deprecated
      if (this.authConfig && this.authConfig.required) {
        const allowQueryToken = process.env.EVOKORE_WS_ALLOW_QUERY_TOKEN === "true";
        let bearerToken: string | null = null;

        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
          bearerToken = authHeader.slice(7).trim() || null;
        } else if (allowQueryToken) {
          bearerToken = reqUrl.searchParams.get("token");
        }

        if (!bearerToken) {
          const hint = allowQueryToken
            ? "Missing Authorization header or token query parameter"
            : "Missing Authorization header (set EVOKORE_WS_ALLOW_QUERY_TOKEN=true to allow query-string fallback)";
          socket.write(`HTTP/1.1 401 Unauthorized\r\nContent-Type: text/plain\r\n\r\n${hint}\r\n`);
          socket.destroy();
          return;
        }

        // Inject the resolved token as a Bearer header for the standard auth check
        req.headers.authorization = `Bearer ${bearerToken}`;
        const authResult = await authenticateRequest(req, this.authConfig);
        if (!authResult.authorized) {
          this.auditLog.log("auth_failure", "failure", {
            metadata: { path: "/ws/approvals", error: authResult.error || "Unauthorized" },
          });
          socket.write("HTTP/1.1 401 Unauthorized\r\nContent-Type: text/plain\r\n\r\nInvalid token\r\n");
          socket.destroy();
          return;
        }

        const role = (authResult.claims?.role as string) || process.env.EVOKORE_ROLE || "";
        (req as any)._evokoreRole = role;

        // RBAC: require at least developer role for WebSocket connections
        const roleLevels: Record<string, number> = { admin: 3, developer: 2, readonly: 1 };
        if ((roleLevels[role] || 0) < (roleLevels["developer"] || 0)) {
          socket.write("HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\n\r\nInsufficient role\r\n");
          socket.destroy();
          return;
        }
      }

      // Complete the WebSocket upgrade
      this.wss!.handleUpgrade(req, socket, head, (ws) => {
        this.wss!.emit("connection", ws, req);
      });
    });

    // Handle new WebSocket connections
    this.wss.on("connection", (ws: WebSocket, req: http.IncomingMessage) => {
      this.wsClients.add(ws);

      // Determine the client's role for RBAC on approval management actions
      const reqUrl = new URL(req.url ?? "/", `http://${req.headers.host || "localhost"}`);
      const clientRole = (req as any)._evokoreRole || "";
      // Store role metadata on the socket for later use
      (ws as any)._role = clientRole;

      // Mark alive for heartbeat
      (ws as any)._isAlive = true;
      ws.on("pong", () => { (ws as any)._isAlive = true; });

      // Send snapshot of current pending approvals
      if (this.securityManager) {
        const snapshot = this.securityManager.getPendingApprovals();
        try {
          ws.send(JSON.stringify({ type: "snapshot", approvals: snapshot }));
        } catch { /* best effort */ }
      }

      console.error(`[EVOKORE-WS] Approval client connected (${this.wsClients.size} active)`);

      // Handle incoming messages
      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "ping") {
            ws.send(JSON.stringify({ type: "pong" }));
            return;
          }
          // Approve still uses prefix matching for backwards compatibility
          if (msg.type === "approve" && typeof msg.prefix === "string") {
            const prefix = msg.prefix.replace(/[^a-f0-9]/gi, "").substring(0, 8);
            if (prefix.length < 4) {
              ws.send(JSON.stringify({ type: "error", message: "Invalid token prefix" }));
              return;
            }

            if (this.authConfig && this.authConfig.required) {
              const roleLevels: Record<string, number> = { admin: 3, developer: 2, readonly: 1 };
              if ((roleLevels[(ws as any)._role] || 0) < (roleLevels["developer"] || 0)) {
                ws.send(JSON.stringify({
                  type: "error",
                  message: "Forbidden: developer role required for approve",
                }));
                return;
              }
            }
            if (this.securityManager) {
              this.securityManager.approveToken(prefix);
            }
          }
          // Deny accepts full token (32 hex chars) or prefix (8+ hex chars)
          if (msg.type === "deny" && typeof msg.token === "string") {
            if (this.authConfig && this.authConfig.required) {
              const roleLevels: Record<string, number> = { admin: 3, developer: 2, readonly: 1 };
              if ((roleLevels[(ws as any)._role] || 0) < (roleLevels["admin"] || 0)) {
                ws.send(JSON.stringify({
                  type: "error",
                  message: "Forbidden: admin role required for deny",
                }));
                return;
              }
            }
            if (this.securityManager) {
              const token = msg.token.replace(/[^a-f0-9]/gi, "").substring(0, 64);
              if (token.length >= 8) {
                this.securityManager.denyToken(token);
              }
            }
          }
        } catch {
          // Ignore malformed messages
        }
      });

      ws.on("close", () => {
        this.wsClients.delete(ws);
        console.error(`[EVOKORE-WS] Approval client disconnected (${this.wsClients.size} active)`);
      });

      ws.on("error", () => {
        this.wsClients.delete(ws);
      });
    });

    // Heartbeat: ping all clients periodically, terminate unresponsive ones
    this.wsHeartbeatInterval = setInterval(() => {
      for (const client of this.wsClients) {
        if ((client as any)._isAlive === false) {
          this.wsClients.delete(client);
          client.terminate();
          continue;
        }
        (client as any)._isAlive = false;
        try { client.ping(); } catch { /* best effort */ }
      }
    }, heartbeatMs);
    if (this.wsHeartbeatInterval.unref) {
      this.wsHeartbeatInterval.unref();
    }

    // Wire SecurityManager callback to broadcast events
    if (this.securityManager) {
      this.securityManager.setApprovalCallback((event) => {
        this.broadcastApprovalEvent(event);
      });
    }

    console.error(`[EVOKORE-WS] Approval WebSocket enabled on /ws/approvals (max ${maxClients} clients, heartbeat ${heartbeatMs}ms)`);
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = req.url ?? "/";
    const isMetricsPath = url === "/metrics" || url === "/metrics/";

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
          if (!isMetricsPath) {
            this.auditLog.log("auth_failure", "failure", {
              metadata: { path: url, error: authResult.error || "Unauthorized" },
            });
            this.telemetryManager?.recordAuthFailure();
          }
          sendUnauthorizedResponse(res, authResult.error || "Unauthorized");
          return;
        }
        if (!isMetricsPath) {
          this.auditLog.log("auth_success", "success", {
            actor: (authResult.claims?.sub as string) ?? "unknown",
            metadata: { path: url },
          });
          this.telemetryManager?.recordAuthSuccess();
        }
        authClaims = authResult.claims;
      }
    }

    if (isMetricsPath && req.method === "GET") {
      if (!this.telemetryManager?.isEnabled()) {
        res.writeHead(503, { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" });
        res.end("# EVOKORE telemetry is disabled. Set EVOKORE_TELEMETRY=true to enable /metrics.\n");
        return;
      }

      res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" });
      res.end(this.telemetryManager.getPrometheusMetrics());
      return;
    }

    // MCP endpoint
    if (url === "/mcp") {
      const roleOverride = (authClaims?.role as string | undefined) ?? undefined;
      // Extract tenantId from the JWT `sub` claim so new sessions can be
      // namespaced under ~/.evokore/tenants/{tenantId}/sessions/ when
      // EVOKORE_TENANT_SCOPING=true. Undefined for non-JWT / static-token
      // deployments keeps the legacy flat layout.
      const tenantIdOverride = (authClaims?.sub as string | undefined) ?? undefined;
      await this.handleMcpRequest(req, res, roleOverride, tenantIdOverride);
      return;
    }

    // Anything else: 404
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }

  private async handleMcpRequest(req: http.IncomingMessage, res: http.ServerResponse, roleOverride?: string, tenantIdOverride?: string): Promise<void> {
    // Look up existing session from header
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && this.transports.has(sessionId)) {
      // Route to existing transport.
      // Refresh the session role from the incoming JWT claim so that role
      // changes (promotion/demotion) propagate without requiring a new
      // MCP session. Missing claim leaves the current role untouched.
      if (roleOverride !== undefined) {
        await this.sessionIsolation?.setSessionRole(sessionId, roleOverride);
      }
      const transport = this.transports.get(sessionId)!;
      await transport.handleRequest(req, res);
      return;
    }

    if (sessionId && !this.transports.has(sessionId)) {
      // Attempt to reattach: load session from persistent store
      if (this.sessionIsolation) {
        try {
          const loaded = await this.sessionIsolation.loadSession(sessionId);
          if (loaded) {
            // Apply the latest JWT role claim to the rehydrated session
            // (if present) so reattach does not pin the persisted role.
            if (roleOverride !== undefined) {
              await this.sessionIsolation.setSessionRole(sessionId, roleOverride);
            }
            // Recreate a transport bound to the recovered session ID
            const reattachedTransport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => sessionId,
              onsessioninitialized: (restoredId: string) => {
                this.transports.set(restoredId, reattachedTransport);
              },
            });

            reattachedTransport.onclose = () => {
              const sid = reattachedTransport.sessionId;
              if (sid) {
                this.transports.delete(sid);
                this.sessionIsolation?.destroySession(sid);
                console.error(`[EVOKORE-HTTP] Reattached session closed: ${sid}`);
              }
            };

            // Connect the MCP server to the reattached transport
            try {
              await this.mcpServer.connect(reattachedTransport);
            } catch (err) {
              this.transports.delete(sessionId);
              await reattachedTransport.close().catch(() => {});
              throw err;
            }

            console.error(`[EVOKORE-HTTP] Session reattached: ${sessionId}`);

            // Emit webhook event for reattachment
            if (this.webhookManager) {
              this.webhookManager.emit("session_resumed", { sessionId });
            }
            this.auditLog.log("session_resume", "success", { sessionId });
            this.telemetryManager?.recordSessionResume();

            // Handle the request with the reattached transport
            await reattachedTransport.handleRequest(req, res);
            return;
          }
        } catch (err: any) {
          console.error(`[EVOKORE-HTTP] Session reattachment failed for ${sessionId}:`, err?.message || err);
        }
      }

      // Session not found in persistent store (or no store configured): 404
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message: "Session not found",
          data: { sessionId },
        },
        id: null,
      }));
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
        this.sessionIsolation?.createSession(newSessionId, role, tenantIdOverride);
        this.auditLog.log("session_create", "success", {
          sessionId: newSessionId,
          actor: role ?? "system",
          metadata: { transport: "http", tenantId: tenantIdOverride },
        });
        this.telemetryManager?.recordSessionStart();
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
// @AI:NAV[END:class-httpserver]
