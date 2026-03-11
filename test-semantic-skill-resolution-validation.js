'use strict';

const assert = require('assert');

const { SkillManager } = require('./dist/SkillManager');

const mockProxyManager = {
  callProxiedTool: async () => ({ content: [{ type: 'text', text: '' }] })
};

async function run() {
  console.log('Running semantic skill resolution validation...');

  const sm = new SkillManager(mockProxyManager);
  await sm.loadSkills();

  const wrapQuery = await sm.handleToolCall('search_skills', { query: 'wrap up session handoff' });
  const wrapText = wrapQuery.content[0].text.toLowerCase();
  assert(
    wrapText.includes('session-wrap') || wrapText.includes('handoff-protocol'),
    'Expected natural-language handoff query to surface session-wrap or handoff-protocol.'
  );

  const mcpQuery = await sm.handleToolCall('search_skills', { query: 'create a new MCP server' });
  const mcpText = mcpQuery.content[0].text.toLowerCase();
  assert(
    mcpText.includes('mcp-builder'),
    'Expected MCP server objective to surface the primary mcp-builder skill.'
  );

  const workflowResolution = await sm.handleToolCall('resolve_workflow', { objective: 'wrap up session handoff' });
  const workflowText = workflowResolution.content[0].text.toLowerCase();
  assert(
    workflowText.includes('why matched:'),
    'Expected resolve_workflow to explain why a skill matched the objective.'
  );
  assert(
    workflowText.includes('activated_skill'),
    'Expected resolve_workflow to inject activated skill content.'
  );

  console.log('Semantic skill resolution validation passed.');
}

run().catch((error) => {
  console.error('Semantic skill resolution validation failed:', error);
  process.exit(1);
});
