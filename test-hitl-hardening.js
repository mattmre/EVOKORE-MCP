'use strict';


const path = require('path');
const fs = require('fs');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

function extractToken(text) {
  const match = String(text || '').match(/_evokore_approval_token' with the value '([^']+)'/);
  return match && match[1] ? match[1] : null;
}

async function callWrite(client, args) {
  return client.callTool({
    name: 'fs_write_file',
    arguments: args
  });
}

test('HITL hardening validation', async () => {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/index.js'],
    stderr: 'inherit'
  });

  const client = new Client(
    { name: 'hitl-hardening-validator', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);

  const testFile = path.resolve(__dirname, 'test-hitl-hardening-output.txt');
  const baseArgs = { path: testFile, content: 'first write' };

  // 1) First call should require approval token
  const first = await callWrite(client, baseArgs);
  if (!first.isError) {
    throw new Error('Expected initial call to require approval token.');
  }
  const firstText = first.content && first.content[0] ? first.content[0].text : '';
  const token1 = extractToken(firstText);
  if (!token1) {
    throw new Error('Failed to extract first approval token.');
  }

  // 2) Same args + token succeeds
  const approved = await callWrite(client, {
    ...baseArgs,
    _evokore_approval_token: token1
  });
  if (approved.isError) {
    throw new Error('Expected approved call to succeed.');
  }

  // 3) Replay same token fails (one-time token)
  const replay = await callWrite(client, {
    ...baseArgs,
    _evokore_approval_token: token1
  });
  if (!replay.isError) {
    throw new Error('Expected replayed token to fail.');
  }

  // 4) Token is bound to exact args; changed args with same token should fail
  const secondIntercept = await callWrite(client, {
    path: testFile,
    content: 'second write'
  });
  if (!secondIntercept.isError) {
    throw new Error('Expected second call to require approval token.');
  }
  const secondText = secondIntercept.content && secondIntercept.content[0] ? secondIntercept.content[0].text : '';
  const token2 = extractToken(secondText);
  if (!token2) {
    throw new Error('Failed to extract second approval token.');
  }

  const mismatchedArgs = await callWrite(client, {
    path: testFile,
    content: 'modified payload',
    _evokore_approval_token: token2
  });
  if (!mismatchedArgs.isError) {
    throw new Error('Expected mismatched args + token to fail.');
  }

  if (fs.existsSync(testFile)) {
    fs.unlinkSync(testFile);
  }
});
