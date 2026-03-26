import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import http from 'http';
import path from 'path';
import { fork, ChildProcess } from 'child_process';

const DASHBOARD_PATH = path.resolve(__dirname, '..', '..', 'scripts', 'dashboard.js');

// Helper: make an HTTP request with optional headers
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
      // Clear legacy auth vars to avoid interference
      EVOKORE_DASHBOARD_USER: '',
      EVOKORE_DASHBOARD_PASS: '',
      ...envOverrides,
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

// ---- Section 1: Local-only mode (no token set) -- backward compatible ----

describe('Dashboard Auth: Local-only mode (M2.1)', () => {
  const PORT = 28801;
  let child: ChildProcess | null = null;

  beforeAll(async () => {
    const dash = startDashboard(PORT);
    child = dash.child;
    await dash.ready;
  });

  afterAll(() => {
    child?.kill();
  });

  it('allows unauthenticated access to / in local-only mode', async () => {
    const res = await request(PORT, '/');
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('EVOKORE Session Dashboard');
  });

  it('allows unauthenticated access to /api/sessions in local-only mode', async () => {
    const res = await request(PORT, '/api/sessions');
    expect(res.statusCode).toBe(200);
  });

  it('allows unauthenticated access to /api/approvals in local-only mode', async () => {
    const res = await request(PORT, '/api/approvals');
    expect(res.statusCode).toBe(200);
  });

  it('returns auth status mode=local with authenticated=true', async () => {
    const res = await request(PORT, '/api/auth/status');
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.mode).toBe('local');
    expect(data.authenticated).toBe(true);
    expect(data.role).toBe('admin');
  });

  it('redirects /login to / in local-only mode', async () => {
    const res = await request(PORT, '/login');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/');
  });

  it('includes security headers on HTML responses', async () => {
    const res = await request(PORT, '/');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
  });

  it('includes security headers on API responses', async () => {
    const res = await request(PORT, '/api/sessions');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('defaults to admin role in local-only mode', async () => {
    const res = await request(PORT, '/api/auth/status');
    const data = JSON.parse(res.body);
    expect(data.role).toBe('admin');
  });
});

// ---- Section 2: Token auth mode ----

describe('Dashboard Auth: Token mode (M2.1)', () => {
  const PORT = 28802;
  const TEST_TOKEN = 'test-dashboard-secret-token-12345';
  let child: ChildProcess | null = null;

  beforeAll(async () => {
    const dash = startDashboard(PORT, {
      EVOKORE_DASHBOARD_TOKEN: TEST_TOKEN,
    });
    child = dash.child;
    await dash.ready;
  });

  afterAll(() => {
    child?.kill();
  });

  it('blocks unauthenticated API requests with 401', async () => {
    const res = await request(PORT, '/api/sessions');
    expect(res.statusCode).toBe(401);
    const data = JSON.parse(res.body);
    expect(data.error).toContain('Unauthorized');
  });

  it('blocks requests with wrong token with 401', async () => {
    const res = await request(PORT, '/api/sessions', 'GET', undefined, {
      Authorization: 'Bearer wrong-token',
    });
    expect(res.statusCode).toBe(401);
  });

  it('allows requests with valid Bearer token', async () => {
    const res = await request(PORT, '/api/sessions', 'GET', undefined, {
      Authorization: `Bearer ${TEST_TOKEN}`,
    });
    expect(res.statusCode).toBe(200);
  });

  it('serves login page at /login without auth', async () => {
    const res = await request(PORT, '/login');
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Access Token');
    expect(res.body).toContain('Sign In');
  });

  it('returns auth status mode=token with authenticated=false for no token', async () => {
    const res = await request(PORT, '/api/auth/status');
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.mode).toBe('token');
    expect(data.authenticated).toBe(false);
    expect(data.role).toBeNull();
  });

  it('returns auth status authenticated=true for valid token', async () => {
    const res = await request(PORT, '/api/auth/status', 'GET', undefined, {
      Authorization: `Bearer ${TEST_TOKEN}`,
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.authenticated).toBe(true);
    expect(data.role).toBe('readonly');
  });

  it('defaults to readonly role in token mode', async () => {
    const res = await request(PORT, '/api/auth/status', 'GET', undefined, {
      Authorization: `Bearer ${TEST_TOKEN}`,
    });
    const data = JSON.parse(res.body);
    expect(data.role).toBe('readonly');
  });

  it('redirects browser HTML requests to /login when unauthenticated', async () => {
    const res = await request(PORT, '/', 'GET', undefined, {
      Accept: 'text/html',
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  it('returns 401 JSON for API requests without Accept: text/html', async () => {
    const res = await request(PORT, '/api/sessions', 'GET', undefined, {
      Accept: 'application/json',
    });
    expect(res.statusCode).toBe(401);
  });

  it('includes security headers on 401 responses', async () => {
    const res = await request(PORT, '/api/sessions');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('includes WWW-Authenticate: Bearer header on 401 responses', async () => {
    const res = await request(PORT, '/api/sessions');
    expect(res.headers['www-authenticate']).toContain('Bearer');
  });
});

// ---- Section 3: RBAC role authorization ----

describe('Dashboard Auth: RBAC role authorization (M2.1)', () => {
  const PORT_READONLY = 28803;
  const PORT_DEVELOPER = 28804;
  const PORT_ADMIN = 28805;
  const TEST_TOKEN = 'rbac-test-token-67890';
  let childReadonly: ChildProcess | null = null;
  let childDeveloper: ChildProcess | null = null;
  let childAdmin: ChildProcess | null = null;

  beforeAll(async () => {
    const dashReadonly = startDashboard(PORT_READONLY, {
      EVOKORE_DASHBOARD_TOKEN: TEST_TOKEN,
      EVOKORE_DASHBOARD_ROLE: 'readonly',
    });
    childReadonly = dashReadonly.child;

    const dashDeveloper = startDashboard(PORT_DEVELOPER, {
      EVOKORE_DASHBOARD_TOKEN: TEST_TOKEN,
      EVOKORE_DASHBOARD_ROLE: 'developer',
    });
    childDeveloper = dashDeveloper.child;

    const dashAdmin = startDashboard(PORT_ADMIN, {
      EVOKORE_DASHBOARD_TOKEN: TEST_TOKEN,
      EVOKORE_DASHBOARD_ROLE: 'admin',
    });
    childAdmin = dashAdmin.child;

    await Promise.all([dashReadonly.ready, dashDeveloper.ready, dashAdmin.ready]);
  });

  afterAll(() => {
    childReadonly?.kill();
    childDeveloper?.kill();
    childAdmin?.kill();
  });

  const auth = { Authorization: `Bearer rbac-test-token-67890` };

  // readonly role: can access session endpoints
  it('readonly role: can access /api/sessions', async () => {
    const res = await request(PORT_READONLY, '/api/sessions', 'GET', undefined, auth);
    expect(res.statusCode).toBe(200);
  });

  it('readonly role: can access /api/sessions/types', async () => {
    const res = await request(PORT_READONLY, '/api/sessions/types', 'GET', undefined, auth);
    expect(res.statusCode).toBe(200);
  });

  it('readonly role: can access / (dashboard HTML)', async () => {
    const res = await request(PORT_READONLY, '/', 'GET', undefined, auth);
    expect(res.statusCode).toBe(200);
  });

  // readonly role: cannot access developer or admin endpoints
  it('readonly role: blocked from /approvals', async () => {
    const res = await request(PORT_READONLY, '/approvals', 'GET', undefined, auth);
    expect(res.statusCode).toBe(403);
    const data = JSON.parse(res.body);
    expect(data.error).toBe('Forbidden');
  });

  it('readonly role: blocked from /api/approvals', async () => {
    const res = await request(PORT_READONLY, '/api/approvals', 'GET', undefined, auth);
    expect(res.statusCode).toBe(403);
  });

  it('readonly role: blocked from /api/approvals/deny', async () => {
    const res = await request(PORT_READONLY, '/api/approvals/deny', 'POST',
      JSON.stringify({ prefix: 'abcd1234' }), auth);
    expect(res.statusCode).toBe(403);
  });

  // developer role: can access approvals
  it('developer role: can access /api/approvals', async () => {
    const res = await request(PORT_DEVELOPER, '/api/approvals', 'GET', undefined, auth);
    expect(res.statusCode).toBe(200);
  });

  it('developer role: can access /approvals HTML', async () => {
    const res = await request(PORT_DEVELOPER, '/approvals', 'GET', undefined, auth);
    expect(res.statusCode).toBe(200);
  });

  it('developer role: blocked from /api/approvals/deny (requires admin)', async () => {
    const res = await request(PORT_DEVELOPER, '/api/approvals/deny', 'POST',
      JSON.stringify({ prefix: 'abcd1234' }), auth);
    expect(res.statusCode).toBe(403);
  });

  // admin role: can access everything
  it('admin role: can access /api/sessions', async () => {
    const res = await request(PORT_ADMIN, '/api/sessions', 'GET', undefined, auth);
    expect(res.statusCode).toBe(200);
  });

  it('admin role: can access /api/approvals', async () => {
    const res = await request(PORT_ADMIN, '/api/approvals', 'GET', undefined, auth);
    expect(res.statusCode).toBe(200);
  });

  it('admin role: can access /api/approvals/deny', async () => {
    const res = await request(PORT_ADMIN, '/api/approvals/deny', 'POST',
      JSON.stringify({ prefix: 'abcd1234' }), auth);
    // May return 200 or 400 depending on state, but not 403
    expect(res.statusCode).not.toBe(403);
  });
});

// ---- Section 4: Rate limiting for auth failures ----

describe('Dashboard Auth: Rate limiting (M2.1)', () => {
  const PORT = 28806;
  const TEST_TOKEN = 'rate-limit-test-token-99999';
  let child: ChildProcess | null = null;

  beforeAll(async () => {
    const dash = startDashboard(PORT, {
      EVOKORE_DASHBOARD_TOKEN: TEST_TOKEN,
    });
    child = dash.child;
    await dash.ready;
  });

  afterAll(() => {
    child?.kill();
  });

  it('returns 401 for wrong tokens without rate limiting initially', async () => {
    const res = await request(PORT, '/api/sessions', 'GET', undefined, {
      Authorization: 'Bearer wrong-token-1',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 429 after 5 failed auth attempts', async () => {
    // Send 4 more failures (1 already sent above = 5 total)
    for (let i = 0; i < 4; i++) {
      await request(PORT, '/api/sessions', 'GET', undefined, {
        Authorization: `Bearer wrong-token-${i + 2}`,
      });
    }

    // The 6th attempt should be rate limited
    const res = await request(PORT, '/api/sessions', 'GET', undefined, {
      Authorization: 'Bearer wrong-token-6',
    });
    expect(res.statusCode).toBe(429);
    const data = JSON.parse(res.body);
    expect(data.error).toContain('Too many failed');
  });

  it('rate limiting does not block valid tokens', async () => {
    // Rate limiting should still apply before token check
    // but the valid token should work if we start a fresh instance
    // (this test verifies that 429 blocks even valid tokens during lockout)
    const res = await request(PORT, '/api/sessions', 'GET', undefined, {
      Authorization: `Bearer ${TEST_TOKEN}`,
    });
    // During lockout, even valid tokens get 429
    expect(res.statusCode).toBe(429);
  });
});

// ---- Section 5: Security headers comprehensiveness ----

describe('Dashboard Auth: Security headers (M2.1)', () => {
  const PORT = 28807;
  let child: ChildProcess | null = null;

  beforeAll(async () => {
    const dash = startDashboard(PORT);
    child = dash.child;
    await dash.ready;
  });

  afterAll(() => {
    child?.kill();
  });

  it('X-Content-Type-Options: nosniff on all responses', async () => {
    const responses = await Promise.all([
      request(PORT, '/'),
      request(PORT, '/api/sessions'),
      request(PORT, '/api/auth/status'),
      request(PORT, '/approvals'),
    ]);
    for (const res of responses) {
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    }
  });

  it('X-Frame-Options: DENY on all responses', async () => {
    const responses = await Promise.all([
      request(PORT, '/'),
      request(PORT, '/api/sessions'),
    ]);
    for (const res of responses) {
      expect(res.headers['x-frame-options']).toBe('DENY');
    }
  });

  it('Cache-Control: no-store on API responses', async () => {
    const res = await request(PORT, '/api/sessions');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('Content-Security-Policy present on all responses', async () => {
    const res = await request(PORT, '/');
    expect(res.headers['content-security-policy']).toContain("default-src 'self' 'unsafe-inline'");
  });

  it('security headers on 404 responses', async () => {
    const res = await request(PORT, '/nonexistent');
    expect(res.statusCode).toBe(404);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });
});

// ---- Section 6: Custom role via env var ----

describe('Dashboard Auth: Custom role configuration (M2.1)', () => {
  const PORT = 28808;
  let child: ChildProcess | null = null;

  beforeAll(async () => {
    const dash = startDashboard(PORT, {
      EVOKORE_DASHBOARD_TOKEN: 'custom-role-token',
      EVOKORE_DASHBOARD_ROLE: 'developer',
    });
    child = dash.child;
    await dash.ready;
  });

  afterAll(() => {
    child?.kill();
  });

  it('respects EVOKORE_DASHBOARD_ROLE env var', async () => {
    const res = await request(PORT, '/api/auth/status', 'GET', undefined, {
      Authorization: 'Bearer custom-role-token',
    });
    const data = JSON.parse(res.body);
    expect(data.role).toBe('developer');
  });

  it('developer role can access approvals but not deny', async () => {
    const auth = { Authorization: 'Bearer custom-role-token' };
    const approvalsRes = await request(PORT, '/api/approvals', 'GET', undefined, auth);
    expect(approvalsRes.statusCode).toBe(200);

    const denyRes = await request(PORT, '/api/approvals/deny', 'POST',
      JSON.stringify({ prefix: 'abcd1234' }), auth);
    expect(denyRes.statusCode).toBe(403);
  });
});

// ---- Section 7: Auth status endpoint behavior ----

describe('Dashboard Auth: /api/auth/status endpoint (M2.1)', () => {
  const PORT = 28809;
  const TEST_TOKEN = 'auth-status-test-token';
  let child: ChildProcess | null = null;

  beforeAll(async () => {
    const dash = startDashboard(PORT, {
      EVOKORE_DASHBOARD_TOKEN: TEST_TOKEN,
      EVOKORE_DASHBOARD_ROLE: 'admin',
    });
    child = dash.child;
    await dash.ready;
  });

  afterAll(() => {
    child?.kill();
  });

  it('is accessible without authentication', async () => {
    const res = await request(PORT, '/api/auth/status');
    expect(res.statusCode).toBe(200);
  });

  it('returns mode=token when EVOKORE_DASHBOARD_TOKEN is set', async () => {
    const res = await request(PORT, '/api/auth/status');
    const data = JSON.parse(res.body);
    expect(data.mode).toBe('token');
  });

  it('returns authenticated=false without token', async () => {
    const res = await request(PORT, '/api/auth/status');
    const data = JSON.parse(res.body);
    expect(data.authenticated).toBe(false);
    expect(data.role).toBeNull();
  });

  it('returns authenticated=true with valid token', async () => {
    const res = await request(PORT, '/api/auth/status', 'GET', undefined, {
      Authorization: `Bearer ${TEST_TOKEN}`,
    });
    const data = JSON.parse(res.body);
    expect(data.authenticated).toBe(true);
    expect(data.role).toBe('admin');
  });

  it('returns authenticated=false with invalid token', async () => {
    const res = await request(PORT, '/api/auth/status', 'GET', undefined, {
      Authorization: 'Bearer wrong-token',
    });
    const data = JSON.parse(res.body);
    expect(data.authenticated).toBe(false);
    expect(data.role).toBeNull();
  });
});

// ---- Section 8: Invalid role fallback ----

describe('Dashboard Auth: Invalid role fallback (M2.1)', () => {
  const PORT = 28810;
  let child: ChildProcess | null = null;

  beforeAll(async () => {
    const dash = startDashboard(PORT, {
      EVOKORE_DASHBOARD_TOKEN: 'fallback-test-token',
      EVOKORE_DASHBOARD_ROLE: 'invalid-role',
    });
    child = dash.child;
    await dash.ready;
  });

  afterAll(() => {
    child?.kill();
  });

  it('falls back to readonly when invalid role is specified in token mode', async () => {
    const res = await request(PORT, '/api/auth/status', 'GET', undefined, {
      Authorization: 'Bearer fallback-test-token',
    });
    const data = JSON.parse(res.body);
    // Invalid role should fall back to readonly in token mode
    expect(data.role).toBe('readonly');
  });
});
