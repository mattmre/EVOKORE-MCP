'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function run() {
  const proxyPath = path.resolve(__dirname, 'src', 'ProxyManager.ts');
  const usagePath = path.resolve(__dirname, 'docs', 'USAGE.md');
  const troubleshootingPath = path.resolve(__dirname, 'docs', 'TROUBLESHOOTING.md');

  const proxySource = fs.readFileSync(proxyPath, 'utf8');
  const usage = fs.readFileSync(usagePath, 'utf8');
  const troubleshooting = fs.readFileSync(troubleshootingPath, 'utf8');

  assert.match(proxySource, /private resolveServerEnv\(serverId: string, serverEnv\?: Record<string, string>\): Record<string, string>/);
  assert.match(proxySource, /const missingVars = new Set<string>\(\);/);
  assert.match(proxySource, /if \(envValue === undefined\) \{/);
  assert.match(proxySource, /missingVars\.add\(varName\);/);
  assert.match(proxySource, /throw new Error\(`Unresolved env placeholder\(s\) for child server '\$\{serverId\}' key '\$\{key\}': \$\{missingList\}`\);/);
  assert.match(proxySource, /Failed to boot child server '\$\{serverId\}': \$\{e\.message\}/);

  assert.match(usage, /unresolved.*fails fast.*child server/i);
  assert.match(troubleshooting, /Unresolved env placeholder\(s\) for child server/i);
  assert.match(troubleshooting, /\$\{[A-Z0-9_]+\}/);

  console.log('Unresolved env placeholder validation passed.');
}

try {
  run();
} catch (error) {
  console.error('Unresolved env placeholder validation failed:', error);
  process.exit(1);
}
