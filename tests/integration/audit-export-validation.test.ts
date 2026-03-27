import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('AuditExporter module structure', () => {
  it('AuditExporter source file exists', () => {
    const srcPath = path.resolve(__dirname, '..', '..', 'src', 'AuditExporter.ts');
    expect(fs.existsSync(srcPath)).toBe(true);
  });

  it('can be imported from source', async () => {
    const mod = await import('../../src/AuditExporter');
    expect(mod.AuditExporter).toBeDefined();
    expect(typeof mod.AuditExporter).toBe('function');
  });

  it('AuditLog exposes chronological reads for export', async () => {
    const { AuditLog } = await import('../../src/AuditLog');
    const log = new AuditLog({ enabled: false });
    expect(typeof log.getEntriesChronological).toBe('function');
  });
});

describe('AuditExporter opt-in gating', () => {
  let originalAuditLog: string | undefined;
  let originalAuditExport: string | undefined;

  beforeEach(() => {
    originalAuditLog = process.env.EVOKORE_AUDIT_LOG;
    originalAuditExport = process.env.EVOKORE_AUDIT_EXPORT;
  });

  afterEach(() => {
    if (originalAuditLog !== undefined) {
      process.env.EVOKORE_AUDIT_LOG = originalAuditLog;
    } else {
      delete process.env.EVOKORE_AUDIT_LOG;
    }

    if (originalAuditExport !== undefined) {
      process.env.EVOKORE_AUDIT_EXPORT = originalAuditExport;
    } else {
      delete process.env.EVOKORE_AUDIT_EXPORT;
    }
  });

  it('is disabled by default', async () => {
    delete process.env.EVOKORE_AUDIT_LOG;
    delete process.env.EVOKORE_AUDIT_EXPORT;

    const { AuditExporter } = await import('../../src/AuditExporter');
    const { AuditLog } = await import('../../src/AuditLog');
    const exporter = new AuditExporter(new AuditLog({ enabled: false }), {
      exportUrl: 'https://example.com/audit',
    });

    exporter.initialize();
    expect(exporter.isEnabled()).toBe(false);
    await exporter.shutdown();
  });

  it('requires EVOKORE_AUDIT_LOG=true', async () => {
    delete process.env.EVOKORE_AUDIT_LOG;
    process.env.EVOKORE_AUDIT_EXPORT = 'true';

    const { AuditExporter } = await import('../../src/AuditExporter');
    const { AuditLog } = await import('../../src/AuditLog');
    const exporter = new AuditExporter(new AuditLog({ enabled: false }), {
      exportUrl: 'https://example.com/audit',
    });

    exporter.initialize();
    expect(exporter.isEnabled()).toBe(false);
    await exporter.shutdown();
  });

  it('does not enable when the AuditLog instance itself is disabled', async () => {
    process.env.EVOKORE_AUDIT_LOG = 'true';
    process.env.EVOKORE_AUDIT_EXPORT = 'true';

    const { AuditExporter } = await import('../../src/AuditExporter');
    const { AuditLog } = await import('../../src/AuditLog');
    const exporter = new AuditExporter(new AuditLog({ enabled: false }), {
      exportUrl: 'https://example.com/audit',
    });

    exporter.initialize();
    expect(exporter.isEnabled()).toBe(false);
    await exporter.shutdown();
  });

  it('requires EVOKORE_AUDIT_EXPORT=true', async () => {
    process.env.EVOKORE_AUDIT_LOG = 'true';
    delete process.env.EVOKORE_AUDIT_EXPORT;

    const { AuditExporter } = await import('../../src/AuditExporter');
    const { AuditLog } = await import('../../src/AuditLog');
    const exporter = new AuditExporter(new AuditLog({ enabled: true }), {
      exportUrl: 'https://example.com/audit',
    });

    exporter.initialize();
    expect(exporter.isEnabled()).toBe(false);
    await exporter.shutdown();
  });

  it('requires a valid HTTP(S) export URL', async () => {
    process.env.EVOKORE_AUDIT_LOG = 'true';
    process.env.EVOKORE_AUDIT_EXPORT = 'true';

    const { AuditExporter } = await import('../../src/AuditExporter');
    const { AuditLog } = await import('../../src/AuditLog');
    const exporter = new AuditExporter(new AuditLog({ enabled: true }), {
      exportUrl: 'ftp://example.com/audit',
    });

    exporter.initialize();
    expect(exporter.isEnabled()).toBe(false);
    await exporter.shutdown();
  });
});

