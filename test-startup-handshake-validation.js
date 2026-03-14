'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

test('server initialize is not blocked by a slow or invalid child server', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-startup-'));
  const tempConfigPath = path.join(tempRoot, 'mcp.config.json');

  fs.writeFileSync(tempConfigPath, JSON.stringify({
    servers: {
      slowpoke: {
        command: 'node',
        args: ['-e', 'setTimeout(() => process.exit(0), 8000)']
      }
    }
  }, null, 2));

  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/index.js'],
    env: {
      ...process.env,
      EVOKORE_MCP_CONFIG_PATH: tempConfigPath,
      EVOKORE_CHILD_SERVER_BOOT_TIMEOUT_MS: '2000'
    },
    stderr: 'pipe'
  });

  const client = new Client({ name: 'startup-validation', version: '0.0.0' });
  const stderrChunks = [];

  transport.stderr?.on('data', (chunk) => {
    stderrChunks.push(String(chunk));
  });

  const startedAt = Date.now();

  try {
    await client.connect(transport);
    const connectElapsedMs = Date.now() - startedAt;
    expect(connectElapsedMs).toBeLessThan(5000);

    const { tools } = await client.listTools();
    const toolNames = tools.map((tool) => tool.name);
    expect(toolNames).toContain('proxy_server_status');
    expect(toolNames).toContain('search_skills');
  } finally {
    await client.close().catch(() => {});
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  const stderrText = stderrChunks.join('');
  expect(stderrText).toMatch(/Enterprise Router running on stdio/);
});
