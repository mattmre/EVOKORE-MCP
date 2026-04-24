import { describe, expect, it, beforeAll } from 'vitest';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const skillManagerJsPath = path.join(ROOT, 'dist', 'SkillManager.js');

const mockProxyManager = {
  callProxiedTool: async () => ({ content: [{ type: 'text', text: '' }] })
};

function getSkillManager() {
  const { SkillManager } = require(skillManagerJsPath);
  return new SkillManager(mockProxyManager);
}

function makeSkillMetadata(name: string) {
  return {
    name,
    description: `${name} fixture`,
    category: 'Test',
    subcategory: '',
    declaredCategory: 'Test',
    tags: [],
    aliases: [],
    resolutionHints: [],
    metadata: {},
    metadataText: '',
    searchableText: name,
    pathDepth: 1,
    filePath: `/fake/${name}/SKILL.md`,
    content: `---\nname: ${name}\n---\n# ${name}\n`
  };
}

describe('SkillManager: fuzzy-match suggestions for missing skills (audit #282 item 10)', () => {
  let sm: any;

  beforeAll(() => {
    sm = getSkillManager();
    const cache: Map<string, any> = (sm as any).skillsCache;
    for (const name of [
      'pr-manager',
      'session-wrap',
      'panel-meta-improvement',
      'tester-runner'
    ]) {
      cache.set(`Test/${name}`, makeSkillMetadata(name));
    }
  });

  describe('suggestSimilarSkillNames', () => {
    it('returns the closest match for a single-character typo', () => {
      const out = sm.suggestSimilarSkillNames('pr-manger');
      expect(out[0]).toBe('pr-manager');
    });

    it('ranks the lowest-distance match first', () => {
      const out = sm.suggestSimilarSkillNames('pr-manaegr');
      expect(out[0]).toBe('pr-manager');
    });

    it('returns an empty array when the query is empty', () => {
      expect(sm.suggestSimilarSkillNames('')).toEqual([]);
    });

    it('returns an empty array when nothing is within edit-distance threshold', () => {
      expect(sm.suggestSimilarSkillNames('totally-unrelated-zxqv')).toEqual([]);
    });

    it('respects the limit parameter', () => {
      const out = sm.suggestSimilarSkillNames('panel-meta-improvment', 1);
      expect(out.length).toBeLessThanOrEqual(1);
    });

    it('is case-insensitive', () => {
      const out = sm.suggestSimilarSkillNames('PR-MANGER');
      expect(out[0]).toBe('pr-manager');
    });
  });

  describe('buildSkillNotFoundMessage', () => {
    it('returns the bare error when no candidates are close enough', () => {
      const msg = sm.buildSkillNotFoundMessage('totally-unrelated-zxqv');
      expect(msg).toBe('Skill not found: totally-unrelated-zxqv');
    });

    it('appends a "Did you mean" hint when a single candidate is close', () => {
      const msg = sm.buildSkillNotFoundMessage('pr-manger');
      expect(msg).toContain('Skill not found: pr-manger');
      expect(msg).toContain('Did you mean "pr-manager"');
    });

    it('appends a multi-candidate hint when several are close', () => {
      const msg = sm.buildSkillNotFoundMessage('panel-meta-improvment');
      expect(msg).toContain('Skill not found: panel-meta-improvment');
      expect(msg).toMatch(/Did you mean( one of)?/);
      expect(msg).toContain('panel-meta-improvement');
    });
  });

  describe('throw sites use the suggestion-aware message', () => {
    it('extractCodeBlocks throws with a "Did you mean" hint', () => {
      expect(() => sm.extractCodeBlocks('pr-manger')).toThrow(/Did you mean "pr-manager"/);
    });

    it('validateDependencies returns the suggestion in errors', () => {
      const result = sm.validateDependencies('pr-manger');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Did you mean "pr-manager"');
    });
  });
});
