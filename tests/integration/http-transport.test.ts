import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const proxyManagerTsPath = path.join(ROOT, 'src', 'ProxyManager.ts');
const proxyManagerJsPath = path.join(ROOT, 'dist', 'ProxyManager.js');

describe('T08: HTTP Transport Integration', () => {
  // ---- Source-level structural validation ----

  describe('source structure', () => {
    const src = fs.readFileSync(proxyManagerTsPath, 'utf8');

    it('imports StreamableHTTPClientTransport from the MCP SDK', () => {
      expect(src).toMatch(/StreamableHTTPClientTransport/);
      expect(src).toMatch(/import.*StreamableHTTPClientTransport.*from/);
    });

    it('defines ServerConfig interface with transport and url fields', () => {
      expect(src).toMatch(/transport\??\s*:\s*["']?stdio["']?\s*\|\s*["']?http["']?/);
      expect(src).toMatch(/url\??\s*:\s*string/);
    });

    it('checks for HTTP transport via transport === "http"', () => {
      expect(src).toMatch(/transport\s*===\s*["']http["']/);
    });

    it('creates StreamableHTTPClientTransport with a URL for http servers', () => {
      expect(src).toMatch(/new\s+StreamableHTTPClientTransport\s*\(\s*new\s+URL/);
    });

    it('tracks connection type as "http" in server state', () => {
      expect(src).toMatch(/connectionType.*http/);
    });
  });

  // ---- Config shape validation ----

  describe('config parsing for HTTP transport', () => {
    it('accepts a config with transport: "http" and url field', () => {
      const config = {
        servers: {
          'test-http': {
            transport: 'http' as const,
            url: 'http://localhost:9999/mcp'
          }
        }
      };
      expect(config.servers['test-http'].transport).toBe('http');
      expect(config.servers['test-http'].url).toBeDefined();
    });

    it('distinguishes HTTP from stdio configs', () => {
      const config = {
        servers: {
          stdio_server: { command: 'node', args: ['server.js'] },
          http_server: { transport: 'http' as const, url: 'http://localhost:8080' }
        }
      };

      const isHttp = (cfg: any) => cfg.transport === 'http' && !!cfg.url;
      expect(isHttp(config.servers.stdio_server)).toBe(false);
      expect(isHttp(config.servers.http_server)).toBe(true);
    });
  });

  // ---- Compiled module behavioral tests ----

  describe('ProxyManager HTTP transport behavior', () => {
    it('ProxyManager constructor accepts a SecurityManager', () => {
      const { ProxyManager } = require(proxyManagerJsPath);
      const { SecurityManager } = require(path.join(ROOT, 'dist', 'SecurityManager.js'));
      const sm = new SecurityManager();
      const pm = new ProxyManager(sm);
      expect(pm).toBeDefined();
    });

    it('getProxiedTools returns empty array before loadServers', () => {
      const { ProxyManager } = require(proxyManagerJsPath);
      const { SecurityManager } = require(path.join(ROOT, 'dist', 'SecurityManager.js'));
      const sm = new SecurityManager();
      const pm = new ProxyManager(sm);
      expect(pm.getProxiedTools()).toEqual([]);
    });

    it('getServerStatusSnapshot returns empty array before loadServers', () => {
      const { ProxyManager } = require(proxyManagerJsPath);
      const { SecurityManager } = require(path.join(ROOT, 'dist', 'SecurityManager.js'));
      const sm = new SecurityManager();
      const pm = new ProxyManager(sm);
      expect(pm.getServerStatusSnapshot()).toEqual([]);
    });

    it('loadServers handles unreachable HTTP endpoint gracefully', async () => {
      const { ProxyManager } = require(proxyManagerJsPath);
      const { SecurityManager } = require(path.join(ROOT, 'dist', 'SecurityManager.js'));
      const sm = new SecurityManager();
      const pm = new ProxyManager(sm);

      // Create a temp config pointing to an HTTP server that does not exist
      const os = require('os');
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-http-test-'));
      const tempConfigPath = path.join(tempDir, 'mcp.config.json');
      fs.writeFileSync(tempConfigPath, JSON.stringify({
        servers: {
          unreachable_http: {
            transport: 'http',
            url: 'http://127.0.0.1:39999/nonexistent-mcp-endpoint'
          }
        }
      }));

      const originalEnv = process.env.EVOKORE_MCP_CONFIG_PATH;
      const originalTimeout = process.env.EVOKORE_CHILD_SERVER_BOOT_TIMEOUT_MS;
      process.env.EVOKORE_MCP_CONFIG_PATH = tempConfigPath;
      process.env.EVOKORE_CHILD_SERVER_BOOT_TIMEOUT_MS = '2000';

      try {
        // loadServers should not throw -- it catches per-server errors
        await pm.loadServers();

        // The unreachable server should be marked as error
        const states = pm.getServerStatusSnapshot();
        expect(states.length).toBe(1);
        expect(states[0].id).toBe('unreachable_http');
        expect(states[0].status).toBe('error');
        expect(states[0].connectionType).toBe('http');
        expect(states[0].errorCount).toBeGreaterThan(0);

        // No tools should be proxied
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
  });

  // ---- Error path validation ----

  describe('error handling for missing stdio command', () => {
    it('loadServers reports error for stdio server without command', async () => {
      const { ProxyManager } = require(proxyManagerJsPath);
      const { SecurityManager } = require(path.join(ROOT, 'dist', 'SecurityManager.js'));
      const sm = new SecurityManager();
      const pm = new ProxyManager(sm);

      const os = require('os');
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-stdio-err-'));
      const tempConfigPath = path.join(tempDir, 'mcp.config.json');
      fs.writeFileSync(tempConfigPath, JSON.stringify({
        servers: {
          no_command: {
            args: ['--some-arg']
            // Missing command field for stdio
          }
        }
      }));

      const originalEnv = process.env.EVOKORE_MCP_CONFIG_PATH;
      const originalTimeout = process.env.EVOKORE_CHILD_SERVER_BOOT_TIMEOUT_MS;
      process.env.EVOKORE_MCP_CONFIG_PATH = tempConfigPath;
      process.env.EVOKORE_CHILD_SERVER_BOOT_TIMEOUT_MS = '2000';

      try {
        await pm.loadServers();
        const states = pm.getServerStatusSnapshot();
        expect(states.length).toBe(1);
        expect(states[0].status).toBe('error');
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
  });
});
