'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// ---- load SkillManager from dist ----

const { SkillManager } = require('./dist/SkillManager');

// SkillManager requires a proxyManager in its constructor but loadSkills()
// does not use it. Provide a no-op stub.
const mockProxyManager = {
  callProxiedTool: async () => ({ content: [{ type: 'text', text: '' }] })
};

test('skill indexing validation (recursive)', async () => {
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
  const indexedCount = cache.size;

  assert.ok(indexedCount >= 100,
    'Expected >=100 indexed skills with recursive traversal, got ' + indexedCount);

  assert.ok(loadTimeMs < 10000,
    'Expected loadSkills to complete in <10s, took ' + loadTimeMs + 'ms');

  // ----------------------------------------------------------------
  // Section 2: Category coverage
  // ----------------------------------------------------------------
  const categories = new Set();
  for (const skill of cache.values()) {
    categories.add(skill.category);
  }

  const expectedCategories = [
    'GENERAL CODING WORKFLOWS',
    'ORCHESTRATION FRAMEWORK',
    'DEVELOPER TOOLS',
    'AUTOMATION AND PRODUCTIVITY',
    'WSHOBSON PLUGINS'
  ];

  for (const cat of expectedCategories) {
    assert.ok(categories.has(cat),
      'Expected category "' + cat + '" in indexed skills');
  }

  // ----------------------------------------------------------------
  // Section 3: Search quality (search_skills via Fuse.js)
  // ----------------------------------------------------------------
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
  }

  // ----------------------------------------------------------------
  // Section 4: resolve_workflow validation
  // ----------------------------------------------------------------
  const wrapResult = await sm.handleToolCall('resolve_workflow', { objective: 'wrap up session' });
  const wrapText = wrapResult.content[0].text;
  assert.ok(wrapText.includes('EVOKORE-MCP injected'),
    'Expected resolve_workflow to inject workflows');
  assert.ok(wrapText.includes('activated_skill'),
    'Expected resolve_workflow response to contain activated_skill tags');

  const docsResult = await sm.handleToolCall('resolve_workflow', { objective: 'create documentation' });
  const docsText = docsResult.content[0].text;
  assert.ok(docsText.includes('WORKFLOW:'),
    'Expected resolve_workflow to return at least one WORKFLOW block');

  // ----------------------------------------------------------------
  // Section 5: get_skill_help validation
  // ----------------------------------------------------------------
  const knownSkillKeys = [...cache.keys()].slice(0, 3);

  if (knownSkillKeys.length > 0) {
    const testSkillKey = knownSkillKeys[0];
    const helpResult = await sm.handleToolCall('get_skill_help', { skill_name: testSkillKey });
    const helpText = helpResult.content[0].text;
    assert.ok(helpText.includes('Skill Overview'),
      'Expected get_skill_help response to contain "Skill Overview"');
    assert.ok(helpText.includes('Internal Instructions'),
      'Expected get_skill_help response to contain "Internal Instructions"');
  }

  // Test bare name lookup (without category prefix)
  const firstSkill = [...cache.values()][0];
  assert.ok(firstSkill, 'No skills indexed');
  const bareResult = await sm.handleToolCall('get_skill_help', { skill_name: firstSkill.name });
  const bareText = bareResult.content[0].text;
  assert.ok(bareText.includes('Skill Overview'),
    'Expected bare name lookup to return skill help');

  const notFoundResult = await sm.handleToolCall('get_skill_help', { skill_name: 'zzz-nonexistent-skill-zzz' });
  const notFoundText = notFoundResult.content[0].text;
  assert.ok(notFoundText.includes('Could not find'),
    'Expected not-found message for nonexistent skill');

  // ----------------------------------------------------------------
  // Section 6: Recursive depth -- deeply nested skills ARE now indexed
  // ----------------------------------------------------------------
  const orchTddPath = path.resolve(__dirname, 'SKILLS', 'ORCHESTRATION FRAMEWORK',
    'commands', 'orch-tdd', 'SKILL.md');
  const orchTddExists = fs.existsSync(orchTddPath);

  assert.ok(orchTddExists,
    'Expected ' + orchTddPath + ' to exist on disk for this test to be meaningful');

  const hasOrchTdd = [...cache.keys()].some(k => k.includes('orch-tdd')) ||
                     [...cache.values()].some(s => s.filePath.includes('orch-tdd'));
  assert.ok(hasOrchTdd,
    'orch-tdd should be indexed with recursive traversal');

  // WSHOBSON PLUGINS reachability: skills at depth 3
  const wshobsonSkills = [...cache.values()].filter(s =>
    s.category === 'WSHOBSON PLUGINS');
  assert.ok(wshobsonSkills.length > 20,
    'Expected >20 WSHOBSON PLUGINS skills, got ' + wshobsonSkills.length);

  const commandsIndexed = [...cache.values()].some(s =>
    s.filePath.includes(path.join('ORCHESTRATION FRAMEWORK', 'commands', 'SKILL.md')));
  assert.ok(commandsIndexed,
    'ORCHESTRATION FRAMEWORK/commands/SKILL.md should be indexed');

  // ----------------------------------------------------------------
  // Section 7: Composite key collision test
  // ----------------------------------------------------------------
  const keys = [...cache.keys()];
  const compositeKeys = keys.filter(k => k.includes('/'));
  assert.ok(compositeKeys.length === keys.length,
    'Expected all keys to be composite (category/name), but ' +
    (keys.length - compositeKeys.length) + ' are bare names');

  // ----------------------------------------------------------------
  // Section 8: Directory exclusion test
  // ----------------------------------------------------------------
  const hasNodeModules = [...cache.values()].some(s =>
    s.filePath.includes('node_modules'));
  assert.ok(!hasNodeModules,
    'No skills should be indexed from node_modules directories');

  const hasGit = [...cache.values()].some(s =>
    s.filePath.includes(path.sep + '.git' + path.sep));
  assert.ok(!hasGit,
    'No skills should be indexed from .git directories');

  // ----------------------------------------------------------------
  // Section 9: Subcategory field validation
  // ----------------------------------------------------------------
  for (const [key, skill] of cache) {
    assert.ok(typeof skill.subcategory === 'string',
      'Skill "' + key + '" is missing subcategory field');
  }

  const withSubcat = [...cache.values()].filter(s => s.subcategory.length > 0);
  assert.ok(withSubcat.length > 0,
    'Expected at least some skills to have a non-empty subcategory');

  // ----------------------------------------------------------------
  // Section 10: SKILL.md format -- frontmatter structure
  // ----------------------------------------------------------------
  for (const [key, skill] of cache) {
    assert.ok(skill.name && skill.name.length > 0,
      'Skill keyed as "' + key + '" has empty name');
  }

  for (const [key, skill] of cache) {
    assert.ok(skill.description && skill.description.length > 0,
      'Skill "' + key + '" has empty description');
  }

  for (const [key, skill] of cache) {
    assert.ok(skill.category && skill.category.length > 0,
      'Skill "' + key + '" has empty category');
  }

  for (const [key, skill] of cache) {
    assert.ok(skill.content && skill.content.length > 0,
      'Skill "' + key + '" has empty content');
  }

  for (const [key, skill] of cache) {
    assert.ok(fs.existsSync(skill.filePath),
      'Skill "' + key + '" filePath does not exist: ' + skill.filePath);
  }
});
