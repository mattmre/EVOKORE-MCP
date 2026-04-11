import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// RBAC Session Gaps — G-01, G-02, G-03
//
// G-01: Native-tool dispatch now runs SecurityManager.checkPermission().
// G-02: SessionIsolation exposes a setSessionRole() API.
// G-03: HttpServer refreshes session role from JWT on existing/reattach paths.
//
// Tests mix source-structural checks (matching this file's sibling style) with
// runtime behaviour tests that exercise the compiled JS in dist/.

const ROOT = path.resolve(__dirname, '../..');
const indexTsPath = path.join(ROOT, 'src', 'index.ts');
const sessionIsolationTsPath = path.join(ROOT, 'src', 'SessionIsolation.ts');
const httpServerTsPath = path.join(ROOT, 'src', 'HttpServer.ts');
const securityJsPath = path.join(ROOT, 'dist', 'SecurityManager.js');
const sessionIsolationJsPath = path.join(ROOT, 'dist', 'SessionIsolation.js');

describe('RBAC Session Gaps — G-01, G-02, G-03', () => {
  // ---- G-02: SessionIsolation.setSessionRole ----

  describe('G-02: SessionIsolation.setSessionRole', () => {
    describe('source structure', () => {
      const src = fs.readFileSync(sessionIsolationTsPath, 'utf8');

      it('declares an async setSessionRole method', () => {
        expect(src).toMatch(/async\s+setSessionRole\s*\(\s*sessionId\s*:\s*string\s*,\s*role\s*:\s*string\s*\|\s*null\s*\)\s*:\s*Promise<boolean>/);
      });

      it('imports AuditLog', () => {
        expect(src).toMatch(/import\s*\{\s*AuditLog\s*\}\s*from\s*["']\.\/AuditLog["']/);
      });

      it('audits set_session_role changes through AuditLog', () => {
        expect(src).toMatch(/set_session_role/);
      });

      it('re-inserts into the session Map to preserve LRU ordering', () => {
        expect(src).toMatch(/this\.sessions\.delete\s*\(\s*sessionId\s*\)[\s\S]*this\.sessions\.set\s*\(\s*sessionId\s*,\s*state\s*\)/);
      });
    });

    describe('runtime behaviour', () => {
      let iso: any;

      beforeEach(() => {
        const { SessionIsolation } = require(sessionIsolationJsPath);
        iso = new SessionIsolation();
      });

      it('updates the role on an existing session and returns true', async () => {
        iso.createSession('g02-a', 'readonly');
        const result = await iso.setSessionRole('g02-a', 'admin');
        expect(result).toBe(true);
        expect(iso.getSession('g02-a').role).toBe('admin');
      });

      it('sets the role to null explicitly', async () => {
        iso.createSession('g02-null', 'developer');
        const result = await iso.setSessionRole('g02-null', null);
        expect(result).toBe(true);
        expect(iso.getSession('g02-null').role).toBeNull();
      });

      it('returns false for a non-existent session', async () => {
        const result = await iso.setSessionRole('does-not-exist', 'admin');
        expect(result).toBe(false);
      });

      it('is a no-op (returns true, audit skipped) when the role is unchanged', async () => {
        iso.createSession('g02-noop', 'admin');
        // Capture audit log writes to detect noise.
        const { AuditLog } = require(path.join(ROOT, 'dist', 'AuditLog.js'));
        const audit = AuditLog.getInstance();
        const logged: any[] = [];
        const originalLog = audit.log.bind(audit);
        audit.log = (eventType: string, outcome: string, details: any) => {
          if (details?.metadata?.action === 'set_session_role') {
            logged.push({ eventType, outcome, details });
          }
          return originalLog(eventType, outcome, details);
        };
        try {
          const result = await iso.setSessionRole('g02-noop', 'admin');
          expect(result).toBe(true);
          expect(logged.length).toBe(0);
        } finally {
          audit.log = originalLog;
        }
      });

      it('updates LRU order so the touched session becomes most recent', async () => {
        iso.createSession('g02-lru-a');
        iso.createSession('g02-lru-b');
        iso.createSession('g02-lru-c');

        // Initial LRU order: a, b, c (a is oldest)
        await iso.setSessionRole('g02-lru-a', 'admin');

        // After role update, 'g02-lru-a' should be most recent.
        // Walk the internal map (a map iterates in insertion order).
        const order = Array.from(iso['sessions'].keys());
        expect(order[order.length - 1]).toBe('g02-lru-a');
      });
    });
  });

  // ---- G-01: Native tool dispatch gate ----

  describe('G-01: Native tool dispatch gate in index.ts', () => {
    const src = fs.readFileSync(indexTsPath, 'utf8');

    it('gate runs checkPermission for non-proxied, non-unknown tools', () => {
      // Gate block excludes proxied + unknown
      expect(src).toMatch(/source\s*!==\s*["']proxied["']\s*&&\s*source\s*!==\s*["']unknown["']/);
      // Uses securityManager.checkPermission with a sessionRole
      expect(src).toMatch(/this\.securityManager\.checkPermission\s*\(\s*toolName\s*,\s*gateRole\s*\)/);
    });

    it('deny branch throws an McpError with InvalidRequest', () => {
      expect(src).toMatch(/permission\s*===\s*["']deny["'][\s\S]*?McpError\s*\(\s*\n?\s*ErrorCode\.InvalidRequest/);
    });

    it('require_approval branch strips _evokore_approval_token from args', () => {
      expect(src).toMatch(/delete\s+argsObj\._evokore_approval_token/);
    });

    it('require_approval branch generates and returns a token on missing/invalid input', () => {
      expect(src).toMatch(/generateToken\s*\(\s*toolName\s*,\s*argsObj\s*\)/);
      expect(src).toMatch(/_evokore_approval_token/);
    });

    it('require_approval branch consumes a valid token and continues', () => {
      expect(src).toMatch(/this\.securityManager\.consumeToken\s*\(\s*providedToken\s*\)/);
    });

    it('emits approval_requested webhook on gate fallthrough', () => {
      expect(src).toMatch(/approval_requested/);
    });

    it('does not double-gate proxied tools (ProxyManager is authoritative)', () => {
      // Gate must explicitly skip proxied so ProxyManager.callProxiedTool
      // remains the single enforcement point for proxied tools.
      expect(src).toMatch(/if\s*\(\s*source\s*!==\s*["']proxied["']/);
    });
  });

  describe('G-01: runtime — security gate semantics', () => {
    function makeSM() {
      const { SecurityManager } = require(securityJsPath);
      const sm = new SecurityManager();
      sm.rules = {
        nav_get_map: 'deny',
        get_telemetry: 'require_approval',
        reset_telemetry: 'allow',
      };
      return sm;
    }

    it('native tool denied by rules → checkPermission returns deny', () => {
      const sm = makeSM();
      expect(sm.checkPermission('nav_get_map')).toBe('deny');
    });

    it('native tool requiring approval → checkPermission returns require_approval', () => {
      const sm = makeSM();
      expect(sm.checkPermission('get_telemetry')).toBe('require_approval');
    });

    it('valid approval token satisfies HITL gate for native tool', () => {
      const sm = makeSM();
      const argsObj: Record<string, unknown> = { foo: 'bar' };
      const token = sm.generateToken('get_telemetry', argsObj);
      expect(sm.validateToken('get_telemetry', token, argsObj)).toBe(true);
      sm.consumeToken(token);
      // After consumption, the token should no longer validate.
      expect(sm.validateToken('get_telemetry', token, argsObj)).toBe(false);
    });

    it('invalid approval token is rejected for native tool', () => {
      const sm = makeSM();
      expect(sm.validateToken('get_telemetry', 'nope', {})).toBe(false);
    });

    it('allowed native tool has no HITL friction', () => {
      const sm = makeSM();
      expect(sm.checkPermission('reset_telemetry')).toBe('allow');
    });
  });

  // ---- G-03: JWT role refresh on existing / reattach paths ----

  describe('G-03: HttpServer refreshes session role on existing/reattach', () => {
    const src = fs.readFileSync(httpServerTsPath, 'utf8');

    it('existing session path applies roleOverride via setSessionRole', () => {
      // Matches the block inserted before transport.handleRequest on the existing session path.
      expect(src).toMatch(/this\.transports\.has\s*\(\s*sessionId\s*\)[\s\S]*?roleOverride\s*!==\s*undefined[\s\S]*?setSessionRole\s*\(\s*sessionId\s*,\s*roleOverride\s*\)/);
    });

    it('reattachment path applies roleOverride after loadSession', () => {
      expect(src).toMatch(/loadSession\s*\(\s*sessionId\s*\)[\s\S]*?if\s*\(\s*loaded\s*\)[\s\S]*?roleOverride\s*!==\s*undefined[\s\S]*?setSessionRole\s*\(\s*sessionId\s*,\s*roleOverride\s*\)/);
    });

    it('both refresh paths guard on roleOverride !== undefined (does not clear on missing claim)', () => {
      const matches = src.match(/roleOverride\s*!==\s*undefined/g) || [];
      // At minimum: one for existing-session path, one for reattach path.
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('G-03: runtime — setSessionRole interaction', () => {
    it('applying JWT role to an existing session updates it in place', async () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation();
      iso.createSession('jwt-existing', 'readonly');

      // Simulate the HttpServer existing-session path.
      const jwtRole: string | undefined = 'admin';
      if (jwtRole !== undefined) {
        await iso.setSessionRole('jwt-existing', jwtRole);
      }

      expect(iso.getSession('jwt-existing').role).toBe('admin');
    });

    it('applying JWT role after reattach updates the rehydrated session', async () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation();
      // Seed a persisted session via the in-memory store contract.
      iso.createSession('jwt-reattach', 'readonly');
      // Forget in-memory copy to simulate process restart.
      iso['sessions'].delete('jwt-reattach');

      const loaded = await iso.loadSession('jwt-reattach');
      expect(loaded).not.toBeNull();
      expect(loaded.role).toBe('readonly');

      const jwtRole: string | undefined = 'developer';
      if (jwtRole !== undefined) {
        await iso.setSessionRole('jwt-reattach', jwtRole);
      }

      expect(iso.getSession('jwt-reattach').role).toBe('developer');
    });

    it('missing JWT role claim leaves the session role unchanged', async () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);
      const iso = new SessionIsolation();
      iso.createSession('jwt-missing', 'developer');

      const jwtRole: string | undefined = undefined;
      if (jwtRole !== undefined) {
        await iso.setSessionRole('jwt-missing', jwtRole);
      }

      expect(iso.getSession('jwt-missing').role).toBe('developer');
    });
  });

  // ---- Research documentation ----

  describe('research documentation', () => {
    it('rbac session gaps research doc exists and covers all three fixes', () => {
      const docPath = path.join(ROOT, 'docs', 'research', 'rbac-session-gaps-2026-04-11.md');
      expect(fs.existsSync(docPath)).toBe(true);

      const content = fs.readFileSync(docPath, 'utf8');
      expect(content).toMatch(/G-01/);
      expect(content).toMatch(/G-02/);
      expect(content).toMatch(/G-03/);
      expect(content).toMatch(/setSessionRole/);
    });
  });
});