describe('AuditExporter payload and delivery behavior', () => {
  let tmpDir: string;
  let auditFile: string;
  let originalAuditLog: string | undefined;
  let originalAuditExport: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-audit-export-'));
    auditFile = path.join(tmpDir, 'audit.jsonl');
    originalAuditLog = process.env.EVOKORE_AUDIT_LOG;
    originalAuditExport = process.env.EVOKORE_AUDIT_EXPORT;
    process.env.EVOKORE_AUDIT_LOG = 'true';
    process.env.EVOKORE_AUDIT_EXPORT = 'true';
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });

    if (originalAuditLog !== undefined) {
      process.env.EVOKORE_AUDIT_LOG = originalAuditLog;
    } else {
      delete process.env.EVOKORE_AUDIT_LOG;
    }

    if (originalAuditExport !== undefined) {
      process.env.EVOKORE_AUDIT_EXPORT = originalAuditExport;
    } else {
      delete process.env.EVOKORE_AUDIT_EXPORT;
    }
  });

  it('buildPayload wraps entries in an audit_export envelope', async () => {
    const { AuditExporter } = await import('../../src/AuditExporter');
    const { AuditLog } = await import('../../src/AuditLog');
    const log = new AuditLog({ enabled: true, auditDir: tmpDir, auditFile });
    const exporter = new AuditExporter(log, { exportUrl: 'https://example.com/audit' });

    const payload = exporter.buildPayload([
      { timestamp: Date.now(), eventType: 'auth_success', outcome: 'success' },
    ]);

    expect(payload.event).toBe('audit_export');
    expect(payload.version).toBe(1);
    expect(Array.isArray(payload.entries)).toBe(true);
    expect(payload.entries).toHaveLength(1);
    expect(payload.instanceId).toBe(exporter.getInstanceId());
  });

  it('skips pre-existing backlog and exports only entries created after startup', async () => {
    const { AuditExporter } = await import('../../src/AuditExporter');
    const { AuditLog } = await import('../../src/AuditLog');
    const log = new AuditLog({ enabled: true, auditDir: tmpDir, auditFile });

    log.log('preexisting_event', 'success');

    const exporter = new AuditExporter(log, {
      exportUrl: 'https://example.com/audit',
      batchSize: 10,
    });
    exporter.initialize();

    log.log('post_start_event', 'failure', { metadata: { token: 'secret123' } });

    const payloads: any[] = [];
    (exporter as any).deliverWithRetry = async (payload: any) => {
      payloads.push(payload);
    };

    await (exporter as any).exportOnce();

    expect(payloads).toHaveLength(1);
    expect(payloads[0].entries).toHaveLength(1);
    expect(payloads[0].entries[0].eventType).toBe('post_start_event');
    expect(payloads[0].entries[0].metadata?.token).toBe('[REDACTED]');
    await exporter.shutdown();
  });

  it('exports entries in chronological batches', async () => {
    const { AuditExporter } = await import('../../src/AuditExporter');
    const { AuditLog } = await import('../../src/AuditLog');
    const log = new AuditLog({ enabled: true, auditDir: tmpDir, auditFile });
    const exporter = new AuditExporter(log, {
      exportUrl: 'https://example.com/audit',
      batchSize: 2,
    });

    exporter.initialize();
    log.log('event_1', 'success');
    log.log('event_2', 'failure');
    log.log('event_3', 'denied');

    const payloads: any[] = [];
    (exporter as any).deliverWithRetry = async (payload: any) => {
      payloads.push(payload);
    };

    await (exporter as any).exportOnce();

    expect(payloads).toHaveLength(2);
    expect(payloads[0].entries.map((entry: any) => entry.eventType)).toEqual(['event_1', 'event_2']);
    expect(payloads[1].entries.map((entry: any) => entry.eventType)).toEqual(['event_3']);
    await exporter.shutdown();
  });

  it('AuditLog chronological reads are oldest-first', async () => {
    const { AuditLog } = await import('../../src/AuditLog');
    const log = new AuditLog({ enabled: true, auditDir: tmpDir, auditFile });

    log.log('event_1', 'success');
    log.log('event_2', 'success');
    log.log('event_3', 'success');

    const entries = log.getEntriesChronological(2, 1);
    expect(entries).toHaveLength(2);
    expect(entries[0].eventType).toBe('event_2');
    expect(entries[1].eventType).toBe('event_3');
  });

});

describe('AuditExporter source integration', () => {
  it('uses WebhookManager.computeSignature for signing', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'src', 'AuditExporter.ts'),
      'utf-8'
    );
    expect(source).toContain('WebhookManager.computeSignature');
    expect(source).toContain('X-EVOKORE-Signature');
    expect(source).toContain('X-EVOKORE-Timestamp');
  });

  it('index.ts wires AuditExporter lifecycle', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'src', 'index.ts'),
      'utf-8'
    );
    expect(source).toContain('AuditExporter');
    expect(source).toContain('new AuditExporter');
    expect(source).toContain('this.auditExporter.initialize()');
    expect(source).toContain('this.auditExporter.shutdown()');
  });

  it('.env.example documents audit export env vars', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '..', '..', '.env.example'),
      'utf-8'
    );
    expect(source).toContain('EVOKORE_AUDIT_EXPORT');
    expect(source).toContain('EVOKORE_AUDIT_EXPORT_URL');
    expect(source).toContain('EVOKORE_AUDIT_EXPORT_INTERVAL_MS');
    expect(source).toContain('EVOKORE_AUDIT_EXPORT_BATCH_SIZE');
    expect(source).toContain('EVOKORE_AUDIT_EXPORT_SECRET');
  });
});
