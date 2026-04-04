import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const securityTsPath = path.join(ROOT, 'src', 'SecurityManager.ts');
const securityJsPath = path.join(ROOT, 'dist', 'SecurityManager.js');
const permissionsPath = path.join(ROOT, 'permissions.yml');

describe('T11: RBAC Role Switching', () => {
  // ---- Source structural validation ----

  describe('SecurityManager source structure', () => {
    const src = fs.readFileSync(securityTsPath, 'utf8');

    it('has RoleDefinition interface with required fields', () => {
      expect(src).toMatch(/interface RoleDefinition/);
      expect(src).toMatch(/default_permission/);
      expect(src).toMatch(/overrides\??:/);
      expect(src).toMatch(/description/);
    });

    it('reads EVOKORE_ROLE env var for role activation', () => {
      expect(src).toMatch(/EVOKORE_ROLE/);
    });

    it('has getActiveRole, setActiveRole, and listRoles methods', () => {
      expect(src).toMatch(/getActiveRole\(\)/);
      expect(src).toMatch(/setActiveRole\(/);
      expect(src).toMatch(/listRoles\(\)/);
    });
  });

  // ---- permissions.yml role definitions ----

  describe('permissions.yml defines all 3 roles', () => {
    const perms = fs.readFileSync(permissionsPath, 'utf8');

    it('has roles: top-level key', () => {
      expect(perms).toMatch(/^roles:/m);
    });

    it('defines admin role with default_permission: allow', () => {
      expect(perms).toMatch(/^\s+admin:/m);
      expect(perms).toMatch(/default_permission:\s*allow/);
    });

    it('defines developer role with default_permission: require_approval', () => {
      expect(perms).toMatch(/^\s+developer:/m);
      expect(perms).toMatch(/default_permission:\s*require_approval/);
    });

    it('defines readonly role with default_permission: deny', () => {
      expect(perms).toMatch(/^\s+readonly:/m);
      expect(perms).toMatch(/default_permission:\s*deny/);
    });

    it('retains flat rules section for backwards compatibility', () => {
      expect(perms).toMatch(/^rules:/m);
    });
  });

  // ---- Runtime: no active role (flat permissions fallback) ----

  describe('flat permissions when no role is active', () => {
    it('defaults to null role on construction', () => {
      const { SecurityManager } = require(securityJsPath);
      const sm = new SecurityManager();
      expect(sm.getActiveRole()).toBeNull();
    });

    it('uses flat rules for permission checks', () => {
      const { SecurityManager } = require(securityJsPath);
      const sm = new SecurityManager();
      sm.rules = {
        fs_read_file: 'allow',
        fs_write_file: 'require_approval',
        supabase_create_project: 'deny'
      };

      expect(sm.checkPermission('fs_read_file')).toBe('allow');
      expect(sm.checkPermission('fs_write_file')).toBe('require_approval');
      expect(sm.checkPermission('supabase_create_project')).toBe('deny');
    });

    it('defaults unknown tools to "deny" with no role', () => {
      const { SecurityManager } = require(securityJsPath);
      const sm = new SecurityManager();
      sm.rules = {};
      expect(sm.checkPermission('totally_unknown_tool')).toBe('deny');
    });
  });

  // ---- Runtime: admin role ----

  describe('admin role: full access', () => {
    it('allows all tools by default', () => {
      const { SecurityManager } = require(securityJsPath);
      const sm = new SecurityManager();
      sm.roles = new Map([
        ['admin', { description: 'Full access', default_permission: 'allow' }]
      ]);
      sm.setActiveRole('admin');

      expect(sm.getActiveRole()).toBe('admin');
      expect(sm.checkPermission('any_tool')).toBe('allow');
      expect(sm.checkPermission('supabase_delete_branch')).toBe('allow');
      expect(sm.checkPermission('fs_write_file')).toBe('allow');
    });
  });

  // ---- Runtime: developer role ----

  describe('developer role: layered permissions', () => {
    function createDevSecurity() {
      const { SecurityManager } = require(securityJsPath);
      const sm = new SecurityManager();
      sm.rules = { github_push_files: 'require_approval' };
      sm.roles = new Map([
        ['developer', {
          description: 'Dev access',
          default_permission: 'require_approval',
          overrides: {
            fs_read_file: 'allow',
            supabase_delete_branch: 'deny'
          }
        }]
      ]);
      sm.setActiveRole('developer');
      return sm;
    }

    it('role override: allow takes priority', () => {
      const sm = createDevSecurity();
      expect(sm.checkPermission('fs_read_file')).toBe('allow');
    });

    it('role override: deny takes priority', () => {
      const sm = createDevSecurity();
      expect(sm.checkPermission('supabase_delete_branch')).toBe('deny');
    });

    it('flat rule applies when no role override exists', () => {
      const sm = createDevSecurity();
      expect(sm.checkPermission('github_push_files')).toBe('require_approval');
    });

    it('falls back to role default_permission for unknown tools', () => {
      const sm = createDevSecurity();
      expect(sm.checkPermission('completely_unknown')).toBe('require_approval');
    });
  });

  // ---- Runtime: readonly role ----

  describe('readonly role: deny by default with specific allows', () => {
    function createReadonlySecurity() {
      const { SecurityManager } = require(securityJsPath);
      const sm = new SecurityManager();
      sm.rules = {};
      sm.roles = new Map([
        ['readonly', {
          description: 'Read-only',
          default_permission: 'deny',
          overrides: {
            fs_read_file: 'allow',
            github_search_repositories: 'allow'
          }
        }]
      ]);
      sm.setActiveRole('readonly');
      return sm;
    }

    it('allows explicitly overridden tools', () => {
      const sm = createReadonlySecurity();
      expect(sm.checkPermission('fs_read_file')).toBe('allow');
      expect(sm.checkPermission('github_search_repositories')).toBe('allow');
    });

    it('denies non-overridden tools', () => {
      const sm = createReadonlySecurity();
      expect(sm.checkPermission('fs_write_file')).toBe('deny');
      expect(sm.checkPermission('random_tool')).toBe('deny');
    });
  });

  // ---- Role switching at runtime ----

  describe('runtime role switching', () => {
    it('setActiveRole returns true for known roles', () => {
      const { SecurityManager } = require(securityJsPath);
      const sm = new SecurityManager();
      sm.roles = new Map([
        ['admin', { description: 'Full access', default_permission: 'allow' }],
        ['readonly', { description: 'Read-only', default_permission: 'deny' }]
      ]);
      expect(sm.setActiveRole('admin')).toBe(true);
      expect(sm.getActiveRole()).toBe('admin');
    });

    it('setActiveRole returns false for unknown roles', () => {
      const { SecurityManager } = require(securityJsPath);
      const sm = new SecurityManager();
      sm.roles = new Map([
        ['admin', { description: 'Full access', default_permission: 'allow' }]
      ]);
      sm.setActiveRole('admin');
      expect(sm.setActiveRole('nonexistent')).toBe(false);
      // Should keep the previous role
      expect(sm.getActiveRole()).toBe('admin');
    });

    it('setActiveRole(null) deactivates RBAC', () => {
      const { SecurityManager } = require(securityJsPath);
      const sm = new SecurityManager();
      sm.roles = new Map([
        ['admin', { description: 'Full access', default_permission: 'allow' }]
      ]);
      sm.setActiveRole('admin');
      expect(sm.setActiveRole(null)).toBe(true);
      expect(sm.getActiveRole()).toBeNull();
    });

    it('permissions change when role is switched', () => {
      const { SecurityManager } = require(securityJsPath);
      const sm = new SecurityManager();
      sm.rules = {};
      sm.roles = new Map([
        ['admin', { description: 'Full access', default_permission: 'allow' }],
        ['readonly', { description: 'Read-only', default_permission: 'deny', overrides: { fs_read_file: 'allow' } }]
      ]);

      sm.setActiveRole('admin');
      expect(sm.checkPermission('fs_write_file')).toBe('allow');

      sm.setActiveRole('readonly');
      expect(sm.checkPermission('fs_write_file')).toBe('deny');
    });
  });

  // ---- listRoles ----

  describe('listRoles method', () => {
    it('returns all roles with active status', () => {
      const { SecurityManager } = require(securityJsPath);
      const sm = new SecurityManager();
      sm.roles = new Map([
        ['admin', { description: 'Full access', default_permission: 'allow' }],
        ['developer', { description: 'Dev', default_permission: 'require_approval' }],
        ['readonly', { description: 'Read-only', default_permission: 'deny' }]
      ]);

      let roles = sm.listRoles();
      expect(roles.length).toBe(3);
      expect(roles.every((r: any) => !r.isActive)).toBe(true);

      sm.setActiveRole('developer');
      roles = sm.listRoles();
      const dev = roles.find((r: any) => r.name === 'developer');
      expect(dev).toBeDefined();
      expect(dev.isActive).toBe(true);
      expect(dev.description).toBe('Dev');

      const admin = roles.find((r: any) => r.name === 'admin');
      expect(admin).toBeDefined();
      expect(admin.isActive).toBe(false);
    });
  });

  // ---- Role override priority ----

  describe('role overrides take priority over flat rules', () => {
    it('role override wins when flat rule says something different', () => {
      const { SecurityManager } = require(securityJsPath);
      const sm = new SecurityManager();
      // Flat rule says require_approval
      sm.rules = { fs_read_file: 'require_approval' };
      // Role override says allow
      sm.roles = new Map([
        ['dev', {
          description: 'Dev',
          default_permission: 'deny',
          overrides: { fs_read_file: 'allow' }
        }]
      ]);
      sm.setActiveRole('dev');
      expect(sm.checkPermission('fs_read_file')).toBe('allow');
    });
  });
});
