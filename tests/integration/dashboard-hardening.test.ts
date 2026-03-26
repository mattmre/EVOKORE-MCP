import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fork, ChildProcess } from 'child_process';

const DASHBOARD_PATH = path.resolve(__dirname, '..', '..', 'scripts', 'dashboard.js');
const SESSIONS_DIR = path.join(os.homedir(), '.evokore', 'sessions');

// Helper: make an HTTP request with optional auth header
function request(
  port: number,
  urlPath: string,
  method = 'GET',
  body?: string,
  headers?: Record<string, string>
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const reqHeaders: Record<string, string> = {};
    if (body) reqHeaders['Content-Type'] = 'application/json';
    if (headers) Object.assign(reqHeaders, headers);

    const opts: http.RequestOptions = {
      hostname: '127.0.0.1',
      port,
      path: urlPath,
      method,
      headers: Object.keys(reqHeaders).length ? reqHeaders : undefined,
    };
    const req = http.request(opts, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () =>
        resolve({
          statusCode: res.statusCode!,
          headers: res.headers,
          body: Buffer.concat(chunks).toString(),
        })
      );
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// Start dashboard on a port with optional env overrides
function startDashboard(
  port: number,
  envOverrides?: Record<string, string>
): { child: ChildProcess; ready: Promise<void> } {
  const child = fork(DASHBOARD_PATH, [], {
    env: {
      ...process.env,
      EVOKORE_DASHBOARD_PORT: String(port),
      ...(envOverrides || {}),
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });

  const ready = new Promise<void>((resolve, reject) => {
    let stderr = '';
    const timeout = setTimeout(() => reject(new Error('Dashboard startup timeout')), 10000);

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      if (text.includes('running at')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    child.on('exit', (code) => {
      clearTimeout(timeout);
      if (code !== 0) reject(new Error(`Dashboard exited with code ${code}: ${stderr}`));
    });
  });

  return { child, ready };
}

describe('Dashboard Hardening', () => {
  describe('source code validation', () => {
    let source: string;

    beforeAll(() => {
      source = fs.readFileSync(DASHBOARD_PATH, 'utf8');
    });

    it('requires crypto module for timing-safe comparison', () => {
      expect(source).toContain("require('crypto')");
    });

    it('uses crypto.timingSafeEqual for credential checking', () => {
      expect(source).toContain('crypto.timingSafeEqual');
    });

    it('reads EVOKORE_DASHBOARD_TOKEN env var for Bearer token auth', () => {
      expect(source).toContain('EVOKORE_DASHBOARD_TOKEN');
    });

    it('has requireAuth function that sends 401 with WWW-Authenticate', () => {
      expect(source).toContain('requireAuth');
      expect(source).toContain('WWW-Authenticate');
      expect(source).toContain('401');
    });

    it('extracts Bearer token from Authorization header', () => {
      expect(source).toContain('extractBearerToken');
      expect(source).toContain('Bearer');
    });

    it('supports session filtering via query params', () => {
      expect(source).toContain("url.searchParams.get('status')");
      expect(source).toContain("url.searchParams.get('since')");
    });

    it('has auto-refresh on the sessions page (30s interval)', () => {
      expect(source).toContain('30000');
      expect(source).toContain('startAutoRefresh');
    });

    it('has auto-refresh on the approvals page (5s interval)', () => {
      expect(source).toContain('setInterval(loadApprovals, 5000)');
    });

    it('shows session context on approval cards', () => {
      expect(source).toContain('sessionId');
      expect(source).toContain('session-context');
    });

    it('shows approval status badges (pending/denied)', () => {
      expect(source).toContain('approval-status-pending');
      expect(source).toContain('approval-status-denied');
    });

    it('uses only Node.js built-in modules (zero external deps)', () => {
      const requireMatches = source.match(/require\(['"]([^'"]+)['"]\)/g) || [];
      const imports = requireMatches.map((m) => m.match(/require\(['"]([^'"]+)['"]\)/)![1]);
      const allowedBuiltins = ['http', 'fs', 'path', 'os', 'crypto'];
      for (const imp of imports) {
        expect(allowedBuiltins).toContain(imp);
      }
    });

    it('applies auth check before handling routes', () => {
      // The requireAuth call should come before any route matching in handleRequest
      const handleRequestMatch = source.match(/function handleRequest[\s\S]*?requireAuth/);
      expect(handleRequestMatch).toBeTruthy();
    });

    it('logs auth status on startup', () => {
      expect(source).toContain('Authentication: ENABLED');
      expect(source).toContain('Authentication: DISABLED');
    });
  });

  describe('unauthenticated mode (no credentials configured)', () => {
    const PORT = 28900;
    let child: ChildProcess | null = null;

    afterAll(() => {
      if (child && !child.killed) child.kill('SIGTERM');
    });

    it('allows access without auth headers when env vars are unset', async () => {
      const { child: c, ready } = startDashboard(PORT, {
        // Explicitly clear any existing auth env
        EVOKORE_DASHBOARD_USER: '',
        EVOKORE_DASHBOARD_PASS: '',
      });
      child = c;
      await ready;

      const res = await request(PORT, '/');
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('EVOKORE Session Dashboard');

      c.kill('SIGTERM');
      child = null;
    });

    it('/api/sessions returns JSON without auth', async () => {
      const { child: c, ready } = startDashboard(PORT + 1, {
        EVOKORE_DASHBOARD_USER: '',
        EVOKORE_DASHBOARD_PASS: '',
      });
      child = c;
      await ready;

      const res = await request(PORT + 1, '/api/sessions');
      expect(res.statusCode).toBe(200);
      const sessions = JSON.parse(res.body);
      expect(Array.isArray(sessions)).toBe(true);

      c.kill('SIGTERM');
      child = null;
    });

    it('/api/approvals returns JSON without auth', async () => {
      const { child: c, ready } = startDashboard(PORT + 2, {
        EVOKORE_DASHBOARD_USER: '',
        EVOKORE_DASHBOARD_PASS: '',
      });
      child = c;
      await ready;

      const res = await request(PORT + 2, '/api/approvals');
      expect(res.statusCode).toBe(200);
      const approvals = JSON.parse(res.body);
      expect(Array.isArray(approvals)).toBe(true);

      c.kill('SIGTERM');
      child = null;
    });
  });

  describe('authenticated mode (Bearer token configured)', () => {
    const PORT = 28910;
    const TEST_TOKEN = 'hardening-test-token-secure';
    let child: ChildProcess | null = null;

    afterAll(() => {
      if (child && !child.killed) child.kill('SIGTERM');
    });

    it('rejects requests without auth header (401)', async () => {
      const { child: c, ready } = startDashboard(PORT, {
        EVOKORE_DASHBOARD_TOKEN: TEST_TOKEN,
      });
      child = c;
      await ready;

      const res = await request(PORT, '/api/sessions');
      expect(res.statusCode).toBe(401);
      expect(res.headers['www-authenticate']).toContain('Bearer');

      c.kill('SIGTERM');
      child = null;
    });

    it('rejects requests with wrong credentials (401)', async () => {
      const { child: c, ready } = startDashboard(PORT + 1, {
        EVOKORE_DASHBOARD_TOKEN: TEST_TOKEN,
      });
      child = c;
      await ready;

      const res = await request(PORT + 1, '/api/sessions', 'GET', undefined, {
        Authorization: 'Bearer wrong-token',
      });
      expect(res.statusCode).toBe(401);
      expect(res.headers['www-authenticate']).toContain('Bearer');

      c.kill('SIGTERM');
      child = null;
    });

    it('allows requests with correct credentials (200)', async () => {
      const { child: c, ready } = startDashboard(PORT + 2, {
        EVOKORE_DASHBOARD_TOKEN: TEST_TOKEN,
      });
      child = c;
      await ready;

      const res = await request(PORT + 2, '/api/sessions', 'GET', undefined, {
        Authorization: `Bearer ${TEST_TOKEN}`,
      });
      expect(res.statusCode).toBe(200);

      c.kill('SIGTERM');
      child = null;
    });

    it('protects API endpoints with auth too', async () => {
      const { child: c, ready } = startDashboard(PORT + 3, {
        EVOKORE_DASHBOARD_TOKEN: TEST_TOKEN,
      });
      child = c;
      await ready;

      // Without auth
      const noAuth = await request(PORT + 3, '/api/sessions');
      expect(noAuth.statusCode).toBe(401);

      // With auth
      const withAuth = await request(PORT + 3, '/api/sessions', 'GET', undefined, {
        Authorization: `Bearer ${TEST_TOKEN}`,
      });
      expect(withAuth.statusCode).toBe(200);

      c.kill('SIGTERM');
      child = null;
    });

    it('protects /approvals endpoint with auth', async () => {
      const { child: c, ready } = startDashboard(PORT + 4, {
        EVOKORE_DASHBOARD_TOKEN: TEST_TOKEN,
        EVOKORE_DASHBOARD_ROLE: 'admin',
      });
      child = c;
      await ready;

      const noAuth = await request(PORT + 4, '/approvals');
      // Browser-like request without token gets redirected to login
      expect([401, 302]).toContain(noAuth.statusCode);

      const withAuth = await request(PORT + 4, '/approvals', 'GET', undefined, {
        Authorization: `Bearer ${TEST_TOKEN}`,
      });
      expect(withAuth.statusCode).toBe(200);
      expect(withAuth.body).toContain('HITL Approvals');

      c.kill('SIGTERM');
      child = null;
    });

    it('rejects partial credentials (empty token)', async () => {
      const { child: c, ready } = startDashboard(PORT + 5, {
        EVOKORE_DASHBOARD_TOKEN: TEST_TOKEN,
      });
      child = c;
      await ready;

      const res = await request(PORT + 5, '/api/sessions', 'GET', undefined, {
        Authorization: 'Bearer ',
      });
      expect(res.statusCode).toBe(401);

      c.kill('SIGTERM');
      child = null;
    });

    it('rejects malformed Authorization header (Basic instead of Bearer)', async () => {
      const { child: c, ready } = startDashboard(PORT + 6, {
        EVOKORE_DASHBOARD_TOKEN: TEST_TOKEN,
      });
      child = c;
      await ready;

      const res = await request(PORT + 6, '/api/sessions', 'GET', undefined, {
        Authorization: 'Basic dXNlcjpwYXNz',
      });
      expect(res.statusCode).toBe(401);

      c.kill('SIGTERM');
      child = null;
    });
  });

  describe('session filtering via query params', () => {
    const PORT = 28920;
    let child: ChildProcess | null = null;

    afterAll(() => {
      if (child && !child.killed) child.kill('SIGTERM');
    });

    it('/api/sessions accepts ?status= query parameter', async () => {
      const { child: c, ready } = startDashboard(PORT);
      child = c;
      await ready;

      const res = await request(PORT, '/api/sessions?status=active');
      expect(res.statusCode).toBe(200);
      const sessions = JSON.parse(res.body);
      expect(Array.isArray(sessions)).toBe(true);
      // All returned sessions should be active (if any exist)
      for (const s of sessions) {
        expect(s.status).toBe('active');
      }

      c.kill('SIGTERM');
      child = null;
    });

    it('/api/sessions accepts ?since= query parameter', async () => {
      const { child: c, ready } = startDashboard(PORT + 1);
      child = c;
      await ready;

      // Use a future date to ensure no sessions match
      const res = await request(PORT + 1, '/api/sessions?since=2099-01-01');
      expect(res.statusCode).toBe(200);
      const sessions = JSON.parse(res.body);
      expect(Array.isArray(sessions)).toBe(true);
      expect(sessions.length).toBe(0);

      c.kill('SIGTERM');
      child = null;
    });

    it('/api/sessions works with combined filters', async () => {
      const { child: c, ready } = startDashboard(PORT + 2);
      child = c;
      await ready;

      const res = await request(PORT + 2, '/api/sessions?status=active&since=2020-01-01');
      expect(res.statusCode).toBe(200);
      const sessions = JSON.parse(res.body);
      expect(Array.isArray(sessions)).toBe(true);

      c.kill('SIGTERM');
      child = null;
    });

    it('/api/sessions returns all sessions with no query params', async () => {
      const { child: c, ready } = startDashboard(PORT + 3);
      child = c;
      await ready;

      const allRes = await request(PORT + 3, '/api/sessions');
      expect(allRes.statusCode).toBe(200);
      const allSessions = JSON.parse(allRes.body);
      expect(Array.isArray(allSessions)).toBe(true);

      c.kill('SIGTERM');
      child = null;
    });
  });

  describe('/approvals endpoint format', () => {
    const PORT = 28930;
    let child: ChildProcess | null = null;

    afterAll(() => {
      if (child && !child.killed) child.kill('SIGTERM');
    });

    it('/api/approvals returns JSON array', async () => {
      const { child: c, ready } = startDashboard(PORT);
      child = c;
      await ready;

      const res = await request(PORT, '/api/approvals');
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.headers['cache-control']).toBe('no-store');
      const approvals = JSON.parse(res.body);
      expect(Array.isArray(approvals)).toBe(true);

      c.kill('SIGTERM');
      child = null;
    });

    it('/approvals HTML page contains auto-refresh indicator', async () => {
      const { child: c, ready } = startDashboard(PORT + 1);
      child = c;
      await ready;

      const res = await request(PORT + 1, '/approvals');
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('Auto-refresh 5s');
      expect(res.body).toContain('setInterval(loadApprovals, 5000)');

      c.kill('SIGTERM');
      child = null;
    });

    it('/approvals HTML has status badge styles', async () => {
      const { child: c, ready } = startDashboard(PORT + 2);
      child = c;
      await ready;

      const res = await request(PORT + 2, '/approvals');
      expect(res.body).toContain('approval-status-pending');
      expect(res.body).toContain('approval-status-denied');

      c.kill('SIGTERM');
      child = null;
    });

    it('/ dashboard HTML has auto-refresh (30s)', async () => {
      const { child: c, ready } = startDashboard(PORT + 3);
      child = c;
      await ready;

      const res = await request(PORT + 3, '/');
      expect(res.body).toContain('Auto-refresh 30s');
      expect(res.body).toContain('setInterval(loadSessions, 30000)');

      c.kill('SIGTERM');
      child = null;
    });

    it('/ dashboard HTML has status and since filter controls', async () => {
      const { child: c, ready } = startDashboard(PORT + 4);
      child = c;
      await ready;

      const res = await request(PORT + 4, '/');
      expect(res.body).toContain('status-filter');
      expect(res.body).toContain('since-filter');

      c.kill('SIGTERM');
      child = null;
    });
  });
});
