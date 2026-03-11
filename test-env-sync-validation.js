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
  assert.match(syncScript, /const CANONICAL_PROJECT_ROOT = resolveCanonicalProjectRoot\(\);/);
  assert.match(syncScript, /const ENTRY_POINT = path\.join\(CANONICAL_PROJECT_ROOT, 'dist', 'index\.js'\);/);
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
    '.gitignore must not have a UTF-8 BOM prefix'
  );

  // --- New: Validate .gitignore has no UTF-16LE encoding corruption ---
  const gitignoreRaw = fs.readFileSync(gitignorePath);
  const hasUtf16Null = gitignoreRaw.some((byte, i) => byte === 0x00 && i > 0);
  assert.ok(
    !hasUtf16Null,
    '.gitignore contains null bytes — likely UTF-16LE corruption. Rewrite as clean UTF-8.'
  );
  console.log('  Validated .gitignore has clean UTF-8 encoding (no BOM, no UTF-16LE).');

  // --- New: Reverse-drift test — ensure all process.env references in src/ appear in .env.example ---
  const srcDir = path.resolve(__dirname, 'src');
  const srcFiles = fs.readdirSync(srcDir).filter(f => f.endsWith('.ts') || f.endsWith('.js'));
  const envRefRegex = /process\.env\.(\w+)/g;
  const envRefBracketRegex = /process\.env\[['"](\w+)['"]\]/g;
  const referencedVars = new Set();

  for (const file of srcFiles) {
    const content = fs.readFileSync(path.join(srcDir, file), 'utf8');
    let m;
    while ((m = envRefRegex.exec(content)) !== null) {
      referencedVars.add(m[1]);
    }
    while ((m = envRefBracketRegex.exec(content)) !== null) {
      referencedVars.add(m[1]);
    }
  }

  // Exclude dynamic/generic env access patterns (e.g., varName from a loop)
  const genericVars = new Set(['NODE_ENV', 'PATH', 'HOME', 'USERPROFILE']);
  const missingFromExample = [];
  for (const varName of referencedVars) {
    if (genericVars.has(varName)) continue;
    const varPattern = new RegExp('(?:^|\\n)#?\\s*' + varName + '=');
    if (!varPattern.test(envExample)) {
      missingFromExample.push(varName);
    }
  }
  assert.strictEqual(
    missingFromExample.length, 0,
    `src/ references env vars not documented in .env.example: ${missingFromExample.join(', ')}`
  );
  console.log(`  Reverse-drift check passed: ${referencedVars.size} env var(s) from src/ all present in .env.example.`);

  console.log('Environment sync validation passed.');
}

try {
  run();
} catch (error) {
  console.error('Environment sync validation failed:', error);
  process.exit(1);
}
