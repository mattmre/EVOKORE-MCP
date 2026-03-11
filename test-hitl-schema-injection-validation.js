'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const distEntry = path.resolve(__dirname, 'dist', 'index.js');
const mockServerPath = path.resolve(__dirname, 'tests', 'helpers', 'mock-tool-discovery-server.js');
const tempConfigPath = path.join(os.tmpdir(), `evokore-hitl-schema-${process.pid}.json`);

function writeTestConfig() {
  fs.writeFileSync(tempConfigPath, JSON.stringify({
    servers: {
      mocksvc: {
        command: process.execPath,
        args: [mockServerPath]
      }
    }
  }, null, 2));
}

async function run() {
  console.log('Running HITL schema injection validation...');
  writeTestConfig();

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [distEntry],
    stderr: 'inherit',
    env: {
      ...process.env,
      EVOKORE_MCP_CONFIG_PATH: tempConfigPath,
      EVOKORE_TOOL_DISCOVERY_MODE: 'legacy'
    }
  });

  const client = new Client(
    { name: 'hitl-schema-validator', version: '1.0.0' },
    { capabilities: {} }
  );

  try {
    await client.connect(transport);
    const response = await client.listTools();

    const searchDocs = response.tools.find((tool) => tool.name === 'mocksvc_search_docs');
    const opsPing = response.tools.find((tool) => tool.name === 'mocksvc_ops_ping');

    assert.ok(searchDocs, 'mocksvc_search_docs should be present');
    assert.ok(opsPing, 'mocksvc_ops_ping should be present');

    assert.ok(searchDocs.inputSchema.properties._evokore_approval_token, 'existing object schemas should gain approval token field');
    assert.strictEqual(searchDocs.inputSchema.required.includes('_evokore_approval_token'), false, 'approval token must remain optional');

    assert.strictEqual(opsPing.inputSchema.type, 'object', 'schema-injected tool should remain object-typed');
    assert.ok(opsPing.inputSchema.properties, 'tool without properties should gain a properties object');
    assert.ok(opsPing.inputSchema.properties._evokore_approval_token, 'tool without properties should still advertise approval token field');

    console.log('HITL schema injection validation passed.');
  } finally {
    try {
      if (typeof client.close === 'function') {
        await client.close();
      }
    } finally {
      if (typeof transport.close === 'function') {
        await transport.close();
      }
      if (fs.existsSync(tempConfigPath)) {
        fs.unlinkSync(tempConfigPath);
      }
    }
  }
}

run().catch((error) => {
  console.error('HITL schema injection validation failed:', error);
  process.exit(1);
});
