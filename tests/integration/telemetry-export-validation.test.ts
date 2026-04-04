import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// 1. Module Structure
// ---------------------------------------------------------------------------

describe('TelemetryExporter module structure', () => {
  it('TelemetryExporter source file exists', () => {
    const srcPath = path.resolve(__dirname, '..', '..', 'src', 'TelemetryExporter.ts');
    expect(fs.existsSync(srcPath)).toBe(true);
  });

  it('TelemetryExporter compiles to dist', () => {
    const distPath = path.resolve(__dirname, '..', '..', 'dist', 'TelemetryExporter.js');
    expect(fs.existsSync(distPath)).toBe(true);
  });

  it('can be imported from source', async () => {
    const mod = await import('../../src/TelemetryExporter');
    expect(mod.TelemetryExporter).toBeDefined();
    expect(typeof mod.TelemetryExporter).toBe('function');
  });

  it('has initialize() method', async () => {
    const { TelemetryExporter } = await import('../../src/TelemetryExporter');
    const { TelemetryManager } = await import('../../src/TelemetryManager');
    const tm = new TelemetryManager();
    const exporter = new TelemetryExporter(tm);
    expect(typeof exporter.initialize).toBe('function');
  });

  it('has shutdown() method that returns a Promise', async () => {
    const { TelemetryExporter } = await import('../../src/TelemetryExporter');
    const { TelemetryManager } = await import('../../src/TelemetryManager');
    const tm = new TelemetryManager();
    const exporter = new TelemetryExporter(tm);
    const result = exporter.shutdown();
    expect(result).toBeInstanceOf(Promise);
    await result;
  });

  it('has isEnabled() method', async () => {
    const { TelemetryExporter } = await import('../../src/TelemetryExporter');
    const { TelemetryManager } = await import('../../src/TelemetryManager');
    const tm = new TelemetryManager();
    const exporter = new TelemetryExporter(tm);
    expect(typeof exporter.isEnabled).toBe('function');
  });

  it('has buildPayload() method', async () => {
    const { TelemetryExporter } = await import('../../src/TelemetryExporter');
    const { TelemetryManager } = await import('../../src/TelemetryManager');
    const tm = new TelemetryManager();
    const exporter = new TelemetryExporter(tm);
    expect(typeof exporter.buildPayload).toBe('function');
  });

  it('constructor accepts TelemetryManager and options', async () => {
    const { TelemetryExporter } = await import('../../src/TelemetryExporter');
    const { TelemetryManager } = await import('../../src/TelemetryManager');
    const tm = new TelemetryManager();
    const exporter = new TelemetryExporter(tm, {
      exportUrl: 'https://example.com/metrics',
      intervalMs: 30000,
      secret: 'test-secret',
    });
    expect(exporter).toBeDefined();
    expect(exporter.getIntervalMs()).toBe(30000);
  });
});

// ---------------------------------------------------------------------------
// 2. Opt-in Gating
// ---------------------------------------------------------------------------

