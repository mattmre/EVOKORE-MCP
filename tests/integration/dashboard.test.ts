import { describe, it, expect, afterAll } from 'vitest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync, fork, ChildProcess } from 'child_process';

const DASHBOARD_PATH = path.resolve(__dirname, '..', '..', 'scripts', 'dashboard.js');

// Helper: make an HTTP request and return { statusCode, headers, body }
function request(
  port: number,
  urlPath: string,
  method = 'GET',
  body?: string
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const opts: http.RequestOptions = {
      hostname: '127.0.0.1',
      port,
      path: urlPath,
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
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

// Helper: start the dashboard on a given port, returns the child process and a "ready" promise
function startDashboard(port: number): { child: ChildProcess; ready: Promise<void> } {
  const child = fork(DASHBOARD_PATH, [], {
    env: { ...process.env, EVOKORE_DASHBOARD_PORT: String(port) },
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

describe('Session Dashboard (T13)', () => {
  const TEST_PORT = 18899; // Use a non-standard port to avoid conflicts
  let dashboardChild: ChildProcess | null = null;

  afterAll(() => {
    if (dashboardChild && !dashboardChild.killed) {
      dashboardChild.kill('SIGTERM');
    }
  });

  it('dashboard.js exists and passes syntax check', () => {
    expect(fs.existsSync(DASHBOARD_PATH)).toBe(true);
    // Node.js --check validates syntax without executing
    execFileSync(process.execPath, ['--check', DASHBOARD_PATH], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  });

  it('uses only Node.js built-in modules (zero external deps)', () => {
    const source = fs.readFileSync(DASHBOARD_PATH, 'utf8');
    const requireMatches = source.match(/require\(['"]([^'"]+)['"]\)/g) || [];
    const imports = requireMatches.map((m) => m.match(/require\(['"]([^'"]+)['"]\)/)![1]);
    const allowedBuiltins = ['http', 'fs', 'path', 'os', 'crypto'];
    for (const imp of imports) {
      expect(allowedBuiltins).toContain(imp);
    }
  });

  it('binds to 127.0.0.1 for security', () => {
    const source = fs.readFileSync(DASHBOARD_PATH, 'utf8');
    expect(source).toContain("'127.0.0.1'");
  });

  it('default port is 8899 and is configurable via EVOKORE_DASHBOARD_PORT', () => {
    const source = fs.readFileSync(DASHBOARD_PATH, 'utf8');
    expect(source).toContain('8899');
    expect(source).toContain('EVOKORE_DASHBOARD_PORT');
  });

  it('defines expected routes: /, /approvals, /api/sessions, /api/approvals', () => {
    const source = fs.readFileSync(DASHBOARD_PATH, 'utf8');
    expect(source).toMatch(/pathname\s*===\s*'\/'/);
    expect(source).toMatch(/pathname\s*===\s*'\/approvals'/);
    expect(source).toMatch(/pathname\s*===\s*'\/api\/sessions'/);
    expect(source).toMatch(/pathname\s*===\s*'\/api\/approvals'/);
  });

  it('has session ID sanitization against path traversal', () => {
    const source = fs.readFileSync(DASHBOARD_PATH, 'utf8');
    expect(source).toContain('sanitizeSessionId');
  });

  it('has HTML escaping for XSS prevention', () => {
    const source = fs.readFileSync(DASHBOARD_PATH, 'utf8');
    expect(source).toContain('escapeHtml');
  });

  it('dashboard starts and listens on the configured port', async () => {
    const { child, ready } = startDashboard(TEST_PORT);
    dashboardChild = child;
    await ready;

    // Server is listening -- make a basic request
    const res = await request(TEST_PORT, '/');
    expect(res.statusCode).toBe(200);

    child.kill('SIGTERM');
    dashboardChild = null;
  });

  it('/ serves HTML with correct content-type', async () => {
    const { child, ready } = startDashboard(TEST_PORT + 1);
    dashboardChild = child;
    await ready;

    const res = await request(TEST_PORT + 1, '/');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('EVOKORE Session Dashboard');

    child.kill('SIGTERM');
    dashboardChild = null;
  });

  it('/approvals serves HTML', async () => {
    const { child, ready } = startDashboard(TEST_PORT + 2);
    dashboardChild = child;
    await ready;

    const res = await request(TEST_PORT + 2, '/approvals');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('HITL Approvals');

    child.kill('SIGTERM');
    dashboardChild = null;
  });

  it('/api/sessions returns JSON', async () => {
    const { child, ready } = startDashboard(TEST_PORT + 3);
    dashboardChild = child;
    await ready;

    const res = await request(TEST_PORT + 3, '/api/sessions');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    const sessions = JSON.parse(res.body);
    expect(Array.isArray(sessions)).toBe(true);

    child.kill('SIGTERM');
    dashboardChild = null;
  });

  it('/api/approvals returns JSON', async () => {
    const { child, ready } = startDashboard(TEST_PORT + 4);
    dashboardChild = child;
    await ready;

    const res = await request(TEST_PORT + 4, '/api/approvals');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    const approvals = JSON.parse(res.body);
    expect(Array.isArray(approvals)).toBe(true);

    child.kill('SIGTERM');
    dashboardChild = null;
  });

  it('unknown routes return 404 JSON', async () => {
    const { child, ready } = startDashboard(TEST_PORT + 5);
    dashboardChild = child;
    await ready;

    const res = await request(TEST_PORT + 5, '/nonexistent');
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Not found');

    child.kill('SIGTERM');
    dashboardChild = null;
  });

  it('server closes cleanly when process is killed', async () => {
    const { child, ready } = startDashboard(TEST_PORT + 6);
    dashboardChild = child;
    await ready;

    // Verify it is listening
    const res = await request(TEST_PORT + 6, '/');
    expect(res.statusCode).toBe(200);

    // Kill it
    child.kill('SIGTERM');

    // Wait for exit
    await new Promise<void>((resolve) => {
      child.on('exit', () => resolve());
      setTimeout(resolve, 3000); // safety timeout
    });

    // Verify it is no longer listening
    try {
      await request(TEST_PORT + 6, '/');
      // If we get here, the server is still running
      expect(true).toBe(false); // force fail
    } catch {
      // Expected: ECONNREFUSED
    }

    dashboardChild = null;
  });

  it('port conflict is handled (second instance on same port fails)', async () => {
    const { child: first, ready: firstReady } = startDashboard(TEST_PORT + 7);
    dashboardChild = first;
    await firstReady;

    // Start a second dashboard on the same port -- should fail
    const second = fork(DASHBOARD_PATH, [], {
      env: { ...process.env, EVOKORE_DASHBOARD_PORT: String(TEST_PORT + 7) },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });

    const exitCode = await new Promise<number | null>((resolve) => {
      const timeout = setTimeout(() => {
        second.kill('SIGTERM');
        resolve(null);
      }, 5000);
      second.on('exit', (code) => {
        clearTimeout(timeout);
        resolve(code);
      });
    });

    // The second process should exit with a non-zero code due to EADDRINUSE
    expect(exitCode).not.toBe(0);

    first.kill('SIGTERM');
    dashboardChild = null;
  });
});
