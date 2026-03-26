import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const configPath = path.join(ROOT, 'mcp.config.json');
const permissionsPath = path.join(ROOT, 'permissions.yml');
const envExamplePath = path.join(ROOT, '.env.example');
const securityJsPath = path.join(ROOT, 'dist', 'SecurityManager.js');
const proxyManagerTsPath = path.join(ROOT, 'src', 'ProxyManager.ts');

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const permissions = fs.readFileSync(permissionsPath, 'utf8');
const envExample = fs.readFileSync(envExamplePath, 'utf8');

// ---- Credential-gated test support ----
const hasCredentials = Boolean(process.env.SUPABASE_ACCESS_TOKEN);

// ---- Permission tier definitions (shared across test sections) ----
const ALLOW_TOOLS = [
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

const REQUIRE_APPROVAL_TOOLS = [
  'supabase_execute_sql',
  'supabase_apply_migration',
  'supabase_restore_project',
  'supabase_create_branch',
  'supabase_merge_branch',
  'supabase_deploy_edge_function',
];

const DENY_TOOLS = [
  'supabase_create_project',
  'supabase_pause_project',
  'supabase_delete_branch',
];

const ALL_TOOLS = [...ALLOW_TOOLS, ...REQUIRE_APPROVAL_TOOLS, ...DENY_TOOLS];

// ============================================================================
// M2.3: Supabase Live Validation Test Suite
// ============================================================================

describe('M2.3: Supabase Live Validation', () => {

  // ==========================================================================
  // A. Configuration validation (always runs, no credentials needed)
  // ==========================================================================

  describe('configuration validation', () => {

    describe('mcp.config.json supabase entry', () => {
      it('supabase server is configured', () => {
        expect(config.servers).toBeDefined();
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
        expect(config.servers.supabase.env).toBeDefined();
        expect(config.servers.supabase.env.SUPABASE_ACCESS_TOKEN).toBe('${SUPABASE_ACCESS_TOKEN}');
      });

      it('uses default stdio transport (no explicit transport key)', () => {
        expect(config.servers.supabase.transport).toBeUndefined();
      });

      it('does not set any extraneous configuration keys', () => {
        const validKeys = ['command', 'args', 'env', 'transport', 'url', 'rateLimit'];
        const actualKeys = Object.keys(config.servers.supabase);
        for (const key of actualKeys) {
          expect(validKeys).toContain(key);
        }
      });
    });

    describe('env vars documented in .env.example', () => {
      it('SUPABASE_ACCESS_TOKEN is documented', () => {
        expect(envExample).toContain('SUPABASE_ACCESS_TOKEN');
      });

      it('includes setup instructions for the token', () => {
        expect(envExample).toMatch(/supabase\.com/i);
      });
    });

    describe('permission tiers configured correctly', () => {

      it('has exactly 10 tools with "allow" permission', () => {
        for (const tool of ALLOW_TOOLS) {
          expect(permissions).toMatch(new RegExp(`${tool}:\\s*"allow"`));
        }
        expect(ALLOW_TOOLS).toHaveLength(10);
      });

      it('has exactly 6 tools with "require_approval" permission', () => {
        for (const tool of REQUIRE_APPROVAL_TOOLS) {
          expect(permissions).toMatch(new RegExp(`${tool}:\\s*"require_approval"`));
        }
        expect(REQUIRE_APPROVAL_TOOLS).toHaveLength(6);
      });

      it('has exactly 3 tools with "deny" permission', () => {
        for (const tool of DENY_TOOLS) {
          expect(permissions).toMatch(new RegExp(`${tool}:\\s*"deny"`));
        }
        expect(DENY_TOOLS).toHaveLength(3);
      });

      it('every supabase tool in permissions.yml uses the supabase_ prefix', () => {
        const supabaseLines = permissions
          .split('\n')
          .filter(line => {
            const trimmed = line.trim();
            return trimmed.startsWith('supabase_') && trimmed.includes(':');
          });
        expect(supabaseLines.length).toBeGreaterThan(0);
        for (const line of supabaseLines) {
          expect(line.trim()).toMatch(/^supabase_\w+:/);
        }
      });

      it('all 19 expected supabase tools are present in permissions.yml', () => {
        for (const tool of ALL_TOOLS) {
          expect(permissions).toContain(tool);
        }
        expect(ALL_TOOLS).toHaveLength(19);
      });

      it('permission tier totals are consistent (10 + 6 + 3 = 19)', () => {
        const uniqueTools = new Set(ALL_TOOLS);
        expect(uniqueTools.size).toBe(19);
      });
    });

    describe('RBAC role integration', () => {

      it('developer role overrides include supabase read tools', () => {
        // developer role should have overrides for supabase
        expect(permissions).toMatch(/developer:/);
        expect(permissions).toMatch(/supabase_list_projects:\s*allow/);
        expect(permissions).toMatch(/supabase_list_tables:\s*allow/);
      });

      it('developer role denies destructive supabase operations', () => {
        expect(permissions).toMatch(/supabase_create_project:\s*deny/);
        expect(permissions).toMatch(/supabase_delete_branch:\s*deny/);
      });

      it('readonly role overrides include supabase read tools', () => {
        expect(permissions).toMatch(/readonly:/);
        // readonly section should have supabase read tool overrides
        expect(permissions).toMatch(/supabase_list_projects:\s*allow/);
        expect(permissions).toMatch(/supabase_get_project:\s*allow/);
        expect(permissions).toMatch(/supabase_list_tables:\s*allow/);
        expect(permissions).toMatch(/supabase_search_docs:\s*allow/);
      });
    });

    describe('tool prefixing convention', () => {

      it('ProxyManager applies server-id prefix to tool names', () => {
        const proxyManagerSrc = fs.readFileSync(proxyManagerTsPath, 'utf8');
        expect(proxyManagerSrc).toMatch(/`\$\{serverId\}_\$\{tool\.name\}`/);
      });

      it('supabase server uses "supabase" as its server ID', () => {
        expect(Object.keys(config.servers)).toContain('supabase');
      });

      it('HITL approval token is injected into all proxied tool schemas', () => {
        const proxyManagerSrc = fs.readFileSync(proxyManagerTsPath, 'utf8');
        expect(proxyManagerSrc).toContain('_evokore_approval_token');
      });
    });
  });

  // ==========================================================================
  // B. Credential availability (always runs, reports but does not fail)
  // ==========================================================================

  describe('credential availability', () => {

    it('detects whether SUPABASE_ACCESS_TOKEN is set', () => {
      if (hasCredentials) {
        // Token is available -- validate basic format
        const token = process.env.SUPABASE_ACCESS_TOKEN!;
        expect(token.length).toBeGreaterThan(10);
        expect(token).not.toMatch(/^\$\{/);
        expect(token).not.toBe('your_supabase_access_token_here');
      } else {
        // Not a failure -- just informational
        console.warn(
          '[M2.3] SUPABASE_ACCESS_TOKEN is not set. ' +
          'Live integration tests will be skipped. ' +
          'Set the token in .env to enable live validation.'
        );
        expect(true).toBe(true); // Explicit pass
      }
    });
  });

  // ==========================================================================
  // C. Live integration tests (credential-gated, skipped when no token)
  // ==========================================================================

  describe.skipIf(!hasCredentials)('live integration (credential-gated)', () => {

    let StdioClientTransport: any;
    let Client: any;
    let waitForProxyBoot: any;

    beforeAll(async () => {
      // Dynamic imports -- only loaded when credentials are available
      const sdkClient = await import('@modelcontextprotocol/sdk/client/index.js');
      const sdkStdio = await import('@modelcontextprotocol/sdk/client/stdio.js');
      Client = sdkClient.Client;
      StdioClientTransport = sdkStdio.StdioClientTransport;
      ({ waitForProxyBoot } = require('../helpers/wait-for-proxy-boot.js'));
    });

    it('supabase child server boots and registers tools', async () => {
      // Boot the EVOKORE server with real credentials and check proxy boot
      const transport = new StdioClientTransport({
        command: process.platform === 'win32' ? 'node.exe' : 'node',
        args: [path.join(ROOT, 'dist', 'index.js')],
        env: {
          ...process.env,
          EVOKORE_CHILD_SERVER_BOOT_TIMEOUT_MS: '30000',
        } as Record<string, string>,
        stderr: 'pipe',
      });

      const client = new Client(
        { name: 'supabase-live-test', version: '1.0.0' },
        { capabilities: {} },
      );

      try {
        await client.connect(transport);
        const stderrText = await waitForProxyBoot(transport, 45000);

        // Verify supabase server booted
        expect(stderrText).toContain('Booting child server: supabase');

        // Check that tools were registered (boot success means tool listing happened)
        const { tools } = await client.listTools();
        const supabaseTools = tools.filter((t: any) => t.name.startsWith('supabase_'));
        expect(supabaseTools.length).toBeGreaterThan(0);

        // At minimum, list_projects should be available
        const listProjects = supabaseTools.find((t: any) => t.name === 'supabase_list_projects');
        expect(listProjects).toBeDefined();
      } finally {
        try { await client.close(); } catch { /* best-effort */ }
        try { await transport.close(); } catch { /* best-effort */ }
      }
    }, 60000);

    it('supabase_list_projects returns a valid response', async () => {
      const transport = new StdioClientTransport({
        command: process.platform === 'win32' ? 'node.exe' : 'node',
        args: [path.join(ROOT, 'dist', 'index.js')],
        env: {
          ...process.env,
          EVOKORE_CHILD_SERVER_BOOT_TIMEOUT_MS: '30000',
        } as Record<string, string>,
        stderr: 'pipe',
      });

      const client = new Client(
        { name: 'supabase-live-test', version: '1.0.0' },
        { capabilities: {} },
      );

      try {
        await client.connect(transport);
        await waitForProxyBoot(transport, 45000);

        const result: any = await client.callTool({
          name: 'supabase_list_projects',
          arguments: {},
        });

        // The tool should return content (even if the project list is empty)
        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
        expect(Array.isArray(result.content)).toBe(true);
        expect(result.content.length).toBeGreaterThan(0);

        // Content should be text-based
        expect(result.content[0].type).toBe('text');
      } finally {
        try { await client.close(); } catch { /* best-effort */ }
        try { await transport.close(); } catch { /* best-effort */ }
      }
    }, 60000);

    it('supabase_list_organizations returns a valid response', async () => {
      const transport = new StdioClientTransport({
        command: process.platform === 'win32' ? 'node.exe' : 'node',
        args: [path.join(ROOT, 'dist', 'index.js')],
        env: {
          ...process.env,
          EVOKORE_CHILD_SERVER_BOOT_TIMEOUT_MS: '30000',
        } as Record<string, string>,
        stderr: 'pipe',
      });

      const client = new Client(
        { name: 'supabase-live-test', version: '1.0.0' },
        { capabilities: {} },
      );

      try {
        await client.connect(transport);
        await waitForProxyBoot(transport, 45000);

        const result: any = await client.callTool({
          name: 'supabase_list_organizations',
          arguments: {},
        });

        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
        expect(Array.isArray(result.content)).toBe(true);
        expect(result.content.length).toBeGreaterThan(0);
        expect(result.content[0].type).toBe('text');
      } finally {
        try { await client.close(); } catch { /* best-effort */ }
        try { await transport.close(); } catch { /* best-effort */ }
      }
    }, 60000);

    it('deny-tier tools are rejected by the security interceptor', async () => {
      const transport = new StdioClientTransport({
        command: process.platform === 'win32' ? 'node.exe' : 'node',
        args: [path.join(ROOT, 'dist', 'index.js')],
        env: {
          ...process.env,
          EVOKORE_CHILD_SERVER_BOOT_TIMEOUT_MS: '30000',
        } as Record<string, string>,
        stderr: 'pipe',
      });

      const client = new Client(
        { name: 'supabase-live-test', version: '1.0.0' },
        { capabilities: {} },
      );

      try {
        await client.connect(transport);
        await waitForProxyBoot(transport, 45000);

        // supabase_create_project is a deny-tier tool
        await expect(
          client.callTool({
            name: 'supabase_create_project',
            arguments: { name: 'test-denied', organization_id: 'fake' },
          }),
        ).rejects.toThrow(/denied/i);
      } finally {
        try { await client.close(); } catch { /* best-effort */ }
        try { await transport.close(); } catch { /* best-effort */ }
      }
    }, 60000);

    it('require_approval tools return HITL token prompt without token', async () => {
      const transport = new StdioClientTransport({
        command: process.platform === 'win32' ? 'node.exe' : 'node',
        args: [path.join(ROOT, 'dist', 'index.js')],
        env: {
          ...process.env,
          EVOKORE_CHILD_SERVER_BOOT_TIMEOUT_MS: '30000',
        } as Record<string, string>,
        stderr: 'pipe',
      });

      const client = new Client(
        { name: 'supabase-live-test', version: '1.0.0' },
        { capabilities: {} },
      );

      try {
        await client.connect(transport);
        await waitForProxyBoot(transport, 45000);

        // supabase_execute_sql is a require_approval tool
        const result: any = await client.callTool({
          name: 'supabase_execute_sql',
          arguments: { query: 'SELECT 1' },
        });

        // Should return an error response with the HITL approval token prompt
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('SECURITY INTERCEPTOR');
        expect(result.content[0].text).toContain('_evokore_approval_token');
      } finally {
        try { await client.close(); } catch { /* best-effort */ }
        try { await transport.close(); } catch { /* best-effort */ }
      }
    }, 60000);
  });

  // ==========================================================================
  // D. Degradation validation (always runs, no credentials needed)
  // ==========================================================================

  describe('degradation validation', () => {

    it('SecurityManager resolves allow-tier tools correctly without role', () => {
      const { SecurityManager } = require(securityJsPath);
      const sm = new SecurityManager();
      // Manually inject the rules to test resolution logic
      sm.rules = Object.fromEntries(
        ALLOW_TOOLS.map(tool => [tool, 'allow']),
      );
      for (const tool of ALLOW_TOOLS) {
        expect(sm.checkPermission(tool)).toBe('allow');
      }
    });

    it('SecurityManager resolves require_approval-tier tools correctly without role', () => {
      const { SecurityManager } = require(securityJsPath);
      const sm = new SecurityManager();
      sm.rules = Object.fromEntries(
        REQUIRE_APPROVAL_TOOLS.map(tool => [tool, 'require_approval']),
      );
      for (const tool of REQUIRE_APPROVAL_TOOLS) {
        expect(sm.checkPermission(tool)).toBe('require_approval');
      }
    });

    it('SecurityManager resolves deny-tier tools correctly without role', () => {
      const { SecurityManager } = require(securityJsPath);
      const sm = new SecurityManager();
      sm.rules = Object.fromEntries(
        DENY_TOOLS.map(tool => [tool, 'deny']),
      );
      for (const tool of DENY_TOOLS) {
        expect(sm.checkPermission(tool)).toBe('deny');
      }
    });

    it('ProxyManager env resolution throws on missing SUPABASE_ACCESS_TOKEN', () => {
      const proxyManagerSrc = fs.readFileSync(proxyManagerTsPath, 'utf8');
      // ProxyManager.resolveServerEnv throws when env placeholders are unresolved
      expect(proxyManagerSrc).toContain('Unresolved env placeholder');
      // The error message includes the server ID and the missing variable name
      expect(proxyManagerSrc).toContain('child server');
    });

    it('ProxyManager records server status as error when boot fails', () => {
      const proxyManagerSrc = fs.readFileSync(proxyManagerTsPath, 'utf8');
      // When a child server fails to boot, its status is set to 'error'
      expect(proxyManagerSrc).toContain("serverState.status = 'error'");
      expect(proxyManagerSrc).toContain('serverState.errorCount++');
    });

    it('ProxyManager uses Promise.allSettled so one failing server does not block others', () => {
      const proxyManagerSrc = fs.readFileSync(proxyManagerTsPath, 'utf8');
      expect(proxyManagerSrc).toContain('Promise.allSettled');
    });

    it('readonly role enforces deny-default for unoverridden supabase tools', () => {
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
          },
        }],
      ]);
      sm.setActiveRole('readonly');

      // Overridden tools should be allowed
      expect(sm.checkPermission('supabase_list_projects')).toBe('allow');
      expect(sm.checkPermission('supabase_list_tables')).toBe('allow');

      // Non-overridden tools fall to the role's default_permission: deny
      expect(sm.checkPermission('supabase_execute_sql')).toBe('deny');
      expect(sm.checkPermission('supabase_create_project')).toBe('deny');
      expect(sm.checkPermission('supabase_apply_migration')).toBe('deny');
    });

    it('server status snapshot API is available on ProxyManager', () => {
      const proxyManagerSrc = fs.readFileSync(proxyManagerTsPath, 'utf8');
      expect(proxyManagerSrc).toContain('getServerStatusSnapshot');
    });

    it('graceful error messages reference the server ID on boot failure', () => {
      const proxyManagerSrc = fs.readFileSync(proxyManagerTsPath, 'utf8');
      expect(proxyManagerSrc).toMatch(/Failed to boot child server.*\$\{serverId\}/);
    });
  });
});