describe('TelemetryExporter opt-in gating', () => {
  let originalTelemetry: string | undefined;
  let originalExport: string | undefined;
  let originalUrl: string | undefined;

  beforeEach(() => {
    originalTelemetry = process.env.EVOKORE_TELEMETRY;
    originalExport = process.env.EVOKORE_TELEMETRY_EXPORT;
    originalUrl = process.env.EVOKORE_TELEMETRY_EXPORT_URL;
  });

  afterEach(() => {
    if (originalTelemetry !== undefined) {
      process.env.EVOKORE_TELEMETRY = originalTelemetry;
    } else {
      delete process.env.EVOKORE_TELEMETRY;
    }
    if (originalExport !== undefined) {
      process.env.EVOKORE_TELEMETRY_EXPORT = originalExport;
    } else {
      delete process.env.EVOKORE_TELEMETRY_EXPORT;
    }
    if (originalUrl !== undefined) {
      process.env.EVOKORE_TELEMETRY_EXPORT_URL = originalUrl;
    } else {
      delete process.env.EVOKORE_TELEMETRY_EXPORT_URL;
    }
  });

  it('is disabled by default', async () => {
    delete process.env.EVOKORE_TELEMETRY;
    delete process.env.EVOKORE_TELEMETRY_EXPORT;

    const { TelemetryExporter } = await import('../../src/TelemetryExporter');
    const { TelemetryManager } = await import('../../src/TelemetryManager');
    const tm = new TelemetryManager();
    const exporter = new TelemetryExporter(tm);
    exporter.initialize();
    expect(exporter.isEnabled()).toBe(false);
    await exporter.shutdown();
  });

  it('requires EVOKORE_TELEMETRY=true as prerequisite', async () => {
    delete process.env.EVOKORE_TELEMETRY;
    process.env.EVOKORE_TELEMETRY_EXPORT = 'true';
    process.env.EVOKORE_TELEMETRY_EXPORT_URL = 'https://example.com/metrics';

    const { TelemetryExporter } = await import('../../src/TelemetryExporter');
    const { TelemetryManager } = await import('../../src/TelemetryManager');
    const tm = new TelemetryManager();
    const exporter = new TelemetryExporter(tm, {
      exportUrl: 'https://example.com/metrics',
    });
    exporter.initialize();
    expect(exporter.isEnabled()).toBe(false);
    await exporter.shutdown();
  });

  it('requires EVOKORE_TELEMETRY_EXPORT=true', async () => {
    process.env.EVOKORE_TELEMETRY = 'true';
    delete process.env.EVOKORE_TELEMETRY_EXPORT;

    const { TelemetryExporter } = await import('../../src/TelemetryExporter');
    const { TelemetryManager } = await import('../../src/TelemetryManager');
    const tm = new TelemetryManager();
    const exporter = new TelemetryExporter(tm, {
      exportUrl: 'https://example.com/metrics',
    });
    exporter.initialize();
    expect(exporter.isEnabled()).toBe(false);
    await exporter.shutdown();
  });

  it('enables when both flags are true and URL is valid', async () => {
    process.env.EVOKORE_TELEMETRY = 'true';
    process.env.EVOKORE_TELEMETRY_EXPORT = 'true';

    const { TelemetryExporter } = await import('../../src/TelemetryExporter');
    const { TelemetryManager } = await import('../../src/TelemetryManager');
    const tm = new TelemetryManager();
    const exporter = new TelemetryExporter(tm, {
      exportUrl: 'https://example.com/metrics',
    });
    exporter.initialize();
    expect(exporter.isEnabled()).toBe(true);
    await exporter.shutdown();
  });

  it('stays disabled when URL is missing despite both flags', async () => {
    process.env.EVOKORE_TELEMETRY = 'true';
    process.env.EVOKORE_TELEMETRY_EXPORT = 'true';

    const { TelemetryExporter } = await import('../../src/TelemetryExporter');
    const { TelemetryManager } = await import('../../src/TelemetryManager');
    const tm = new TelemetryManager();
    const exporter = new TelemetryExporter(tm); // no URL
    exporter.initialize();
    expect(exporter.isEnabled()).toBe(false);
    await exporter.shutdown();
  });
});

// ---------------------------------------------------------------------------
// 3. Configuration Validation
// ---------------------------------------------------------------------------

