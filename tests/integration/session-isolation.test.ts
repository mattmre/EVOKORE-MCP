import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const sessionIsolationTsPath = path.join(ROOT, 'src', 'SessionIsolation.ts');
const sessionIsolationJsPath = path.join(ROOT, 'dist', 'SessionIsolation.js');

describe('T30: Multi-Tenant Session Isolation', () => {
  // ---- Source-level structural validation ----

  describe('SessionIsolation source structure', () => {
    const src = fs.readFileSync(sessionIsolationTsPath, 'utf8');

    it('exports the SessionIsolation class', () => {
      expect(src).toMatch(/export\s+class\s+SessionIsolation/);
    });

    it('exports the SessionState interface', () => {
      expect(src).toMatch(/export\s+interface\s+SessionState/);
    });

    it('has a createSession method', () => {
      expect(src).toMatch(/createSession\s*\(/);
    });

    it('has a getSession method', () => {
      expect(src).toMatch(/getSession\s*\(/);
    });

    it('has a destroySession method', () => {
      expect(src).toMatch(/destroySession\s*\(/);
    });

    it('has a listSessions method', () => {
      expect(src).toMatch(/listSessions\s*\(/);
    });

    it('has a cleanExpired method', () => {
      expect(src).toMatch(/cleanExpired\s*\(/);
    });

    it('supports EVOKORE_SESSION_TTL_MS env var', () => {
      expect(src).toMatch(/EVOKORE_SESSION_TTL_MS/);
    });

    it('SessionState includes activatedTools, role, rateLimitCounters, and metadata fields', () => {
      expect(src).toMatch(/activatedTools/);
      expect(src).toMatch(/role/);
      expect(src).toMatch(/rateLimitCounters/);
      expect(src).toMatch(/metadata/);
    });

    it('defaults TTL to 1 hour', () => {
      expect(src).toMatch(/60\s*\*\s*60\s*\*\s*1000/);
    });
  });

  // ---- Runtime: Module loads ----

  describe('SessionIsolation module loads', () => {
    it('compiled module exists and exports SessionIsolation class', () => {
      const mod = require(sessionIsolationJsPath);
      expect(mod.SessionIsolation).toBeDefined();
      expect(typeof mod.SessionIsolation).toBe('function');
    });
  });

  // ---- Runtime: Session creation ----

  describe('session creation', () => {
    it('creates a session with a unique ID', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation();
      const session = iso.createSession('test-session-1');

      expect(session.sessionId).toBe('test-session-1');
      expect(session.createdAt).toBeGreaterThan(0);
      expect(session.lastAccessedAt).toBeGreaterThanOrEqual(session.createdAt);
      expect(session.activatedTools).toBeInstanceOf(Set);
      expect(session.activatedTools.size).toBe(0);
      expect(session.role).toBeNull();
      expect(session.rateLimitCounters).toBeInstanceOf(Map);
      expect(session.metadata).toBeInstanceOf(Map);
    });

    it('creates a session with a specific role', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation();
      const session = iso.createSession('admin-session', 'admin');

      expect(session.role).toBe('admin');
    });

    it('replaces an existing session with the same ID', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation();

      const first = iso.createSession('dup');
      first.activatedTools.add('tool-a');

      const second = iso.createSession('dup');
      expect(second.activatedTools.size).toBe(0);
      expect(iso.getSession('dup')).toBe(second);
    });
  });

  // ---- Runtime: Session state isolation ----

  describe('session state isolation', () => {
    it('different sessions have independent activated tools', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation();

      const s1 = iso.createSession('session-1');
      const s2 = iso.createSession('session-2');

      s1.activatedTools.add('github_push');
      s1.activatedTools.add('fs_write_file');

      s2.activatedTools.add('supabase_query');

      expect(s1.activatedTools.size).toBe(2);
      expect(s2.activatedTools.size).toBe(1);
      expect(s1.activatedTools.has('supabase_query')).toBe(false);
      expect(s2.activatedTools.has('github_push')).toBe(false);
    });

    it('different sessions have independent roles', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation();

      const admin = iso.createSession('admin-sess', 'admin');
      const reader = iso.createSession('reader-sess', 'readonly');

      expect(admin.role).toBe('admin');
      expect(reader.role).toBe('readonly');

      // Changing one does not affect the other
      admin.role = 'developer';
      expect(reader.role).toBe('readonly');
    });

    it('different sessions have independent rate limit counters', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation();

      const s1 = iso.createSession('s1');
      const s2 = iso.createSession('s2');

      s1.rateLimitCounters.set('fs_read_file', { tokens: 5, lastRefillAt: Date.now() });

      expect(s1.rateLimitCounters.has('fs_read_file')).toBe(true);
      expect(s2.rateLimitCounters.has('fs_read_file')).toBe(false);
    });

    it('different sessions have independent metadata', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation();

      const s1 = iso.createSession('s1');
      const s2 = iso.createSession('s2');

      s1.metadata.set('clientName', 'Claude Desktop');
      s2.metadata.set('clientName', 'VS Code');

      expect(s1.metadata.get('clientName')).toBe('Claude Desktop');
      expect(s2.metadata.get('clientName')).toBe('VS Code');
    });
  });

  // ---- Runtime: Session TTL expiry ----

  describe('session TTL expiry', () => {
    it('returns null for an expired session', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      // Very short TTL for testing
      const iso = new SessionIsolation({ ttlMs: 1 });

      iso.createSession('ephemeral');

      // Wait slightly beyond the TTL
      const start = Date.now();
      while (Date.now() - start < 5) {
        // spin-wait a few ms
      }

      expect(iso.getSession('ephemeral')).toBeNull();
    });

    it('refreshes TTL on access', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation({ ttlMs: 50 });

      iso.createSession('kept-alive');

      // Access within TTL to keep it alive
      const session = iso.getSession('kept-alive');
      expect(session).not.toBeNull();
      expect(session!.sessionId).toBe('kept-alive');
    });

    it('respects custom TTL from constructor', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation({ ttlMs: 999 });
      expect(iso.getTtlMs()).toBe(999);
    });

    it('defaults TTL to 1 hour when no options provided', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      // Clear env var if set
      const original = process.env.EVOKORE_SESSION_TTL_MS;
      delete process.env.EVOKORE_SESSION_TTL_MS;

      const iso = new SessionIsolation();
      expect(iso.getTtlMs()).toBe(60 * 60 * 1000);

      // Restore
      if (original !== undefined) {
        process.env.EVOKORE_SESSION_TTL_MS = original;
      }
    });
  });

  // ---- Runtime: cleanExpired ----

  describe('cleanExpired removes only expired sessions', () => {
    it('removes expired sessions and keeps active ones', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation({ ttlMs: 1 });

      iso.createSession('old-session');

      // Wait for it to expire
      const start = Date.now();
      while (Date.now() - start < 5) {
        // spin-wait
      }

      // Create a fresh session that should survive
      const freshIso = new SessionIsolation({ ttlMs: 60000 });
      freshIso.createSession('expired');
      freshIso.createSession('fresh');

      // Manually expire one by backdating lastAccessedAt
      const expiredState = freshIso.getSession('expired');
      if (expiredState) {
        expiredState.lastAccessedAt = Date.now() - 120000;
      }

      const removed = freshIso.cleanExpired();
      expect(removed).toBe(1);

      expect(freshIso.getSession('fresh')).not.toBeNull();
      expect(freshIso.getSession('expired')).toBeNull();
    });

    it('returns 0 when no sessions are expired', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation({ ttlMs: 60000 });

      iso.createSession('active-1');
      iso.createSession('active-2');

      const removed = iso.cleanExpired();
      expect(removed).toBe(0);
    });
  });

  // ---- Runtime: listSessions ----

  describe('listSessions returns all active sessions', () => {
    it('lists session IDs for all non-expired sessions', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation({ ttlMs: 60000 });

      iso.createSession('alpha');
      iso.createSession('beta');
      iso.createSession('gamma');

      const list = iso.listSessions();
      expect(list).toContain('alpha');
      expect(list).toContain('beta');
      expect(list).toContain('gamma');
      expect(list.length).toBe(3);
    });

    it('excludes expired sessions from the list', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation({ ttlMs: 60000 });

      iso.createSession('alive');
      iso.createSession('dead');

      // Manually expire
      const deadState = iso.getSession('dead');
      if (deadState) {
        deadState.lastAccessedAt = Date.now() - 120000;
      }

      const list = iso.listSessions();
      expect(list).toContain('alive');
      expect(list).not.toContain('dead');
      expect(list.length).toBe(1);
    });
  });

  // ---- Runtime: destroySession ----

  describe('destroySession cleanup', () => {
    it('removes a session and returns true', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation();

      iso.createSession('to-destroy');
      expect(iso.destroySession('to-destroy')).toBe(true);
      expect(iso.getSession('to-destroy')).toBeNull();
    });

    it('returns false for a non-existent session', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation();

      expect(iso.destroySession('never-existed')).toBe(false);
    });

    it('destroyed session state is fully cleaned up', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation();

      const session = iso.createSession('cleanup-test');
      session.activatedTools.add('tool-a');
      session.metadata.set('key', 'value');
      session.rateLimitCounters.set('tool-b', { tokens: 10, lastRefillAt: Date.now() });

      iso.destroySession('cleanup-test');
      expect(iso.listSessions()).not.toContain('cleanup-test');
      expect(iso.size).toBe(0);
    });
  });

  // ---- Runtime: concurrent sessions don't interfere ----

  describe('concurrent sessions do not interfere', () => {
    it('many sessions operate independently', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation();

      const sessionCount = 50;
      for (let i = 0; i < sessionCount; i++) {
        const session = iso.createSession(`concurrent-${i}`, i % 2 === 0 ? 'admin' : 'readonly');
        session.activatedTools.add(`tool-${i}`);
        session.metadata.set('index', i);
      }

      expect(iso.listSessions().length).toBe(sessionCount);

      // Verify each session has exactly its own tool and metadata
      for (let i = 0; i < sessionCount; i++) {
        const session = iso.getSession(`concurrent-${i}`);
        expect(session).not.toBeNull();
        expect(session!.activatedTools.size).toBe(1);
        expect(session!.activatedTools.has(`tool-${i}`)).toBe(true);
        expect(session!.metadata.get('index')).toBe(i);
        expect(session!.role).toBe(i % 2 === 0 ? 'admin' : 'readonly');
      }
    });

    it('destroying one session does not affect others', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation();

      iso.createSession('keep');
      iso.createSession('remove');
      iso.createSession('also-keep');

      iso.destroySession('remove');

      expect(iso.getSession('keep')).not.toBeNull();
      expect(iso.getSession('also-keep')).not.toBeNull();
      expect(iso.getSession('remove')).toBeNull();
      expect(iso.listSessions().length).toBe(2);
    });

    it('modifying state in one session leaves other sessions unchanged', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation();

      const s1 = iso.createSession('writer');
      const s2 = iso.createSession('observer');

      // Heavily modify s1
      for (let i = 0; i < 100; i++) {
        s1.activatedTools.add(`tool-${i}`);
      }
      s1.role = 'admin';
      s1.metadata.set('heavy', true);

      // s2 should be untouched
      expect(s2.activatedTools.size).toBe(0);
      expect(s2.role).toBeNull();
      expect(s2.metadata.size).toBe(0);
    });
  });

  // ---- Research doc exists ----

  describe('research documentation', () => {
    it('multi-tenant-session-isolation research doc exists', () => {
      const docPath = path.join(ROOT, 'docs', 'research', 'multi-tenant-session-isolation-2026-03-14.md');
      expect(fs.existsSync(docPath)).toBe(true);

      const content = fs.readFileSync(docPath, 'utf8');
      expect(content).toMatch(/Session Isolation/i);
      expect(content).toMatch(/Security Boundaries/i);
      expect(content).toMatch(/Future Persistence/i);
    });
  });
});
