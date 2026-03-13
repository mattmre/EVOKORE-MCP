'use strict';

const assert = require('assert');

const RECOMMENDED_LOAD_MS = 2000;
const HARD_LOAD_MS = 45000;
const RECOMMENDED_SEARCH_MS = 500;
const HARD_SEARCH_MS = 1500;

// ---- load SkillManager from dist ----

const { SkillManager } = require('./dist/SkillManager');

// SkillManager requires a proxyManager in its constructor but loadSkills()
// does not use it. Provide a no-op stub.
const mockProxyManager = {
  callProxiedTool: async () => ({ content: [{ type: 'text', text: '' }] })
};

test('skill index performance monitoring', async () => {
  // ----------------------------------------------------------------
  // Section 1: loadSkills performance
  // ----------------------------------------------------------------
  const sm = new SkillManager(mockProxyManager);

  const loadStart = Date.now();
  await sm.loadSkills();
  const loadElapsed = Date.now() - loadStart;

  if (loadElapsed > RECOMMENDED_LOAD_MS) {
    console.warn(`   WARN  loadSkills exceeded recommended warm-path target (${RECOMMENDED_LOAD_MS}ms).`);
  }

  assert.ok(loadElapsed < HARD_LOAD_MS,
    `loadSkills took ${loadElapsed}ms, expected <${HARD_LOAD_MS}ms`);

  // ----------------------------------------------------------------
  // Section 2: getStats() returns valid metrics
  // ----------------------------------------------------------------
  const stats = sm.getStats();

  assert.ok(stats && typeof stats === 'object', 'getStats() must return an object');

  assert.ok(typeof stats.totalSkills === 'number', 'totalSkills must be a number');
  assert.ok(stats.totalSkills > 0, `totalSkills is ${stats.totalSkills}, expected >0`);

  assert.ok(Array.isArray(stats.categories), 'categories must be an array');
  assert.ok(stats.categories.length > 0, 'categories must not be empty');
  for (const cat of stats.categories) {
    assert.ok(typeof cat === 'string', `category must be a string, got ${typeof cat}`);
  }

  const sorted = [...stats.categories].sort();
  assert.deepStrictEqual(stats.categories, sorted, 'categories must be sorted');

  assert.ok(typeof stats.loadTimeMs === 'number', 'loadTimeMs must be a number');
  assert.ok(stats.loadTimeMs >= 0, `loadTimeMs is ${stats.loadTimeMs}, expected >=0`);

  // Allow some tolerance (stats.loadTimeMs might be slightly less than wall-clock)
  assert.ok(stats.loadTimeMs <= loadElapsed + 50,
    `loadTimeMs (${stats.loadTimeMs}) should not exceed measured time (${loadElapsed}ms) by much`);

  assert.ok(typeof stats.fuseIndexSizeKb === 'number', 'fuseIndexSizeKb must be a number');
  assert.ok(stats.fuseIndexSizeKb >= 0, `fuseIndexSizeKb is ${stats.fuseIndexSizeKb}, expected >=0`);

  assert.ok(stats.fuseIndexSizeKb > 0,
    `fuseIndexSizeKb should be >0 after indexing skills, got ${stats.fuseIndexSizeKb}`);

  assert.strictEqual(stats.lastSearchMs, 0,
    `lastSearchMs should be 0 before any search, got ${stats.lastSearchMs}`);

  // ----------------------------------------------------------------
  // Section 3: Search performance
  // ----------------------------------------------------------------
  const searchQueries = ['handoff', 'session', 'documentation', 'testing', 'workflow'];

  for (const query of searchQueries) {
    const searchStart = Date.now();
    await sm.handleToolCall('search_skills', { query });
    const searchElapsed = Date.now() - searchStart;
    if (searchElapsed > RECOMMENDED_SEARCH_MS) {
      console.warn(`     WARN  search "${query}" exceeded recommended target (${RECOMMENDED_SEARCH_MS}ms).`);
    }
    assert.ok(searchElapsed < HARD_SEARCH_MS,
      `search_skills("${query}") took ${searchElapsed}ms, expected <${HARD_SEARCH_MS}ms`);
  }

  // After searches, lastSearchMs should be updated
  const statsAfterSearch = sm.getStats();

  assert.ok(typeof statsAfterSearch.lastSearchMs === 'number',
    'lastSearchMs must be a number');
  assert.ok(statsAfterSearch.lastSearchMs >= 0,
    `lastSearchMs should be >=0, got ${statsAfterSearch.lastSearchMs}`);
});