describe('TelemetryExporter configuration validation', () => {
  let originalTelemetry: string | undefined;
  let originalExport: string | undefined;

  beforeEach(() => {
    originalTelemetry = process.env.EVOKORE_TELEMETRY;
    originalExport = process.env.EVOKORE_TELEMETRY_EXPORT;
    process.env.EVOKORE_TELEMETRY = 'true';
    process.env.EVOKORE_TELEMETRY_EXPORT = 'true';
  });

  afterEach(() => {
    if (originalTelemetry !== undefined) {
      process.env.EVOKORE_TELEMETRY = originalTelemetry;
    } else {
      delete process.env.EVOKORE_TELEMETRY;
    }
    if (originalExport !== undefined) {
      process.env.EVOKORE_TELEMETRY_EXPORT = originalExport;
    } else {
      delete process.env.EVOKORE_TELEMETRY_EXPORT;
    }
  });

  it('rejects empty URL', async () => {
    const { TelemetryExporter } = await import('../../src/TelemetryExporter');
    const { TelemetryManager } = await import('../../src/TelemetryManager');
    const tm = new TelemetryManager();
    const exporter = new TelemetryExporter(tm, { exportUrl: '' });
    exporter.initialize();
    expect(exporter.isEnabled()).toBe(false);
    await exporter.shutdown();
  });

  it('rejects non-HTTP/HTTPS schemes', async () => {
    const { TelemetryExporter } = await import('../../src/TelemetryExporter');
    const { TelemetryManager } = await import('../../src/TelemetryManager');
    const tm = new TelemetryManager();

    const exporter = new TelemetryExporter(tm, { exportUrl: 'ftp://example.com/metrics' });
    exporter.initialize();
    expect(exporter.isEnabled()).toBe(false);
    await exporter.shutdown();
  });

  it('rejects invalid URLs', async () => {
    const { TelemetryExporter } = await import('../../src/TelemetryExporter');
    const { TelemetryManager } = await import('../../src/TelemetryManager');
    const tm = new TelemetryManager();

    const exporter = new TelemetryExporter(tm, { exportUrl: 'not-a-url' });
    exporter.initialize();
    expect(exporter.isEnabled()).toBe(false);
    await exporter.shutdown();
  });

  it('enforces minimum 10s interval', async () => {
    const { TelemetryExporter } = await import('../../src/TelemetryExporter');
    const { TelemetryManager } = await import('../../src/TelemetryManager');
    const tm = new TelemetryManager();

    // Below minimum should default to 60000
    const exporter = new TelemetryExporter(tm, {
      exportUrl: 'https://example.com/metrics',
      intervalMs: 5000,
    });
    expect(exporter.getIntervalMs()).toBe(60000);
    await exporter.shutdown();
  });

  it('defaults to 60s interval when not specified', async () => {
    const { TelemetryExporter } = await import('../../src/TelemetryExporter');
    const { TelemetryManager } = await import('../../src/TelemetryManager');
    const tm = new TelemetryManager();

    const exporter = new TelemetryExporter(tm, {
      exportUrl: 'https://example.com/metrics',
    });
    expect(exporter.getIntervalMs()).toBe(60000);
    await exporter.shutdown();
  });

  it('accepts custom interval >= 10s', async () => {
    const { TelemetryExporter } = await import('../../src/TelemetryExporter');
    const { TelemetryManager } = await import('../../src/TelemetryManager');
    const tm = new TelemetryManager();

    const exporter = new TelemetryExporter(tm, {
      exportUrl: 'https://example.com/metrics',
      intervalMs: 15000,
    });
    expect(exporter.getIntervalMs()).toBe(15000);
    await exporter.shutdown();
  });

  it('accepts HTTPS URLs', async () => {
    const { TelemetryExporter } = await import('../../src/TelemetryExporter');
    const { TelemetryManager } = await import('../../src/TelemetryManager');
    const tm = new TelemetryManager();

    const exporter = new TelemetryExporter(tm, {
      exportUrl: 'https://metrics.example.com/v1/push',
    });
    exporter.initialize();
    expect(exporter.isEnabled()).toBe(true);
    await exporter.shutdown();
  });

  it('accepts HTTP URLs', async () => {
    const { TelemetryExporter } = await import('../../src/TelemetryExporter');
    const { TelemetryManager } = await import('../../src/TelemetryManager');
    const tm = new TelemetryManager();

    // Use a public address (not localhost) since SEC-04 SSRF protection
    // blocks private/loopback addresses in TelemetryExporter.isValidUrl()
    const exporter = new TelemetryExporter(tm, {
      exportUrl: 'http://metrics.example.com/v1/push',
    });
    exporter.initialize();
    expect(exporter.isEnabled()).toBe(true);
    await exporter.shutdown();
  });

  it('rejects private/loopback URLs (SSRF protection)', async () => {
    const { TelemetryExporter } = await import('../../src/TelemetryExporter');
    const { TelemetryManager } = await import('../../src/TelemetryManager');
    const tm = new TelemetryManager();

    const exporter = new TelemetryExporter(tm, {
      exportUrl: 'http://localhost:9090/metrics',
    });
    exporter.initialize();
    expect(exporter.isEnabled()).toBe(false);
    await exporter.shutdown();
  });
});

// ---------------------------------------------------------------------------
// 4. Payload Shape
// ---------------------------------------------------------------------------

