'use strict';

/**
 * Skill Indexing Validation Tests
 *
 * Validates that SkillManager indexes skills correctly using recursive
 * traversal (max depth 5) across SKILLS/{category}/.../{skill}/SKILL.md
 * and that search, resolve_workflow, and get_skill_help produce meaningful results.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// ---- helpers ----

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  PASS  ' + name);
  } catch (err) {
    failed++;
    console.error('  FAIL  ' + name);
    console.error('        ' + err.message);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  PASS  ' + name);
  } catch (err) {
    failed++;
    console.error('  FAIL  ' + name);
    console.error('        ' + err.message);
  }
}

// ---- load SkillManager from dist ----

const { SkillManager } = require('./dist/SkillManager');

// SkillManager requires a proxyManager in its constructor but loadSkills()
// does not use it. Provide a no-op stub.
const mockProxyManager = {
  callProxiedTool: async () => ({ content: [{ type: 'text', text: '' }] })
};

async function run() {
  console.log('\n=== Skill Indexing Validation (Recursive) ===\n');

  const sm = new SkillManager(mockProxyManager);

  // Performance gate: loadSkills must complete in reasonable time
  const startTime = Date.now();
  await sm.loadSkills();
  const loadTimeMs = Date.now() - startTime;

  // Expose internals for direct inspection.
  const cache = sm.skillsCache;
  const fuseIndex = sm.fuseIndex;

  // ----------------------------------------------------------------
  // Section 1: Index count baseline (recursive)
  // ----------------------------------------------------------------
  console.log('\n-- Index Count Baseline --');

  const indexedCount = cache.size;
  console.log('   Indexed skill count: ' + indexedCount);
  console.log('   Load time: ' + loadTimeMs + 'ms');

  test('indexes at least 100 skills (recursive traversal)', () => {
    assert.ok(indexedCount >= 100,
      'Expected >=100 indexed skills with recursive traversal, got ' + indexedCount);
  });

  test('performance gate: loadSkills completes in <10000ms', () => {
    assert.ok(loadTimeMs < 10000,
      'Expected loadSkills to complete in <10s, took ' + loadTimeMs + 'ms');
  });

  // ----------------------------------------------------------------
  // Section 2: Category coverage
  // ----------------------------------------------------------------
  console.log('\n-- Category Coverage --');

  const categories = new Set();
  for (const skill of cache.values()) {
    categories.add(skill.category);
  }
  console.log('   Categories found: ' + [...categories].sort().join(', '));

  const expectedCategories = [
    'GENERAL CODING WORKFLOWS',
    'ORCHESTRATION FRAMEWORK',
    'DEVELOPER TOOLS',
    'AUTOMATION AND PRODUCTIVITY',
    'WSHOBSON PLUGINS'
  ];

  for (const cat of expectedCategories) {
    test('category "' + cat + '" is present', () => {
      assert.ok(categories.has(cat),
        'Expected category "' + cat + '" in indexed skills');
    });
  }

  // ----------------------------------------------------------------
  // Section 3: Search quality (search_skills via Fuse.js)
  // ----------------------------------------------------------------
  console.log('\n-- Search Quality --');

  const searchCases = [
    {
      query: 'handoff',
      expectCategoryMatch: 'ORCHESTRATION FRAMEWORK',
      description: '"handoff" returns orchestration-related skills'
    },
    {
      query: 'session',
      expectNameSubstring: 'session',
      description: '"session" returns session-related skills'
    },
    {
      query: 'documentation',
      expectAnyResults: true,
      description: '"documentation" returns at least one result'
    },
    {
      query: 'security',
      expectAnyResults: true,
      description: '"security" returns at least one result'
    },
    {
      query: 'python testing',
      expectCategoryMatch: 'WSHOBSON PLUGINS',
      description: '"python testing" returns WSHOBSON PLUGINS skills'
    }
  ];

  for (const tc of searchCases) {
    test(tc.description, () => {
      assert.ok(fuseIndex, 'Fuse index must be initialized');
      const results = fuseIndex.search(tc.query, { limit: 10 });
      assert.ok(results.length > 0,
        'search_skills("' + tc.query + '") returned 0 results');

      if (tc.expectCategoryMatch) {
        const hasCategory = results.some(r =>
          r.item.category === tc.expectCategoryMatch);
        assert.ok(hasCategory,
          'Expected at least one result in category "' + tc.expectCategoryMatch +
          '" for query "' + tc.query + '". Got categories: ' + results.map(r => r.item.category).join(', '));
      }

      if (tc.expectNameSubstring) {
        const hasName = results.some(r =>
          r.item.name.toLowerCase().includes(tc.expectNameSubstring));
        assert.ok(hasName,
          'Expected at least one result with "' + tc.expectNameSubstring + '" in name ' +
          'for query "' + tc.query + '". Got names: ' + results.map(r => r.item.name).join(', '));
      }
    });
  }

  // ----------------------------------------------------------------
  // Section 4: resolve_workflow validation
  // ----------------------------------------------------------------
  console.log('\n-- resolve_workflow Validation --');

  await testAsync('resolve_workflow returns injected workflows for "wrap up session"', async () => {
    const result = await sm.handleToolCall('resolve_workflow', { objective: 'wrap up session' });
    const text = result.content[0].text;
    assert.ok(text.includes('EVOKORE-MCP injected'),
      'Expected resolve_workflow to inject workflows');
    assert.ok(text.includes('activated_skill'),
      'Expected resolve_workflow response to contain activated_skill tags');
  });

  await testAsync('resolve_workflow returns results for "create documentation"', async () => {
    const result = await sm.handleToolCall('resolve_workflow', { objective: 'create documentation' });
    const text = result.content[0].text;
    assert.ok(text.includes('WORKFLOW:'),
      'Expected resolve_workflow to return at least one WORKFLOW block');
  });

  // ----------------------------------------------------------------
  // Section 5: get_skill_help validation
  // ----------------------------------------------------------------
  console.log('\n-- get_skill_help Validation --');

  // Find a known skill name from the cache to test with
  const knownSkillKeys = [...cache.keys()].slice(0, 3);
  console.log('   Sample indexed skill keys: ' + knownSkillKeys.join(', '));

  if (knownSkillKeys.length > 0) {
    const testSkillKey = knownSkillKeys[0];
    await testAsync('get_skill_help returns content for "' + testSkillKey + '"', async () => {
      const result = await sm.handleToolCall('get_skill_help', { skill_name: testSkillKey });
      const text = result.content[0].text;
      assert.ok(text.includes('Skill Overview'),
        'Expected get_skill_help response to contain "Skill Overview"');
      assert.ok(text.includes('Internal Instructions'),
        'Expected get_skill_help response to contain "Internal Instructions"');
    });
  }

  // Test bare name lookup (without category prefix)
  await testAsync('get_skill_help supports bare name lookup', async () => {
    const firstSkill = [...cache.values()][0];
    if (!firstSkill) throw new Error('No skills indexed');
    const result = await sm.handleToolCall('get_skill_help', { skill_name: firstSkill.name });
    const text = result.content[0].text;
    assert.ok(text.includes('Skill Overview'),
      'Expected bare name lookup to return skill help');
  });

  await testAsync('get_skill_help returns not-found for nonexistent skill', async () => {
    const result = await sm.handleToolCall('get_skill_help', { skill_name: 'zzz-nonexistent-skill-zzz' });
    const text = result.content[0].text;
    assert.ok(text.includes('Could not find'),
      'Expected not-found message for nonexistent skill');
  });

  // ----------------------------------------------------------------
  // Section 6: Recursive depth -- deeply nested skills ARE now indexed
  // ----------------------------------------------------------------
  console.log('\n-- Recursive Depth Validation --');

  const orchTddPath = path.resolve(__dirname, 'SKILLS', 'ORCHESTRATION FRAMEWORK',
    'commands', 'orch-tdd', 'SKILL.md');
  const orchTddExists = fs.existsSync(orchTddPath);

  test('orch-tdd/SKILL.md exists on disk at level 3', () => {
    assert.ok(orchTddExists,
      'Expected ' + orchTddPath + ' to exist on disk for this test to be meaningful');
  });

  test('orch-tdd IS in the skills index (recursive traversal)', () => {
    const hasOrchTdd = [...cache.keys()].some(k => k.includes('orch-tdd')) ||
                       [...cache.values()].some(s => s.filePath.includes('orch-tdd'));
    assert.ok(hasOrchTdd,
      'orch-tdd should be indexed with recursive traversal');
  });

  // WSHOBSON PLUGINS reachability: skills at depth 3
  test('WSHOBSON PLUGINS skills are reachable', () => {
    const wshobsonSkills = [...cache.values()].filter(s =>
      s.category === 'WSHOBSON PLUGINS');
    assert.ok(wshobsonSkills.length > 20,
      'Expected >20 WSHOBSON PLUGINS skills, got ' + wshobsonSkills.length);
  });

  test('"commands" directory IS indexed', () => {
    const commandsIndexed = [...cache.values()].some(s =>
      s.filePath.includes(path.join('ORCHESTRATION FRAMEWORK', 'commands', 'SKILL.md')));
    assert.ok(commandsIndexed,
      'ORCHESTRATION FRAMEWORK/commands/SKILL.md should be indexed');
  });

  // ----------------------------------------------------------------
  // Section 7: Composite key collision test
  // ----------------------------------------------------------------
  console.log('\n-- Composite Key Collision Test --');

  test('no cache key collisions (composite keys include category)', () => {
    const keys = [...cache.keys()];
    const compositeKeys = keys.filter(k => k.includes('/'));
    assert.ok(compositeKeys.length === keys.length,
      'Expected all keys to be composite (category/name), but ' +
      (keys.length - compositeKeys.length) + ' are bare names');
  });

  // ----------------------------------------------------------------
  // Section 8: Directory exclusion test
  // ----------------------------------------------------------------
  console.log('\n-- Directory Exclusion Test --');

  test('no skills indexed from node_modules directories', () => {
    const hasNodeModules = [...cache.values()].some(s =>
      s.filePath.includes('node_modules'));
    assert.ok(!hasNodeModules,
      'No skills should be indexed from node_modules directories');
  });

  test('no skills indexed from .git directories', () => {
    const hasGit = [...cache.values()].some(s =>
      s.filePath.includes(path.sep + '.git' + path.sep));
    assert.ok(!hasGit,
      'No skills should be indexed from .git directories');
  });

  // ----------------------------------------------------------------
  // Section 9: Subcategory field validation
  // ----------------------------------------------------------------
  console.log('\n-- Subcategory Field Validation --');

  test('all indexed skills have a subcategory field (may be empty)', () => {
    for (const [key, skill] of cache) {
      assert.ok(typeof skill.subcategory === 'string',
        'Skill "' + key + '" is missing subcategory field');
    }
  });

  test('some skills have non-empty subcategory', () => {
    const withSubcat = [...cache.values()].filter(s => s.subcategory.length > 0);
    assert.ok(withSubcat.length > 0,
      'Expected at least some skills to have a non-empty subcategory');
  });

  // ----------------------------------------------------------------
  // Section 10: SKILL.md format -- frontmatter structure
  // ----------------------------------------------------------------
  console.log('\n-- SKILL.md Format Validation --');

  test('all indexed skills have a name', () => {
    for (const [key, skill] of cache) {
      assert.ok(skill.name && skill.name.length > 0,
        'Skill keyed as "' + key + '" has empty name');
    }
  });

  test('all indexed skills have a description', () => {
    for (const [key, skill] of cache) {
      assert.ok(skill.description && skill.description.length > 0,
        'Skill "' + key + '" has empty description');
    }
  });

  test('all indexed skills have a category', () => {
    for (const [key, skill] of cache) {
      assert.ok(skill.category && skill.category.length > 0,
        'Skill "' + key + '" has empty category');
    }
  });

  test('all indexed skills have non-empty content', () => {
    for (const [key, skill] of cache) {
      assert.ok(skill.content && skill.content.length > 0,
        'Skill "' + key + '" has empty content');
    }
  });

  test('all indexed skills have a valid filePath', () => {
    for (const [key, skill] of cache) {
      assert.ok(fs.existsSync(skill.filePath),
        'Skill "' + key + '" filePath does not exist: ' + skill.filePath);
    }
  });

  // ----------------------------------------------------------------
  // Summary
  // ----------------------------------------------------------------
  console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===\n');

  if (failed > 0) {
    process.exit(1);
  }

  console.log('Skill Indexing Validation PASSED.');
}

run().catch(err => {
  console.error('Test suite crashed:', err);
  process.exit(1);
});
