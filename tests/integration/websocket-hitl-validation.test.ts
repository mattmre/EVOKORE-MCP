import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

const HTTP_SERVER_PATH = path.resolve(__dirname, '..', '..', 'src', 'HttpServer.ts');
const SECURITY_MANAGER_PATH = path.resolve(__dirname, '..', '..', 'src', 'SecurityManager.ts');
const INDEX_PATH = path.resolve(__dirname, '..', '..', 'src', 'index.ts');
const DASHBOARD_PATH = path.resolve(__dirname, '..', '..', 'scripts', 'dashboard.js');
const ENV_EXAMPLE_PATH = path.resolve(__dirname, '..', '..', '.env.example');

describe('WebSocket HITL Real-Time Approvals (M3.3)', () => {
  let httpServerSource: string;
  let securityManagerSource: string;
  let indexSource: string;
  let dashboardSource: string;
  let envExampleSource: string;

  beforeAll(() => {
    httpServerSource = fs.readFileSync(HTTP_SERVER_PATH, 'utf8');
    securityManagerSource = fs.readFileSync(SECURITY_MANAGER_PATH, 'utf8');
    indexSource = fs.readFileSync(INDEX_PATH, 'utf8');
    dashboardSource = fs.readFileSync(DASHBOARD_PATH, 'utf8');
    envExampleSource = fs.readFileSync(ENV_EXAMPLE_PATH, 'utf8');
  });

  describe('Section 1: Module Structure', () => {
    it('HttpServer imports WebSocketServer from ws', () => {
      expect(httpServerSource).toContain('import { WebSocketServer, WebSocket } from "ws"');
    });

    it('HttpServer imports SecurityManager and ApprovalEvent', () => {
      expect(httpServerSource).toContain('import { SecurityManager, ApprovalEvent } from "./SecurityManager"');
    });

    it('EVOKORE_WS_APPROVALS_ENABLED env var recognized in HttpServer', () => {
      expect(httpServerSource).toContain('EVOKORE_WS_APPROVALS_ENABLED');
    });

    it('EVOKORE_WS_HEARTBEAT_MS env var recognized in HttpServer', () => {
      expect(httpServerSource).toContain('EVOKORE_WS_HEARTBEAT_MS');
    });

    it('EVOKORE_WS_MAX_CLIENTS env var recognized in HttpServer', () => {
      expect(httpServerSource).toContain('EVOKORE_WS_MAX_CLIENTS');
    });

    it('All WS-related env vars documented in .env.example', () => {
      expect(envExampleSource).toContain('EVOKORE_WS_APPROVALS_ENABLED');
      expect(envExampleSource).toContain('EVOKORE_WS_HEARTBEAT_MS');
      expect(envExampleSource).toContain('EVOKORE_WS_MAX_CLIENTS');
    });

    it('dashboard approvals WS endpoint vars documented in .env.example', () => {
      expect(envExampleSource).toContain('EVOKORE_DASHBOARD_APPROVAL_WS_URL');
      expect(envExampleSource).toContain('EVOKORE_DASHBOARD_APPROVAL_WS_TOKEN');
    });
  });

  describe('Section 2: WebSocket Protocol', () => {
    it('connection endpoint path is /ws/approvals', () => {
      expect(httpServerSource).toContain('/ws/approvals');
    });

    it('auth required on upgrade via Authorization header (BUG-04)', () => {
      // Primary auth: Authorization header
      expect(httpServerSource).toContain('req.headers.authorization');
      expect(httpServerSource).toContain('EVOKORE_WS_ALLOW_QUERY_TOKEN');
      // Query-string fallback still present as deprecated opt-in
      expect(httpServerSource).toContain('searchParams.get("token")');
      // Bearer token is injected for the standard auth check
      expect(httpServerSource).toContain('Bearer ${bearerToken}');
    });

    it('missing token rejected with 401 during upgrade', () => {
      expect(httpServerSource).toContain('Missing Authorization header');
      expect(httpServerSource).toContain('401 Unauthorized');
    });

    it('resolved WebSocket role is propagated onto the request after auth', () => {
      expect(httpServerSource).toContain('_evokoreRole');
      expect(httpServerSource).toContain('process.env.EVOKORE_ROLE');
    });

    it('snapshot sent on connection', () => {
      expect(httpServerSource).toContain('"snapshot"');
      expect(httpServerSource).toContain('getPendingApprovals');
    });

    it('messages are valid JSON with type field', () => {
      // Server sends JSON messages with type field
      expect(httpServerSource).toContain('JSON.stringify(event)');
      expect(httpServerSource).toContain('JSON.stringify({ type: "snapshot"');
      expect(httpServerSource).toContain('JSON.stringify({ type: "pong" })');
    });

    it('server broadcasts approval_requested, approval_acknowledged, approval_denied, approval_granted types', () => {
      // These are broadcast via broadcastApprovalEvent which sends the raw event from SecurityManager
      expect(httpServerSource).toContain('broadcastApprovalEvent');
      expect(securityManagerSource).toContain('"approval_requested"');
      expect(securityManagerSource).toContain('"approval_acknowledged"');
      expect(securityManagerSource).toContain('"approval_denied"');
      expect(securityManagerSource).toContain('"approval_granted"');
    });

    it('client can send approve message via WebSocket', () => {
      expect(httpServerSource).toContain('msg.type === "approve"');
      expect(httpServerSource).toContain('approveToken(prefix)');
    });

    it('client can send deny message via WebSocket', () => {
      expect(httpServerSource).toContain("msg.type === \"deny\"");
      expect(httpServerSource).toContain('msg.prefix');
    });

    it('ping/pong heartbeat implemented', () => {
      // Server-side ping
      expect(httpServerSource).toContain('client.ping()');
      // Client pong tracking
      expect(httpServerSource).toContain('_isAlive');
      expect(httpServerSource).toContain("ws.on(\"pong\"");
      // Client-side ping/pong
      expect(httpServerSource).toContain('JSON.stringify({ type: "pong" })');
    });

    it('non /ws/approvals upgrade requests rejected with 404', () => {
      expect(httpServerSource).toContain('404 Not Found');
    });

    it('max clients enforced with 503 response', () => {
      expect(httpServerSource).toContain('503 Service Unavailable');
      expect(httpServerSource).toContain('Too many WebSocket clients');
    });
  });

  describe('Section 3: SecurityManager Callback', () => {
    it('SecurityManager exports ApprovalEvent interface', () => {
      expect(securityManagerSource).toContain('export interface ApprovalEvent');
    });

    it('SecurityManager has setApprovalCallback method', () => {
      expect(securityManagerSource).toMatch(/setApprovalCallback\s*\(/);
    });

    it('callback invoked on generateToken (approval_requested)', () => {
      // Find the generateToken method body and verify it calls emitApprovalEvent
      const generateMatch = securityManagerSource.match(
        /generateToken\s*\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/
      );
      expect(generateMatch).toBeTruthy();
      expect(generateMatch![1]).toContain('emitApprovalEvent');
      expect(generateMatch![1]).toContain('"approval_requested"');
    });

    it('callback invoked on consumeToken (approval_granted)', () => {
      const consumeMatch = securityManagerSource.match(
        /consumeToken\s*\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/
      );
      expect(consumeMatch).toBeTruthy();
      expect(consumeMatch![1]).toContain('emitApprovalEvent');
      expect(consumeMatch![1]).toContain('"approval_granted"');
    });

    it('callback invoked on approveToken (approval_acknowledged)', () => {
      const approveMatch = securityManagerSource.match(
        /approveToken\s*\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/
      );
      expect(approveMatch).toBeTruthy();
      expect(approveMatch![1]).toContain('emitApprovalEvent');
      expect(approveMatch![1]).toContain('"approval_acknowledged"');
      expect(approveMatch![1]).toContain('approvedAt');
    });

    it('callback invoked on denyToken (approval_denied)', () => {
      const denyMatch = securityManagerSource.match(
        /denyToken\s*\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/
      );
      expect(denyMatch).toBeTruthy();
      expect(denyMatch![1]).toContain('emitApprovalEvent');
      expect(denyMatch![1]).toContain('"approval_denied"');
    });

    it('callback failure does not break token lifecycle (try-catch)', () => {
      expect(securityManagerSource).toContain('emitApprovalEvent');
      // The emitApprovalEvent method should have a try-catch
      const emitMatch = securityManagerSource.match(
        /emitApprovalEvent\s*\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/
      );
      expect(emitMatch).toBeTruthy();
      expect(emitMatch![1]).toContain('try');
      expect(emitMatch![1]).toContain('catch');
    });

    it('emitApprovalEvent is a no-op when no callback is registered', () => {
      const emitMatch = securityManagerSource.match(
        /emitApprovalEvent\s*\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/
      );
      expect(emitMatch).toBeTruthy();
      expect(emitMatch![1]).toContain('if (!this.approvalCallback) return');
    });
  });

  describe('Section 4: Dashboard Integration', () => {
    it('dashboard approvals page includes WebSocket connection code', () => {
      expect(dashboardSource).toContain('new WebSocket(');
      expect(dashboardSource).toContain('connectWebSocket');
    });

    it('dashboard can target an explicit approvals WebSocket endpoint', () => {
      expect(dashboardSource).toContain('EVOKORE_DASHBOARD_APPROVAL_WS_URL');
      expect(dashboardSource).toContain('approvalWsUrl');
      expect(dashboardSource).toContain('approvalWsHost');
      expect(dashboardSource).toContain('approvalWsPort');
    });

    it('dashboard supports a dedicated approvals WebSocket token override', () => {
      expect(dashboardSource).toContain('EVOKORE_DASHBOARD_APPROVAL_WS_TOKEN');
      expect(dashboardSource).toContain('approvalWsToken');
    });

    it('dashboard preserves same-origin fallback for non-loopback deployments', () => {
      expect(dashboardSource).toContain("window.location.host + '/ws/approvals'");
      expect(dashboardSource).toContain('loopbackHosts');
      expect(dashboardSource).toContain("approvalWsHost === '0.0.0.0' ? pageHost : approvalWsHost");
    });

    it('dashboard appends token with query-safe delimiter handling', () => {
      expect(dashboardSource).toContain("wsUrl.indexOf('?') === -1 ? '?' : '&'");
    });

    it('fallback to polling when WebSocket unavailable', () => {
      // On close, starts polling
      expect(dashboardSource).toContain('startPolling()');
      // Reconnect is scheduled
      expect(dashboardSource).toContain('scheduleReconnect');
    });

    it('reconnection logic with exponential backoff', () => {
      expect(dashboardSource).toContain('wsReconnectDelay');
      expect(dashboardSource).toContain('wsMaxReconnectDelay');
      // Backoff calculation: delay * 2 capped at max
      expect(dashboardSource).toContain('wsReconnectDelay * 2');
      expect(dashboardSource).toContain('Math.min(');
    });

    it('connection status indicator in UI', () => {
      expect(dashboardSource).toContain('ws-status');
      expect(dashboardSource).toContain('ws-dot-live');
      expect(dashboardSource).toContain('ws-dot-reconnecting');
      expect(dashboardSource).toContain('ws-dot-polling');
      expect(dashboardSource).toContain('updateWsStatus');
    });

    it('WS-based deny action when connected uses full token (BUG-01)', () => {
      // The deny function checks wsConnected before deciding transport
      expect(dashboardSource).toContain('wsConnected && wsConnection');
      // Deny sends full token, not an 8-char prefix
      expect(dashboardSource).toContain("JSON.stringify({ type: 'deny', token: token })");
    });

    it('WS-based approve action requires a live connection', () => {
      expect(dashboardSource).toContain('function approveToken(prefix)');
      expect(dashboardSource).toContain("JSON.stringify({ type: 'approve', prefix: prefix })");
      expect(dashboardSource).toContain('Approve requires a live WebSocket connection');
    });

    it('handles snapshot message type from server', () => {
      expect(dashboardSource).toContain("msg.type === 'snapshot'");
      expect(dashboardSource).toContain('msg.approvals');
    });

    it('handles approval_requested message type from server', () => {
      expect(dashboardSource).toContain("msg.type === 'approval_requested'");
    });

    it('handles approval_acknowledged message type from server', () => {
      expect(dashboardSource).toContain("msg.type === 'approval_acknowledged'");
      expect(dashboardSource).toContain('approvedAt');
    });

    it('handles approval_denied message type from server', () => {
      expect(dashboardSource).toContain("msg.type === 'approval_denied'");
    });

    it('handles approval_granted message type from server', () => {
      expect(dashboardSource).toContain("msg.type === 'approval_granted'");
    });

    it('handles WebSocket error messages by reloading approvals', () => {
      expect(dashboardSource).toContain("msg.type === 'error'");
      expect(dashboardSource).toContain('loadApprovals();');
      expect(dashboardSource).toContain('alert(msg.message)');
    });
  });

  describe('Section 5: Backward Compatibility', () => {
    it('file IPC (pending-approvals.json) still works when WS enabled', () => {
      // SecurityManager still calls persistPendingApprovals in all token lifecycle methods
      expect(securityManagerSource).toContain('persistPendingApprovals');
      // generateToken still persists
      const generateMatch = securityManagerSource.match(
        /generateToken\s*\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/
      );
      expect(generateMatch).toBeTruthy();
      expect(generateMatch![1]).toContain('persistPendingApprovals');
    });

    it('dashboard polling still works when WS disabled', () => {
      // The dashboard always starts with polling and HTTP load
      expect(dashboardSource).toContain('loadApprovals();');
      expect(dashboardSource).toContain('startPolling();');
      // Polling interval still exists
      expect(dashboardSource).toContain('setInterval(loadApprovals, 5000)');
    });

    it('existing HITL token flow unchanged', () => {
      // generateToken still returns token string
      expect(securityManagerSource).toMatch(/generateToken\s*\(toolName.*\).*:\s*string/);
      // validateToken still works the same
      expect(securityManagerSource).toMatch(/validateToken\s*\(toolName.*\).*:\s*boolean/);
      expect(securityManagerSource).toContain('approveToken');
      // consumeToken still deletes and persists
      const consumeMatch = securityManagerSource.match(
        /consumeToken\s*\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/
      );
      expect(consumeMatch).toBeTruthy();
      expect(consumeMatch![1]).toContain('pendingTokens.delete(token)');
      expect(consumeMatch![1]).toContain('persistPendingApprovals');
    });

    it('WebSocket feature is opt-in only (gated by env var)', () => {
      expect(httpServerSource).toContain('EVOKORE_WS_APPROVALS_ENABLED');
      expect(httpServerSource).toContain('"true"');
      // initWebSocketApprovals only called conditionally
      expect(httpServerSource).toContain('if (process.env.EVOKORE_WS_APPROVALS_ENABLED === "true")');
    });

    it('index.ts passes securityManager to HttpServer', () => {
      expect(indexSource).toContain('securityManager: this.securityManager');
    });

    it('HttpServer options interface includes securityManager', () => {
      expect(httpServerSource).toContain('securityManager?: SecurityManager');
    });

    it('WebSocket server properly cleaned up on stop()', () => {
      // stop() clears heartbeat interval
      const stopMatch = httpServerSource.match(
        /async stop\(\)[^{]*\{([\s\S]*?)\n  \}/
      );
      expect(stopMatch).toBeTruthy();
      expect(stopMatch![1]).toContain('wsHeartbeatInterval');
      expect(stopMatch![1]).toContain('wsClients');
      expect(stopMatch![1]).toContain('wss');
    });
  });
});
