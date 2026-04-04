import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ROOT = path.resolve(__dirname, '../..');
const registryManagerTsPath = path.join(ROOT, 'src', 'RegistryManager.ts');
const registryManagerJsPath = path.join(ROOT, 'dist', 'RegistryManager.js');
const skillManagerTsPath = path.join(ROOT, 'src', 'SkillManager.ts');
const httpUtilsTsPath = path.join(ROOT, 'src', 'httpUtils.ts');
const indexTsPath = path.join(ROOT, 'src', 'index.ts');

describe('RegistryManager', () => {

  // ---- Module existence ----

  describe('module exists and exports', () => {
    it('has TypeScript source file', () => {
      expect(fs.existsSync(registryManagerTsPath)).toBe(true);
    });

    it('has compiled JavaScript file', () => {
      expect(fs.existsSync(registryManagerJsPath)).toBe(true);
    });

    it('exports RegistryManager class', () => {
      const mod = require(registryManagerJsPath);
      expect(mod.RegistryManager).toBeDefined();
      expect(typeof mod.RegistryManager).toBe('function');
    });
  });

  // ---- Source structure ----

  describe('source structure', () => {
    const src = fs.readFileSync(registryManagerTsPath, 'utf8');

    it('defines RegistryEntry interface', () => {
      expect(src).toMatch(/export interface RegistryEntry/);
    });

    it('defines RegistryIndex interface', () => {
      expect(src).toMatch(/export interface RegistryIndex/);
    });

    it('RegistryEntry has required fields', () => {
      expect(src).toMatch(/name:\s*string/);
      expect(src).toMatch(/version:\s*string/);
      expect(src).toMatch(/description:\s*string/);
      expect(src).toMatch(/url:\s*string/);
    });

    it('RegistryEntry has optional fields', () => {
      expect(src).toMatch(/category\?:\s*string/);
      expect(src).toMatch(/author\?:\s*string/);
      expect(src).toMatch(/tags\?:\s*string\[\]/);
      expect(src).toMatch(/checksum\?:\s*string/);
      expect(src).toMatch(/updatedAt\?:\s*string/);
    });

    it('has fetchRegistry method', () => {
      expect(src).toMatch(/async fetchRegistry/);
    });

    it('has searchRegistry method', () => {
      expect(src).toMatch(/searchRegistry/);
    });

    it('has verifyChecksum method', () => {
      expect(src).toMatch(/verifyChecksum/);
    });

    it('has clearCache method', () => {
      expect(src).toMatch(/clearCache/);
    });

    it('has getCacheStats method', () => {
      expect(src).toMatch(/getCacheStats/);
    });
  });

  // ---- Registry schema parsing ----

  describe('registry schema parsing', () => {
    it('parses full registry index format', () => {
      const { RegistryManager } = require(registryManagerJsPath);
      const rm = new RegistryManager();

      // Access the private parseRegistryIndex method via prototype
      const parsed = (rm as any).parseRegistryIndex({
        name: 'test-registry',
        version: '1.0.0',
        entries: [
          {
            name: 'skill-a',
            version: '1.0.0',
            description: 'A test skill',
            url: 'https://example.com/skill-a.md',
            category: 'Testing',
            author: 'test-author',
            tags: ['testing', 'example'],
            checksum: 'abc123',
            updatedAt: '2025-01-01'
          }
        ]
      });

      expect(parsed.name).toBe('test-registry');
      expect(parsed.version).toBe('1.0.0');
      expect(parsed.entries.length).toBe(1);
      expect(parsed.entries[0].name).toBe('skill-a');
      expect(parsed.entries[0].category).toBe('Testing');
      expect(parsed.entries[0].author).toBe('test-author');
      expect(parsed.entries[0].tags).toEqual(['testing', 'example']);
      expect(parsed.entries[0].checksum).toBe('abc123');
    });

    it('parses flat array format', () => {
      const { RegistryManager } = require(registryManagerJsPath);
      const rm = new RegistryManager();

      const parsed = (rm as any).parseRegistryIndex([
        { name: 'skill-1', url: 'https://example.com/1.md', version: '1.0.0', description: 'First' },
        { name: 'skill-2', url: 'https://example.com/2.md', version: '2.0.0', description: 'Second' }
      ]);

      expect(parsed.name).toBe('unknown');
      expect(parsed.entries.length).toBe(2);
    });

    it('parses skills sub-key format', () => {
      const { RegistryManager } = require(registryManagerJsPath);
      const rm = new RegistryManager();

      const parsed = (rm as any).parseRegistryIndex({
        name: 'alt-registry',
        version: '0.1.0',
        skills: [
          { name: 'alt-skill', url: 'https://example.com/alt.md', description: 'Alt' }
        ]
      });

      expect(parsed.entries.length).toBe(1);
      expect(parsed.entries[0].name).toBe('alt-skill');
    });

    it('filters out entries missing name', () => {
      const { RegistryManager } = require(registryManagerJsPath);
      const rm = new RegistryManager();

      const parsed = (rm as any).parseRegistryIndex({
        name: 'test',
        version: '1.0.0',
        entries: [
          { url: 'https://example.com/no-name.md', description: 'Missing name' },
          { name: 'valid', url: 'https://example.com/valid.md', description: 'Valid' }
        ]
      });

      expect(parsed.entries.length).toBe(1);
      expect(parsed.entries[0].name).toBe('valid');
    });

    it('filters out entries missing url', () => {
      const { RegistryManager } = require(registryManagerJsPath);
      const rm = new RegistryManager();

      const parsed = (rm as any).parseRegistryIndex({
        name: 'test',
        version: '1.0.0',
        entries: [
          { name: 'no-url', description: 'Missing URL' },
          { name: 'valid', url: 'https://example.com/valid.md', description: 'Valid' }
        ]
      });

      expect(parsed.entries.length).toBe(1);
    });

    it('provides defaults for missing optional fields', () => {
      const { RegistryManager } = require(registryManagerJsPath);
      const rm = new RegistryManager();

      const parsed = (rm as any).parseRegistryIndex({
        name: 'test',
        version: '1.0.0',
        entries: [
          { name: 'minimal', url: 'https://example.com/min.md' }
        ]
      });

      const entry = parsed.entries[0];
      expect(entry.version).toBe('0.0.0');
      expect(entry.description).toBe('No description');
      expect(entry.author).toBeUndefined();
      expect(entry.tags).toBeUndefined();
      expect(entry.checksum).toBeUndefined();
    });
  });

  // ---- Search functionality ----

  describe('search functionality', () => {
    let rm: any;
    let registries: any[];

    beforeEach(() => {
      const { RegistryManager } = require(registryManagerJsPath);
      rm = new RegistryManager();
      registries = [
        {
          name: 'test-registry',
          version: '1.0.0',
          entries: [
            {
              name: 'git-workflow',
              version: '1.0.0',
              description: 'Git branching and merge workflow skill',
              url: 'https://example.com/git.md',
              author: 'alice',
              tags: ['git', 'workflow', 'branching']
            },
            {
              name: 'docker-deploy',
              version: '2.0.0',
              description: 'Docker container deployment guide',
              url: 'https://example.com/docker.md',
              author: 'bob',
              tags: ['docker', 'deployment', 'containers']
            },
            {
              name: 'testing-framework',
              version: '1.5.0',
              description: 'Unit and integration testing best practices',
              url: 'https://example.com/testing.md',
              tags: ['testing', 'best-practices']
            }
          ]
        }
      ];
    });

    it('returns all entries with empty query', () => {
      const results = rm.searchRegistry('', registries);
      expect(results.length).toBe(3);
    });

    it('matches by name', () => {
      const results = rm.searchRegistry('docker', registries);
      expect(results[0].name).toBe('docker-deploy');
    });

    it('matches by description', () => {
      const results = rm.searchRegistry('branching', registries);
      expect(results[0].name).toBe('git-workflow');
    });

    it('matches by tag', () => {
      const results = rm.searchRegistry('deployment', registries);
      expect(results[0].name).toBe('docker-deploy');
    });

    it('matches by author', () => {
      const results = rm.searchRegistry('alice', registries);
      expect(results[0].name).toBe('git-workflow');
    });

    it('is case-insensitive', () => {
      const results = rm.searchRegistry('DOCKER', registries);
      expect(results[0].name).toBe('docker-deploy');
    });

    it('returns empty for no match', () => {
      const results = rm.searchRegistry('nonexistent-skill-xyz', registries);
      expect(results.length).toBe(0);
    });

    it('ranks exact name match higher than partial match', () => {
      const results = rm.searchRegistry('testing', registries);
      // 'testing-framework' should rank higher because 'testing' is in its name
      const names = results.map((r: any) => r.name);
      expect(names[0]).toBe('testing-framework');
    });

    it('searches across multiple registries', () => {
      const secondRegistry = {
        name: 'second',
        version: '1.0.0',
        entries: [
          {
            name: 'git-hooks',
            version: '1.0.0',
            description: 'Pre-commit and post-commit git hooks',
            url: 'https://example.com/hooks.md',
            tags: ['git', 'hooks']
          }
        ]
      };
      const results = rm.searchRegistry('git', [...registries, secondRegistry]);
      expect(results.length).toBe(2);
      const names = results.map((r: any) => r.name);
      expect(names).toContain('git-workflow');
      expect(names).toContain('git-hooks');
    });
  });

  // ---- Checksum verification ----

  describe('checksum verification', () => {
    it('verifies correct SHA-256 checksum', () => {
      const { RegistryManager } = require(registryManagerJsPath);
      const rm = new RegistryManager();

      const content = 'Hello, world!';
      const expected = crypto.createHash('sha256').update(content, 'utf8').digest('hex');

      expect(rm.verifyChecksum(content, expected)).toBe(true);
    });

    it('rejects incorrect checksum', () => {
      const { RegistryManager } = require(registryManagerJsPath);
      const rm = new RegistryManager();

      expect(rm.verifyChecksum('Hello, world!', 'deadbeef0000')).toBe(false);
    });

    it('is case-insensitive for hex comparison', () => {
      const { RegistryManager } = require(registryManagerJsPath);
      const rm = new RegistryManager();

      const content = 'test content';
      const expected = crypto.createHash('sha256').update(content, 'utf8').digest('hex');

      expect(rm.verifyChecksum(content, expected.toUpperCase())).toBe(true);
    });

    it('handles empty content', () => {
      const { RegistryManager } = require(registryManagerJsPath);
      const rm = new RegistryManager();

      const emptyHash = crypto.createHash('sha256').update('', 'utf8').digest('hex');
      expect(rm.verifyChecksum('', emptyHash)).toBe(true);
    });
  });

  // ---- Cache TTL behavior ----

  describe('cache TTL behavior', () => {
    it('starts with empty cache', () => {
      const { RegistryManager } = require(registryManagerJsPath);
      const rm = new RegistryManager();

      const stats = rm.getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.urls).toEqual([]);
    });

    it('isCached returns false for unfetched URL', () => {
      const { RegistryManager } = require(registryManagerJsPath);
      const rm = new RegistryManager();

      expect(rm.isCached('https://example.com/index.json')).toBe(false);
    });

    it('clearCache removes all entries', () => {
      const { RegistryManager } = require(registryManagerJsPath);
      const rm = new RegistryManager();

      // Manually insert into cache via private field
      (rm as any).cache.set('url1', { index: { name: 'a', version: '1', entries: [] }, fetchedAt: Date.now() });
      (rm as any).cache.set('url2', { index: { name: 'b', version: '1', entries: [] }, fetchedAt: Date.now() });

      expect(rm.getCacheStats().size).toBe(2);

      rm.clearCache();
      expect(rm.getCacheStats().size).toBe(0);
    });

    it('clearCache with specific URL removes only that entry', () => {
      const { RegistryManager } = require(registryManagerJsPath);
      const rm = new RegistryManager();

      (rm as any).cache.set('url1', { index: { name: 'a', version: '1', entries: [] }, fetchedAt: Date.now() });
      (rm as any).cache.set('url2', { index: { name: 'b', version: '1', entries: [] }, fetchedAt: Date.now() });

      rm.clearCache('url1');
      expect(rm.getCacheStats().size).toBe(1);
      expect(rm.getCacheStats().urls).toEqual(['url2']);
    });

    it('isCached returns true for fresh entry', () => {
      const { RegistryManager } = require(registryManagerJsPath);
      const rm = new RegistryManager(60000); // 60s TTL

      (rm as any).cache.set('url1', { index: { name: 'a', version: '1', entries: [] }, fetchedAt: Date.now() });
      expect(rm.isCached('url1')).toBe(true);
    });

    it('isCached returns false for expired entry', () => {
      const { RegistryManager } = require(registryManagerJsPath);
      const rm = new RegistryManager(1000); // 1s TTL

      (rm as any).cache.set('url1', {
        index: { name: 'a', version: '1', entries: [] },
        fetchedAt: Date.now() - 2000 // 2s ago, beyond 1s TTL
      });
      expect(rm.isCached('url1')).toBe(false);
    });

    it('constructor accepts custom TTL', () => {
      const { RegistryManager } = require(registryManagerJsPath);
      const rm = new RegistryManager(5000);
      expect((rm as any).cacheTtlMs).toBe(5000);
    });

    it('default TTL is 1 hour', () => {
      const { RegistryManager } = require(registryManagerJsPath);
      const rm = new RegistryManager();
      expect((rm as any).cacheTtlMs).toBe(3600000);
    });
  });

  // ---- Graceful handling of unreachable registries ----

  describe('graceful handling of unreachable registries', () => {
    it('fetchRegistry rejects on invalid URL', async () => {
      const { RegistryManager } = require(registryManagerJsPath);
      const rm = new RegistryManager();

      await expect(rm.fetchRegistry('not-a-url')).rejects.toThrow(/Invalid URL/);
    });

    it('fetchRegistry rejects on non-HTTP protocol', async () => {
      const { RegistryManager } = require(registryManagerJsPath);
      const rm = new RegistryManager();

      await expect(rm.fetchRegistry('ftp://example.com/index.json')).rejects.toThrow(/Only HTTP\/HTTPS/);
    });

    it('httpGet has URL validation', () => {
      const src = fs.readFileSync(httpUtilsTsPath, 'utf8');
      expect(src).toMatch(/Invalid URL/);
    });

    it('has redirect depth limit', () => {
      const src = fs.readFileSync(httpUtilsTsPath, 'utf8');
      expect(src).toMatch(/MAX_REDIRECT_DEPTH/);
      expect(src).toMatch(/Too many redirects/);
    });

    it('has response size limit', () => {
      const src = fs.readFileSync(httpUtilsTsPath, 'utf8');
      expect(src).toMatch(/MAX_FETCH_SIZE/);
      expect(src).toMatch(/Response too large/);
    });

    it('has request timeout', () => {
      const src = fs.readFileSync(httpUtilsTsPath, 'utf8');
      expect(src).toMatch(/FETCH_TIMEOUT_MS/);
      expect(src).toMatch(/timed out/);
    });
  });

  // ---- SkillManager integration ----

  describe('SkillManager integration', () => {
    const skillSrc = fs.readFileSync(skillManagerTsPath, 'utf8');

    it('SkillManager imports RegistryManager', () => {
      expect(skillSrc).toMatch(/import.*RegistryManager.*from.*\.\/RegistryManager/);
    });

    it('SkillManager constructor accepts optional RegistryManager', () => {
      expect(skillSrc).toMatch(/registryManager\?:\s*RegistryManager/);
    });

    it('list_registry tool has query parameter', () => {
      expect(skillSrc).toMatch(/query.*search query to filter registry entries/);
    });

    it('fetch_skill tool has checksum parameter', () => {
      expect(skillSrc).toMatch(/checksum.*SHA-256 checksum to verify/);
    });

    it('fetchRemoteSkill verifies checksum when provided', () => {
      expect(skillSrc).toMatch(/verifyChecksum/);
      expect(skillSrc).toMatch(/Checksum verification failed/);
    });

    it('FetchSkillResult includes checksumVerified field', () => {
      expect(skillSrc).toMatch(/checksumVerified\?:\s*boolean/);
    });
  });

  // ---- index.ts integration ----

  describe('index.ts integration', () => {
    const indexSrc = fs.readFileSync(indexTsPath, 'utf8');

    it('imports RegistryManager', () => {
      expect(indexSrc).toMatch(/import.*RegistryManager.*from.*\.\/RegistryManager/);
    });

    it('creates RegistryManager instance', () => {
      expect(indexSrc).toMatch(/new RegistryManager\(\)/);
    });

    it('passes RegistryManager to SkillManager constructor', () => {
      expect(indexSrc).toMatch(/new SkillManager\(this\.proxyManager,\s*this\.registryManager\)/);
    });
  });
});
