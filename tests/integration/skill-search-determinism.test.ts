import { describe, expect, it, beforeAll } from 'vitest';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const skillManagerJsPath = path.join(ROOT, 'dist', 'SkillManager.js');

const mockProxyManager = {
  callProxiedTool: async () => ({ content: [{ type: 'text', text: '' }] })
};

interface SkillFixture {
  name: string;
  description?: string;
  category?: string;
  subcategory?: string;
  declaredCategory?: string;
  tags?: string[];
  aliases?: string[];
  resolutionHints?: string[];
  pathDepth?: number;
}

function buildSkill(fixture: SkillFixture): any {
  const name = fixture.name;
  const description = fixture.description ?? `${name} description`;
  const category = fixture.category ?? 'TEST CATEGORY';
  const subcategory = fixture.subcategory ?? '';
  const declaredCategory = fixture.declaredCategory ?? category;
  const tags = fixture.tags ?? [];
  const aliases = fixture.aliases ?? [];
  const resolutionHints = fixture.resolutionHints ?? [];
  const pathDepth = fixture.pathDepth ?? 0;
  const searchableText = [
    name, description, category, subcategory, declaredCategory,
    ...tags, ...aliases, ...resolutionHints
  ].filter(Boolean).join(' ');

  return {
    name,
    description,
    category,
    subcategory,
    declaredCategory,
    tags,
    aliases,
    resolutionHints,
    metadata: {},
    metadataText: '',
    searchableText,
    pathDepth,
    filePath: `/fixture/${category}/${name}/SKILL.md`,
    content: description,
  };
}

/**
 * Build a SkillManager and replace its skillsCache + fuseIndex with the given fixtures.
 * Bypasses real disk I/O so tests run in milliseconds and don't depend on SKILLS/.
 */
function buildSkillManagerWithFixtures(fixtures: SkillFixture[]): any {
  const { SkillManager } = require(skillManagerJsPath);
  // fuse.js v7 exports the constructor directly when loaded via CommonJS.
  const FuseModule = require('fuse.js');
  const Fuse = FuseModule.default || FuseModule;
  const sm = new SkillManager(mockProxyManager);

  const cache = new Map<string, any>();
  const skills: any[] = [];
  for (const fx of fixtures) {
    const skill = buildSkill(fx);
    cache.set(`${skill.category}/${skill.name}`.toLowerCase(), skill);
    skills.push(skill);
  }

  // Mirror the keys/weights used by SkillManager.loadSkills() so tier-3 fuzzy
  // search behaves like production.
  const fuse = new Fuse(skills, {
    keys: [
      { name: 'name', weight: 0.22 },
      { name: 'description', weight: 0.18 },
      { name: 'category', weight: 0.05 },
      { name: 'subcategory', weight: 0.05 },
      { name: 'declaredCategory', weight: 0.04 },
      { name: 'tags', weight: 0.08 },
      { name: 'aliases', weight: 0.12 },
      { name: 'resolutionHints', weight: 0.08 },
      { name: 'metadataText', weight: 0.06 },
      { name: 'searchableText', weight: 0.07 },
      { name: 'content', weight: 0.05 },
    ],
    threshold: 0.4,
    ignoreLocation: true,
    includeScore: true,
  });

  // Inject internal state. SkillManager exposes searchSkills() publicly now,
  // so we only need to seed the cache + fuse index it consults.
  sm.skillsCache = cache;
  sm.fuseIndex = fuse;
  return sm;
}

describe('SkillManager search precedence (alias-exact > prefix > fuzzy)', () => {
  let sm: any;

  beforeAll(() => {
    sm = buildSkillManagerWithFixtures([
      {
        name: 'deploy-pipeline',
        description: 'Deploy build pipeline',
        aliases: ['deploy', 'shipit'],
      },
      {
        name: 'deployment-config',
        description: 'Deployment configuration manager',
      },
      {
        name: 'config-deploy-pipeline-v2',
        description: 'Versioned deploy pipeline configuration',
      },
    ]);
  });

  it('ranks alias-exact > name-prefix > fuzzy for "deploy"', () => {
    const results = sm.searchSkills('deploy', 5);
    const names = results.map((r: any) => r.skill.name);

    // skill-A wins on alias-exact.
    expect(names[0]).toBe('deploy-pipeline');
    // skill-B is a name-prefix on "deploy".
    expect(names[1]).toBe('deployment-config');
    // skill-C should be ranked last via fuzzy/substring.
    expect(names).toContain('config-deploy-pipeline-v2');
    expect(names.indexOf('config-deploy-pipeline-v2')).toBeGreaterThan(
      names.indexOf('deployment-config')
    );
  });

  it('tags the top result with an "alias exact" reason', () => {
    const results = sm.searchSkills('deploy', 5);
    expect(results[0].skill.name).toBe('deploy-pipeline');
    expect(results[0].reasons.some((r: string) => r.startsWith('alias exact'))).toBe(true);
  });

  it('tags the second result with a "name prefix" reason', () => {
    const results = sm.searchSkills('deploy', 5);
    expect(results[1].skill.name).toBe('deployment-config');
    expect(results[1].reasons.some((r: string) => r.startsWith('name prefix'))).toBe(true);
  });

  it('tags fuzzy-only matches with a "fuzzy match" reason', () => {
    const results = sm.searchSkills('deploy', 5);
    const fuzzy = results.find((r: any) => r.skill.name === 'config-deploy-pipeline-v2');
    expect(fuzzy).toBeDefined();
    expect(fuzzy.reasons.some((r: string) => r.startsWith('fuzzy match'))).toBe(true);
  });

  it('returns only alias-exact match for a unique alias query "shipit"', () => {
    const results = sm.searchSkills('shipit', 5);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].skill.name).toBe('deploy-pipeline');
    expect(results[0].reasons.some((r: string) => r.startsWith('alias exact'))).toBe(true);
    // No other fixture should rank for "shipit".
    const others = results.filter((r: any) => r.skill.name !== 'deploy-pipeline');
    expect(others).toEqual([]);
  });

  it('treats alias-exact case-insensitively (query "Deploy")', () => {
    const results = sm.searchSkills('Deploy', 5);
    expect(results[0].skill.name).toBe('deploy-pipeline');
    expect(results[0].reasons.some((r: string) => r.startsWith('alias exact'))).toBe(true);
  });

  it('produces stable, deterministic ordering across consecutive calls', () => {
    const first = sm.searchSkills('deploy', 5).map((r: any) => `${r.skill.category}/${r.skill.name}`);
    const second = sm.searchSkills('deploy', 5).map((r: any) => `${r.skill.category}/${r.skill.name}`);
    expect(second).toEqual(first);
  });

  it('deduplicates a skill that matches both alias-exact and prefix', () => {
    // skill-A's name "deploy-pipeline" also starts with "deploy", but because
    // it already matched in tier-1 (alias-exact) it must not appear again.
    const results = sm.searchSkills('deploy', 10);
    const aCount = results.filter((r: any) => r.skill.name === 'deploy-pipeline').length;
    expect(aCount).toBe(1);
  });

  it('respects the limit argument', () => {
    const results = sm.searchSkills('deploy', 2);
    expect(results.length).toBe(2);
  });
});
