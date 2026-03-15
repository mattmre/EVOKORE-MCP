import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const httpServerTsPath = path.join(ROOT, 'src', 'HttpServer.ts');
const sessionIsolationTsPath = path.join(ROOT, 'src', 'SessionIsolation.ts');
const sessionIsolationJsPath = path.join(ROOT, 'dist', 'SessionIsolation.js');

describe('Periodic Cleanup for Expired Session Rate Limit Counters', () => {

  // ---- Phase 1: Source-level structural validation ----

  describe('HttpServer cleanup interval prunes orphaned transports', () => {
    const httpSrc = fs.readFileSync(httpServerTsPath, 'utf8');

    it('captures the return value of cleanExpired()', () => {
      expect(httpSrc).toMatch(/const\s+removed\s*=\s*this\.sessionIsolation\?\.cleanExpired\(\)/);
    });

    it('checks removed > 0 before iterating transports', () => {
      expect(httpSrc).toMatch(/if\s*\(\s*removed\s*>\s*0\s*\)/);
    });

    it('uses hasSession to check for orphaned transports without touching lastAccessedAt', () => {
      expect(httpSrc).toMatch(/hasSession\s*\(\s*sessionId\s*\)/);
    });

    it('deletes orphaned transport entries from the transports Map', () => {
      expect(httpSrc).toMatch(/this\.transports\.delete\s*\(\s*sessionId\s*\)/);
    });

    it('calls transport.close() on orphaned transports', () => {
      expect(httpSrc).toMatch(/transport\.close\(\)\.catch/);
    });

    it('does not use getSession in the cleanup path (would touch lastAccessedAt)', () => {
      // The cleanup interval body should use hasSession, not getSession
      // Extract the cleanup interval body by finding the setInterval block
      const intervalMatch = httpSrc.match(/setInterval\s*\(\s*\(\)\s*=>\s*\{([\s\S]*?)\}\s*,\s*60_000\s*\)/);
      expect(intervalMatch).not.toBeNull();
      const intervalBody = intervalMatch![1];
      expect(intervalBody).not.toMatch(/\.getSession\s*\(/);
    });
  });

  describe('SessionIsolation exposes hasSession method', () => {
    const siSrc = fs.readFileSync(sessionIsolationTsPath, 'utf8');

    it('declares a hasSession method', () => {
      expect(siSrc).toMatch(/hasSession\s*\(\s*sessionId\s*:\s*string\s*\)\s*:\s*boolean/);
    });

    it('hasSession does NOT update lastAccessedAt', () => {
      // Extract the hasSession method body (from signature to closing brace at method indent level)
      const methodMatch = siSrc.match(/hasSession\s*\(sessionId:\s*string\)\s*:\s*boolean\s*\{[\s\S]*?return\s+true;\s*\n\s*\}/);
      expect(methodMatch).not.toBeNull();
      const methodBody = methodMatch![0];
      expect(methodBody).not.toMatch(/lastAccessedAt\s*=/);
    });
  });

  // ---- Phase 2: Runtime tests for hasSession ----

  describe('hasSession runtime behavior', () => {
    it('returns true for an active session', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation({ ttlMs: 60000 });

      iso.createSession('active');
      expect(iso.hasSession('active')).toBe(true);
    });

    it('returns false for a non-existent session', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation({ ttlMs: 60000 });

      expect(iso.hasSession('does-not-exist')).toBe(false);
    });

    it('returns false for an expired session and removes it', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation({ ttlMs: 60000 });

      const session = iso.createSession('expired');
      session.lastAccessedAt = Date.now() - 120000; // expired

      expect(iso.hasSession('expired')).toBe(false);
      // Verify it was actually removed
      expect(iso.size).toBe(0);
    });

    it('does NOT update lastAccessedAt when checking an active session', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation({ ttlMs: 60000 });

      const session = iso.createSession('no-touch');
      const originalLastAccess = session.lastAccessedAt;

      // Small delay so timestamp would differ if touched
      const start = Date.now();
      while (Date.now() - start < 5) {
        // spin-wait
      }

      iso.hasSession('no-touch');

      // lastAccessedAt should be unchanged
      expect(session.lastAccessedAt).toBe(originalLastAccess);
    });

    it('returns false after destroySession', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation({ ttlMs: 60000 });

      iso.createSession('to-destroy');
      iso.destroySession('to-destroy');

      expect(iso.hasSession('to-destroy')).toBe(false);
    });
  });

  // ---- Phase 3: Cleanup integration behavior ----

  describe('cleanExpired removes sessions with rate limit counters', () => {
    it('rate limit counters are cleaned when session expires', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation({ ttlMs: 60000 });

      const session = iso.createSession('rate-limited');
      session.rateLimitCounters.set('github/search', { tokens: 3, lastRefillAt: Date.now() });
      session.rateLimitCounters.set('fs/read_file', { tokens: 0, lastRefillAt: Date.now() });
      expect(session.rateLimitCounters.size).toBe(2);

      // Expire the session
      session.lastAccessedAt = Date.now() - 120000;

      const removed = iso.cleanExpired();
      expect(removed).toBe(1);

      // Session and its counters are gone
      expect(iso.hasSession('rate-limited')).toBe(false);
      expect(iso.size).toBe(0);
    });

    it('active sessions with rate limit counters are preserved', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation({ ttlMs: 60000 });

      const active = iso.createSession('active-rl');
      active.rateLimitCounters.set('github/search', { tokens: 5, lastRefillAt: Date.now() });

      const expired = iso.createSession('expired-rl');
      expired.rateLimitCounters.set('fs/write_file', { tokens: 1, lastRefillAt: Date.now() });
      expired.lastAccessedAt = Date.now() - 120000;

      const removed = iso.cleanExpired();
      expect(removed).toBe(1);

      // Active session's counters should be untouched
      const activeSession = iso.getSession('active-rl');
      expect(activeSession).not.toBeNull();
      expect(activeSession!.rateLimitCounters.size).toBe(1);
      expect(activeSession!.rateLimitCounters.get('github/search')?.tokens).toBe(5);
    });
  });

  describe('transport cleanup after session expiry (simulated)', () => {
    it('orphaned transport IDs are detected after cleanExpired removes sessions', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation({ ttlMs: 60000 });

      // Simulate the HttpServer.transports Map
      const transports = new Map<string, { closed: boolean }>();

      // Create sessions with transports
      iso.createSession('session-a');
      transports.set('session-a', { closed: false });

      iso.createSession('session-b');
      transports.set('session-b', { closed: false });

      iso.createSession('session-c');
      transports.set('session-c', { closed: false });

      // Expire session-a and session-c
      const sessionA = iso.getSession('session-a');
      sessionA!.lastAccessedAt = Date.now() - 120000;

      const sessionC = iso.getSession('session-c');
      sessionC!.lastAccessedAt = Date.now() - 120000;

      // Run cleanup (mirrors HttpServer interval logic)
      const removed = iso.cleanExpired();
      expect(removed).toBe(2);

      // Detect and prune orphaned transports
      const orphanedIds: string[] = [];
      if (removed > 0) {
        for (const [sessionId, transport] of transports.entries()) {
          if (!iso.hasSession(sessionId)) {
            transports.delete(sessionId);
            transport.closed = true;
            orphanedIds.push(sessionId);
          }
        }
      }

      expect(orphanedIds).toContain('session-a');
      expect(orphanedIds).toContain('session-c');
      expect(orphanedIds).not.toContain('session-b');

      // Only session-b transport remains
      expect(transports.size).toBe(1);
      expect(transports.has('session-b')).toBe(true);
    });

    it('no transport cleanup when no sessions expired', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation({ ttlMs: 60000 });

      const transports = new Map<string, { closed: boolean }>();

      iso.createSession('active-1');
      transports.set('active-1', { closed: false });

      iso.createSession('active-2');
      transports.set('active-2', { closed: false });

      const removed = iso.cleanExpired();
      expect(removed).toBe(0);

      // No cleanup should happen
      let cleanupRan = false;
      if (removed > 0) {
        cleanupRan = true;
      }
      expect(cleanupRan).toBe(false);
      expect(transports.size).toBe(2);
    });
  });
});