describe('TelemetryExporter payload shape', () => {
  it('envelope has required fields', async () => {
    const { TelemetryExporter } = await import('../../src/TelemetryExporter');
    const { TelemetryManager } = await import('../../src/TelemetryManager');
    const tm = new TelemetryManager();
    tm.setEnabled(true);
    tm.recordToolCall(50);
    tm.recordSessionStart();

    const exporter = new TelemetryExporter(tm, {
      exportUrl: 'https://example.com/metrics',
    });

    const payload = exporter.buildPayload();

    expect(payload.id).toBeTypeOf('string');
    expect(payload.id.length).toBeGreaterThan(0);
    expect(payload.timestamp).toBeTypeOf('string');
    // ISO 8601 format check
    expect(new Date(payload.timestamp).toISOString()).toBe(payload.timestamp);
    expect(payload.event).toBe('telemetry_export');
    expect(payload.version).toBeTypeOf('number');
    expect(payload.version).toBeGreaterThanOrEqual(2);
    expect(payload.metrics).toBeDefined();
    expect(typeof payload.metrics).toBe('object');
    expect(payload.instanceId).toBeTypeOf('string');
    expect(payload.instanceId.length).toBeGreaterThan(0);
  });

  it('metrics match TelemetryMetrics shape', async () => {
    const { TelemetryExporter } = await import('../../src/TelemetryExporter');
    const { TelemetryManager } = await import('../../src/TelemetryManager');
    const tm = new TelemetryManager();
    tm.setEnabled(true);
    tm.recordToolCall(100);
    tm.recordToolError();
    tm.recordSessionStart();
    tm.recordAuthSuccess();

    const exporter = new TelemetryExporter(tm, {
      exportUrl: 'https://example.com/metrics',
    });

    const payload = exporter.buildPayload();
    const m = payload.metrics;

    expect(m.telemetryVersion).toBeTypeOf('number');
    expect(m.toolCallCount).toBeTypeOf('number');
    expect(m.toolErrorCount).toBeTypeOf('number');
    expect(m.sessionCount).toBeTypeOf('number');
    expect(m.avgLatencyMs).toBeTypeOf('number');
    expect(m.startTime).toBeTypeOf('string');
    expect(m.uptime).toBeTypeOf('number');
    expect(m.sessions).toBeDefined();
    expect(m.sessions.activeCount).toBeTypeOf('number');
    expect(m.sessions.totalCreated).toBeTypeOf('number');
    expect(m.sessions.totalResumed).toBeTypeOf('number');
    expect(m.sessions.totalExpired).toBeTypeOf('number');
    expect(m.auth).toBeDefined();
    expect(m.auth.successCount).toBeTypeOf('number');
    expect(m.auth.failureCount).toBeTypeOf('number');
    expect(m.auth.rateLimitedCount).toBeTypeOf('number');
  });

  it('version field matches telemetry version', async () => {
    const { TelemetryExporter } = await import('../../src/TelemetryExporter');
    const { TelemetryManager } = await import('../../src/TelemetryManager');
    const tm = new TelemetryManager();
    tm.setEnabled(true);

    const exporter = new TelemetryExporter(tm, {
      exportUrl: 'https://example.com/metrics',
    });

    const payload = exporter.buildPayload();
    expect(payload.version).toBe(payload.metrics.telemetryVersion);
  });

  it('instanceId is stable across payloads', async () => {
    const { TelemetryExporter } = await import('../../src/TelemetryExporter');
    const { TelemetryManager } = await import('../../src/TelemetryManager');
    const tm = new TelemetryManager();

    const exporter = new TelemetryExporter(tm, {
      exportUrl: 'https://example.com/metrics',
    });

    const p1 = exporter.buildPayload();
    const p2 = exporter.buildPayload();
    expect(p1.instanceId).toBe(p2.instanceId);
    expect(p1.instanceId).toBe(exporter.getInstanceId());
  });

  it('each payload gets a unique id', async () => {
    const { TelemetryExporter } = await import('../../src/TelemetryExporter');
    const { TelemetryManager } = await import('../../src/TelemetryManager');
    const tm = new TelemetryManager();

    const exporter = new TelemetryExporter(tm, {
      exportUrl: 'https://example.com/metrics',
    });

    const p1 = exporter.buildPayload();
    const p2 = exporter.buildPayload();
    expect(p1.id).not.toBe(p2.id);
  });

  it('no tool names or arguments in payload', async () => {
    const { TelemetryExporter } = await import('../../src/TelemetryExporter');
    const { TelemetryManager } = await import('../../src/TelemetryManager');
    const tm = new TelemetryManager();
    tm.setEnabled(true);
    tm.recordToolCall(10);

    const exporter = new TelemetryExporter(tm, {
      exportUrl: 'https://example.com/metrics',
    });

    const payload = exporter.buildPayload();
    const jsonStr = JSON.stringify(payload);

    // Should not contain typical tool-name patterns
    expect(jsonStr).not.toContain('toolName');
    expect(jsonStr).not.toContain('arguments');
    expect(jsonStr).not.toContain('tool_name');
  });
});

