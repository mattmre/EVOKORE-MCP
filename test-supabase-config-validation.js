'use strict';

/**
 * M2.3: Supabase Configuration Validation
 *
 * Root-level CI-safe test that validates the mcp.config.json and permissions.yml
 * supabase configuration structure. Does NOT require credentials.
 */

const fs = require('fs');
const path = require('path');

const configPath = path.resolve(__dirname, 'mcp.config.json');
const permissionsPath = path.resolve(__dirname, 'permissions.yml');
const envExamplePath = path.resolve(__dirname, '.env.example');

describe('M2.3: Supabase config validation (CI-safe, no credentials)', () => {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const permissions = fs.readFileSync(permissionsPath, 'utf8');
  const envExample = fs.readFileSync(envExamplePath, 'utf8');

  // --- mcp.config.json structure ---

  test('supabase server entry exists in mcp.config.json', () => {
    expect(config.servers).toBeDefined();
    expect(config.servers.supabase).toBeDefined();
  });

  test('supabase uses npx command with @supabase/mcp-server-supabase', () => {
    expect(config.servers.supabase.command).toBe('npx');
    expect(config.servers.supabase.args).toContain('@supabase/mcp-server-supabase');
  });

  test('supabase includes --read-only safety flag', () => {
    expect(config.servers.supabase.args).toContain('--read-only');
  });

  test('supabase env uses interpolation for SUPABASE_ACCESS_TOKEN', () => {
    expect(config.servers.supabase.env.SUPABASE_ACCESS_TOKEN).toBe('${SUPABASE_ACCESS_TOKEN}');
  });

  // --- .env.example documentation ---

  test('SUPABASE_ACCESS_TOKEN is documented in .env.example', () => {
    expect(envExample).toContain('SUPABASE_ACCESS_TOKEN');
  });

  // --- permissions.yml tier coverage ---

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
    'supabase_merge_branch',
    'supabase_deploy_edge_function',
  ];

  const denyTools = [
    'supabase_create_project',
    'supabase_pause_project',
    'supabase_delete_branch',
  ];

  test('all 10 allow-tier supabase tools are present', () => {
    for (const tool of allowTools) {
      expect(permissions).toMatch(new RegExp(`${tool}:\\s*"allow"`));
    }
  });

  test('all 6 require_approval-tier supabase tools are present', () => {
    for (const tool of requireApprovalTools) {
      expect(permissions).toMatch(new RegExp(`${tool}:\\s*"require_approval"`));
    }
  });

  test('all 3 deny-tier supabase tools are present', () => {
    for (const tool of denyTools) {
      expect(permissions).toMatch(new RegExp(`${tool}:\\s*"deny"`));
    }
  });

  test('total supabase tool count is at least 19', () => {
    const allTools = [...allowTools, ...requireApprovalTools, ...denyTools];
    expect(allTools).toHaveLength(19);
    // Every tool should appear in permissions.yml
    for (const tool of allTools) {
      expect(permissions).toContain(tool);
    }
  });

  test('no supabase tools exist in permissions.yml outside the known set', () => {
    const knownTools = new Set([...allowTools, ...requireApprovalTools, ...denyTools]);
    const supabaseLines = permissions
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('supabase_') && line.includes(':'));

    // Extract unique tool names from the rules section
    const foundToolNames = new Set(
      supabaseLines.map(line => line.split(':')[0].trim()),
    );

    for (const found of foundToolNames) {
      expect(knownTools.has(found)).toBe(true);
    }
  });

  test('RBAC readonly role includes supabase read overrides', () => {
    expect(permissions).toMatch(/readonly:/);
    expect(permissions).toMatch(/supabase_list_projects:\s*allow/);
    expect(permissions).toMatch(/supabase_list_tables:\s*allow/);
  });

  test('RBAC developer role includes supabase overrides', () => {
    expect(permissions).toMatch(/developer:/);
    expect(permissions).toMatch(/supabase_list_projects:\s*allow/);
    expect(permissions).toMatch(/supabase_create_project:\s*deny/);
  });
});
