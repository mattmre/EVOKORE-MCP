/**
 * Dashboard session-filter alignment validation tests (M1.3)
 *
 * Validates that the dashboard reads sessions from both:
 *   - ~/.evokore/sessions/ (hook-side sessions)
 *   - ~/.evokore/session-store/ (HTTP transport sessions via FileSessionStore)
 *
 * Tests cover:
 *   - Unified listing from both directories
 *   - Type filtering (?type=hook, ?type=http)
 *   - Status and date filters across both types
 *   - Deduplication (hook preferred when same ID in both)
 *   - Schema normalization
 *   - Session type counts endpoint
 *   - Empty directory resilience
 *   - Frontend type filter presence
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

const DASHBOARD_PATH = path.resolve(__dirname, '..', '..', 'scripts', 'dashboard.js');

describe('Dashboard Session-Filter Alignment (M1.3)', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(DASHBOARD_PATH, 'utf8');
  });

  describe('dual-directory session reading', () => {
    it('defines SESSION_STORE_DIR constant for HTTP transport sessions', () => {
      expect(source).toContain("SESSION_STORE_DIR");
      expect(source).toContain("session-store");
    });

    it('has readHookSessions function that reads from SESSIONS_DIR', () => {
      expect(source).toContain('function readHookSessions()');
      expect(source).toContain('SESSIONS_DIR');
    });

    it('has readHttpSessions function that reads from SESSION_STORE_DIR', () => {
      expect(source).toContain('function readHttpSessions()');
      expect(source).toContain('SESSION_STORE_DIR');
    });

    it('listSessions calls both readHookSessions and readHttpSessions', () => {
      // Extract the listSessions function body
      const match = source.match(/function listSessions\(filters\)\s*\{[\s\S]*?\n\}/);
      expect(match).toBeTruthy();
      const body = match![0];
      expect(body).toContain('readHookSessions()');
      expect(body).toContain('readHttpSessions()');
    });

    it('readHttpSessions filters out .tmp files', () => {
      expect(source).toContain("!f.endsWith('.tmp')");
    });

    it('handles missing session-store directory gracefully', () => {
      // readHttpSessions should check existsSync before readdirSync
      const match = source.match(/function readHttpSessions\(\)\s*\{[\s\S]*?\n\}/);
      expect(match).toBeTruthy();
      const body = match![0];
      expect(body).toContain('existsSync');
      expect(body).toContain('return []');
    });
  });

  describe('type field and filtering', () => {
    it('normalizeHookSession sets type to hook', () => {
      const match = source.match(/function normalizeHookSession[\s\S]*?\n\}/);
      expect(match).toBeTruthy();
      expect(match![0]).toContain("type: 'hook'");
    });

    it('normalizeHttpSession sets type to http', () => {
      const match = source.match(/function normalizeHttpSession[\s\S]*?\n\}/);
      expect(match).toBeTruthy();
      expect(match![0]).toContain("type: 'http'");
    });

    it('API route parses ?type= query parameter', () => {
      expect(source).toContain("url.searchParams.get('type')");
      expect(source).toContain('filters.type = typeParam');
    });

    it('listSessions applies type filter', () => {
      const match = source.match(/function listSessions\(filters\)\s*\{[\s\S]*?\n\}/);
      expect(match).toBeTruthy();
      const body = match![0];
      expect(body).toContain('filters.type');
      expect(body).toContain("s.type === filters.type");
    });
  });

  describe('schema normalization', () => {
    it('hook sessions include normalized fields: id, type, createdAt, lastActivity, status, purpose, metadata', () => {
      const match = source.match(/function normalizeHookSession[\s\S]*?\n\}/);
      expect(match).toBeTruthy();
      const body = match![0];
      // Check all normalized fields are present
      expect(body).toContain('id,');
      expect(body).toContain("type: 'hook'");
      expect(body).toContain('createdAt:');
      expect(body).toContain('lastActivity:');
      expect(body).toContain('status:');
      expect(body).toContain('purpose:');
      expect(body).toContain('replayCount:');
      expect(body).toContain('evidenceCount:');
      expect(body).toContain('metadata:');
    });

    it('HTTP sessions include normalized fields: id, type, createdAt, lastActivity, status, purpose, metadata', () => {
      const match = source.match(/function normalizeHttpSession[\s\S]*?\n\}/);
      expect(match).toBeTruthy();
      const body = match![0];
      expect(body).toContain('id,');
      expect(body).toContain("type: 'http'");
      expect(body).toContain('createdAt:');
      expect(body).toContain('lastActivity:');
      expect(body).toContain('status:');
      expect(body).toContain('purpose: null');
      expect(body).toContain('replayCount: 0');
      expect(body).toContain('evidenceCount: 0');
      expect(body).toContain('metadata:');
    });

    it('HTTP session metadata includes activatedTools, role, rateLimitCounters', () => {
      const match = source.match(/function normalizeHttpSession[\s\S]*?\n\}/);
      expect(match).toBeTruthy();
      const body = match![0];
      expect(body).toContain('activatedTools');
      expect(body).toContain('role');
      expect(body).toContain('rateLimitCounters');
    });

    it('hook session metadata includes replayPath, evidencePath, metrics', () => {
      const match = source.match(/function normalizeHookSession[\s\S]*?\n\}/);
      expect(match).toBeTruthy();
      const body = match![0];
      expect(body).toContain('replayPath');
      expect(body).toContain('evidencePath');
      expect(body).toContain('metrics');
    });
  });

  describe('HTTP session status derivation', () => {
    it('has deriveHttpSessionStatus function', () => {
      expect(source).toContain('function deriveHttpSessionStatus(data)');
    });

    it('derives expired status when session exceeds TTL', () => {
      const match = source.match(/function deriveHttpSessionStatus[\s\S]*?\n\}/);
      expect(match).toBeTruthy();
      const body = match![0];
      expect(body).toContain("'expired'");
      expect(body).toContain("'active'");
    });

    it('respects EVOKORE_SESSION_TTL_MS env var for TTL', () => {
      const match = source.match(/function deriveHttpSessionStatus[\s\S]*?\n\}/);
      expect(match).toBeTruthy();
      const body = match![0];
      expect(body).toContain('EVOKORE_SESSION_TTL_MS');
    });
  });

  describe('deduplication', () => {
    it('prefers hook session when same ID exists in both directories', () => {
      const match = source.match(/function listSessions\(filters\)\s*\{[\s\S]*?\n\}/);
      expect(match).toBeTruthy();
      const body = match![0];
      // Hook sessions are added first, then HTTP sessions check seen set
      expect(body).toContain('seen.add(s.id)');
      expect(body).toContain('!seen.has(s.id)');
      // Verify hooks are iterated first
      const hookIdx = body.indexOf('hookSessions');
      const httpIdx = body.indexOf('httpSessions');
      // The first for-loop iterates hookSessions
      const firstForHook = body.indexOf('for (const s of hookSessions)');
      const firstForHttp = body.indexOf('for (const s of httpSessions)');
      expect(firstForHook).toBeLessThan(firstForHttp);
    });
  });

  describe('session type counts endpoint', () => {
    it('has getSessionTypeCounts function', () => {
      expect(source).toContain('function getSessionTypeCounts()');
    });

    it('returns hook, http, and total counts', () => {
      const match = source.match(/function getSessionTypeCounts[\s\S]*?\n\}/);
      expect(match).toBeTruthy();
      const body = match![0];
      expect(body).toContain('hook:');
      expect(body).toContain('http:');
      expect(body).toContain('total:');
    });

    it('has /api/sessions/types route', () => {
      expect(source).toContain("/api/sessions/types");
    });

    it('/api/sessions/types route is positioned before /api/sessions route', () => {
      // The types route must come first since /api/sessions would match otherwise
      const typesIdx = source.indexOf("/api/sessions/types");
      const sessionsIdx = source.indexOf("url.pathname === '/api/sessions'");
      expect(typesIdx).toBeLessThan(sessionsIdx);
    });
  });

  describe('existing filters work across both types', () => {
    it('status filter applies to merged session list', () => {
      const match = source.match(/function listSessions\(filters\)\s*\{[\s\S]*?\n\}/);
      expect(match).toBeTruthy();
      const body = match![0];
      expect(body).toContain("s.status === filters.status");
    });

    it('since filter applies to merged session list', () => {
      const match = source.match(/function listSessions\(filters\)\s*\{[\s\S]*?\n\}/);
      expect(match).toBeTruthy();
      const body = match![0];
      expect(body).toContain('filters.since');
      expect(body).toContain('sinceDate');
    });

    it('since filter handles both ISO string and numeric timestamps', () => {
      const match = source.match(/function listSessions\(filters\)\s*\{[\s\S]*?\n\}/);
      expect(match).toBeTruthy();
      const body = match![0];
      expect(body).toContain('sinceMs');
      expect(body).toContain('sinceISO');
    });
  });

  describe('frontend type filter', () => {
    it('dashboard HTML has type-filter dropdown', () => {
      expect(source).toContain('type-filter');
    });

    it('type-filter dropdown has Hook and HTTP options', () => {
      expect(source).toContain("<option value=\"hook\">Hook</option>");
      expect(source).toContain("<option value=\"http\">HTTP</option>");
    });

    it('buildFilterUrl reads type-filter value', () => {
      expect(source).toContain("getElementById('type-filter')");
      expect(source).toContain("params.set('type', typeFilter.value)");
    });

    it('has typeBadge function for session type display', () => {
      expect(source).toContain('function typeBadge(type)');
    });

    it('typeBadge renders distinct badges for hook and http', () => {
      // Look for the two type badge styles
      expect(source).toContain("type === 'hook'");
      expect(source).toContain("type === 'http'");
    });

    it('session cards show type badge', () => {
      expect(source).toContain('typeBadge(s.type)');
    });

    it('has expired status badge style', () => {
      expect(source).toContain('status-expired');
    });

    it('statusBadge function handles expired status', () => {
      expect(source).toContain("status === 'expired'");
    });

    it('status filter dropdown includes Expired option', () => {
      expect(source).toContain('<option value="expired">Expired</option>');
    });
  });

  describe('startup logging', () => {
    it('logs both session directories on startup', () => {
      expect(source).toContain('Hook sessions directory');
      expect(source).toContain('HTTP sessions directory');
    });
  });

  describe('zero external dependencies preserved', () => {
    it('uses only Node.js built-in modules', () => {
      const requireMatches = source.match(/require\(['"]([^'"]+)['"]\)/g) || [];
      const imports = requireMatches.map((m) => m.match(/require\(['"]([^'"]+)['"]\)/)![1]);
      const allowedBuiltins = ['http', 'fs', 'path', 'os', 'crypto'];
      for (const imp of imports) {
        expect(allowedBuiltins).toContain(imp);
      }
    });
  });
});
