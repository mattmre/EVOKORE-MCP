'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// ---- Section 1: Source-level contract checks ----

test('skill hot-reload: refreshSkills method exists in SkillManager', () => {
  const skillMgr = fs.readFileSync(path.resolve(__dirname, 'src/SkillManager.ts'), 'utf8');

  // refreshSkills method signature
  assert.match(skillMgr, /async\s+refreshSkills\(\)/,
    'Expected async refreshSkills() method in SkillManager.ts');

  // Returns refresh result with added/removed/total
  assert.match(skillMgr, /added/,
    'Expected "added" in refreshSkills return');
  assert.match(skillMgr, /removed/,
    'Expected "removed" in refreshSkills return');
  assert.match(skillMgr, /total/,
    'Expected "total" in refreshSkills return');
  assert.match(skillMgr, /refreshTimeMs/,
    'Expected "refreshTimeMs" in refreshSkills return');
});

test('skill hot-reload: refresh_skills tool definition exists', () => {
  const skillMgr = fs.readFileSync(path.resolve(__dirname, 'src/SkillManager.ts'), 'utf8');

  assert.match(skillMgr, /name:\s*["']refresh_skills["']/,
    'Expected refresh_skills tool definition in getTools()');
  assert.match(skillMgr, /Refresh.*skill.*index/i,
    'Expected refresh_skills description to mention refreshing the skill index');
  assert.match(skillMgr, /idempotentHint:\s*true/,
    'Expected refresh_skills to be marked idempotent');
});

test('skill hot-reload: index.ts handles refresh_skills tool call', () => {
  const indexTs = fs.readFileSync(path.resolve(__dirname, 'src/index.ts'), 'utf8');

  assert.match(indexTs, /refresh_skills/,
    'Expected refresh_skills handling in index.ts');
  assert.match(indexTs, /handleRefreshSkills/,
    'Expected handleRefreshSkills method in index.ts');
  assert.match(indexTs, /rebuildToolCatalog/,
    'Expected rebuildToolCatalog call after skill refresh');
  assert.match(indexTs, /sendToolListChanged/,
    'Expected sendToolListChanged notification after skill refresh');
});

test('skill hot-reload: filesystem watcher support', () => {
  const skillMgr = fs.readFileSync(path.resolve(__dirname, 'src/SkillManager.ts'), 'utf8');

  assert.match(skillMgr, /enableWatcher/,
    'Expected enableWatcher method in SkillManager.ts');
  assert.match(skillMgr, /disableWatcher/,
    'Expected disableWatcher method in SkillManager.ts');
  assert.match(skillMgr, /debounce/i,
    'Expected debounce logic in watcher implementation');
  assert.match(skillMgr, /setOnRefreshCallback/,
    'Expected setOnRefreshCallback method in SkillManager.ts');
  assert.match(skillMgr, /recursive:\s*true/,
    'Expected recursive fs.watch option');
});

test('skill hot-reload: watcher is opt-in via env var', () => {
  const indexTs = fs.readFileSync(path.resolve(__dirname, 'src/index.ts'), 'utf8');

  assert.match(indexTs, /EVOKORE_SKILL_WATCHER/,
    'Expected EVOKORE_SKILL_WATCHER env var check in index.ts');
});

test('skill hot-reload: SkillRefreshResult interface is exported', () => {
  const skillMgr = fs.readFileSync(path.resolve(__dirname, 'src/SkillManager.ts'), 'utf8');

  assert.match(skillMgr, /export\s+interface\s+SkillRefreshResult/,
    'Expected SkillRefreshResult interface to be exported');
});

// ---- Section 2: Runtime validation via dist (if available) ----

test('skill hot-reload: refreshSkills runtime validation', async () => {
  let SkillManager;
  try {
    ({ SkillManager } = require('./dist/SkillManager'));
  } catch {
    // dist not built yet, skip runtime tests
    console.error('[SKIP] dist/SkillManager not available, skipping runtime validation');
    return;
  }

  const mockProxyManager = {
    callProxiedTool: async () => ({ content: [{ type: 'text', text: '' }] })
  };

  const sm = new SkillManager(mockProxyManager);

  // Load skills initially
  await sm.loadSkills();
  const initialCount = sm.getSkillCount();
  assert.ok(initialCount > 0, 'Expected skills to be loaded initially');

  // Call refreshSkills and verify the result shape
  const result = await sm.refreshSkills();
  assert.ok(typeof result.added === 'number', 'Expected added to be a number');
  assert.ok(typeof result.removed === 'number', 'Expected removed to be a number');
  assert.ok(typeof result.updated === 'number', 'Expected updated to be a number');
  assert.ok(typeof result.total === 'number', 'Expected total to be a number');
  assert.ok(typeof result.refreshTimeMs === 'number', 'Expected refreshTimeMs to be a number');

  // After refresh, count should be the same (no filesystem changes)
  assert.strictEqual(result.total, initialCount,
    'Expected total to match initial count when no filesystem changes occurred');
  assert.strictEqual(result.added, 0,
    'Expected 0 added when no filesystem changes occurred');
  assert.strictEqual(result.removed, 0,
    'Expected 0 removed when no filesystem changes occurred');

  // Verify refresh_skills is in the tool list
  const tools = sm.getTools();
  const refreshTool = tools.find(t => t.name === 'refresh_skills');
  assert.ok(refreshTool, 'Expected refresh_skills tool in getTools() output');
  assert.ok(refreshTool.description.toLowerCase().includes('refresh'),
    'Expected refresh_skills description to mention refreshing');
});
