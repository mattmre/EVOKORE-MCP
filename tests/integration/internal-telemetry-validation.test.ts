import { describe, it, expect, beforeEach, afterEach, afterAll, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import { fork, ChildProcess } from 'child_process';

// ---------------------------------------------------------------------------
// 1. AuditLog unit tests
// ---------------------------------------------------------------------------

describe('AuditLog', () => {
  let AuditLog: typeof import('../../src/AuditLog').AuditLog;
  let redactForAudit: typeof import('../../src/AuditLog').redactForAudit;
  let tmpDir: string;
  let auditFile: string;

  beforeEach(async () => {
    // Fresh temp directory per test
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-audit-test-'));
    auditFile = path.join(tmpDir, 'audit.jsonl');

    // Reset singleton
    const mod = await import('../../src/AuditLog');
    AuditLog = mod.AuditLog;
    redactForAudit = mod.redactForAudit;
    AuditLog.resetInstance();
  });

  afterEach(() => {
    // Clean up temp files
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch { /* best effort */ }
  });

  it('writes entries when enabled', () => {
    const log = new AuditLog({ enabled: true, auditDir: tmpDir, auditFile });

    log.write({
      timestamp: Date.now(),
      eventType: 'tool_call',
      outcome: 'success',
      resource: 'reload_plugins',
    });

    expect(fs.existsSync(auditFile)).toBe(true);
    const lines = fs.readFileSync(auditFile, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);

    const entry = JSON.parse(lines[0]);
    expect(entry.eventType).toBe('tool_call');
    expect(entry.outcome).toBe('success');
    expect(entry.resource).toBe('reload_plugins');
  });

  it('does not write entries when disabled', () => {
    const log = new AuditLog({ enabled: false, auditDir: tmpDir, auditFile });

    log.write({
      timestamp: Date.now(),
      eventType: 'tool_call',
      outcome: 'success',
    });

    expect(fs.existsSync(auditFile)).toBe(false);
  });

  it('respects EVOKORE_AUDIT_LOG env var opt-out', () => {
    // Without the env var, AuditLog defaults to enabled (opt-out model)
    const log = new AuditLog({ auditDir: tmpDir, auditFile });
    expect(log.isEnabled()).toBe(true);
  });

  it('entries have required fields', () => {
    const log = new AuditLog({ enabled: true, auditDir: tmpDir, auditFile });

    log.log('auth_failure', 'failure', {
      sessionId: 'test-session',
      actor: 'developer',
      resource: '/mcp',
      metadata: { path: '/mcp' },
    });

    const entries = log.getEntries();
    expect(entries).toHaveLength(1);

    const entry = entries[0];
    expect(entry.timestamp).toBeTypeOf('number');
    expect(entry.timestamp).toBeGreaterThan(0);
    expect(entry.eventType).toBe('auth_failure');
    expect(entry.outcome).toBe('failure');
    expect(entry.sessionId).toBe('test-session');
    expect(entry.actor).toBe('developer');
    expect(entry.resource).toBe('/mcp');
    expect(entry.metadata).toBeDefined();
  });

  it('getEntries returns newest first with pagination', () => {
    const log = new AuditLog({ enabled: true, auditDir: tmpDir, auditFile });

    for (let i = 0; i < 5; i++) {
      log.log(`event_${i}`, 'success');
    }

    const all = log.getEntries(100, 0);
    expect(all).toHaveLength(5);
    expect(all[0].eventType).toBe('event_4'); // newest first

    const page = log.getEntries(2, 1);
    expect(page).toHaveLength(2);
    expect(page[0].eventType).toBe('event_3');
    expect(page[1].eventType).toBe('event_2');
  });

  it('getSummary returns counts by eventType', () => {
    const log = new AuditLog({ enabled: true, auditDir: tmpDir, auditFile });

    log.log('auth_success', 'success');
    log.log('auth_success', 'success');
    log.log('auth_failure', 'failure');
    log.log('session_create', 'success');

    const summary = log.getSummary();
    expect(summary.auth_success).toBe(2);
    expect(summary.auth_failure).toBe(1);
    expect(summary.session_create).toBe(1);
  });

  it('rotation works when file exceeds maxBytes', () => {
    const smallMax = 200; // 200 bytes triggers rotation quickly
    const log = new AuditLog({ enabled: true, auditDir: tmpDir, auditFile, maxBytes: smallMax, maxRotations: 2 });

    // Write enough entries to exceed the limit
    for (let i = 0; i < 10; i++) {
      log.log(`event_${i}`, 'success', { metadata: { data: 'x'.repeat(50) } });
    }

    // After rotation, the .1 backup should exist
    const rotated = `${auditFile}.1`;
    expect(fs.existsSync(rotated)).toBe(true);
    // Current file should still exist and be smaller than maxBytes or recently created
    expect(fs.existsSync(auditFile)).toBe(true);
  });

  it('redactForAudit redacts sensitive keys', () => {
    const result = redactForAudit({
      username: 'admin',
      token: 'secret123',
      password: 'hunter2',
      api_key: 'sk-abc',
      normalField: 'visible',
    });

    expect(result).toBeDefined();
    expect(result!.username).toBe('admin');
    expect(result!.token).toBe('[REDACTED]');
    expect(result!.password).toBe('[REDACTED]');
    expect(result!.api_key).toBe('[REDACTED]');
    expect(result!.normalField).toBe('visible');
  });

  it('redacts sensitive metadata before persisting audit entries', () => {
    const log = new AuditLog({ enabled: true, auditDir: tmpDir, auditFile });

    log.log('auth_failure', 'failure', {
      actor: 'developer',
      metadata: {
        path: '/mcp',
        token: 'secret123',
        password: 'hunter2',
      },
    });

    const lines = fs.readFileSync(auditFile, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);

    const entry = JSON.parse(lines[0]);
    expect(entry.metadata.path).toBe('/mcp');
    expect(entry.metadata.token).toBe('[REDACTED]');
    expect(entry.metadata.password).toBe('[REDACTED]');
  });

  it('redactForAudit handles undefined input', () => {
    expect(redactForAudit(undefined)).toBeUndefined();
  });

  it('redacts nested sensitive keys', () => {
    const input = { outer: { token: 'secret123', safe: 'visible' }, normal: 'ok' };
    const redacted = redactForAudit(input as unknown as Record<string, unknown>);
    expect((redacted?.outer as any)?.token).toBe('[REDACTED]');
    expect((redacted?.outer as any)?.safe).toBe('visible');
    expect(redacted?.normal).toBe('ok');
  });

  it('getEntryCount returns correct count', () => {
    const log = new AuditLog({ enabled: true, auditDir: tmpDir, auditFile });

    expect(log.getEntryCount()).toBe(0);

    log.log('test', 'success');
    log.log('test', 'success');

    expect(log.getEntryCount()).toBe(2);
  });

  it('singleton pattern works', () => {
    const instance = new AuditLog({ enabled: true, auditDir: tmpDir, auditFile });
    AuditLog.setInstance(instance);

    expect(AuditLog.getInstance()).toBe(instance);

    AuditLog.resetInstance();
    const fresh = AuditLog.getInstance();
    expect(fresh).not.toBe(instance);
  });
});

// ---------------------------------------------------------------------------
// 2. TelemetryManager enhanced metrics tests
// ---------------------------------------------------------------------------

describe('TelemetryManager enhanced metrics', () => {
  let TelemetryManager: typeof import('../../src/TelemetryManager').TelemetryManager;

  beforeEach(async () => {
    const mod = await import('../../src/TelemetryManager');
    TelemetryManager = mod.TelemetryManager;
  });

  it('telemetryVersion field is present', () => {
    const tm = new TelemetryManager();
    tm.setEnabled(true);

    const metrics = tm.getMetrics();
    expect(metrics.telemetryVersion).toBeTypeOf('number');
    expect(metrics.telemetryVersion).toBeGreaterThanOrEqual(2);
  });

  it('session metrics are tracked', () => {
    const tm = new TelemetryManager();
    tm.setEnabled(true);

    tm.recordSessionStart();
    tm.recordSessionStart();
    tm.recordSessionResume();
    tm.recordSessionExpire();

    const metrics = tm.getMetrics();
    expect(metrics.sessions.totalCreated).toBe(2);
    expect(metrics.sessions.totalResumed).toBe(1);
    expect(metrics.sessions.totalExpired).toBe(1);
    expect(metrics.sessions.activeCount).toBe(1); // 2 created - 1 expired
  });

  it('auth metrics are tracked', () => {
    const tm = new TelemetryManager();
    tm.setEnabled(true);

    tm.recordAuthSuccess();
    tm.recordAuthSuccess();
    tm.recordAuthFailure();
    tm.recordAuthRateLimited();

    const metrics = tm.getMetrics();
    expect(metrics.auth.successCount).toBe(2);
    expect(metrics.auth.failureCount).toBe(1);
    expect(metrics.auth.rateLimitedCount).toBe(1);
  });

  it('reset clears session and auth metrics', () => {
    const tm = new TelemetryManager();
    tm.setEnabled(true);

    tm.recordSessionStart();
    tm.recordAuthSuccess();
    tm.resetMetrics();

    const metrics = tm.getMetrics();
    expect(metrics.sessions.totalCreated).toBe(0);
    expect(metrics.sessions.activeCount).toBe(0);
    expect(metrics.auth.successCount).toBe(0);
    expect(metrics.telemetryVersion).toBeGreaterThanOrEqual(2);
  });

  it('records are ignored when disabled', () => {
    const tm = new TelemetryManager();
    // Disabled by default (no env var)

    tm.recordSessionStart();
    tm.recordSessionResume();
    tm.recordSessionExpire();
    tm.recordAuthSuccess();
    tm.recordAuthFailure();
    tm.recordAuthRateLimited();

    const metrics = tm.getMetrics();
    expect(metrics.sessions.totalCreated).toBe(0);
    expect(metrics.auth.successCount).toBe(0);
  });

  it('uptime and startTime are present', () => {
    const tm = new TelemetryManager();
    tm.setEnabled(true);

    const metrics = tm.getMetrics();
    expect(metrics.startTime).toBeTypeOf('string');
    expect(metrics.uptime).toBeTypeOf('number');
    expect(metrics.uptime).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Dashboard /api/audit endpoint tests
// ---------------------------------------------------------------------------

const DASHBOARD_PATH = path.resolve(__dirname, '..', '..', 'scripts', 'dashboard.js');

function httpRequest(
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

function startDashboard(
  port: number,
  envOverrides?: Record<string, string>
): { child: ChildProcess; ready: Promise<void> } {
  const child = fork(DASHBOARD_PATH, [], {
    env: {
      ...process.env,
      EVOKORE_DASHBOARD_PORT: String(port),
      EVOKORE_DASHBOARD_TOKEN: '',
      EVOKORE_DASHBOARD_ROLE: 'admin',
      ...envOverrides,
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });

  const ready = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Dashboard start timeout')), 10000);
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
      if (code !== 0 && code !== null) reject(new Error(`Dashboard exited with code ${code}`));
    });
  });

  return { child, ready };
}

describe('Dashboard /api/audit endpoint', () => {
  let child: ChildProcess | null = null;
  const PORT = 18960 + Math.floor(Math.random() * 100);
  let auditDir: string;
  let auditFile: string;

  beforeAll(async () => {
    // Create a temp audit file for the dashboard to read
    auditDir = path.join(os.homedir(), '.evokore', 'audit');
    auditFile = path.join(auditDir, 'audit.jsonl');

    // Ensure the audit directory exists
    if (!fs.existsSync(auditDir)) {
      fs.mkdirSync(auditDir, { recursive: true });
    }

    // Write some test entries (append, will clean up after)
    const testEntries = [
      JSON.stringify({ timestamp: Date.now() - 2000, eventType: 'auth_success', outcome: 'success', actor: 'admin' }),
      JSON.stringify({ timestamp: Date.now() - 1000, eventType: 'session_create', outcome: 'success', sessionId: 'test-123' }),
      JSON.stringify({ timestamp: Date.now(), eventType: 'tool_call', outcome: 'success', resource: 'reload_plugins' }),
    ];
    fs.appendFileSync(auditFile, testEntries.join('\n') + '\n');

    const { child: c, ready } = startDashboard(PORT);
    child = c;
    await ready;
  });

  afterAll(async () => {
    if (child) {
      child.kill('SIGTERM');
      await new Promise(resolve => child!.on('exit', resolve));
    }
    // Clean up test entries from the audit file
    try {
      if (fs.existsSync(auditFile)) {
        const content = fs.readFileSync(auditFile, 'utf-8');
        const lines = content.trim().split('\n').filter(line => {
          try {
            const entry = JSON.parse(line);
            // Keep entries that are not our test entries
            return entry.sessionId !== 'test-123' && entry.actor !== 'admin' && entry.resource !== 'reload_plugins';
          } catch {
            return true;
          }
        });
        if (lines.length > 0) {
          fs.writeFileSync(auditFile, lines.join('\n') + '\n');
        } else {
          fs.unlinkSync(auditFile);
        }
      }
    } catch { /* best effort cleanup */ }
  });

  it('/api/audit returns entries', async () => {
    const res = await httpRequest(PORT, '/api/audit');
    expect(res.statusCode).toBe(200);

    const entries = JSON.parse(res.body);
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThanOrEqual(3);
    // Newest first
    expect(entries[0].timestamp).toBeGreaterThanOrEqual(entries[entries.length - 1].timestamp);
  });

  it('/api/audit supports limit and offset', async () => {
    const res = await httpRequest(PORT, '/api/audit?limit=1&offset=0');
    expect(res.statusCode).toBe(200);

    const entries = JSON.parse(res.body);
    expect(entries.length).toBeLessThanOrEqual(1);
  });

  it('/api/audit/summary returns event type counts', async () => {
    const res = await httpRequest(PORT, '/api/audit/summary');
    expect(res.statusCode).toBe(200);

    const summary = JSON.parse(res.body);
    expect(typeof summary).toBe('object');
    // Should contain at least some of our test event types
    const totalCount = Object.values(summary).reduce((sum: number, count) => sum + (count as number), 0);
    expect(totalCount).toBeGreaterThanOrEqual(3);
  });

  it('/api/audit requires admin role', async () => {
    // Start a dashboard with readonly role
    const readonlyPort = PORT + 1;
    const { child: roChild, ready } = startDashboard(readonlyPort, {
      EVOKORE_DASHBOARD_TOKEN: 'test-token-readonly',
      EVOKORE_DASHBOARD_ROLE: 'readonly',
    });

    try {
      await ready;

      const res = await httpRequest(readonlyPort, '/api/audit', 'GET', undefined, {
        Authorization: 'Bearer test-token-readonly',
      });
      expect(res.statusCode).toBe(403);
    } finally {
      roChild.kill('SIGTERM');
      await new Promise(resolve => roChild.on('exit', resolve));
    }
  });
});
