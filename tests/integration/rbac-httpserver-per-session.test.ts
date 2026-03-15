import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const securityTsPath = path.join(ROOT, 'src', 'SecurityManager.ts');
const securityJsPath = path.join(ROOT, 'dist', 'SecurityManager.js');
const proxyTsPath = path.join(ROOT, 'src', 'ProxyManager.ts');
const indexTsPath = path.join(ROOT, 'src', 'index.ts');
const httpServerTsPath = path.join(ROOT, 'src', 'HttpServer.ts');
const sessionIsolationJsPath = path.join(ROOT, 'dist', 'SessionIsolation.js');

describe('Per-Session RBAC for HttpServer', () => {

  // ---- Source structural validation ----

  describe('SecurityManager has optional role parameter on checkPermission', () => {
    const src = fs.readFileSync(securityTsPath, 'utf8');

    it('checkPermission signature accepts optional role parameter', () => {
      expect(src).toMatch(/checkPermission\s*\(\s*toolName\s*:\s*string\s*,\s*role\?\s*:\s*string\s*\|\s*null\s*\)/);
    });

    it('computes effectiveRole from parameter or activeRole', () => {
      expect(src).toMatch(/effectiveRole/);
      expect(src).toMatch(/role\s*!==\s*undefined/);
    });

    it('uses effectiveRole instead of this.activeRole for role lookup', () => {
      expect(src).toMatch(/effectiveRole\s*&&\s*this\.roles\.has\s*\(\s*effectiveRole\s*\)/);
    });
  });

  describe('ProxyManager forwards role to checkPermission', () => {
    const src = fs.readFileSync(proxyTsPath, 'utf8');

    it('callProxiedTool signature accepts optional role parameter', () => {
      expect(src).toMatch(/callProxiedTool\s*\(\s*toolName\s*:\s*string\s*,\s*args\s*:\s*any\s*,\s*role\?\s*:\s*string\s*\|\s*null\s*\)/);
    });

    it('passes role to checkPermission', () => {
      expect(src).toMatch(/checkPermission\s*\(\s*toolName\s*,\s*role\s*\)/);
    });
  });

  describe('index.ts threads session role to ProxyManager', () => {
    const src = fs.readFileSync(indexTsPath, 'utf8');

    it('looks up session from sessionIsolation in proxied tool handler', () => {
      // The proxied branch should call getSession to find the session role
      expect(src).toMatch(/sessionIsolation\.getSession\s*\(\s*sessionId\s*\)/);
    });

    it('extracts sessionRole from session state', () => {
      expect(src).toMatch(/sessionRole/);
      expect(src).toMatch(/session\?\.role/);
    });

    it('passes sessionRole to callProxiedTool', () => {
      expect(src).toMatch(/callProxiedTool\s*\(\s*toolName\s*,\s*args\s*,\s*sessionRole\s*\)/);
    });
  });

  describe('HttpServer passes default role on session creation', () => {
    const src = fs.readFileSync(httpServerTsPath, 'utf8');

    it('passes EVOKORE_ROLE to createSession in onsessioninitialized', () => {
      expect(src).toMatch(/createSession\s*\(\s*newSessionId\s*,\s*process\.env\.EVOKORE_ROLE\s*\|\|\s*null\s*\)/);
    });
  });

  // ---- Runtime: checkPermission with explicit role parameter ----

  describe('checkPermission with explicit role parameter', () => {
    function createSecurityWithRoles() {
      const { SecurityManager } = require(securityJsPath);
      const sm = new SecurityManager();
      sm.rules = { github_push_files: 'require_approval' };
      sm.roles = new Map([
        ['admin', { description: 'Full access', default_permission: 'allow' }],
        ['readonly', { description: 'Read-only', default_permission: 'deny', overrides: { fs_read_file: 'allow' } }],
        ['developer', { description: 'Dev', default_permission: 'require_approval', overrides: { fs_read_file: 'allow' } }],
      ]);
      return sm;
    }

    it('uses passed role instead of activeRole', () => {
      const sm = createSecurityWithRoles();
      sm.setActiveRole('admin'); // global role is admin

      // But pass 'readonly' explicitly -- should use readonly role
      expect(sm.checkPermission('some_write_tool', 'readonly')).toBe('deny');
      // Verify admin is still the global role
      expect(sm.getActiveRole()).toBe('admin');
    });

    it('passes null explicitly to opt out of RBAC', () => {
      const sm = createSecurityWithRoles();
      sm.setActiveRole('readonly'); // global role denies by default

      // Explicit null: should skip RBAC entirely and use flat rules
      expect(sm.checkPermission('unknown_tool', null)).toBe('allow'); // flat default
      expect(sm.checkPermission('github_push_files', null)).toBe('require_approval'); // flat rule
    });

    it('omitting role falls back to activeRole (backward compat)', () => {
      const sm = createSecurityWithRoles();
      sm.setActiveRole('readonly');

      // No second arg: uses activeRole (readonly), which denies unknown tools
      expect(sm.checkPermission('some_write_tool')).toBe('deny');
      expect(sm.checkPermission('fs_read_file')).toBe('allow'); // override
    });

    it('role override takes priority over flat rules when explicit role is passed', () => {
      const sm = createSecurityWithRoles();
      // No global role set
      expect(sm.getActiveRole()).toBeNull();

      // Pass developer explicitly: fs_read_file is overridden to allow
      expect(sm.checkPermission('fs_read_file', 'developer')).toBe('allow');
      // github_push_files has a flat rule (require_approval) which applies as additional override
      expect(sm.checkPermission('github_push_files', 'developer')).toBe('require_approval');
      // unknown tool falls back to developer default_permission
      expect(sm.checkPermission('completely_unknown', 'developer')).toBe('require_approval');
    });

    it('passing an unknown role name falls through to flat permissions', () => {
      const sm = createSecurityWithRoles();
      sm.setActiveRole('admin');

      // 'nonexistent' is not in the roles map, so effectiveRole is truthy but not found
      // Should fall through to flat permissions
      expect(sm.checkPermission('unknown_tool', 'nonexistent')).toBe('allow');
      expect(sm.checkPermission('github_push_files', 'nonexistent')).toBe('require_approval');
    });
  });

  // ---- Runtime: two sessions with different roles get different permissions ----

  describe('two sessions with different roles', () => {
    it('get different permission results for the same tool', () => {
      const { SecurityManager } = require(securityJsPath);
      const { SessionIsolation } = require(sessionIsolationJsPath);

      const sm = new SecurityManager();
      sm.rules = {};
      sm.roles = new Map([
        ['admin', { description: 'Full access', default_permission: 'allow' }],
        ['readonly', { description: 'Read-only', default_permission: 'deny', overrides: { fs_read_file: 'allow' } }],
      ]);

      const iso = new SessionIsolation();
      const adminSession = iso.createSession('session-admin', 'admin');
      const readonlySession = iso.createSession('session-readonly', 'readonly');

      expect(adminSession.role).toBe('admin');
      expect(readonlySession.role).toBe('readonly');

      // Same tool, different role from each session
      expect(sm.checkPermission('fs_write_file', adminSession.role)).toBe('allow');
      expect(sm.checkPermission('fs_write_file', readonlySession.role)).toBe('deny');

      // Both allow fs_read_file (admin by default, readonly by override)
      expect(sm.checkPermission('fs_read_file', adminSession.role)).toBe('allow');
      expect(sm.checkPermission('fs_read_file', readonlySession.role)).toBe('allow');
    });
  });

  // ---- Runtime: HttpServer session creation with default role ----

  describe('HttpServer creates sessions with EVOKORE_ROLE default', () => {
    it('createSession receives the role parameter', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);

      const iso = new SessionIsolation();

      // Simulate what HttpServer does: pass EVOKORE_ROLE || null
      const roleFromEnv = process.env.EVOKORE_ROLE || null;
      const session = iso.createSession('http-session-1', roleFromEnv);

      // In the test environment EVOKORE_ROLE is likely unset, so role should be null
      expect(session.role).toBe(roleFromEnv);
      expect(session.sessionId).toBe('http-session-1');
    });

    it('createSession with explicit role stores it on the session', () => {
      const { SessionIsolation } = require(sessionIsolationJsPath);

      const iso = new SessionIsolation();
      const session = iso.createSession('http-session-2', 'developer');

      expect(session.role).toBe('developer');

      // Retrieve it and confirm
      const retrieved = iso.getSession('http-session-2');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.role).toBe('developer');
    });
  });

  // ---- Research documentation ----

  describe('research documentation', () => {
    it('per-session RBAC research doc exists', () => {
      const docPath = path.join(ROOT, 'docs', 'research', 'rbac-httpserver-per-session-2026-03-15.md');
      expect(fs.existsSync(docPath)).toBe(true);

      const content = fs.readFileSync(docPath, 'utf8');
      expect(content).toMatch(/Per-Session RBAC/i);
      expect(content).toMatch(/effectiveRole/);
      expect(content).toMatch(/Backward Compat/i);
      expect(content).toMatch(/JWT Claim/i);
    });
  });
});
