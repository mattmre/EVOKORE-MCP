'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function run() {
  const syncPath = path.resolve(__dirname, 'scripts', 'sync-configs.js');
  const proxyPath = path.resolve(__dirname, 'src', 'ProxyManager.ts');
  const configPath = path.resolve(__dirname, 'mcp.config.json');
  const envExamplePath = path.resolve(__dirname, '.env.example');

  const syncScript = fs.readFileSync(syncPath, 'utf8');
  const proxySource = fs.readFileSync(proxyPath, 'utf8');
  const mcpConfig = fs.readFileSync(configPath, 'utf8');
  const envExample = fs.readFileSync(envExamplePath, 'utf8');

  assert.match(syncScript, /const ENTRY_POINT = path\.join\(PROJECT_ROOT, 'dist', 'index\.js'\);/);
  assert.match(syncScript, /args: \[ENTRY_POINT\]/);
  assert.ok(proxySource.includes('const ENV_PLACEHOLDER_REGEX = /\\$\\{(\\w+)\\}/g;'), 'ProxyManager env placeholder regex should be present');
  assert.match(proxySource, /const resolvedEnv = this\.resolveServerEnv\(serverId, serverConfig\.env\);/);
  assert.match(proxySource, /Unresolved env placeholder\(s\) for child server '\$\{serverId\}' key '\$\{key\}':/);
  assert.match(proxySource, /missingVars\.add\(varName\);/);
  assert.match(mcpConfig, /\$\{ELEVENLABS_API_KEY\}/);
  assert.match(envExample, /ELEVENLABS_API_KEY=/);

  console.log('Environment sync validation passed.');
}

try {
  run();
} catch (error) {
  console.error('Environment sync validation failed:', error);
  process.exit(1);
}
