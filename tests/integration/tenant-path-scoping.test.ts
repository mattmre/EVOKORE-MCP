/**
 * Tenant path scoping validation (Wave 1 Phase 1-B).
 *
 * Verifies the EVOKORE_TENANT_SCOPING opt-in feature that namespaces session
 * artifacts under ~/.evokore/tenants/{tenantId}/sessions/ when enabled, while
 * keeping the legacy flat ~/.evokore/sessions/ layout for single-operator
 * deployments.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';

import {
  SessionIsolation,
  resolveTenantSessionDir,
  sanitizeTenantId,
  type SessionState,
} from '../../src/SessionIsolation';
import { FileSessionStore } from '../../src/stores/FileSessionStore';

let tempHome: string;
let originalEvokoreHome: string | undefined;
let originalScoping: string | undefined;

beforeEach(() => {
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-tenant-scoping-'));
  originalEvokoreHome = process.env.EVOKORE_HOME;
  originalScoping = process.env.EVOKORE_TENANT_SCOPING;
  process.env.EVOKORE_HOME = tempHome;
});

afterEach(async () => {
  if (originalEvokoreHome === undefined) {
    delete process.env.EVOKORE_HOME;
  } else {
    process.env.EVOKORE_HOME = originalEvokoreHome;
  }
  if (originalScoping === undefined) {
    delete process.env.EVOKORE_TENANT_SCOPING;
  } else {
    process.env.EVOKORE_TENANT_SCOPING = originalScoping;
  }

  await fsp.rm(tempHome, { recursive: true, force: true }).catch(() => {});
});

function createTestSessionState(id: string, tenantId?: string): SessionState {
  const now = Date.now();
  return {
    sessionId: id,
    createdAt: now,
    lastAccessedAt: now,
    activatedTools: new Set(),
    role: null,
    rateLimitCounters: new Map(),
    metadata: new Map(),
    tenantId,
  };
}

describe('resolveTenantSessionDir', () => {
  it('returns flat sessions path when EVOKORE_TENANT_SCOPING is unset (no tenant)', () => {
    delete process.env.EVOKORE_TENANT_SCOPING;
    const dir = resolveTenantSessionDir(undefined);
    expect(dir).toBe(path.join(tempHome, 'sessions'));
  });

  it('returns flat sessions path when EVOKORE_TENANT_SCOPING is unset (tenant provided)', () => {
    delete process.env.EVOKORE_TENANT_SCOPING;
    const dir = resolveTenantSessionDir('tenant-123');
    expect(dir).toBe(path.join(tempHome, 'sessions'));
  });

  it('returns tenant-scoped path when EVOKORE_TENANT_SCOPING=true and tenantId provided', () => {
    process.env.EVOKORE_TENANT_SCOPING = 'true';
    const dir = resolveTenantSessionDir('tenant-123');
    expect(dir).toBe(path.join(tempHome, 'tenants', 'tenant-123', 'sessions'));
  });

  it('returns flat path when EVOKORE_TENANT_SCOPING=true but tenantId is missing', () => {
    process.env.EVOKORE_TENANT_SCOPING = 'true';
    const dir = resolveTenantSessionDir(undefined);
    expect(dir).toBe(path.join(tempHome, 'sessions'));
  });

  it('sanitizes path traversal attempts into safe component names', () => {
    process.env.EVOKORE_TENANT_SCOPING = 'true';
    const dir = resolveTenantSessionDir('../evil');
    // No unsanitized ".." path segment leaks into the resolved path
    expect(dir.split(path.sep)).not.toContain('..');
    // And the tenant directory sits under {tempHome}/tenants/...
    expect(dir.startsWith(path.join(tempHome, 'tenants'))).toBe(true);
    // The dot is allowed (not a separator), but the leading "../" got
    // neutralized into underscores + dot pattern.
    expect(dir).toContain(path.join('tenants', '.._evil', 'sessions'));
  });

  it('truncates tenant IDs longer than 128 characters', () => {
    process.env.EVOKORE_TENANT_SCOPING = 'true';
    const longId = 'a'.repeat(500);
    const dir = resolveTenantSessionDir(longId);
    const rel = dir.slice(path.join(tempHome, 'tenants').length + 1);
    const tenantSegment = rel.split(path.sep)[0];
    expect(tenantSegment.length).toBe(128);
  });

  it('rejects only-illegal-character tenantIds to the flat path', () => {
    process.env.EVOKORE_TENANT_SCOPING = 'true';
    // sanitizeTenantId replaces illegal chars with "_", so this still yields
    // a safe non-empty segment, NOT the flat path. Empty sanitized output is
    // the only case that falls back.
    expect(sanitizeTenantId('///')).toBe('___');
    expect(sanitizeTenantId('')).toBe('');
    const dir = resolveTenantSessionDir('');
    expect(dir).toBe(path.join(tempHome, 'sessions'));
  });
});

describe('SessionIsolation.resolveTenantSessionDir', () => {
  it('delegates to the module-level helper', () => {
    process.env.EVOKORE_TENANT_SCOPING = 'true';
    const iso = new SessionIsolation();
    expect(iso.resolveTenantSessionDir('tenant-xyz')).toBe(
      resolveTenantSessionDir('tenant-xyz')
    );
  });
});

describe('FileSessionStore tenant scoping', () => {
  it('writes a session to the tenant-scoped directory when scoping is enabled', async () => {
    process.env.EVOKORE_TENANT_SCOPING = 'true';
    const flatDir = path.join(tempHome, 'session-store');
    const store = new FileSessionStore({ directory: flatDir });

    const state = createTestSessionState('sess-aaa', 'tenant-abc');
    await store.set('sess-aaa', state);

    const tenantFile = path.join(
      tempHome,
      'tenants',
      'tenant-abc',
      'sessions',
      'sess-aaa.json'
    );
    expect(fs.existsSync(tenantFile)).toBe(true);

    // The legacy flat directory should not have received a copy.
    const flatFile = path.join(flatDir, 'sess-aaa.json');
    expect(fs.existsSync(flatFile)).toBe(false);
  });

  it('reads the session back from the tenant-scoped directory', async () => {
    process.env.EVOKORE_TENANT_SCOPING = 'true';
    const flatDir = path.join(tempHome, 'session-store');
    const store = new FileSessionStore({ directory: flatDir });

    const state = createTestSessionState('sess-bbb', 'tenant-abc');
    await store.set('sess-bbb', state);

    const loaded = await store.get('sess-bbb');
    expect(loaded).toBeDefined();
    expect(loaded?.sessionId).toBe('sess-bbb');
    expect(loaded?.tenantId).toBe('tenant-abc');
  });

  it('falls back to the flat directory when the tenant dir is empty (upgrade path)', async () => {
    // Write as legacy flat (scoping disabled for the write)
    delete process.env.EVOKORE_TENANT_SCOPING;
    const flatDir = path.join(tempHome, 'session-store');
    const store = new FileSessionStore({ directory: flatDir });

    const state = createTestSessionState('sess-ccc');
    await store.set('sess-ccc', state);

    // Enable scoping — session still readable from the flat dir
    process.env.EVOKORE_TENANT_SCOPING = 'true';
    const loaded = await store.get('sess-ccc');
    expect(loaded).toBeDefined();
    expect(loaded?.sessionId).toBe('sess-ccc');
  });

  it('keeps single-operator behavior identical when scoping is disabled', async () => {
    delete process.env.EVOKORE_TENANT_SCOPING;
    const flatDir = path.join(tempHome, 'session-store');
    const store = new FileSessionStore({ directory: flatDir });

    // Even if a tenantId is set on the state, we write to the flat dir
    const state = createTestSessionState('sess-ddd', 'tenant-xyz');
    await store.set('sess-ddd', state);

    const flatFile = path.join(flatDir, 'sess-ddd.json');
    expect(fs.existsSync(flatFile)).toBe(true);

    const tenantFile = path.join(
      tempHome,
      'tenants',
      'tenant-xyz',
      'sessions',
      'sess-ddd.json'
    );
    expect(fs.existsSync(tenantFile)).toBe(false);
  });

  it('delete removes both flat and tenant-scoped copies when scoping is enabled', async () => {
    // Seed both locations
    process.env.EVOKORE_TENANT_SCOPING = 'true';
    const flatDir = path.join(tempHome, 'session-store');
    const store = new FileSessionStore({ directory: flatDir });

    // Write a tenant-scoped copy
    const tenantState = createTestSessionState('sess-eee', 'tenant-q');
    await store.set('sess-eee', tenantState);

    // Seed a legacy flat copy as well by disabling scoping briefly
    delete process.env.EVOKORE_TENANT_SCOPING;
    const flatState = createTestSessionState('sess-eee');
    await store.set('sess-eee', flatState);
    process.env.EVOKORE_TENANT_SCOPING = 'true';

    await store.delete('sess-eee');

    const flatFile = path.join(flatDir, 'sess-eee.json');
    const tenantFile = path.join(
      tempHome,
      'tenants',
      'tenant-q',
      'sessions',
      'sess-eee.json'
    );
    expect(fs.existsSync(flatFile)).toBe(false);
    expect(fs.existsSync(tenantFile)).toBe(false);
  });
});
