import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const configPath = path.join(ROOT, 'mcp.config.json');
const permissionsPath = path.join(ROOT, 'permissions.yml');
const securityJsPath = path.join(ROOT, 'dist', 'SecurityManager.js');

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const permissions = fs.readFileSync(permissionsPath, 'utf8');

describe('T09: Supabase Integration Validation', () => {
  // ---- Config shape validation ----

  describe('mcp.config.json supabase entry', () => {
    it('has a supabase server configured', () => {
      expect(config.servers.supabase).toBeDefined();
    });

    it('uses npx as the command', () => {
      expect(config.servers.supabase.command).toBe('npx');
    });

    it('references @supabase/mcp-server-supabase package', () => {
      expect(config.servers.supabase.args).toContain('@supabase/mcp-server-supabase');
    });

    it('includes --read-only flag for safety', () => {
      expect(config.servers.supabase.args).toContain('--read-only');
    });

    it('uses env interpolation for SUPABASE_ACCESS_TOKEN', () => {
      expect(config.servers.supabase.env.SUPABASE_ACCESS_TOKEN).toBe('${SUPABASE_ACCESS_TOKEN}');
    });
  });

  // ---- Tool prefixing validation ----

  describe('supabase tool prefix convention', () => {
    it('all supabase rules in permissions.yml use supabase_ prefix', () => {
      const supabaseRuleLines = permissions
        .split('\n')
        .filter(line => line.trim().startsWith('supabase_'));
      expect(supabaseRuleLines.length).toBeGreaterThan(0);
      for (const line of supabaseRuleLines) {
        expect(line.trim()).toMatch(/^supabase_\w+:/);
      }
    });
  });

  // ---- Tiered permission validation ----

  describe('tiered permissions (10 allow, 4+ require_approval, 3 deny)', () => {
    const allowTools = [
      'supabase_list_projects',
      'supabase_get_project',
      'supabase_list_tables',
      'supabase_list_migrations',
      'supabase_list_extensions',
      'supabase_get_logs',
      'supabase_get_project_url',
      'supabase_list_organizations',
      'supabase_get_organization',
      'supabase_search_docs',
    ];

    const requireApprovalTools = [
      'supabase_execute_sql',
      'supabase_apply_migration',
      'supabase_restore_project',
      'supabase_create_branch',
    ];

    const denyTools = [
      'supabase_create_project',
      'supabase_pause_project',
      'supabase_delete_branch',
    ];

    it('has 10 supabase tools with "allow" permission', () => {
      for (const tool of allowTools) {
        const regex = new RegExp(`${tool}:\\s*"allow"`);
        expect(permissions).toMatch(regex);
      }
      expect(allowTools.length).toBe(10);
    });

    it('has at least 4 supabase tools with "require_approval" permission', () => {
      for (const tool of requireApprovalTools) {
        const regex = new RegExp(`${tool}:\\s*"require_approval"`);
        expect(permissions).toMatch(regex);
      }
      expect(requireApprovalTools.length).toBeGreaterThanOrEqual(4);
    });

    it('has 3 supabase tools with "deny" permission', () => {
      for (const tool of denyTools) {
        const regex = new RegExp(`${tool}:\\s*"deny"`);
        expect(permissions).toMatch(regex);
      }
      expect(denyTools.length).toBe(3);
    });
  });

  // ---- Runtime permission resolution for supabase tools ----

  describe('SecurityManager runtime resolution for supabase tools', () => {
    it('resolves supabase_list_projects as "allow" with no active role', () => {
      const { SecurityManager } = require(securityJsPath);
      const sm = new SecurityManager();
      sm.rules = { supabase_list_projects: 'allow' };
      expect(sm.checkPermission('supabase_list_projects')).toBe('allow');
    });

    it('resolves supabase_execute_sql as "require_approval" with no active role', () => {
      const { SecurityManager } = require(securityJsPath);
      const sm = new SecurityManager();
      sm.rules = { supabase_execute_sql: 'require_approval' };
      expect(sm.checkPermission('supabase_execute_sql')).toBe('require_approval');
    });

    it('resolves supabase_create_project as "deny" with no active role', () => {
      const { SecurityManager } = require(securityJsPath);
      const sm = new SecurityManager();
      sm.rules = { supabase_create_project: 'deny' };
      expect(sm.checkPermission('supabase_create_project')).toBe('deny');
    });

    it('readonly role denies supabase tools not in its overrides', () => {
      const { SecurityManager } = require(securityJsPath);
      const sm = new SecurityManager();
      sm.rules = {};
      sm.roles = new Map([
        ['readonly', {
          description: 'Read-only access',
          default_permission: 'deny',
          overrides: {
            supabase_list_projects: 'allow',
            supabase_list_tables: 'allow',
          }
        }]
      ]);
      sm.setActiveRole('readonly');

      expect(sm.checkPermission('supabase_list_projects')).toBe('allow');
      expect(sm.checkPermission('supabase_list_tables')).toBe('allow');
      expect(sm.checkPermission('supabase_execute_sql')).toBe('deny');
      expect(sm.checkPermission('supabase_create_project')).toBe('deny');
    });
  });

  // ---- Supabase in readonly RBAC role config ----

  describe('permissions.yml readonly role includes supabase overrides', () => {
    it('readonly role overrides include supabase read tools', () => {
      // Parse the readonly section from permissions.yml
      expect(permissions).toMatch(/readonly:/);
      expect(permissions).toMatch(/supabase_list_projects:\s*allow/);
      expect(permissions).toMatch(/supabase_list_tables:\s*allow/);
    });
  });
});
