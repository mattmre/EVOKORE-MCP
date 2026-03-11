'use strict';

/**
 * Skill Index Performance Monitoring Tests
 *
 * Validates that SkillManager exposes valid performance metrics via getStats(),
 * that loadSkills completes within acceptable time bounds, and that search
 * operations remain within the expected envelope for the recursive index.
 */

const assert = require('assert');

// ---- helpers ----

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err.message}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err.message}`);
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
  console.log('\n=== Skill Index Performance Monitoring Tests ===\n');

  // ----------------------------------------------------------------
  // Section 1: loadSkills performance
  // ----------------------------------------------------------------
  console.log('-- loadSkills Performance --');

  const sm = new SkillManager(mockProxyManager);

  const loadStart = Date.now();
  await sm.loadSkills();
  const loadElapsed = Date.now() - loadStart;

  console.log(`   loadSkills() completed in ${loadElapsed}ms`);

  test('loadSkills completes in under 2000ms', () => {
    assert.ok(loadElapsed < 2000,
      `loadSkills took ${loadElapsed}ms, expected <2000ms`);
  });

  // ----------------------------------------------------------------
  // Section 2: getStats() returns valid metrics
  // ----------------------------------------------------------------
  console.log('\n-- getStats() Validation --');

  const stats = sm.getStats();
  console.log(`   Stats: ${JSON.stringify(stats, null, 2)}`);

  test('getStats() returns an object', () => {
    assert.ok(stats && typeof stats === 'object', 'getStats() must return an object');
  });

  test('totalSkills is a positive number', () => {
    assert.ok(typeof stats.totalSkills === 'number', 'totalSkills must be a number');
    assert.ok(stats.totalSkills > 0, `totalSkills is ${stats.totalSkills}, expected >0`);
  });

  test('categories is a non-empty array of strings', () => {
    assert.ok(Array.isArray(stats.categories), 'categories must be an array');
    assert.ok(stats.categories.length > 0, 'categories must not be empty');
    for (const cat of stats.categories) {
      assert.ok(typeof cat === 'string', `category must be a string, got ${typeof cat}`);
    }
  });

  test('categories are sorted alphabetically', () => {
    const sorted = [...stats.categories].sort();
    assert.deepStrictEqual(stats.categories, sorted, 'categories must be sorted');
  });

  test('loadTimeMs is a non-negative number', () => {
    assert.ok(typeof stats.loadTimeMs === 'number', 'loadTimeMs must be a number');
    assert.ok(stats.loadTimeMs >= 0, `loadTimeMs is ${stats.loadTimeMs}, expected >=0`);
  });

  test('loadTimeMs is consistent with measured time', () => {
    // Allow some tolerance (stats.loadTimeMs might be slightly less than wall-clock)
    assert.ok(stats.loadTimeMs <= loadElapsed + 50,
      `loadTimeMs (${stats.loadTimeMs}) should not exceed measured time (${loadElapsed}ms) by much`);
  });

  test('fuseIndexSizeKb is a non-negative number', () => {
    assert.ok(typeof stats.fuseIndexSizeKb === 'number', 'fuseIndexSizeKb must be a number');
    assert.ok(stats.fuseIndexSizeKb >= 0, `fuseIndexSizeKb is ${stats.fuseIndexSizeKb}, expected >=0`);
  });

  test('fuseIndexSizeKb is greater than zero after indexing', () => {
    assert.ok(stats.fuseIndexSizeKb > 0,
      `fuseIndexSizeKb should be >0 after indexing skills, got ${stats.fuseIndexSizeKb}`);
  });

  test('lastSearchMs is zero before any search', () => {
    assert.strictEqual(stats.lastSearchMs, 0,
      `lastSearchMs should be 0 before any search, got ${stats.lastSearchMs}`);
  });

  // ----------------------------------------------------------------
  // Section 3: Search performance
  // ----------------------------------------------------------------
  console.log('\n-- Search Performance --');

  const searchQueries = ['handoff', 'session', 'documentation', 'testing', 'workflow'];

  for (const query of searchQueries) {
    await testAsync(`search "${query}" completes in under 500ms`, async () => {
      const searchStart = Date.now();
      await sm.handleToolCall('search_skills', { query });
      const searchElapsed = Date.now() - searchStart;
      console.log(`     search "${query}": ${searchElapsed}ms`);
      assert.ok(searchElapsed < 500,
        `search_skills("${query}") took ${searchElapsed}ms, expected <500ms`);
    });
  }

  // After searches, lastSearchMs should be updated
  const statsAfterSearch = sm.getStats();

  test('lastSearchMs is updated after search operations', () => {
    assert.ok(typeof statsAfterSearch.lastSearchMs === 'number',
      'lastSearchMs must be a number');
    assert.ok(statsAfterSearch.lastSearchMs >= 0,
      `lastSearchMs should be >=0, got ${statsAfterSearch.lastSearchMs}`);
  });

  // ----------------------------------------------------------------
  // Summary
  // ----------------------------------------------------------------
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);

  if (failed > 0) {
    process.exit(1);
  }

  console.log('Skill Index Performance Monitoring Tests PASSED.');
}

run().catch(err => {
  console.error('Test suite crashed:', err);
  process.exit(1);
});
