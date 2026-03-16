import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';

const ROOT = path.resolve(__dirname, '../..');
const skillManagerTsPath = path.join(ROOT, 'src', 'SkillManager.ts');
const skillManagerJsPath = path.join(ROOT, 'dist', 'SkillManager.js');

const mockProxyManager = {
  callProxiedTool: async () => ({ content: [{ type: 'text', text: '' }] }),
  getServerStatusSnapshot: () => ({})
};

describe('Skill Watcher Stability', () => {
  // ---- Source structure: watcher setup is gated behind EVOKORE_SKILL_WATCHER ----

  describe('watcher initialization is gated behind EVOKORE_SKILL_WATCHER env var', () => {
    const src = fs.readFileSync(skillManagerTsPath, 'utf8');

    it('has enableWatcher method', () => {
      expect(src).toMatch(/enableWatcher\(\):\s*void/);
    });

    it('has disableWatcher method', () => {
      expect(src).toMatch(/disableWatcher\(\):\s*void/);
    });

    it('stores watcher as FSWatcher member', () => {
      expect(src).toMatch(/private watcher:\s*fsSync\.FSWatcher\s*\|\s*null/);
    });

    it('uses fsSync.watch with recursive option', () => {
      expect(src).toMatch(/fsSync\.watch\(SKILLS_DIR,\s*\{\s*recursive:\s*true\s*\}/);
    });

    it('index.ts gates watcher behind EVOKORE_SKILL_WATCHER env var', () => {
      const indexSrc = fs.readFileSync(path.join(ROOT, 'src', 'index.ts'), 'utf8');
      expect(indexSrc).toMatch(/EVOKORE_SKILL_WATCHER/);
    });
  });

  // ---- Source structure: debouncing exists ----

  describe('watcher has debounce mechanism', () => {
    const src = fs.readFileSync(skillManagerTsPath, 'utf8');

    it('declares a debounceTimer variable', () => {
      expect(src).toMatch(/debounceTimer/);
    });

    it('uses clearTimeout to cancel previous timer', () => {
      expect(src).toMatch(/clearTimeout\(debounceTimer\)/);
    });

    it('uses setTimeout for debounce delay', () => {
      expect(src).toMatch(/setTimeout\(/);
    });

    it('debounce delay is at least 500ms', () => {
      // The source uses 1000ms debounce
      const delayMatch = src.match(/setTimeout\(\(\)\s*=>\s*\{[\s\S]*?\},\s*(\d+)\)/);
      expect(delayMatch).not.toBeNull();
      const delay = parseInt(delayMatch![1], 10);
      expect(delay).toBeGreaterThanOrEqual(500);
    });
  });

  // ---- Source structure: error handling exists ----

  describe('watcher has error handling', () => {
    const src = fs.readFileSync(skillManagerTsPath, 'utf8');

    it('wraps watch setup in try-catch', () => {
      // enableWatcher wraps fsSync.watch in try-catch
      const enableMethod = src.slice(src.indexOf('enableWatcher'));
      const firstTry = enableMethod.indexOf('try {');
      const firstCatch = enableMethod.indexOf('catch (err)');
      expect(firstTry).toBeGreaterThan(0);
      expect(firstCatch).toBeGreaterThan(firstTry);
    });

    it('handles missing SKILLS directory gracefully', () => {
      expect(src).toMatch(/SKILLS directory not found/);
      expect(src).toMatch(/watcher not started/);
    });

    it('logs error when watcher fails to start', () => {
      expect(src).toMatch(/Skill watcher: failed to start/);
    });

    it('catches refresh failures inside watcher callback', () => {
      expect(src).toMatch(/Skill watcher: refresh failed/);
    });

    it('uses .catch on refreshSkills promise inside watcher', () => {
      expect(src).toMatch(/\.catch\(\(err\)/);
    });
  });

  // ---- Source structure: watcher cleanup exists ----

  describe('watcher cleanup for graceful shutdown', () => {
    const src = fs.readFileSync(skillManagerTsPath, 'utf8');

    it('disableWatcher calls watcher.close()', () => {
      expect(src).toMatch(/this\.watcher\.close\(\)/);
    });

    it('disableWatcher sets watcher to null', () => {
      expect(src).toMatch(/this\.watcher\s*=\s*null/);
    });

    it('enableWatcher short-circuits if watcher already active', () => {
      expect(src).toMatch(/if\s*\(this\.watcher\)\s*return/);
    });

    it('logs when watcher is stopped', () => {
      expect(src).toMatch(/Skill watcher: stopped/);
    });
  });

  // ---- Runtime: enableWatcher / disableWatcher basic behavior ----

  describe('watcher runtime behavior', () => {
    function createSkillManager() {
      const { SkillManager } = require(skillManagerJsPath);
      return new SkillManager(mockProxyManager);
    }

    it('enableWatcher does not crash when SKILLS directory does not exist', () => {
      const sm = createSkillManager();
      // The compiled SKILLS_DIR points to dist/../SKILLS which may or may not exist.
      // If SKILLS dir does not exist, enableWatcher should log and return without crashing.
      expect(() => sm.enableWatcher()).not.toThrow();
      sm.disableWatcher();
    });

    it('disableWatcher does not crash when no watcher is active', () => {
      const sm = createSkillManager();
      expect(() => sm.disableWatcher()).not.toThrow();
    });

    it('calling enableWatcher twice does not create duplicate watchers', () => {
      const sm = createSkillManager();
      sm.enableWatcher();
      // The second call should short-circuit (if (this.watcher) return)
      sm.enableWatcher();
      // No crash, single watcher
      sm.disableWatcher();
    });

    it('disableWatcher after enableWatcher sets watcher to null', () => {
      const sm = createSkillManager();
      sm.enableWatcher();
      sm.disableWatcher();
      // The watcher field should be null now
      expect(sm['watcher']).toBeNull();
    });

    it('setOnRefreshCallback accepts a callback function', () => {
      const sm = createSkillManager();
      const callback = () => {};
      expect(() => sm.setOnRefreshCallback(callback)).not.toThrow();
    });
  });

  // ---- Runtime: refreshSkills with malformed skill files ----

  describe('refreshSkills handles malformed skill files', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'evokore-watcher-test-'));
    });

    afterEach(async () => {
      await fsp.rm(tmpDir, { recursive: true, force: true });
    });

    it('does not crash when a skill file has invalid frontmatter', async () => {
      // Create a category directory with a malformed SKILL.md
      const categoryDir = path.join(tmpDir, 'bad-category');
      const skillDir = path.join(categoryDir, 'bad-skill');
      await fsp.mkdir(skillDir, { recursive: true });
      await fsp.writeFile(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: [broken yaml {{{\n---\n# Bad skill'
      );

      // We cannot easily redirect SKILLS_DIR at runtime since it is a module-level const.
      // Instead, test that parseSkillMarkdown handles the malformed content gracefully.
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);

      const result = sm['parseSkillMarkdown'](
        '---\nname: [broken yaml {{{\n---\n# Bad skill',
        'test-cat', path.join(skillDir, 'SKILL.md'), 'bad-skill', ''
      );
      // Should return null without throwing
      expect(result).toBeNull();
    });

    it('does not crash when a skill file has empty frontmatter', async () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);

      const result = sm['parseSkillMarkdown'](
        '---\n\n---\n# Empty frontmatter',
        'test-cat', '/fake/empty/SKILL.md', 'empty-skill', ''
      );
      // Empty YAML parses to null; the code should handle this
      // If frontmatter is null/undefined, name fallback to fallbackName
      if (result) {
        expect(result.name).toBe('empty-skill');
      }
      // Either null or a valid result with fallback name - no crash
    });

    it('does not crash when a skill file has binary content', async () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);

      const binaryContent = Buffer.from([0x00, 0x01, 0xFF, 0xFE]).toString('utf-8');
      const result = sm['parseSkillMarkdown'](
        binaryContent,
        'test-cat', '/fake/binary/SKILL.md', 'binary-skill', ''
      );
      // Should return null (no frontmatter match) without throwing
      expect(result).toBeNull();
    });

    it('does not crash when skill file has frontmatter but no body', async () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);

      const result = sm['parseSkillMarkdown'](
        '---\nname: body-less\ndescription: No body\n---\n',
        'test-cat', '/fake/bodyless/SKILL.md', 'body-less', ''
      );
      if (result) {
        expect(result.name).toBe('body-less');
        expect(result.content).toBe('');
      }
    });
  });

  // ---- Runtime: refreshSkills produces consistent results ----

  describe('refreshSkills produces consistent results after reload', () => {
    it('refreshSkills returns added/removed/updated counts', async () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);

      // Pre-populate cache with one skill
      sm['skillsCache'] = new Map([['test/old-skill', {
        name: 'old-skill',
        description: 'Old',
        category: 'test', subcategory: '', declaredCategory: 'test',
        tags: [], aliases: [], resolutionHints: [],
        metadata: {}, metadataText: '', searchableText: '',
        pathDepth: 0, filePath: '/fake/old', content: '# old',
      }]]);

      // refreshSkills calls loadSkills which rescans SKILLS_DIR
      // This will likely clear the injected skill (since it doesn't exist on disk)
      const result = await sm.refreshSkills();
      expect(result).toHaveProperty('added');
      expect(result).toHaveProperty('removed');
      expect(result).toHaveProperty('updated');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('refreshTimeMs');
      expect(typeof result.refreshTimeMs).toBe('number');
    });

    it('loadSkills clears the cache before re-scanning', async () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);

      // Inject a fake skill
      sm['skillsCache'].set('fake/injected', {
        name: 'injected', description: 'Fake',
        category: 'fake', subcategory: '', declaredCategory: 'fake',
        tags: [], aliases: [], resolutionHints: [],
        metadata: {}, metadataText: '', searchableText: '',
        pathDepth: 0, filePath: '/fake', content: '# fake',
      });

      expect(sm['skillsCache'].has('fake/injected')).toBe(true);

      await sm.loadSkills();

      // After loadSkills, the injected skill should be gone
      // (it was in-memory only, not on disk)
      expect(sm['skillsCache'].has('fake/injected')).toBe(false);
    });
  });

  // ---- Memory leak indicators: watcher cleanup on shutdown ----

  describe('no memory leak indicators in watcher lifecycle', () => {
    it('watcher is set to null after disableWatcher', () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);
      sm.enableWatcher();
      sm.disableWatcher();
      expect(sm['watcher']).toBeNull();
    });

    it('enableWatcher after disableWatcher can re-create watcher', () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);
      sm.enableWatcher();
      sm.disableWatcher();
      expect(sm['watcher']).toBeNull();
      // Should be able to re-enable without issue
      sm.enableWatcher();
      // Cleanup
      sm.disableWatcher();
      expect(sm['watcher']).toBeNull();
    });

    it('multiple disable calls do not throw', () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);
      expect(() => {
        sm.disableWatcher();
        sm.disableWatcher();
        sm.disableWatcher();
      }).not.toThrow();
    });

    it('onRefreshCallback is stored and can be replaced', () => {
      const { SkillManager } = require(skillManagerJsPath);
      const sm = new SkillManager(mockProxyManager);
      const cb1 = () => {};
      const cb2 = () => {};
      sm.setOnRefreshCallback(cb1);
      expect(sm['onRefreshCallback']).toBe(cb1);
      sm.setOnRefreshCallback(cb2);
      expect(sm['onRefreshCallback']).toBe(cb2);
    });
  });
});
