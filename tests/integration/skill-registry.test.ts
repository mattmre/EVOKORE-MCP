import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const skillManagerTsPath = path.join(ROOT, 'src', 'SkillManager.ts');
const skillManagerJsPath = path.join(ROOT, 'dist', 'SkillManager.js');
const configPath = path.join(ROOT, 'mcp.config.json');

const mockProxyManager = {
  callProxiedTool: async () => ({ content: [{ type: 'text', text: '' }] })
};

describe('T21: Remote Skill Registry Validation', () => {
  // ---- Source structure: list_registry tool definition ----

  describe('source contains list_registry tool definition', () => {
    const src = fs.readFileSync(skillManagerTsPath, 'utf8');

    it('defines list_registry tool name', () => {
      expect(src).toMatch(/name:\s*["']list_registry["']/);
    });

    it('has listRegistrySkills method', () => {
      expect(src).toMatch(/listRegistrySkills/);
    });

    it('has loadRegistriesFromConfig private method', () => {
      expect(src).toMatch(/loadRegistriesFromConfig/);
    });

    it('uses EVOKORE_MCP_CONFIG_PATH override for config loading', () => {
      expect(src).toMatch(/EVOKORE_MCP_CONFIG_PATH/);
    });

    it('has SkillRegistry interface with name, baseUrl, and index', () => {
      expect(src).toMatch(/interface SkillRegistry/);
      expect(src).toMatch(/baseUrl:\s*string/);
      expect(src).toMatch(/index:\s*string/);
    });

    it('has RegistrySkillEntry interface', () => {
      expect(src).toMatch(/interface RegistrySkillEntry/);
    });
  });

  // ---- Tool schema validation ----

  describe('list_registry tool schema', () => {
    it('exists in getTools output', () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);
      const tools = sm.getTools();
      const listTool = tools.find((t: any) => t.name === 'list_registry');
      expect(listTool).toBeDefined();
    });

    it('has registry as an optional string property', () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);
      const tools = sm.getTools();
      const listTool = tools.find((t: any) => t.name === 'list_registry');

      expect(listTool.inputSchema.properties.registry).toBeDefined();
      expect(listTool.inputSchema.properties.registry.type).toBe('string');
      // registry is optional (no required array, or not in it)
      expect(listTool.inputSchema.required).toBeUndefined();
    });

    it('has readOnlyHint annotation set to true', () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);
      const tools = sm.getTools();
      const listTool = tools.find((t: any) => t.name === 'list_registry');

      expect(listTool.annotations).toBeDefined();
      expect(listTool.annotations.readOnlyHint).toBe(true);
    });

    it('has idempotentHint annotation set to true', () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);
      const tools = sm.getTools();
      const listTool = tools.find((t: any) => t.name === 'list_registry');

      expect(listTool.annotations.idempotentHint).toBe(true);
    });

    it('has openWorldHint annotation set to true (network access)', () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);
      const tools = sm.getTools();
      const listTool = tools.find((t: any) => t.name === 'list_registry');

      expect(listTool.annotations.openWorldHint).toBe(true);
    });

    it('has descriptive title', () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);
      const tools = sm.getTools();
      const listTool = tools.find((t: any) => t.name === 'list_registry');

      expect(listTool.title).toBe('List Registry Skills');
    });
  });

  // ---- mcp.config.json registry configuration ----

  describe('mcp.config.json registry configuration', () => {
    it('config file exists and is valid JSON', () => {
      const raw = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(raw);
      expect(config).toBeDefined();
    });

    it('has skillRegistries key', () => {
      const raw = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(raw);
      expect(config).toHaveProperty('skillRegistries');
    });

    it('skillRegistries is an array', () => {
      const raw = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(raw);
      expect(Array.isArray(config.skillRegistries)).toBe(true);
    });
  });

  // ---- Empty registry list handling ----

  describe('empty registry list handling', () => {
    it('returns empty array when no registries configured', () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);

      // The current config has skillRegistries: []
      // listRegistrySkills should return empty
      return sm.listRegistrySkills().then((entries: any[]) => {
        expect(entries).toEqual([]);
      });
    });

    it('handleToolCall returns informative message for empty registries', async () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);

      const result = await sm.handleToolCall('list_registry', {});
      expect(result.content[0].text).toMatch(/No skill registries are configured|No skills found/);
    });

    it('handleToolCall returns informative message for specific nonexistent registry', async () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);

      const result = await sm.handleToolCall('list_registry', { registry: 'nonexistent-registry' });
      expect(result.content[0].text).toMatch(/No skills found|not configured/);
    });
  });

  // ---- Registry entry format validation (source-level) ----

  describe('registry entry format validation', () => {
    const src = fs.readFileSync(skillManagerTsPath, 'utf8');

    it('validates registry entries require name field', () => {
      expect(src).toMatch(/typeof r\.name === ["']string["']/);
    });

    it('validates registry entries require baseUrl field', () => {
      expect(src).toMatch(/typeof r\.baseUrl === ["']string["']/);
    });

    it('validates registry entries require index field', () => {
      expect(src).toMatch(/typeof r\.index === ["']string["']/);
    });

    it('filters out invalid registry entries', () => {
      expect(src).toMatch(/\.filter\(\(r: any\)/);
    });

    it('constructs index URL from baseUrl and index path', () => {
      expect(src).toMatch(/registry\.baseUrl.*registry\.index/);
    });

    it('normalizes parsed registry entries through the shared mapper', () => {
      expect(src).toMatch(/toRegistrySkillEntry/);
      expect(src).toMatch(/resolveRegistryEntryUrl/);
    });

    it('delegates registry fetching through the shared RegistryManager path', () => {
      expect(src).toMatch(/fetchConfiguredRegistryEntries/);
      expect(src).toMatch(/registryManager\.fetchRegistry/);
    });
  });

  // ---- Error handling for unreachable registries ----

  describe('error handling for unreachable registries', () => {
    const src = fs.readFileSync(skillManagerTsPath, 'utf8');

    it('catches errors when fetching registry index', () => {
      expect(src).toMatch(/Failed to fetch registry/);
    });

    it('continues processing other registries after one fails', () => {
      // The for loop continues even after try/catch in listRegistrySkills
      expect(src).toMatch(/for \(const registry of targets\)/);
    });

    it('httpGet has a 30-second timeout', () => {
      // Timeout constant moved to shared src/httpUtils.ts (BUG-10)
      const httpUtilsSrc = fs.readFileSync(path.join(path.resolve(__dirname, '../..'), 'src', 'httpUtils.ts'), 'utf8');
      expect(httpUtilsSrc).toMatch(/FETCH_TIMEOUT_MS\s*=\s*30000/);
    });

    it('handleToolCall wraps errors in structured isError response', async () => {
      const src = fs.readFileSync(skillManagerTsPath, 'utf8');
      // The list_registry handler has a try/catch that returns isError: true
      expect(src).toMatch(/Failed to list registry skills/);
    });
  });

  // ---- Registry name filtering ----

  describe('registry name filtering', () => {
    const src = fs.readFileSync(skillManagerTsPath, 'utf8');

    it('filters by registry name case-insensitively', () => {
      expect(src).toMatch(/\.toLowerCase\(\) === registryName\.toLowerCase\(\)/);
    });

    it('queries all registries when no name specified', () => {
      // When registryName is undefined, targets = all registries
      expect(src).toMatch(/registryName\s*\?\s*registries\.filter/);
    });

    it('trims registry argument from args', () => {
      expect(src).toMatch(/args\.registry.*\.trim\(\)/);
    });
  });
});
