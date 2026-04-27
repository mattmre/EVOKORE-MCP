import { describe, expect, it, beforeAll } from 'vitest';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const skillManagerJsPath = path.join(ROOT, 'dist', 'SkillManager.js');

const mockProxyManager = {
  callProxiedTool: async () => ({ content: [{ type: 'text', text: '' }] })
};

/**
 * Snapshot the top-5 results for a fixed set of canonical queries against
 * the real SKILLS/ tree. The first commit ESTABLISHES the snapshot from the
 * post-precedence ranking; future PRs that change ranking must intentionally
 * update the snapshot. This locks the `default` profile output so a silent
 * Fuse upgrade or scoring change cannot regress search results.
 */
describe('Default profile search snapshot', () => {
  let sm: any;
  const QUERIES = ['pr review', 'docs', 'voice', 'orchestration', 'refactor'];

  beforeAll(async () => {
    const { SkillManager } = require(skillManagerJsPath);
    sm = new SkillManager(mockProxyManager);
    await sm.loadSkills();
  }, 30_000);

  it('locks top-5 results for canonical queries', () => {
    const out: Record<string, Array<{ name: string; category: string; subcategory: string }>> = {};

    for (const q of QUERIES) {
      const results = sm.searchSkills(q, 5);
      out[q] = results.map((r: any) => ({
        name: r.skill.name,
        category: r.skill.category,
        subcategory: r.skill.subcategory,
      }));
    }

    expect(out).toMatchSnapshot();
  });

  it('search ordering is stable across consecutive calls', () => {
    for (const q of QUERIES) {
      const first = sm.searchSkills(q, 5).map((r: any) => `${r.skill.category}/${r.skill.name}`);
      const second = sm.searchSkills(q, 5).map((r: any) => `${r.skill.category}/${r.skill.name}`);
      expect(second).toEqual(first);
    }
  });
});
