import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const skillManagerTsPath = path.join(ROOT, 'src', 'SkillManager.ts');
const skillManagerJsPath = path.join(ROOT, 'dist', 'SkillManager.js');

const mockProxyManager = {
  callProxiedTool: async () => ({ content: [{ type: 'text', text: '' }] })
};

describe('T20: Skill Versioning Validation', () => {
  // ---- Source structure: version/requires/conflicts frontmatter parsing ----

  describe('source parses version, requires, and conflicts from frontmatter', () => {
    const src = fs.readFileSync(skillManagerTsPath, 'utf8');

    it('SkillMetadata interface includes version field', () => {
      expect(src).toMatch(/version\?:\s*string/);
    });

    it('SkillMetadata interface includes requires field', () => {
      expect(src).toMatch(/requires\?:\s*SkillDependency\[\]/);
    });

    it('SkillMetadata interface includes conflicts field', () => {
      expect(src).toMatch(/conflicts\?:\s*string\[\]/);
    });

    it('SkillDependency interface has name and optional minVersion', () => {
      expect(src).toMatch(/interface SkillDependency/);
      expect(src).toMatch(/name:\s*string/);
      expect(src).toMatch(/minVersion\?:\s*string/);
    });

    it('parses version from frontmatter or metadata', () => {
      expect(src).toMatch(/frontmatter\?\.version/);
    });

    it('parses requires as array from frontmatter', () => {
      expect(src).toMatch(/Array\.isArray\(frontmatter\?\.requires\)/);
    });

    it('parses conflicts as array from frontmatter', () => {
      expect(src).toMatch(/Array\.isArray\(frontmatter\?\.conflicts\)/);
    });
  });

  // ---- Source structure: validateDependencies ----

  describe('source contains validateDependencies method', () => {
    const src = fs.readFileSync(skillManagerTsPath, 'utf8');

    it('defines validateDependencies method', () => {
      expect(src).toMatch(/validateDependencies\(skillName:\s*string\)/);
    });

    it('returns valid boolean and errors array', () => {
      expect(src).toMatch(/valid:\s*boolean/);
      expect(src).toMatch(/errors:\s*string\[\]/);
    });

    it('checks required skills exist', () => {
      expect(src).toMatch(/Missing required skill/);
    });

    it('checks conflicting skills are detected', () => {
      expect(src).toMatch(/Conflicts with installed skill/);
    });

    it('has semverSatisfies helper method', () => {
      expect(src).toMatch(/semverSatisfies\(/);
    });
  });

  // ---- Runtime: validateDependencies with loaded skills ----

  describe('validateDependencies runtime behavior', () => {
    function createSkillManager() {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);
      return sm;
    }

    it('returns invalid for nonexistent skill', () => {
      const sm = createSkillManager();
      const result = sm.validateDependencies('nonexistent-skill-xyz');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Skill not found: nonexistent-skill-xyz');
    });

    it('returns valid for a skill with no requires or conflicts', () => {
      const sm = createSkillManager();
      // Directly inject a skill into the cache
      const cacheKey = 'test/simple-skill';
      sm['skillsCache'] = new Map([[cacheKey, {
        name: 'simple-skill',
        description: 'A simple skill',
        category: 'test',
        subcategory: '',
        declaredCategory: 'test',
        tags: [],
        aliases: [],
        resolutionHints: [],
        metadata: {},
        metadataText: '',
        searchableText: '',
        pathDepth: 0,
        filePath: '/fake/path',
        content: '# Simple skill',
      }]]);

      const result = sm.validateDependencies('simple-skill');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('detects missing required skills', () => {
      const sm = createSkillManager();
      sm['skillsCache'] = new Map([['test/needs-deps', {
        name: 'needs-deps',
        description: 'A skill with dependencies',
        category: 'test',
        subcategory: '',
        declaredCategory: 'test',
        tags: [],
        aliases: [],
        resolutionHints: [],
        metadata: {},
        metadataText: '',
        searchableText: '',
        pathDepth: 0,
        filePath: '/fake/path',
        content: '# Needs deps',
        requires: [{ name: 'missing-dep-abc' }]
      }]]);

      const result = sm.validateDependencies('needs-deps');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required skill: missing-dep-abc');
    });

    it('detects conflicting installed skills', () => {
      const sm = createSkillManager();
      sm['skillsCache'] = new Map([
        ['test/skill-a', {
          name: 'skill-a',
          description: 'Skill A',
          category: 'test',
          subcategory: '',
          declaredCategory: 'test',
          tags: [],
          aliases: [],
          resolutionHints: [],
          metadata: {},
          metadataText: '',
          searchableText: '',
          pathDepth: 0,
          filePath: '/fake/a',
          content: '# A',
          conflicts: ['skill-b']
        }],
        ['test/skill-b', {
          name: 'skill-b',
          description: 'Skill B',
          category: 'test',
          subcategory: '',
          declaredCategory: 'test',
          tags: [],
          aliases: [],
          resolutionHints: [],
          metadata: {},
          metadataText: '',
          searchableText: '',
          pathDepth: 0,
          filePath: '/fake/b',
          content: '# B',
        }]
      ]);

      const result = sm.validateDependencies('skill-a');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Conflicts with installed skill: skill-b');
    });

    it('validates when all required skills are present', () => {
      const sm = createSkillManager();
      sm['skillsCache'] = new Map([
        ['test/parent', {
          name: 'parent',
          description: 'Parent skill',
          category: 'test',
          subcategory: '',
          declaredCategory: 'test',
          tags: [],
          aliases: [],
          resolutionHints: [],
          metadata: {},
          metadataText: '',
          searchableText: '',
          pathDepth: 0,
          filePath: '/fake/parent',
          content: '# Parent',
          requires: [{ name: 'child' }]
        }],
        ['test/child', {
          name: 'child',
          description: 'Child skill',
          category: 'test',
          subcategory: '',
          declaredCategory: 'test',
          tags: [],
          aliases: [],
          resolutionHints: [],
          metadata: {},
          metadataText: '',
          searchableText: '',
          pathDepth: 0,
          filePath: '/fake/child',
          content: '# Child',
          version: '2.0.0'
        }]
      ]);

      const result = sm.validateDependencies('parent');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('validates when no conflicts are installed', () => {
      const sm = createSkillManager();
      sm['skillsCache'] = new Map([
        ['test/no-conflict', {
          name: 'no-conflict',
          description: 'No conflict',
          category: 'test',
          subcategory: '',
          declaredCategory: 'test',
          tags: [],
          aliases: [],
          resolutionHints: [],
          metadata: {},
          metadataText: '',
          searchableText: '',
          pathDepth: 0,
          filePath: '/fake/path',
          content: '# No conflict',
          conflicts: ['nonexistent-package']
        }]
      ]);

      const result = sm.validateDependencies('no-conflict');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  // ---- Runtime: semver comparison ----

  describe('semver version comparison logic', () => {
    function createSkillManager() {
      const { SkillManager } = require(skillManagerJsPath);
      return new SkillManager(mockProxyManager);
    }

    it('accepts when installed version equals minimum', () => {
      const sm = createSkillManager();
      sm['skillsCache'] = new Map([
        ['test/dep-checker', {
          name: 'dep-checker',
          description: 'Checks deps',
          category: 'test', subcategory: '', declaredCategory: 'test',
          tags: [], aliases: [], resolutionHints: [],
          metadata: {}, metadataText: '', searchableText: '',
          pathDepth: 0, filePath: '/fake', content: '# dep-checker',
          requires: [{ name: 'versioned-dep', minVersion: '1.2.0' }]
        }],
        ['test/versioned-dep', {
          name: 'versioned-dep',
          description: 'Versioned dep',
          category: 'test', subcategory: '', declaredCategory: 'test',
          tags: [], aliases: [], resolutionHints: [],
          metadata: {}, metadataText: '', searchableText: '',
          pathDepth: 0, filePath: '/fake', content: '# versioned-dep',
          version: '1.2.0'
        }]
      ]);

      const result = sm.validateDependencies('dep-checker');
      expect(result.valid).toBe(true);
    });

    it('accepts when installed version exceeds minimum', () => {
      const sm = createSkillManager();
      sm['skillsCache'] = new Map([
        ['test/dep-checker', {
          name: 'dep-checker',
          description: 'Checks deps',
          category: 'test', subcategory: '', declaredCategory: 'test',
          tags: [], aliases: [], resolutionHints: [],
          metadata: {}, metadataText: '', searchableText: '',
          pathDepth: 0, filePath: '/fake', content: '# dep-checker',
          requires: [{ name: 'versioned-dep', minVersion: '1.2.0' }]
        }],
        ['test/versioned-dep', {
          name: 'versioned-dep',
          description: 'Versioned dep',
          category: 'test', subcategory: '', declaredCategory: 'test',
          tags: [], aliases: [], resolutionHints: [],
          metadata: {}, metadataText: '', searchableText: '',
          pathDepth: 0, filePath: '/fake', content: '# versioned-dep',
          version: '2.0.0'
        }]
      ]);

      const result = sm.validateDependencies('dep-checker');
      expect(result.valid).toBe(true);
    });

    it('rejects when installed version is below minimum', () => {
      const sm = createSkillManager();
      sm['skillsCache'] = new Map([
        ['test/dep-checker', {
          name: 'dep-checker',
          description: 'Checks deps',
          category: 'test', subcategory: '', declaredCategory: 'test',
          tags: [], aliases: [], resolutionHints: [],
          metadata: {}, metadataText: '', searchableText: '',
          pathDepth: 0, filePath: '/fake', content: '# dep-checker',
          requires: [{ name: 'versioned-dep', minVersion: '3.0.0' }]
        }],
        ['test/versioned-dep', {
          name: 'versioned-dep',
          description: 'Versioned dep',
          category: 'test', subcategory: '', declaredCategory: 'test',
          tags: [], aliases: [], resolutionHints: [],
          metadata: {}, metadataText: '', searchableText: '',
          pathDepth: 0, filePath: '/fake', content: '# versioned-dep',
          version: '1.5.0'
        }]
      ]);

      const result = sm.validateDependencies('dep-checker');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/version 1\.5\.0 < required 3\.0\.0/);
    });

    it('compares patch versions correctly', () => {
      const sm = createSkillManager();
      sm['skillsCache'] = new Map([
        ['test/dep-checker', {
          name: 'dep-checker',
          description: 'Checks deps',
          category: 'test', subcategory: '', declaredCategory: 'test',
          tags: [], aliases: [], resolutionHints: [],
          metadata: {}, metadataText: '', searchableText: '',
          pathDepth: 0, filePath: '/fake', content: '# dep-checker',
          requires: [{ name: 'versioned-dep', minVersion: '1.2.3' }]
        }],
        ['test/versioned-dep', {
          name: 'versioned-dep',
          description: 'Versioned dep',
          category: 'test', subcategory: '', declaredCategory: 'test',
          tags: [], aliases: [], resolutionHints: [],
          metadata: {}, metadataText: '', searchableText: '',
          pathDepth: 0, filePath: '/fake', content: '# versioned-dep',
          version: '1.2.4'
        }]
      ]);

      const result = sm.validateDependencies('dep-checker');
      expect(result.valid).toBe(true);
    });

    it('skips version check when dependency has no version field', () => {
      const sm = createSkillManager();
      sm['skillsCache'] = new Map([
        ['test/dep-checker', {
          name: 'dep-checker',
          description: 'Checks deps',
          category: 'test', subcategory: '', declaredCategory: 'test',
          tags: [], aliases: [], resolutionHints: [],
          metadata: {}, metadataText: '', searchableText: '',
          pathDepth: 0, filePath: '/fake', content: '# dep-checker',
          requires: [{ name: 'unversioned-dep', minVersion: '1.0.0' }]
        }],
        ['test/unversioned-dep', {
          name: 'unversioned-dep',
          description: 'Unversioned dep',
          category: 'test', subcategory: '', declaredCategory: 'test',
          tags: [], aliases: [], resolutionHints: [],
          metadata: {}, metadataText: '', searchableText: '',
          pathDepth: 0, filePath: '/fake', content: '# unversioned-dep',
          // no version field
        }]
      ]);

      // The code only checks semver when both dep.minVersion and depSkill.version exist
      const result = sm.validateDependencies('dep-checker');
      expect(result.valid).toBe(true);
    });
  });

  // ---- Edge cases ----

  describe('edge cases', () => {
    function createSkillManager() {
      const { SkillManager } = require(skillManagerJsPath);
      return new SkillManager(mockProxyManager);
    }

    it('handles skill with empty requires array', () => {
      const sm = createSkillManager();
      sm['skillsCache'] = new Map([['test/empty-deps', {
        name: 'empty-deps',
        description: 'Empty deps',
        category: 'test', subcategory: '', declaredCategory: 'test',
        tags: [], aliases: [], resolutionHints: [],
        metadata: {}, metadataText: '', searchableText: '',
        pathDepth: 0, filePath: '/fake', content: '# empty-deps',
        requires: [],
        conflicts: []
      }]]);

      const result = sm.validateDependencies('empty-deps');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('handles skill with multiple missing requirements', () => {
      const sm = createSkillManager();
      sm['skillsCache'] = new Map([['test/multi-deps', {
        name: 'multi-deps',
        description: 'Multiple missing deps',
        category: 'test', subcategory: '', declaredCategory: 'test',
        tags: [], aliases: [], resolutionHints: [],
        metadata: {}, metadataText: '', searchableText: '',
        pathDepth: 0, filePath: '/fake', content: '# multi-deps',
        requires: [
          { name: 'missing-a' },
          { name: 'missing-b' },
          { name: 'missing-c' }
        ]
      }]]);

      const result = sm.validateDependencies('multi-deps');
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(3);
      expect(result.errors).toContain('Missing required skill: missing-a');
      expect(result.errors).toContain('Missing required skill: missing-b');
      expect(result.errors).toContain('Missing required skill: missing-c');
    });

    it('handles skill with both missing requires and active conflicts', () => {
      const sm = createSkillManager();
      sm['skillsCache'] = new Map([
        ['test/problematic', {
          name: 'problematic',
          description: 'Both problems',
          category: 'test', subcategory: '', declaredCategory: 'test',
          tags: [], aliases: [], resolutionHints: [],
          metadata: {}, metadataText: '', searchableText: '',
          pathDepth: 0, filePath: '/fake', content: '# problematic',
          requires: [{ name: 'missing-dep' }],
          conflicts: ['conflicting-skill']
        }],
        ['test/conflicting-skill', {
          name: 'conflicting-skill',
          description: 'Conflicting',
          category: 'test', subcategory: '', declaredCategory: 'test',
          tags: [], aliases: [], resolutionHints: [],
          metadata: {}, metadataText: '', searchableText: '',
          pathDepth: 0, filePath: '/fake', content: '# conflicting',
        }]
      ]);

      const result = sm.validateDependencies('problematic');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
      expect(result.errors.some((e: string) => e.includes('Missing required skill'))).toBe(true);
      expect(result.errors.some((e: string) => e.includes('Conflicts with installed skill'))).toBe(true);
    });

    it('version field is not set when frontmatter omits it', () => {
      const sm = createSkillManager();
      sm['skillsCache'] = new Map([['test/no-ver', {
        name: 'no-ver',
        description: 'No version',
        category: 'test', subcategory: '', declaredCategory: 'test',
        tags: [], aliases: [], resolutionHints: [],
        metadata: {}, metadataText: '', searchableText: '',
        pathDepth: 0, filePath: '/fake', content: '# no-ver',
        // version intentionally omitted
      }]]);

      const skill = sm.findSkillByName('no-ver');
      expect(skill).toBeDefined();
      expect(skill.version).toBeUndefined();
    });

    it('requires without minVersion only checks existence', () => {
      const sm = createSkillManager();
      sm['skillsCache'] = new Map([
        ['test/checker', {
          name: 'checker',
          description: 'Checker',
          category: 'test', subcategory: '', declaredCategory: 'test',
          tags: [], aliases: [], resolutionHints: [],
          metadata: {}, metadataText: '', searchableText: '',
          pathDepth: 0, filePath: '/fake', content: '# checker',
          requires: [{ name: 'any-version-ok' }]
        }],
        ['test/any-version-ok', {
          name: 'any-version-ok',
          description: 'Any version',
          category: 'test', subcategory: '', declaredCategory: 'test',
          tags: [], aliases: [], resolutionHints: [],
          metadata: {}, metadataText: '', searchableText: '',
          pathDepth: 0, filePath: '/fake', content: '# any',
          version: '0.0.1'
        }]
      ]);

      const result = sm.validateDependencies('checker');
      expect(result.valid).toBe(true);
    });
  });

  // ---- Frontmatter parsing integration (source-level) ----

  describe('frontmatter parsing handles various requires formats', () => {
    const src = fs.readFileSync(skillManagerTsPath, 'utf8');

    it('supports string-only requires entries', () => {
      // The parser handles typeof r === "string" case
      expect(src).toMatch(/typeof r === ["']string["']/);
    });

    it('supports object requires entries with name and minVersion', () => {
      expect(src).toMatch(/r\?\.name/);
      expect(src).toMatch(/r\.minVersion/);
    });

    it('filters out requires entries with empty names', () => {
      expect(src).toMatch(/\.filter\(\(r: SkillDependency\) => r\.name\)/);
    });

    it('supports both string and object conflict entries', () => {
      expect(src).toMatch(/typeof c === ["']string["']/);
      expect(src).toMatch(/c\?\.name/);
    });
  });
});
