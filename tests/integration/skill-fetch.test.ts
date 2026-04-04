// TODO(BUG-28): convert from source-scraping to behavioral test
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const skillManagerTsPath = path.join(ROOT, 'src', 'SkillManager.ts');
const skillManagerJsPath = path.join(ROOT, 'dist', 'SkillManager.js');

const mockProxyManager = {
  callProxiedTool: async () => ({ content: [{ type: 'text', text: '' }] })
};

describe('T10: Remote Skill Fetch', () => {
  // ---- Source structure validation ----

  describe('source contains fetch_skill tool definition', () => {
    const src = fs.readFileSync(skillManagerTsPath, 'utf8');
    const httpUtilsSrc = fs.readFileSync(path.join(ROOT, 'src', 'httpUtils.ts'), 'utf8');

    it('defines fetch_skill tool name', () => {
      expect(src).toMatch(/name:\s*["']fetch_skill["']/);
    });

    it('has fetchRemoteSkill method', () => {
      expect(src).toMatch(/fetchRemoteSkill/);
    });

    it('has httpGet method for downloading content', () => {
      expect(src).toMatch(/httpGet/);
    });

    it('enforces MAX_FETCH_SIZE limit', () => {
      expect(httpUtilsSrc).toMatch(/MAX_FETCH_SIZE/);
    });

    it('enforces MAX_REDIRECT_DEPTH', () => {
      expect(httpUtilsSrc).toMatch(/MAX_REDIRECT_DEPTH/);
    });

    it('validates URL protocol (HTTP/HTTPS only)', () => {
      expect(httpUtilsSrc).toMatch(/Only HTTP\/HTTPS/);
    });

    it('protects against path traversal', () => {
      expect(src).toMatch(/Path traversal/i);
    });
  });

  // ---- Tool schema validation ----

  describe('fetch_skill tool schema', () => {
    it('exists in getTools output', () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);
      const tools = sm.getTools();
      const fetchTool = tools.find((t: any) => t.name === 'fetch_skill');
      expect(fetchTool).toBeDefined();
    });

    it('has url as a required property', () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);
      const tools = sm.getTools();
      const fetchTool = tools.find((t: any) => t.name === 'fetch_skill');

      expect(fetchTool.inputSchema.properties.url).toBeDefined();
      expect(fetchTool.inputSchema.required).toContain('url');
    });

    it('has category as an optional property', () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);
      const tools = sm.getTools();
      const fetchTool = tools.find((t: any) => t.name === 'fetch_skill');

      expect(fetchTool.inputSchema.properties.category).toBeDefined();
      expect(fetchTool.inputSchema.properties.category.type).toBe('string');
      // category should NOT be in required
      expect(fetchTool.inputSchema.required).not.toContain('category');
    });

    it('has name as an optional property', () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);
      const tools = sm.getTools();
      const fetchTool = tools.find((t: any) => t.name === 'fetch_skill');

      expect(fetchTool.inputSchema.properties.name).toBeDefined();
      expect(fetchTool.inputSchema.required).not.toContain('name');
    });

    it('has overwrite as an optional boolean property', () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);
      const tools = sm.getTools();
      const fetchTool = tools.find((t: any) => t.name === 'fetch_skill');

      expect(fetchTool.inputSchema.properties.overwrite).toBeDefined();
      expect(fetchTool.inputSchema.properties.overwrite.type).toBe('boolean');
      expect(fetchTool.inputSchema.required).not.toContain('overwrite');
    });

    it('has openWorldHint annotation set to true (network access)', () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);
      const tools = sm.getTools();
      const fetchTool = tools.find((t: any) => t.name === 'fetch_skill');

      expect(fetchTool.annotations).toBeDefined();
      expect(fetchTool.annotations.openWorldHint).toBe(true);
    });
  });

  // ---- URL validation error paths ----

  describe('fetch_skill URL validation', () => {
    it('rejects missing url argument', async () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);
      const result = await sm.handleToolCall('fetch_skill', {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/url/i);
    });

    it('rejects empty url argument', async () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);
      const result = await sm.handleToolCall('fetch_skill', { url: '   ' });
      expect(result.isError).toBe(true);
    });

    it('rejects invalid URL string via fetchRemoteSkill', async () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);
      await expect(sm.fetchRemoteSkill('not-a-valid-url'))
        .rejects.toThrow(/Invalid URL/);
    });

    it('rejects ftp:// protocol via fetchRemoteSkill', async () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);
      await expect(sm.fetchRemoteSkill('ftp://example.com/skill.md'))
        .rejects.toThrow(/Only HTTP\/HTTPS/);
    });

    it('rejects file:// protocol via fetchRemoteSkill', async () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);
      await expect(sm.fetchRemoteSkill('file:///etc/passwd'))
        .rejects.toThrow(/Only HTTP\/HTTPS/);
    });
  });

  // ---- handleToolCall error returns (not throws) ----

  describe('handleToolCall fetch_skill returns structured errors', () => {
    it('returns isError true for unreachable URL', async () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);
      const result = await sm.handleToolCall('fetch_skill', {
        url: 'https://127.0.0.1:39999/nonexistent-skill.md'
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/Failed to fetch skill/);
    });

    it('passes category argument through to fetchRemoteSkill', () => {
      // Validate that the source code extracts category from args
      const src = fs.readFileSync(skillManagerTsPath, 'utf8');
      expect(src).toMatch(/args\.category/);
      expect(src).toMatch(/targetCategory/);
    });

    it('passes overwrite argument through to fetchRemoteSkill', () => {
      // Validate that the source code extracts overwrite from args
      const src = fs.readFileSync(skillManagerTsPath, 'utf8');
      expect(src).toMatch(/args\.overwrite/);
      expect(src).toMatch(/overwrite\s*===\s*true/);
    });
  });

  // ---- index.ts auto-refresh wiring ----

  describe('index.ts wires fetch_skill with auto-refresh', () => {
    const indexSrc = fs.readFileSync(path.join(ROOT, 'src', 'index.ts'), 'utf8');

    it('handleFetchSkill exists in index.ts', () => {
      expect(indexSrc).toMatch(/handleFetchSkill/);
    });

    it('auto-refreshes skill index after successful fetch', () => {
      expect(indexSrc).toMatch(/Index auto-refreshed/);
    });
  });
});
