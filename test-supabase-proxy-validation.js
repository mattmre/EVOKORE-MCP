'use strict';


const assert = require('assert');
const fs = require('fs');
const path = require('path');

test('Supabase proxy configuration validation', () => {
  const configPath = path.resolve(__dirname, 'mcp.config.json');
  const permissionsPath = path.resolve(__dirname, 'permissions.yml');

  // --- mcp.config.json: Supabase server entry ---
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.ok(config.servers.supabase, 'supabase server should be configured in mcp.config.json');
  assert.strictEqual(config.servers.supabase.command, 'npx', 'supabase command should be npx');
  assert.ok(
    config.servers.supabase.args.includes('@supabase/mcp-server-supabase'),
    'supabase args should include @supabase/mcp-server-supabase package'
  );
  assert.ok(
    config.servers.supabase.args.includes('--read-only'),
    'supabase args should include --read-only flag for safety'
  );
  assert.ok(
    config.servers.supabase.env.SUPABASE_ACCESS_TOKEN,
    'supabase env should reference SUPABASE_ACCESS_TOKEN'
  );
  assert.strictEqual(
    config.servers.supabase.env.SUPABASE_ACCESS_TOKEN,
    '${SUPABASE_ACCESS_TOKEN}',
    'SUPABASE_ACCESS_TOKEN should use env interpolation syntax'
  );
  console.log('  mcp.config.json: supabase server entry validated.');

  // --- permissions.yml: Supabase rules ---
  const permissions = fs.readFileSync(permissionsPath, 'utf8');

  // Read operations should be allowed
  assert.match(permissions, /supabase_list_projects:\s*"allow"/, 'list_projects should be allowed');
  assert.match(permissions, /supabase_get_project:\s*"allow"/, 'get_project should be allowed');
  assert.match(permissions, /supabase_list_tables:\s*"allow"/, 'list_tables should be allowed');
  assert.match(permissions, /supabase_list_migrations:\s*"allow"/, 'list_migrations should be allowed');
  assert.match(permissions, /supabase_list_extensions:\s*"allow"/, 'list_extensions should be allowed');
  assert.match(permissions, /supabase_get_logs:\s*"allow"/, 'get_logs should be allowed');
  assert.match(permissions, /supabase_get_project_url:\s*"allow"/, 'get_project_url should be allowed');
  assert.match(permissions, /supabase_list_organizations:\s*"allow"/, 'list_organizations should be allowed');
  assert.match(permissions, /supabase_get_organization:\s*"allow"/, 'get_organization should be allowed');
  assert.match(permissions, /supabase_search_docs:\s*"allow"/, 'search_docs should be allowed');
  console.log('  permissions.yml: read operations validated as allowed.');

  // Sensitive operations should require approval
  assert.match(permissions, /supabase_execute_sql:\s*"require_approval"/, 'execute_sql should require approval');
  assert.match(permissions, /supabase_apply_migration:\s*"require_approval"/, 'apply_migration should require approval');
  assert.match(permissions, /supabase_restore_project:\s*"require_approval"/, 'restore_project should require approval');
  assert.match(permissions, /supabase_create_branch:\s*"require_approval"/, 'create_branch should require approval');
  assert.match(permissions, /supabase_merge_branch:\s*"require_approval"/, 'merge_branch should require approval');
  assert.match(permissions, /supabase_deploy_edge_function:\s*"require_approval"/, 'deploy_edge_function should require approval');
  console.log('  permissions.yml: sensitive operations validated as require_approval.');

  // Destructive operations should be denied
  assert.match(permissions, /supabase_create_project:\s*"deny"/, 'create_project should be denied');
  assert.match(permissions, /supabase_pause_project:\s*"deny"/, 'pause_project should be denied');
  assert.match(permissions, /supabase_delete_branch:\s*"deny"/, 'delete_branch should be denied');
  console.log('  permissions.yml: destructive operations validated as denied.');
});
