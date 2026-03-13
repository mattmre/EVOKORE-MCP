'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// ---- load SkillManager from dist ----
const { SkillManager } = require('./dist/SkillManager');

const mockProxyManager = {
  callProxiedTool: async () => ({ content: [{ type: 'text', text: '' }] })
};

// ===================================================================
// Source-level validation: verify the new code structures exist
// ===================================================================

test('remote skill registry - source contains fetch_skill tool definition', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'src/SkillManager.ts'), 'utf8');

  assert.match(src, /name:\s*["']fetch_skill["']/,
    'Expected fetch_skill tool name in SkillManager');
  assert.match(src, /name:\s*["']list_registry["']/,
    'Expected list_registry tool name in SkillManager');
  assert.match(src, /fetchRemoteSkill/,
    'Expected fetchRemoteSkill method in SkillManager');
  assert.match(src, /listRegistrySkills/,
    'Expected listRegistrySkills method in SkillManager');
  assert.match(src, /httpGet/,
    'Expected httpGet method in SkillManager');
  assert.match(src, /loadRegistriesFromConfig/,
    'Expected loadRegistriesFromConfig method');
});

test('remote skill registry - source contains security measures', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'src/SkillManager.ts'), 'utf8');

  // URL protocol validation
  assert.match(src, /Only HTTP\/HTTPS/,
    'Expected protocol validation error message');
  // Size limit
  assert.match(src, /MAX_FETCH_SIZE/,
    'Expected MAX_FETCH_SIZE constant');
  // Redirect limit
  assert.match(src, /MAX_REDIRECT_DEPTH/,
    'Expected MAX_REDIRECT_DEPTH constant');
  // Path traversal check
  assert.match(src, /Path traversal/i,
    'Expected path traversal protection');
  // Frontmatter validation
  assert.match(src, /frontmatter/i,
    'Expected frontmatter validation');
});

test('remote skill registry - index.ts wires fetch_skill with auto-refresh', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'src/index.ts'), 'utf8');

  assert.match(src, /fetch_skill/,
    'Expected fetch_skill handling in index.ts');
  assert.match(src, /handleFetchSkill/,
    'Expected handleFetchSkill method in index.ts');
  assert.match(src, /auto-refresh|auto.*refresh|Index auto-refreshed/i,
    'Expected auto-refresh after fetch_skill in index.ts');
});

test('remote skill registry - mcp.config.json has skillRegistries field', () => {
  const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'mcp.config.json'), 'utf8'));

  assert.ok(Array.isArray(config.skillRegistries),
    'Expected skillRegistries to be an array in mcp.config.json');
});

// ===================================================================
// Runtime validation: verify getTools returns the new tools
// ===================================================================

test('remote skill registry - getTools includes fetch_skill and list_registry', () => {
  const sm = new SkillManager(mockProxyManager);
  const tools = sm.getTools();
  const toolNames = tools.map(t => t.name);

  assert.ok(toolNames.includes('fetch_skill'),
    'Expected fetch_skill in tool list. Got: ' + toolNames.join(', '));
  assert.ok(toolNames.includes('list_registry'),
    'Expected list_registry in tool list. Got: ' + toolNames.join(', '));
});

test('remote skill registry - fetch_skill tool has correct schema', () => {
  const sm = new SkillManager(mockProxyManager);
  const tools = sm.getTools();
  const fetchTool = tools.find(t => t.name === 'fetch_skill');

  assert.ok(fetchTool, 'Expected fetch_skill tool to exist');
  assert.ok(fetchTool.inputSchema, 'Expected inputSchema');
  assert.ok(fetchTool.inputSchema.properties.url, 'Expected url property');
  assert.ok(fetchTool.inputSchema.properties.category, 'Expected category property');
  assert.ok(fetchTool.inputSchema.properties.name, 'Expected name property');
  assert.ok(fetchTool.inputSchema.properties.overwrite, 'Expected overwrite property');
  assert.deepStrictEqual(fetchTool.inputSchema.required, ['url'],
    'Expected url to be required');
  assert.ok(fetchTool.annotations, 'Expected annotations');
  assert.strictEqual(fetchTool.annotations.openWorldHint, true,
    'Expected openWorldHint to be true (network access)');
});

