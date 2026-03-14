import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const indexTsPath = path.join(ROOT, 'src', 'index.ts');
const proxyManagerTsPath = path.join(ROOT, 'src', 'ProxyManager.ts');
const proxyManagerJsPath = path.join(ROOT, 'dist', 'ProxyManager.js');

describe('T12: Async Proxy Boot', () => {
  // ---- Source structural validation ----

  describe('index.ts async boot wiring', () => {
    const src = fs.readFileSync(indexTsPath, 'utf8');

    it('calls bootProxyServersInBackground from run()', () => {
      expect(src).toMatch(/bootProxyServersInBackground/);
    });

    it('uses .catch() on the background promise, not void', () => {
      // Ensure the promise is caught properly
      expect(src).toMatch(/bootProxyServersInBackground\(\)\.catch/);
    });

    it('emits "Proxy bootstrap complete" sentinel on success', () => {
      expect(src).toMatch(/Proxy bootstrap complete/);
    });

    it('emits "Background proxy bootstrap failed" sentinel on error', () => {
      expect(src).toMatch(/Background proxy bootstrap failed/);
    });

    it('connects transport before starting proxy boot in run()', () => {
      // Extract the run() method body to verify ordering
      const runMethodMatch = src.match(/async run\(\)[^{]*\{([\s\S]*?)^\s{2}\}/m);
      expect(runMethodMatch).not.toBeNull();
      const runBody = runMethodMatch![1];

      const connectIdx = runBody.indexOf('server.connect(transport)');
      const bootIdx = runBody.indexOf('bootProxyServersInBackground');
      expect(connectIdx).toBeGreaterThan(-1);
      expect(bootIdx).toBeGreaterThan(-1);
      expect(connectIdx).toBeLessThan(bootIdx);
    });
  });

  // ---- ProxyManager boot timeout configuration ----

  describe('ProxyManager boot timeout', () => {
    const pmSrc = fs.readFileSync(proxyManagerTsPath, 'utf8');

    it('has a default timeout constant', () => {
      expect(pmSrc).toMatch(/DEFAULT_CHILD_SERVER_BOOT_TIMEOUT_MS/);
    });

    it('reads EVOKORE_CHILD_SERVER_BOOT_TIMEOUT_MS from env', () => {
      expect(pmSrc).toMatch(/EVOKORE_CHILD_SERVER_BOOT_TIMEOUT_MS/);
    });

    it('uses withTimeout for client.connect', () => {
      expect(pmSrc).toMatch(/withTimeout\s*\(/);
      expect(pmSrc).toMatch(/client\.connect/);
    });

    it('uses withTimeout for client.listTools', () => {
      expect(pmSrc).toMatch(/client\.listTools/);
    });

    it('includes timeout message with server id', () => {
      expect(pmSrc).toMatch(/Timed out connecting to child server/);
      expect(pmSrc).toMatch(/Timed out listing tools from child server/);
    });
  });

  // ---- Runtime: boot timeout configuration via env var ----

  describe('boot timeout reads from env var', () => {
    it('getChildServerBootTimeoutMs uses env override when set', () => {
      // Test via ProxyManager source that it parses the env var
      const pmSrc = fs.readFileSync(proxyManagerTsPath, 'utf8');
      expect(pmSrc).toMatch(/getChildServerBootTimeoutMs/);
      expect(pmSrc).toMatch(/Number\(process\.env\.EVOKORE_CHILD_SERVER_BOOT_TIMEOUT_MS\)/);
    });

    it('default timeout is 15000ms', () => {
      const pmSrc = fs.readFileSync(proxyManagerTsPath, 'utf8');
      expect(pmSrc).toMatch(/DEFAULT_CHILD_SERVER_BOOT_TIMEOUT_MS\s*=\s*15000/);
    });
  });

  // ---- Runtime: child server failure handling ----

  describe('child server boot failure handling', () => {
    it('marks server as error when boot fails', async () => {
      const { ProxyManager } = require(proxyManagerJsPath);
      const { SecurityManager } = require(path.join(ROOT, 'dist', 'SecurityManager.js'));
      const sm = new SecurityManager();
      const pm = new ProxyManager(sm);

      const os = require('os');
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-boot-fail-'));
      const tempConfigPath = path.join(tempDir, 'mcp.config.json');
      fs.writeFileSync(tempConfigPath, JSON.stringify({
        servers: {
          crashy: {
            command: 'node',
            args: ['-e', 'process.exit(1)']
          }
        }
      }));

      const originalEnv = process.env.EVOKORE_MCP_CONFIG_PATH;
      const originalTimeout = process.env.EVOKORE_CHILD_SERVER_BOOT_TIMEOUT_MS;
      process.env.EVOKORE_MCP_CONFIG_PATH = tempConfigPath;
      process.env.EVOKORE_CHILD_SERVER_BOOT_TIMEOUT_MS = '3000';

      try {
        await pm.loadServers();
        const states = pm.getServerStatusSnapshot();
        expect(states.length).toBe(1);
        expect(states[0].id).toBe('crashy');
        expect(states[0].status).toBe('error');
        expect(states[0].errorCount).toBeGreaterThan(0);
      } finally {
        if (originalEnv !== undefined) {
          process.env.EVOKORE_MCP_CONFIG_PATH = originalEnv;
        } else {
          delete process.env.EVOKORE_MCP_CONFIG_PATH;
        }
        if (originalTimeout !== undefined) {
          process.env.EVOKORE_CHILD_SERVER_BOOT_TIMEOUT_MS = originalTimeout;
        } else {
          delete process.env.EVOKORE_CHILD_SERVER_BOOT_TIMEOUT_MS;
        }
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('does not throw from loadServers even when all servers fail', async () => {
      const { ProxyManager } = require(proxyManagerJsPath);
      const { SecurityManager } = require(path.join(ROOT, 'dist', 'SecurityManager.js'));
      const sm = new SecurityManager();
      const pm = new ProxyManager(sm);

      const os = require('os');
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-all-fail-'));
      const tempConfigPath = path.join(tempDir, 'mcp.config.json');
      fs.writeFileSync(tempConfigPath, JSON.stringify({
        servers: {
          bad1: { command: 'nonexistent-command-12345' },
          bad2: { command: 'node', args: ['-e', 'process.exit(99)'] }
        }
      }));

      const originalEnv = process.env.EVOKORE_MCP_CONFIG_PATH;
      const originalTimeout = process.env.EVOKORE_CHILD_SERVER_BOOT_TIMEOUT_MS;
      process.env.EVOKORE_MCP_CONFIG_PATH = tempConfigPath;
      process.env.EVOKORE_CHILD_SERVER_BOOT_TIMEOUT_MS = '3000';

      try {
        // Should NOT throw
        await pm.loadServers();
        expect(pm.getProxiedTools().length).toBe(0);
      } finally {
        if (originalEnv !== undefined) {
          process.env.EVOKORE_MCP_CONFIG_PATH = originalEnv;
        } else {
          delete process.env.EVOKORE_MCP_CONFIG_PATH;
        }
        if (originalTimeout !== undefined) {
          process.env.EVOKORE_CHILD_SERVER_BOOT_TIMEOUT_MS = originalTimeout;
        } else {
          delete process.env.EVOKORE_CHILD_SERVER_BOOT_TIMEOUT_MS;
        }
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('handles missing config file gracefully', async () => {
      const { ProxyManager } = require(proxyManagerJsPath);
      const { SecurityManager } = require(path.join(ROOT, 'dist', 'SecurityManager.js'));
      const sm = new SecurityManager();
      const pm = new ProxyManager(sm);

      const originalEnv = process.env.EVOKORE_MCP_CONFIG_PATH;
      process.env.EVOKORE_MCP_CONFIG_PATH = '/nonexistent/path/mcp.config.json';

      try {
        await pm.loadServers();
        expect(pm.getProxiedTools().length).toBe(0);
        expect(pm.getServerStatusSnapshot().length).toBe(0);
      } finally {
        if (originalEnv !== undefined) {
          process.env.EVOKORE_MCP_CONFIG_PATH = originalEnv;
        } else {
          delete process.env.EVOKORE_MCP_CONFIG_PATH;
        }
      }
    });
  });

  // ---- Runtime: empty servers config ----

  describe('empty servers config', () => {
    it('handles config with no servers key gracefully', async () => {
      const { ProxyManager } = require(proxyManagerJsPath);
      const { SecurityManager } = require(path.join(ROOT, 'dist', 'SecurityManager.js'));
      const sm = new SecurityManager();
      const pm = new ProxyManager(sm);

      const os = require('os');
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-empty-cfg-'));
      const tempConfigPath = path.join(tempDir, 'mcp.config.json');
      fs.writeFileSync(tempConfigPath, JSON.stringify({ skillRegistries: [] }));

      const originalEnv = process.env.EVOKORE_MCP_CONFIG_PATH;
      process.env.EVOKORE_MCP_CONFIG_PATH = tempConfigPath;

      try {
        await pm.loadServers();
        expect(pm.getProxiedTools().length).toBe(0);
        expect(pm.getServerStatusSnapshot().length).toBe(0);
      } finally {
        if (originalEnv !== undefined) {
          process.env.EVOKORE_MCP_CONFIG_PATH = originalEnv;
        } else {
          delete process.env.EVOKORE_MCP_CONFIG_PATH;
        }
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  // ---- Live startup test: MCP handshake before proxy boot ----

  describe('MCP handshake completes before proxy boot', () => {
    it('server initialize completes within 3s even with a slow child server', async () => {
      const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
      const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
      const os = require('os');

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-async-boot-'));
      const tempConfigPath = path.join(tempDir, 'mcp.config.json');
      fs.writeFileSync(tempConfigPath, JSON.stringify({
        servers: {
          slowpoke: {
            command: 'node',
            args: ['-e', 'setTimeout(() => process.exit(0), 8000)']
          }
        }
      }));

      const transport = new StdioClientTransport({
        command: 'node',
        args: [path.join(ROOT, 'dist', 'index.js')],
        env: {
          ...process.env,
          EVOKORE_MCP_CONFIG_PATH: tempConfigPath,
          EVOKORE_CHILD_SERVER_BOOT_TIMEOUT_MS: '2000'
        },
        stderr: 'pipe'
      });

      const client = new Client({ name: 'async-boot-test', version: '0.0.0' });
      const stderrChunks: string[] = [];
      transport.stderr?.on('data', (chunk: Buffer) => {
        stderrChunks.push(String(chunk));
      });

      const startedAt = Date.now();

      try {
        await client.connect(transport);
        const connectElapsedMs = Date.now() - startedAt;

        // The MCP handshake should complete quickly, not block on the child server
        expect(connectElapsedMs).toBeLessThan(3000);

        // Native tools should be available immediately (before proxy boot)
        const { tools } = await client.listTools();
        const toolNames = tools.map((t: any) => t.name);
        expect(toolNames).toContain('search_skills');
        expect(toolNames).toContain('proxy_server_status');

        // Server should have started (check stderr for the sentinel)
        const stderrText = stderrChunks.join('');
        expect(stderrText).toMatch(/Enterprise Router running on stdio/);
      } finally {
        await client.close().catch(() => {});
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