// ---------------------------------------------------------------------------
// 5. HMAC Signing
// ---------------------------------------------------------------------------

describe('TelemetryExporter HMAC signing', () => {
  it('signature is verifiable with WebhookManager.verifySignature', async () => {
    const { TelemetryExporter } = await import('../../src/TelemetryExporter');
    const { TelemetryManager } = await import('../../src/TelemetryManager');
    const { WebhookManager } = await import('../../src/WebhookManager');

    const secret = 'test-secret-key';
    const tm = new TelemetryManager();
    tm.setEnabled(true);

    const exporter = new TelemetryExporter(tm, {
      exportUrl: 'https://example.com/metrics',
      secret,
    });

    const payload = exporter.buildPayload();
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000);

    const signature = WebhookManager.computeSignature(body, secret, timestamp);
    const isValid = WebhookManager.verifySignature(body, secret, signature, timestamp);
    expect(isValid).toBe(true);
  });

  it('signature uses SHA256', async () => {
    const { WebhookManager } = await import('../../src/WebhookManager');
    const secret = 'abc123';
    const body = '{"test":true}';
    const timestamp = 1000000;

    const sig = WebhookManager.computeSignature(body, secret, timestamp);
    // SHA256 hex is 64 chars
    expect(sig).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(sig)).toBe(true);
  });

  it('signature format matches WebhookManager pattern', async () => {
    const { WebhookManager } = await import('../../src/WebhookManager');
    const secret = 'my-secret';
    const body = '{"event":"telemetry_export"}';
    const timestamp = Math.floor(Date.now() / 1000);

    // Manually compute to verify pattern: HMAC(timestamp.body, secret)
    const message = `${timestamp}.${body}`;
    const expected = crypto.createHmac('sha256', secret).update(message, 'utf8').digest('hex');
    const actual = WebhookManager.computeSignature(body, secret, timestamp);

    expect(actual).toBe(expected);
  });

  it('source file uses WebhookManager.computeSignature for signing', () => {
    const srcPath = path.resolve(__dirname, '..', '..', 'src', 'TelemetryExporter.ts');
    const source = fs.readFileSync(srcPath, 'utf-8');
    expect(source).toContain('WebhookManager.computeSignature');
  });
});

// ---------------------------------------------------------------------------
// 6. Privacy
// ---------------------------------------------------------------------------

