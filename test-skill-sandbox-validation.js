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
// Source-level validation: verify execute_skill structures exist
// ===================================================================

test('skill sandbox - source contains execute_skill tool definition', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'src/SkillManager.ts'), 'utf8');

  assert.match(src, /name:\s*["']execute_skill["']/,
    'Expected execute_skill tool name in SkillManager');
  assert.match(src, /extractCodeBlocks/,
    'Expected extractCodeBlocks method in SkillManager');
  assert.match(src, /executeCodeBlock/,
    'Expected executeCodeBlock method in SkillManager');
});

test('skill sandbox - source contains sandbox safety measures', () => {
  const smSrc = fs.readFileSync(path.resolve(__dirname, 'src/SkillManager.ts'), 'utf8');
  const csSrc = fs.readFileSync(path.resolve(__dirname, 'src/ContainerSandbox.ts'), 'utf8');
  const combined = smSrc + csSrc;

  // Timeout enforcement (may be in SkillManager sandbox options or ContainerSandbox)
  assert.match(combined, /timeout:\s*30000/,
    'Expected 30s timeout for sandboxed execution');
  // Max output size limit: SkillManager sets maxOutputSize, ContainerSandbox passes it as maxBuffer
  assert.match(smSrc, /maxOutputSize:\s*1024\s*\*\s*1024/,
    'Expected 1MB output limit in SkillManager sandbox options');
  assert.match(csSrc, /maxBuffer:\s*options\.maxOutputSize/,
    'Expected maxBuffer to use maxOutputSize in ContainerSandbox');
  // EVOKORE_SANDBOX env signal
  assert.match(combined, /EVOKORE_SANDBOX/,
    'Expected EVOKORE_SANDBOX environment variable injection');
  // Sandbox directory cleanup in finally block (in ContainerSandbox.ts)
  assert.match(csSrc, /finally\s*\{[\s\S]*?rmSync/,
    'Expected sandbox directory cleanup in finally block');
});

test('skill sandbox - destructiveHint annotation is true', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'src/SkillManager.ts'), 'utf8');

  // Find the execute_skill tool block and verify destructiveHint
  const toolBlockMatch = src.match(/name:\s*["']execute_skill["'][\s\S]*?annotations:\s*\{([\s\S]*?)\}/);
  assert.ok(toolBlockMatch, 'Expected to find execute_skill tool block with annotations');
  assert.match(toolBlockMatch[1], /destructiveHint:\s*true/,
    'Expected destructiveHint to be true for execute_skill');
});

// ===================================================================
// Runtime validation: getTools includes execute_skill
// ===================================================================

test('skill sandbox - getTools includes execute_skill', () => {
  const sm = new SkillManager(mockProxyManager);
  const tools = sm.getTools();
  const toolNames = tools.map(t => t.name);

  assert.ok(toolNames.includes('execute_skill'),
    'Expected execute_skill in tool list. Got: ' + toolNames.join(', '));
});

test('skill sandbox - execute_skill tool has correct schema', () => {
  const sm = new SkillManager(mockProxyManager);
  const tools = sm.getTools();
  const tool = tools.find(t => t.name === 'execute_skill');

  assert.ok(tool, 'Expected execute_skill tool to exist');
  assert.ok(tool.inputSchema, 'Expected inputSchema');
  assert.ok(tool.inputSchema.properties.skill_name, 'Expected skill_name property');
  assert.ok(tool.inputSchema.properties.step, 'Expected step property');
  assert.ok(tool.inputSchema.properties.env, 'Expected env property');
  assert.deepStrictEqual(tool.inputSchema.required, ['skill_name'],
    'Expected skill_name to be required');
  assert.ok(tool.annotations, 'Expected annotations');
  assert.strictEqual(tool.annotations.destructiveHint, true,
    'Expected destructiveHint to be true');
  assert.strictEqual(tool.annotations.openWorldHint, true,
    'Expected openWorldHint to be true');
  assert.strictEqual(tool.annotations.readOnlyHint, false,
    'Expected readOnlyHint to be false');
  assert.strictEqual(tool.annotations.idempotentHint, false,
    'Expected idempotentHint to be false');
});

// ===================================================================
// extractCodeBlocks: method validation
// ===================================================================

test('skill sandbox - extractCodeBlocks method exists', () => {
  const sm = new SkillManager(mockProxyManager);
  assert.strictEqual(typeof sm.extractCodeBlocks, 'function',
    'Expected extractCodeBlocks to be a function');
});

test('skill sandbox - extractCodeBlocks throws for unknown skill', () => {
  const sm = new SkillManager(mockProxyManager);

  assert.throws(
    () => sm.extractCodeBlocks('nonexistent-skill-xyz'),
    /Skill not found/,
    'Expected Skill not found error for unknown skill'
  );
});

// ===================================================================
// executeCodeBlock: method validation
// ===================================================================

test('skill sandbox - executeCodeBlock method exists', () => {
  const sm = new SkillManager(mockProxyManager);
  assert.strictEqual(typeof sm.executeCodeBlock, 'function',
    'Expected executeCodeBlock to be a function');
});

test('skill sandbox - executeCodeBlock throws for unknown skill', async () => {
  const sm = new SkillManager(mockProxyManager);

  await assert.rejects(
    () => sm.executeCodeBlock('nonexistent-skill-xyz', 0),
    /Skill not found/,
    'Expected Skill not found error for unknown skill'
  );
});

// ===================================================================
// Language executor mapping validation
// ===================================================================

test('skill sandbox - source supports expected languages', () => {
  // Executor mappings are now in ContainerSandbox.ts (ProcessSandbox class)
  const src = fs.readFileSync(path.resolve(__dirname, 'src/ContainerSandbox.ts'), 'utf8');

  const expectedLanguages = ['bash', 'sh', 'javascript', 'js', 'python', 'py', 'typescript', 'ts'];
  for (const lang of expectedLanguages) {
    assert.match(src, new RegExp('"' + lang + '"\\s*:'),
      'Expected executor mapping for language: ' + lang);
  }
});

test('skill sandbox - unsupported language error in source', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'src/SkillManager.ts'), 'utf8');

  assert.match(src, /Unsupported language for execution/,
    'Expected unsupported language error message');
});

// ===================================================================
// handleToolCall: execute_skill error paths
// ===================================================================

test('skill sandbox - handleToolCall execute_skill returns error for missing skill_name', async () => {
  const sm = new SkillManager(mockProxyManager);

  const result = await sm.handleToolCall('execute_skill', {});
  assert.ok(result.isError, 'Expected isError for missing skill_name');
  assert.ok(result.content[0].text.includes('skill_name'),
    'Expected error message about skill_name');
});

test('skill sandbox - handleToolCall execute_skill returns error for empty skill_name', async () => {
  const sm = new SkillManager(mockProxyManager);

  const result = await sm.handleToolCall('execute_skill', { skill_name: '  ' });
  assert.ok(result.isError, 'Expected isError for empty skill_name');
});

// ===================================================================
// index.ts wiring: execute_skill routes through native tool handler
// ===================================================================

test('skill sandbox - index.ts routes execute_skill through native tool handler', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'src/index.ts'), 'utf8');

  // execute_skill should be handled by the native tool path (isNativeTool -> handleToolCall)
  // Verify the generic native tool routing is present
  assert.match(src, /isNativeTool/,
    'Expected isNativeTool check in index.ts');
  assert.match(src, /handleToolCall/,
    'Expected handleToolCall delegation in index.ts');
});
