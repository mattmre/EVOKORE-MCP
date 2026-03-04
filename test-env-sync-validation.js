'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function run() {
  const syncPath = path.resolve(__dirname, 'scripts', 'sync-configs.js');
  const proxyPath = path.resolve(__dirname, 'src', 'ProxyManager.ts');
  const configPath = path.resolve(__dirname, 'mcp.config.json');
  const envExamplePath = path.resolve(__dirname, '.env.example');
  const gitignorePath = path.resolve(__dirname, '.gitignore');

  const syncScript = fs.readFileSync(syncPath, 'utf8');
  const proxySource = fs.readFileSync(proxyPath, 'utf8');
  const mcpConfig = fs.readFileSync(configPath, 'utf8');
  const envExample = fs.readFileSync(envExamplePath, 'utf8');
  const gitignore = fs.readFileSync(gitignorePath, 'utf8');

  // --- Existing assertions ---
  assert.match(syncScript, /const ENTRY_POINT = path\.join\(PROJECT_ROOT, 'dist', 'index\.js'\);/);
  assert.match(syncScript, /args: \[ENTRY_POINT\]/);
  assert.ok(proxySource.includes('const ENV_PLACEHOLDER_REGEX = /\\$\\{(\\w+)\\}/g;'), 'ProxyManager env placeholder regex should be present');
  assert.match(proxySource, /const resolvedEnv = this\.resolveServerEnv\(serverId, serverConfig\.env\);/);
  assert.match(proxySource, /Unresolved env placeholder\(s\) for child server '\$\{serverId\}' key '\$\{key\}':/);
  assert.match(proxySource, /missingVars\.add\(varName\);/);
  assert.match(mcpConfig, /\$\{ELEVENLABS_API_KEY\}/);
  assert.match(envExample, /ELEVENLABS_API_KEY=/);

  // --- New: Validate ALL ${} placeholders in mcp.config.json have .env.example entries ---
  const placeholderRegex = /\$\{(\w+)\}/g;
  const placeholders = new Set();
  let match;
  while ((match = placeholderRegex.exec(mcpConfig)) !== null) {
    placeholders.add(match[1]);
  }

  for (const varName of placeholders) {
    // Check that the variable name appears in .env.example (either as active or commented-out)
    const varPattern = new RegExp('(?:^|\\n)#?\\s*' + varName + '=');
    assert.ok(
      varPattern.test(envExample),
      `mcp.config.json references \${${varName}} but .env.example has no entry for ${varName}`
    );
  }
  console.log(`  Validated ${placeholders.size} placeholder(s) from mcp.config.json against .env.example.`);

  // --- New: Validate .env is in .gitignore ---
  // Strip any BOM and normalize line endings for robust matching
  const cleanGitignore = gitignore.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const gitignoreLines = cleanGitignore.split('\n').map(l => l.trim());
  assert.ok(
    gitignoreLines.includes('.env'),
    '.env must be listed in .gitignore to prevent secret leakage'
  );
  console.log('  Validated .env is present in .gitignore.');

  // --- New: Validate .gitignore has no BOM ---
  assert.ok(
    !gitignore.startsWith('\uFEFF'),
    '.gitignore must not have a UTF-16 BOM prefix'
  );
  console.log('  Validated .gitignore has clean UTF-8 encoding (no BOM).');

  console.log('Environment sync validation passed.');
}

try {
  run();
} catch (error) {
  console.error('Environment sync validation failed:', error);
  process.exit(1);
}
