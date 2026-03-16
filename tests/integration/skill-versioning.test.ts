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

  // ---- Runtime: version parsing from frontmatter via parseSkillMarkdown ----

  describe('version parsing from skill frontmatter (runtime)', () => {
    function createSkillManager() {
      const { SkillManager } = require(skillManagerJsPath);
      return new SkillManager(mockProxyManager);
    }

    it('parses version: 1.2.3 from frontmatter correctly', () => {
      const sm = createSkillManager();
      const markdown = '---\nname: versioned-skill\ndescription: A versioned skill\nversion: 1.2.3\n---\n# Versioned Skill\nContent here.';
      const result = sm['parseSkillMarkdown'](markdown, 'test-cat', '/fake/versioned-skill/SKILL.md', 'versioned-skill', '');
      expect(result).not.toBeNull();
      expect(result.version).toBe('1.2.3');
      expect(result.name).toBe('versioned-skill');
    });

    it('parses version from metadata subfield when top-level is absent', () => {
      const sm = createSkillManager();
      const markdown = '---\nname: meta-versioned\ndescription: Uses metadata version\nmetadata:\n  version: 2.0.1\n---\n# Meta Versioned\nContent.';
      const result = sm['parseSkillMarkdown'](markdown, 'test-cat', '/fake/meta-versioned/SKILL.md', 'meta-versioned', '');
      expect(result).not.toBeNull();
      expect(result.version).toBe('2.0.1');
    });

    it('prefers top-level version over metadata.version', () => {
      const sm = createSkillManager();
      const markdown = '---\nname: dual-version\ndescription: Both versions\nversion: 3.0.0\nmetadata:\n  version: 1.0.0\n---\n# Dual Version\nContent.';
      const result = sm['parseSkillMarkdown'](markdown, 'test-cat', '/fake/dual-version/SKILL.md', 'dual-version', '');
      expect(result).not.toBeNull();
      expect(result.version).toBe('3.0.0');
    });

    it('parses requires array with name and minVersion objects', () => {
      const sm = createSkillManager();
      const markdown = '---\nname: with-requires\ndescription: Has requires\nversion: 1.0.0\nrequires:\n  - name: dep-skill\n    minVersion: "2.0.0"\n  - name: another-dep\n---\n# With Requires\nContent.';
      const result = sm['parseSkillMarkdown'](markdown, 'test-cat', '/fake/with-requires/SKILL.md', 'with-requires', '');
      expect(result).not.toBeNull();
      expect(result.requires).toHaveLength(2);
      expect(result.requires[0].name).toBe('dep-skill');
      expect(result.requires[0].minVersion).toBe('2.0.0');
      expect(result.requires[1].name).toBe('another-dep');
      expect(result.requires[1].minVersion).toBeUndefined();
    });

    it('parses requires array with string-only entries', () => {
      const sm = createSkillManager();
      const markdown = '---\nname: string-requires\ndescription: String requires\nrequires:\n  - basic-dep\n  - other-dep\n---\n# String Requires\nContent.';
      const result = sm['parseSkillMarkdown'](markdown, 'test-cat', '/fake/string-requires/SKILL.md', 'string-requires', '');
      expect(result).not.toBeNull();
      expect(result.requires).toHaveLength(2);
      expect(result.requires[0].name).toBe('basic-dep');
      expect(result.requires[1].name).toBe('other-dep');
    });

    it('parses conflicts array from frontmatter', () => {
      const sm = createSkillManager();
      const markdown = '---\nname: with-conflicts\ndescription: Has conflicts\nconflicts:\n  - bad-skill\n  - legacy-skill\n---\n# With Conflicts\nContent.';
      const result = sm['parseSkillMarkdown'](markdown, 'test-cat', '/fake/with-conflicts/SKILL.md', 'with-conflicts', '');
      expect(result).not.toBeNull();
      expect(result.conflicts).toHaveLength(2);
      expect(result.conflicts).toContain('bad-skill');
      expect(result.conflicts).toContain('legacy-skill');
    });

    it('defaults gracefully when version field is absent', () => {
      const sm = createSkillManager();
      const markdown = '---\nname: no-version\ndescription: No version field\n---\n# No Version\nContent.';
      const result = sm['parseSkillMarkdown'](markdown, 'test-cat', '/fake/no-version/SKILL.md', 'no-version', '');
      expect(result).not.toBeNull();
      expect(result.version).toBeUndefined();
      // Skill should still parse fine without version
      expect(result.name).toBe('no-version');
    });

    it('omits requires key when frontmatter has no requires field', () => {
      const sm = createSkillManager();
      const markdown = '---\nname: no-requires\ndescription: No requires\n---\n# No Requires\nContent.';
      const result = sm['parseSkillMarkdown'](markdown, 'test-cat', '/fake/no-requires/SKILL.md', 'no-requires', '');
      expect(result).not.toBeNull();
      expect(result.requires).toBeUndefined();
    });

    it('omits conflicts key when frontmatter has no conflicts field', () => {
      const sm = createSkillManager();
      const markdown = '---\nname: no-conflicts\ndescription: No conflicts\n---\n# No Conflicts\nContent.';
      const result = sm['parseSkillMarkdown'](markdown, 'test-cat', '/fake/no-conflicts/SKILL.md', 'no-conflicts', '');
      expect(result).not.toBeNull();
      expect(result.conflicts).toBeUndefined();
    });

    it('returns null for content without frontmatter delimiters', () => {
      const sm = createSkillManager();
      const markdown = '# Just a heading\nNo frontmatter here.';
      const result = sm['parseSkillMarkdown'](markdown, 'test-cat', '/fake/bad/SKILL.md', 'bad', '');
      expect(result).toBeNull();
    });

    it('returns null for malformed YAML in frontmatter', () => {
      const sm = createSkillManager();
      const markdown = '---\nname: [unterminated\n  bad: yaml: here:\n---\n# Bad YAML\nContent.';
      const result = sm['parseSkillMarkdown'](markdown, 'test-cat', '/fake/bad-yaml/SKILL.md', 'bad-yaml', '');
      // parseSkillMarkdown catches YAML parse errors and returns null
      expect(result).toBeNull();
    });
  });

  // ---- Invalid version format handling ----

  describe('invalid and unusual version format handling', () => {
    function createSkillManager() {
      const { SkillManager } = require(skillManagerJsPath);
      return new SkillManager(mockProxyManager);
    }

    it('coerces numeric version to string', () => {
      const sm = createSkillManager();
      const markdown = '---\nname: numeric-version\ndescription: Numeric version\nversion: 1.0\n---\n# Numeric Version\nContent.';
      const result = sm['parseSkillMarkdown'](markdown, 'test-cat', '/fake/numeric-version/SKILL.md', 'numeric-version', '');
      expect(result).not.toBeNull();
      // YAML parses 1.0 as number; code uses String(version) to coerce
      expect(typeof result.version).toBe('string');
    });

    it('handles version with extra segments (e.g., 1.2.3.4)', () => {
      const sm = createSkillManager();
      const markdown = '---\nname: extra-segments\ndescription: Extra version segments\nversion: "1.2.3.4"\n---\n# Extra Segments\nContent.';
      const result = sm['parseSkillMarkdown'](markdown, 'test-cat', '/fake/extra/SKILL.md', 'extra-segments', '');
      expect(result).not.toBeNull();
      expect(result.version).toBe('1.2.3.4');
    });

    it('semverSatisfies handles versions with missing segments gracefully', () => {
      const sm = createSkillManager();
      // semverSatisfies pads missing segments with 0
      const satisfies = sm['semverSatisfies']('1.0', '1.0.0');
      expect(satisfies).toBe(true);
    });

    it('semverSatisfies handles single-segment versions', () => {
      const sm = createSkillManager();
      const satisfies = sm['semverSatisfies']('2', '1');
      expect(satisfies).toBe(true);
    });

    it('semverSatisfies handles non-numeric version segments as NaN -> 0', () => {
      const sm = createSkillManager();
      // "abc".split(".").map(Number) => [NaN], and NaN || 0 => 0
      const satisfies = sm['semverSatisfies']('abc', '0.0.0');
      expect(satisfies).toBe(true);
    });

    it('validateDependencies does not crash with malformed version strings', () => {
      const sm = createSkillManager();
      sm['skillsCache'] = new Map([
        ['test/checker', {
          name: 'checker',
          description: 'Checker',
          category: 'test', subcategory: '', declaredCategory: 'test',
          tags: [], aliases: [], resolutionHints: [],
          metadata: {}, metadataText: '', searchableText: '',
          pathDepth: 0, filePath: '/fake', content: '# checker',
          requires: [{ name: 'dep', minVersion: 'not-a-version' }]
        }],
        ['test/dep', {
          name: 'dep',
          description: 'Dep',
          category: 'test', subcategory: '', declaredCategory: 'test',
          tags: [], aliases: [], resolutionHints: [],
          metadata: {}, metadataText: '', searchableText: '',
          pathDepth: 0, filePath: '/fake', content: '# dep',
          version: 'also-not-a-version'
        }]
      ]);

      // Should not throw, just return a result
      expect(() => sm.validateDependencies('checker')).not.toThrow();
      const result = sm.validateDependencies('checker');
      expect(typeof result.valid).toBe('boolean');
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });

  // ---- getSkillHelpText shows version info ----

  describe('getSkillHelpText displays version and dependency info', () => {
    function createSkillManager() {
      const { SkillManager } = require(skillManagerJsPath);
      return new SkillManager(mockProxyManager);
    }

    it('includes Version line when skill has version', () => {
      const sm = createSkillManager();
      sm['skillsCache'] = new Map([['test/ver-skill', {
        name: 'ver-skill',
        description: 'Versioned',
        category: 'test', subcategory: '', declaredCategory: 'test',
        tags: [], aliases: [], resolutionHints: [],
        metadata: {}, metadataText: '', searchableText: '',
        pathDepth: 0, filePath: '/fake', content: '# ver-skill content',
        version: '4.5.6'
      }]]);

      const help = sm.getSkillHelpText('ver-skill');
      expect(help).toContain('Version: 4.5.6');
    });

    it('omits Version line when skill has no version', () => {
      const sm = createSkillManager();
      sm['skillsCache'] = new Map([['test/no-ver', {
        name: 'no-ver',
        description: 'No version',
        category: 'test', subcategory: '', declaredCategory: 'test',
        tags: [], aliases: [], resolutionHints: [],
        metadata: {}, metadataText: '', searchableText: '',
        pathDepth: 0, filePath: '/fake', content: '# no-ver content',
      }]]);

      const help = sm.getSkillHelpText('no-ver');
      expect(help).not.toContain('Version:');
    });

    it('includes Requires line with formatted dependencies', () => {
      const sm = createSkillManager();
      sm['skillsCache'] = new Map([['test/req-skill', {
        name: 'req-skill',
        description: 'Has requires',
        category: 'test', subcategory: '', declaredCategory: 'test',
        tags: [], aliases: [], resolutionHints: [],
        metadata: {}, metadataText: '', searchableText: '',
        pathDepth: 0, filePath: '/fake', content: '# req-skill',
        requires: [
          { name: 'dep-a', minVersion: '1.0.0' },
          { name: 'dep-b' }
        ]
      }]]);

      const help = sm.getSkillHelpText('req-skill');
      expect(help).toContain('Requires: dep-a >= 1.0.0, dep-b');
    });

    it('includes Conflicts line when conflicts exist', () => {
      const sm = createSkillManager();
      sm['skillsCache'] = new Map([['test/con-skill', {
        name: 'con-skill',
        description: 'Has conflicts',
        category: 'test', subcategory: '', declaredCategory: 'test',
        tags: [], aliases: [], resolutionHints: [],
        metadata: {}, metadataText: '', searchableText: '',
        pathDepth: 0, filePath: '/fake', content: '# con-skill',
        conflicts: ['enemy-a', 'enemy-b']
      }]]);

      const help = sm.getSkillHelpText('con-skill');
      expect(help).toContain('Conflicts: enemy-a, enemy-b');
    });
  });
});
