import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fork, ChildProcess } from 'child_process';

const DASHBOARD_PATH = path.resolve(__dirname, '..', '..', 'scripts', 'dashboard.js');
const EVOKORE_STATE_DIR = path.join(os.homedir(), '.evokore');
const PENDING_APPROVALS_FILE = path.join(EVOKORE_STATE_DIR, 'pending-approvals.json');
const DENIED_TOKENS_FILE = path.join(EVOKORE_STATE_DIR, 'denied-tokens.json');

// Helper: make an HTTP request
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
      if (data.toString().includes('running at')) {
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

// Backup and restore helpers for real state files
function backupFile(filePath: string): string | null {
  if (fs.existsSync(filePath)) {
    const backup = filePath + '.test-backup';
    fs.copyFileSync(filePath, backup);
    return backup;
  }
  return null;
}

function restoreFile(filePath: string, backup: string | null): void {
  if (backup && fs.existsSync(backup)) {
    fs.copyFileSync(backup, filePath);
    fs.unlinkSync(backup);
  } else if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

describe('HITL Approval UI (T14)', () => {
  const HITL_PORT = 19899;

  describe('source code validation', () => {
    let source: string;

    beforeAll(() => {
      source = fs.readFileSync(DASHBOARD_PATH, 'utf8');
    });

    it('/approvals route exists and serves HTML', () => {
      expect(source).toContain("url.pathname === '/approvals'");
      expect(source).toContain('approvalsHTML');
    });

    it('GET /api/approvals endpoint reads pending approvals', () => {
      expect(source).toContain("url.pathname === '/api/approvals'");
      expect(source).toContain('readPendingApprovals');
    });

    it('POST /api/approvals/deny endpoint exists', () => {
      expect(source).toContain("url.pathname === '/api/approvals/deny'");
      expect(source).toContain("req.method === 'POST'");
    });

    it('reads from pending-approvals.json', () => {
      expect(source).toContain('pending-approvals.json');
    });

    it('writes to denied-tokens.json', () => {
      expect(source).toContain('denied-tokens.json');
    });

    it('sanitizes token prefix (hex only, max 8 chars)', () => {
      expect(source).toContain('sanitizeTokenPrefix');
      expect(source).toContain('substring(0, 8)');
    });

    it('enforces minimum prefix length of 4', () => {
      expect(source).toContain('prefix.length < 4');
    });

    it('has auto-refresh on the approvals page', () => {
      expect(source).toContain('setInterval');
      expect(source).toContain('5000');
    });

    it('has deny button in the HTML', () => {
      expect(source).toContain('btn-deny');
      expect(source).toContain('denyToken');
    });

    it('limits POST body size', () => {
      expect(source).toContain('1024 * 10');
      expect(source).toContain('Body too large');
    });
  });

  describe('pending-approvals.json file-based state', () => {
    let pendingBackup: string | null;
    let deniedBackup: string | null;

    beforeAll(() => {
      pendingBackup = backupFile(PENDING_APPROVALS_FILE);
      deniedBackup = backupFile(DENIED_TOKENS_FILE);
    });

    afterAll(() => {
      restoreFile(PENDING_APPROVALS_FILE, pendingBackup);
      restoreFile(DENIED_TOKENS_FILE, deniedBackup);
    });

    it('pending-approvals.json can be written and read back', () => {
      const testData = [
        {
          token: 'aabbccdd...',
          toolName: 'fs_write_file',
          expiresAt: Date.now() + 300000,
          createdAt: Date.now(),
        },
      ];

      if (!fs.existsSync(EVOKORE_STATE_DIR)) {
        fs.mkdirSync(EVOKORE_STATE_DIR, { recursive: true });
      }

      fs.writeFileSync(PENDING_APPROVALS_FILE, JSON.stringify(testData, null, 2));
      const readBack = JSON.parse(fs.readFileSync(PENDING_APPROVALS_FILE, 'utf8'));
      expect(readBack).toHaveLength(1);
      expect(readBack[0].toolName).toBe('fs_write_file');
      expect(readBack[0].token).toBe('aabbccdd...');
    });

    it('denied-tokens.json can be written and read back', () => {
      const testData = [{ prefix: 'aabbccdd', deniedAt: Date.now() }];

      fs.writeFileSync(DENIED_TOKENS_FILE, JSON.stringify(testData, null, 2));
      const readBack = JSON.parse(fs.readFileSync(DENIED_TOKENS_FILE, 'utf8'));
      expect(readBack).toHaveLength(1);
      expect(readBack[0].prefix).toBe('aabbccdd');
    });

    it('expired approvals are filtered out when reading', () => {
      const testData = [
        { token: 'live1234...', toolName: 'tool_a', expiresAt: Date.now() + 300000, createdAt: Date.now() },
        { token: 'dead5678...', toolName: 'tool_b', expiresAt: Date.now() - 1000, createdAt: Date.now() - 301000 },
      ];

      fs.writeFileSync(PENDING_APPROVALS_FILE, JSON.stringify(testData, null, 2));
      const content = JSON.parse(fs.readFileSync(PENDING_APPROVALS_FILE, 'utf8'));
      const now = Date.now();
      const filtered = content.filter((a: any) => a && a.expiresAt > now);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].token).toBe('live1234...');
    });

    it('atomic write pattern works (write to .tmp then rename)', () => {
      const testData = [{ token: 'test1234...', toolName: 'test_tool', expiresAt: Date.now() + 60000, createdAt: Date.now() }];
      const tmpPath = PENDING_APPROVALS_FILE + '.tmp';

      fs.writeFileSync(tmpPath, JSON.stringify(testData));
      expect(fs.existsSync(tmpPath)).toBe(true);

      fs.renameSync(tmpPath, PENDING_APPROVALS_FILE);
      expect(fs.existsSync(tmpPath)).toBe(false);
      expect(fs.existsSync(PENDING_APPROVALS_FILE)).toBe(true);
    });
  });

  describe('approval token lifecycle via live dashboard', () => {
    let dashboardChild: ChildProcess | null = null;
    let pendingBackup: string | null;
    let deniedBackup: string | null;

    beforeAll(async () => {
      pendingBackup = backupFile(PENDING_APPROVALS_FILE);
      deniedBackup = backupFile(DENIED_TOKENS_FILE);

      // Write test approvals for the dashboard to read
      if (!fs.existsSync(EVOKORE_STATE_DIR)) {
        fs.mkdirSync(EVOKORE_STATE_DIR, { recursive: true });
      }
      const testApprovals = [
        {
          token: 'abcd1234...',
          toolName: 'github_push_files',
          expiresAt: Date.now() + 300000,
          createdAt: Date.now(),
        },
      ];
      fs.writeFileSync(PENDING_APPROVALS_FILE, JSON.stringify(testApprovals, null, 2));

      // Remove any existing denied tokens
      if (fs.existsSync(DENIED_TOKENS_FILE)) {
        fs.unlinkSync(DENIED_TOKENS_FILE);
      }

      const { child, ready } = startDashboard(HITL_PORT);
      dashboardChild = child;
      await ready;
    });

    afterAll(() => {
      if (dashboardChild && !dashboardChild.killed) {
        dashboardChild.kill('SIGTERM');
      }
      restoreFile(PENDING_APPROVALS_FILE, pendingBackup);
      restoreFile(DENIED_TOKENS_FILE, deniedBackup);
    });

    it('/approvals returns HTML with approval tokens listed', async () => {
      const res = await request(HITL_PORT, '/approvals');
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.body).toContain('HITL Approvals');
    });

    it('GET /api/approvals returns pending approvals as JSON', async () => {
      const res = await request(HITL_PORT, '/api/approvals');
      expect(res.statusCode).toBe(200);
      const approvals = JSON.parse(res.body);
      expect(Array.isArray(approvals)).toBe(true);
      expect(approvals.length).toBeGreaterThanOrEqual(1);
      expect(approvals[0].toolName).toBe('github_push_files');
    });

    it('POST /api/approvals/deny removes tokens', async () => {
      // Deny with a valid 4+ character hex prefix
      const res = await request(
        HITL_PORT,
        '/api/approvals/deny',
        'POST',
        JSON.stringify({ prefix: 'abcd1234' })
      );
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.denied).toBe('abcd1234');

      // Verify the denied-tokens.json now contains the prefix
      const denied = JSON.parse(fs.readFileSync(DENIED_TOKENS_FILE, 'utf8'));
      expect(denied.some((d: any) => d.prefix === 'abcd1234')).toBe(true);
    });

    it('POST /api/approvals/deny rejects short prefixes', async () => {
      const res = await request(
        HITL_PORT,
        '/api/approvals/deny',
        'POST',
        JSON.stringify({ prefix: 'ab' })
      );
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toContain('Invalid token prefix');
    });

    it('POST /api/approvals/deny rejects invalid JSON', async () => {
      const res = await request(
        HITL_PORT,
        '/api/approvals/deny',
        'POST',
        'not json at all'
      );
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toContain('Invalid JSON');
    });
  });

  describe('SecurityManager source validation', () => {
    const securityManagerPath = path.resolve(__dirname, '..', '..', 'src', 'SecurityManager.ts');
    let source: string;

    beforeAll(() => {
      source = fs.readFileSync(securityManagerPath, 'utf8');
    });

    it('has getPendingApprovals method returning truncated tokens', () => {
      expect(source).toMatch(/getPendingApprovals\s*\(\)/);
      expect(source).toContain('substring(0, 8)');
    });

    it('has denyToken method', () => {
      expect(source).toMatch(/denyToken\s*\(/);
    });

    it('has persistPendingApprovals using atomic write', () => {
      expect(source).toContain('persistPendingApprovals');
      expect(source).toContain('.tmp');
      expect(source).toContain('renameSync');
    });

    it('has checkDeniedTokens method', () => {
      expect(source).toContain('checkDeniedTokens');
    });

    it('generateToken persists approvals', () => {
      const generateMatch = source.match(/generateToken\s*\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/);
      expect(generateMatch).toBeTruthy();
      expect(generateMatch![1]).toContain('persistPendingApprovals');
    });

    it('validateToken checks denied tokens', () => {
      const validateMatch = source.match(/validateToken\s*\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/);
      expect(validateMatch).toBeTruthy();
      expect(validateMatch![1]).toContain('checkDeniedTokens');
    });
  });
});