describe('TelemetryExporter privacy', () => {
  it('no PII fields in exported payload', async () => {
    const { TelemetryExporter } = await import('../../src/TelemetryExporter');
    const { TelemetryManager } = await import('../../src/TelemetryManager');
    const tm = new TelemetryManager();
    tm.setEnabled(true);
    tm.recordToolCall(50);
    tm.recordSessionStart();

    const exporter = new TelemetryExporter(tm, {
      exportUrl: 'https://example.com/metrics',
    });

    const payload = exporter.buildPayload();
    const jsonStr = JSON.stringify(payload);

    // Should not contain PII-adjacent fields
    expect(jsonStr).not.toContain('username');
    expect(jsonStr).not.toContain('email');
    expect(jsonStr).not.toContain('password');
    expect(jsonStr).not.toContain('token');
    expect(jsonStr).not.toContain('sessionId');
    expect(jsonStr).not.toContain('ip_address');
    expect(jsonStr).not.toContain('hostname');
  });

  it('no audit entries in exported payload', async () => {
    const { TelemetryExporter } = await import('../../src/TelemetryExporter');
    const { TelemetryManager } = await import('../../src/TelemetryManager');
    const tm = new TelemetryManager();

    const exporter = new TelemetryExporter(tm, {
      exportUrl: 'https://example.com/metrics',
    });

    const payload = exporter.buildPayload();
    const jsonStr = JSON.stringify(payload);

    expect(jsonStr).not.toContain('audit');
    expect(jsonStr).not.toContain('eventType');
    expect(jsonStr).not.toContain('outcome');
  });

  it('source file does not import AuditLog', () => {
    const srcPath = path.resolve(__dirname, '..', '..', 'src', 'TelemetryExporter.ts');
    const source = fs.readFileSync(srcPath, 'utf-8');
    expect(source).not.toContain('AuditLog');
  });

  it('no process.env secrets leaked in payload', async () => {
    const { TelemetryExporter } = await import('../../src/TelemetryExporter');
    const { TelemetryManager } = await import('../../src/TelemetryManager');
    const tm = new TelemetryManager();

    const exporter = new TelemetryExporter(tm, {
      exportUrl: 'https://example.com/metrics',
      secret: 'super-secret-key',
    });

    const payload = exporter.buildPayload();
    const jsonStr = JSON.stringify(payload);

    expect(jsonStr).not.toContain('super-secret-key');
    expect(jsonStr).not.toContain('EVOKORE_TELEMETRY_EXPORT_SECRET');
  });
});

// ---------------------------------------------------------------------------
// 7. Env var documentation
// ---------------------------------------------------------------------------

describe('TelemetryExporter env var documentation', () => {
  const envExamplePath = path.resolve(__dirname, '..', '..', '.env.example');

  it('has EVOKORE_TELEMETRY_EXPORT entry', () => {
    const content = fs.readFileSync(envExamplePath, 'utf-8');
    expect(content).toContain('EVOKORE_TELEMETRY_EXPORT');
  });

  it('has EVOKORE_TELEMETRY_EXPORT_URL entry', () => {
    const content = fs.readFileSync(envExamplePath, 'utf-8');
    expect(content).toContain('EVOKORE_TELEMETRY_EXPORT_URL');
  });

  it('has EVOKORE_TELEMETRY_EXPORT_INTERVAL_MS entry', () => {
    const content = fs.readFileSync(envExamplePath, 'utf-8');
    expect(content).toContain('EVOKORE_TELEMETRY_EXPORT_INTERVAL_MS');
  });

  it('has EVOKORE_TELEMETRY_EXPORT_SECRET entry', () => {
    const content = fs.readFileSync(envExamplePath, 'utf-8');
    expect(content).toContain('EVOKORE_TELEMETRY_EXPORT_SECRET');
  });
});

// ---------------------------------------------------------------------------
// 8. Integration with index.ts
// ---------------------------------------------------------------------------

describe('TelemetryExporter integration', () => {
  it('index.ts imports TelemetryExporter', () => {
    const indexPath = path.resolve(__dirname, '..', '..', 'src', 'index.ts');
    const source = fs.readFileSync(indexPath, 'utf-8');
    expect(source).toContain('TelemetryExporter');
    expect(source).toContain('./TelemetryExporter');
  });

  it('index.ts creates TelemetryExporter instance', () => {
    const indexPath = path.resolve(__dirname, '..', '..', 'src', 'index.ts');
    const source = fs.readFileSync(indexPath, 'utf-8');
    expect(source).toContain('new TelemetryExporter');
  });

  it('index.ts calls telemetryExporter.initialize()', () => {
    const indexPath = path.resolve(__dirname, '..', '..', 'src', 'index.ts');
    const source = fs.readFileSync(indexPath, 'utf-8');
    expect(source).toContain('telemetryExporter.initialize()');
  });

  it('index.ts calls telemetryExporter.shutdown()', () => {
    const indexPath = path.resolve(__dirname, '..', '..', 'src', 'index.ts');
    const source = fs.readFileSync(indexPath, 'utf-8');
    expect(source).toContain('telemetryExporter.shutdown()');
  });
});
