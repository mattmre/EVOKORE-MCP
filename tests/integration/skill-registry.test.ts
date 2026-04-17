import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const skillManagerJsPath = path.join(ROOT, 'dist', 'SkillManager.js');
const configPath = path.join(ROOT, 'mcp.config.json');

const mockProxyManager = {
  callProxiedTool: async () => ({ content: [{ type: 'text', text: '' }] })
};

function getSkillManager() {
  const { SkillManager } = require(skillManagerJsPath);
  return new SkillManager(mockProxyManager);
}

describe('T21: Remote Skill Registry (runtime smoke)', () => {
  const savedAllowPrivate = process.env.EVOKORE_HTTP_ALLOW_PRIVATE;
  let server: http.Server;
  let baseUrl: string;
  let tempDir: string | null = null;
  let tempConfigPath: string | null = null;
  let originalConfigPath: string | undefined;

  beforeAll(async () => {
    process.env.EVOKORE_HTTP_ALLOW_PRIVATE = 'true';
    server = http.createServer((req, res) => {
      if (req.url === '/registry.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          name: 'mixed-case-registry',
          version: '1.0.0',
          entries: [
            {
              name: 'registry-case-test-skill',
              description: 'Verifies trimmed and case-insensitive registry lookups',
              url: 'skills/case-test.md'
            }
          ]
        }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to start registry smoke server');
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(() => {
    if (originalConfigPath !== undefined) {
      process.env.EVOKORE_MCP_CONFIG_PATH = originalConfigPath;
    } else {
      delete process.env.EVOKORE_MCP_CONFIG_PATH;
    }

    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
      tempConfigPath = null;
    }
  });

  afterAll(async () => {
    if (savedAllowPrivate !== undefined) {
      process.env.EVOKORE_HTTP_ALLOW_PRIVATE = savedAllowPrivate;
    } else {
      delete process.env.EVOKORE_HTTP_ALLOW_PRIVATE;
    }

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });

  function writeRegistryConfig(registries: Array<{ name: string; baseUrl: string; index: string }>): void {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-registry-smoke-'));
    tempConfigPath = path.join(tempDir, 'mcp.config.json');
    originalConfigPath = process.env.EVOKORE_MCP_CONFIG_PATH;
    fs.writeFileSync(tempConfigPath, JSON.stringify({ skillRegistries: registries }, null, 2));
    process.env.EVOKORE_MCP_CONFIG_PATH = tempConfigPath;
  }

  describe('list_registry tool schema', () => {
    it('exposes list_registry with optional registry/query args and read-only annotations', () => {
      const sm = getSkillManager();
      const tools = sm.getTools();
      const listTool = tools.find((t: any) => t.name === 'list_registry');

      expect(listTool).toBeDefined();
      expect(listTool.title).toBe('List Registry Skills');
      expect(listTool.inputSchema.properties.registry.type).toBe('string');
      expect(listTool.inputSchema.properties.query.type).toBe('string');
      expect(listTool.inputSchema.required).toBeUndefined();
      expect(listTool.annotations.readOnlyHint).toBe(true);
      expect(listTool.annotations.idempotentHint).toBe(true);
      expect(listTool.annotations.openWorldHint).toBe(true);
    });
  });

  describe('default config empty-state behavior', () => {
    it('ships an mcp.config.json with skillRegistries as an array', () => {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      expect(config).toHaveProperty('skillRegistries');
      expect(Array.isArray(config.skillRegistries)).toBe(true);
    });

    it('returns an empty list when no registries are configured', async () => {
      const sm = getSkillManager();
      const entries = await sm.listRegistrySkills();
      expect(entries).toEqual([]);
    });

    it('returns an informative message when list_registry runs with no configured registries', async () => {
      const sm = getSkillManager();
      const result = await sm.handleToolCall('list_registry', {});

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toMatch(/No skill registries are configured|no skills were found/i);
    });

    it('returns an informative message for a specific nonexistent registry name', async () => {
      const sm = getSkillManager();
      const result = await sm.handleToolCall('list_registry', { registry: ' nonexistent-registry ' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toMatch(/No skills found|not configured/i);
    });

    it('trims and matches registry names case-insensitively when filtering a configured registry', async () => {
      writeRegistryConfig([{ name: 'MixedCase', baseUrl, index: 'registry.json' }]);

      const sm = getSkillManager();
      const result = await sm.handleToolCall('list_registry', { registry: '  mixedcase  ' });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toContain('registry-case-test-skill');
      expect(result.content[0].text).toContain(`${baseUrl}/skills/case-test.md`);
    });
  });
});
