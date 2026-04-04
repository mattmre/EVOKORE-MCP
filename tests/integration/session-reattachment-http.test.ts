import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import type { SessionState } from '../../src/SessionIsolation';

const ROOT = path.resolve(__dirname, '../..');
const fileStoreJsPath = path.join(ROOT, 'dist', 'stores', 'FileSessionStore.js');
const sessionIsolationJsPath = path.join(ROOT, 'dist', 'SessionIsolation.js');
const httpServerTsPath = path.join(ROOT, 'src', 'HttpServer.ts');
const indexTsPath = path.join(ROOT, 'src', 'index.ts');
const webhookManagerTsPath = path.join(ROOT, 'src', 'WebhookManager.ts');

// Unique temp root for all tests in this file -- cleaned on exit
const TEMP_ROOT = path.join(os.tmpdir(), `evokore-reattach-${Date.now()}-${process.pid}`);

afterAll(async () => {
  try {
    await fsp.rm(TEMP_ROOT, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup
  }
});

let dirCounter = 0;
function tempDir(label: string): string {
  return path.join(TEMP_ROOT, `${label}-${dirCounter++}`);
}

function createTestSessionState(id: string, overrides?: Partial<{
  createdAt: number;
  lastAccessedAt: number;
  role: string | null;
}>): SessionState {
  const now = Date.now();
  return {
    sessionId: id,
    createdAt: overrides?.createdAt ?? now,
    lastAccessedAt: overrides?.lastAccessedAt ?? now,
    activatedTools: new Set<string>(),
    role: overrides?.role ?? null,
    rateLimitCounters: new Map(),
    metadata: new Map(),
  };
}

describe('Session Reattachment (HTTP mode) - M1.1', () => {

  // ==========================================================================
  // 1. SessionIsolation constructed with FileSessionStore in HTTP mode
  // ==========================================================================

  describe('SessionIsolation construction with FileSessionStore', () => {
    it('index.ts imports FileSessionStore', () => {
      const src = fs.readFileSync(indexTsPath, 'utf8');
      expect(src).toMatch(/import\s*\{.*FileSessionStore.*\}\s*from/);
    });

    it('index.ts checks EVOKORE_SESSION_STORE env var', () => {
      const src = fs.readFileSync(indexTsPath, 'utf8');
      expect(src).toMatch(/EVOKORE_SESSION_STORE/);
    });

    it('index.ts uses httpMode option to decide FileSessionStore vs default', () => {
      const src = fs.readFileSync(indexTsPath, 'utf8');
      // Should have httpMode check
      expect(src).toMatch(/httpMode/);
      // Should construct FileSessionStore when httpMode is true
      expect(src).toMatch(/new FileSessionStore/);
    });

    it('EVOKORE_SESSION_STORE=memory opts out of file persistence', () => {
      const src = fs.readFileSync(indexTsPath, 'utf8');
      // Should check for "memory" override
      expect(src).toMatch(/storeOverride\s*!==\s*["']memory["']/);
    });

    it('SessionIsolation accepts a FileSessionStore instance via options', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const { FileSessionStore } = require(fileStoreJsPath);
      const dir = tempDir('iso-fss');

      const store = new FileSessionStore({ directory: dir });
      const iso = new SessionIsolation({ store, ttlMs: 60000 });

      expect(iso.getStore()).toBe(store);
    });
  });

  // ==========================================================================
  // 2. loadSession is called in the reattachment path
  // ==========================================================================

  describe('loadSession wiring in HttpServer', () => {
    it('HttpServer.handleMcpRequest calls loadSession before 404', () => {
      const httpSrc = fs.readFileSync(httpServerTsPath, 'utf8');

      // Extract the section between the unknown-session-id check and the 404
      const methodBody = httpSrc.match(/handleMcpRequest[\s\S]*?Session not found/)?.[0];
      expect(methodBody).toBeDefined();
      expect(methodBody).toMatch(/loadSession/);
    });

    it('HttpServer creates a new transport bound to the recovered session ID', () => {
      const httpSrc = fs.readFileSync(httpServerTsPath, 'utf8');
      // Should use sessionIdGenerator to bind to existing session ID
      expect(httpSrc).toMatch(/sessionIdGenerator:\s*\(\)\s*=>\s*sessionId/);
    });

    it('HttpServer connects MCP server to reattached transport', () => {
      const httpSrc = fs.readFileSync(httpServerTsPath, 'utf8');
      // Should call mcpServer.connect for the reattached transport
      expect(httpSrc).toMatch(/this\.mcpServer\.connect\s*\(\s*reattachedTransport\s*\)/);
    });

    it('reattached transport registers in transports map', () => {
      const httpSrc = fs.readFileSync(httpServerTsPath, 'utf8');
      // After loading, transport is registered via onsessioninitialized callback (BUG-08 fix removed redundant explicit set)
      expect(httpSrc).toMatch(/this\.transports\.set\s*\(\s*restoredId\s*,\s*reattachedTransport\s*\)/);
    });
  });

  // ==========================================================================
  // 3. Session state preserved across loadSession boundary
  // ==========================================================================

  describe('session state preservation across restart', () => {
    it('role is preserved across loadSession boundary', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const dir = tempDir('preserve-role');

      const store1 = new FileSessionStore({ directory: dir });
      const iso1 = new SessionIsolation({ store: store1, ttlMs: 60000 });
      iso1.createSession('role-test', 'developer');
      await iso1.persistSession('role-test');

      const store2 = new FileSessionStore({ directory: dir });
      const iso2 = new SessionIsolation({ store: store2, ttlMs: 60000 });
      const loaded = await iso2.loadSession('role-test');

      expect(loaded).not.toBeNull();
      expect(loaded!.role).toBe('developer');
    });

    it('activatedTools are preserved across loadSession boundary', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const dir = tempDir('preserve-tools');

      const store1 = new FileSessionStore({ directory: dir });
      const iso1 = new SessionIsolation({ store: store1, ttlMs: 60000 });
      const session = iso1.createSession('tools-test');
      session.activatedTools.add('github_list_repos');
      session.activatedTools.add('fs_read_file');
      await iso1.persistSession('tools-test');

      const store2 = new FileSessionStore({ directory: dir });
      const iso2 = new SessionIsolation({ store: store2, ttlMs: 60000 });
      const loaded = await iso2.loadSession('tools-test');

      expect(loaded).not.toBeNull();
      expect(loaded!.activatedTools.has('github_list_repos')).toBe(true);
      expect(loaded!.activatedTools.has('fs_read_file')).toBe(true);
      expect(loaded!.activatedTools.size).toBe(2);
    });

    it('metadata is preserved across loadSession boundary', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const dir = tempDir('preserve-meta');

      const store1 = new FileSessionStore({ directory: dir });
      const iso1 = new SessionIsolation({ store: store1, ttlMs: 60000 });
      const session = iso1.createSession('meta-test');
      session.metadata.set('clientVersion', '2.1.0');
      session.metadata.set('userAgent', 'test-agent');
      await iso1.persistSession('meta-test');

      const store2 = new FileSessionStore({ directory: dir });
      const iso2 = new SessionIsolation({ store: store2, ttlMs: 60000 });
      const loaded = await iso2.loadSession('meta-test');

      expect(loaded).not.toBeNull();
      expect(loaded!.metadata.get('clientVersion')).toBe('2.1.0');
      expect(loaded!.metadata.get('userAgent')).toBe('test-agent');
    });

    it('rateLimitCounters are preserved across loadSession boundary', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const dir = tempDir('preserve-ratelimit');

      const store1 = new FileSessionStore({ directory: dir });
      const iso1 = new SessionIsolation({ store: store1, ttlMs: 60000 });
      const session = iso1.createSession('rate-test');
      session.rateLimitCounters.set('some_tool', { tokens: 5, lastRefillAt: 1000000 });
      await iso1.persistSession('rate-test');

      const store2 = new FileSessionStore({ directory: dir });
      const iso2 = new SessionIsolation({ store: store2, ttlMs: 60000 });
      const loaded = await iso2.loadSession('rate-test');

      expect(loaded).not.toBeNull();
      const counter = loaded!.rateLimitCounters.get('some_tool');
      expect(counter).toBeDefined();
      expect(counter!.tokens).toBe(5);
      expect(counter!.lastRefillAt).toBe(1000000);
    });

    it('expired sessions are rejected by loadSession', async () => {
      const { FileSessionStore } = require(fileStoreJsPath);
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const dir = tempDir('expired-reject');

      const store1 = new FileSessionStore({ directory: dir });
      const iso1 = new SessionIsolation({ store: store1, ttlMs: 1000 });
      const session = iso1.createSession('expire-test');
      session.lastAccessedAt = Date.now() - 10000;
      await iso1.persistSession('expire-test');

      const store2 = new FileSessionStore({ directory: dir });
      const iso2 = new SessionIsolation({ store: store2, ttlMs: 1000 });

      const loaded = await iso2.loadSession('expire-test');
      expect(loaded).toBeNull();
    });
  });

  // ==========================================================================
  // 4. session_resumed webhook event type
  // ==========================================================================

  describe('session_resumed webhook event', () => {
    it('session_resumed is in the WebhookEventType union', () => {
      const src = fs.readFileSync(webhookManagerTsPath, 'utf8');
      expect(src).toMatch(/["']session_resumed["']/);
    });

    it('session_resumed is in the WEBHOOK_EVENT_TYPES array', () => {
      const src = fs.readFileSync(webhookManagerTsPath, 'utf8');
      // Check that it appears inside the WEBHOOK_EVENT_TYPES array
      const arrayMatch = src.match(/WEBHOOK_EVENT_TYPES[\s\S]*?\] as const/);
      expect(arrayMatch).not.toBeNull();
      expect(arrayMatch![0]).toContain('session_resumed');
    });

    it('WebhookManager runtime includes session_resumed', () => {
      const webhookJsPath = path.join(ROOT, 'dist', 'WebhookManager.js');
      const { WEBHOOK_EVENT_TYPES } = require(webhookJsPath);
      expect(WEBHOOK_EVENT_TYPES).toContain('session_resumed');
    });

    it('HttpServer emits session_resumed on successful reattachment', () => {
      const httpSrc = fs.readFileSync(httpServerTsPath, 'utf8');
      expect(httpSrc).toMatch(/emit\s*\(\s*["']session_resumed["']/);
    });
  });

  // ==========================================================================
  // 5. persistSession called in tool activation flow
  // ==========================================================================

  describe('persistSession in tool activation flow', () => {
    it('index.ts calls persistSession after discover_tools activates tools', () => {
      const src = fs.readFileSync(indexTsPath, 'utf8');
      // After activatedCount > 0, persistSession should be called
      expect(src).toMatch(/activatedCount\s*>\s*0[\s\S]*?persistSession/);
    });

    it('persistSession is a fire-and-forget call with error catch', () => {
      const src = fs.readFileSync(indexTsPath, 'utf8');
      // Should have a .catch() on the persistSession promise
      expect(src).toMatch(/persistSession[\s\S]*?\.catch/);
    });
  });

  // ==========================================================================
  // 6. Periodic persistence
  // ==========================================================================

  describe('periodic session persistence', () => {
    it('HttpServer has a periodic persist interval', () => {
      const httpSrc = fs.readFileSync(httpServerTsPath, 'utf8');
      expect(httpSrc).toMatch(/persistInterval/);
      // Should call persistSession in a setInterval
      expect(httpSrc).toMatch(/setInterval[\s\S]*?persistSession/);
    });

    it('persist interval is cleared on stop', () => {
      const httpSrc = fs.readFileSync(httpServerTsPath, 'utf8');
      expect(httpSrc).toMatch(/clearInterval\s*\(\s*this\.persistInterval\s*\)/);
    });
  });

  // ==========================================================================
  // 7. HttpServer accepts webhookManager option
  // ==========================================================================

  describe('HttpServer webhookManager integration', () => {
    it('HttpServerOptions includes webhookManager field', () => {
      const httpSrc = fs.readFileSync(httpServerTsPath, 'utf8');
      expect(httpSrc).toMatch(/webhookManager\s*\?\s*:\s*WebhookManager/);
    });

    it('HttpServer imports WebhookManager', () => {
      const httpSrc = fs.readFileSync(httpServerTsPath, 'utf8');
      expect(httpSrc).toMatch(/import\s*\{.*WebhookManager.*\}\s*from/);
    });

    it('index.ts passes webhookManager to HttpServer', () => {
      const src = fs.readFileSync(indexTsPath, 'utf8');
      expect(src).toMatch(/webhookManager:\s*this\.webhookManager/);
    });
  });

  // ==========================================================================
  // 8. Session contract documentation exists
  // ==========================================================================

  describe('session contract documentation', () => {
    it('session contract document exists', () => {
      const docPath = path.join(ROOT, 'docs', 'research', 'session-contract-m1-2026-03-26.md');
      expect(fs.existsSync(docPath)).toBe(true);
    });

    it('session contract covers lifecycle, persistence, TTL, and non-contract items', () => {
      const docPath = path.join(ROOT, 'docs', 'research', 'session-contract-m1-2026-03-26.md');
      const content = fs.readFileSync(docPath, 'utf8');
      expect(content).toMatch(/lifecycle/i);
      expect(content).toMatch(/persist/i);
      expect(content).toMatch(/TTL/i);
      expect(content).toMatch(/not part of/i);
    });
  });
});