test('remote skill registry - list_registry tool has correct schema', () => {
  const sm = new SkillManager(mockProxyManager);
  const tools = sm.getTools();
  const listTool = tools.find(t => t.name === 'list_registry');

  assert.ok(listTool, 'Expected list_registry tool to exist');
  assert.ok(listTool.inputSchema, 'Expected inputSchema');
  assert.ok(listTool.inputSchema.properties.registry, 'Expected registry property');
  assert.ok(listTool.annotations, 'Expected annotations');
  assert.strictEqual(listTool.annotations.readOnlyHint, true,
    'Expected readOnlyHint to be true');
});

// ===================================================================
// fetchRemoteSkill: validation error cases
// ===================================================================

test('remote skill registry - fetchRemoteSkill rejects invalid URL', async () => {
  const sm = new SkillManager(mockProxyManager);

  await assert.rejects(
    () => sm.fetchRemoteSkill('not-a-url'),
    /Invalid URL/,
    'Expected invalid URL error'
  );
});

test('remote skill registry - fetchRemoteSkill rejects non-HTTP protocols', async () => {
  const sm = new SkillManager(mockProxyManager);

  await assert.rejects(
    () => sm.fetchRemoteSkill('ftp://example.com/skill.md'),
    /Only HTTP\/HTTPS/,
    'Expected protocol error'
  );

  await assert.rejects(
    () => sm.fetchRemoteSkill('file:///etc/passwd'),
    /Only HTTP\/HTTPS/,
    'Expected protocol error for file://'
  );
});

test('remote skill registry - handleToolCall fetch_skill returns error for missing url', async () => {
  const sm = new SkillManager(mockProxyManager);

  const result = await sm.handleToolCall('fetch_skill', {});
  assert.ok(result.isError, 'Expected isError for missing url');
  assert.ok(result.content[0].text.includes('url'),
    'Expected error message about url');
});

test('remote skill registry - handleToolCall fetch_skill returns error for empty url', async () => {
  const sm = new SkillManager(mockProxyManager);

  const result = await sm.handleToolCall('fetch_skill', { url: '  ' });
  assert.ok(result.isError, 'Expected isError for empty url');
});

// ===================================================================
// listRegistrySkills: empty registries
// ===================================================================

test('remote skill registry - listRegistrySkills returns empty for no registries', async () => {
  const sm = new SkillManager(mockProxyManager);
  const entries = await sm.listRegistrySkills();
  assert.ok(Array.isArray(entries), 'Expected array result');
  // With the empty array in mcp.config.json, this should be []
  assert.strictEqual(entries.length, 0, 'Expected 0 entries for empty registry config');
});

test('remote skill registry - handleToolCall list_registry handles empty registries', async () => {
  const sm = new SkillManager(mockProxyManager);
  const result = await sm.handleToolCall('list_registry', {});

  assert.ok(!result.isError, 'Expected no error for empty registries');
  assert.ok(result.content[0].text.includes('No skill registries') || result.content[0].text.includes('No skills found'),
    'Expected informative message for no registries. Got: ' + result.content[0].text);
});

test('remote skill registry - handleToolCall list_registry handles named registry not found', async () => {
  const sm = new SkillManager(mockProxyManager);
  const result = await sm.handleToolCall('list_registry', { registry: 'nonexistent' });

  assert.ok(!result.isError, 'Expected no error');
  assert.ok(result.content[0].text.includes('No skills found') || result.content[0].text.includes('nonexistent'),
    'Expected message about missing registry');
});

// ===================================================================
// Exports and interface validation
// ===================================================================

test('remote skill registry - exported interfaces from dist', () => {
  const mod = require('./dist/SkillManager');

  // The class itself should be exported
  assert.ok(mod.SkillManager, 'Expected SkillManager export');

  // Create an instance and check the new methods exist
  const sm = new mod.SkillManager(mockProxyManager);
  assert.strictEqual(typeof sm.fetchRemoteSkill, 'function',
    'Expected fetchRemoteSkill to be a function');
  assert.strictEqual(typeof sm.listRegistrySkills, 'function',
    'Expected listRegistrySkills to be a function');
});
