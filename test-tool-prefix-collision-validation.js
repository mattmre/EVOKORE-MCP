'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function run() {
  const proxyPath = path.resolve(__dirname, 'src', 'ProxyManager.ts');
  const docsReadmePath = path.resolve(__dirname, 'docs', 'README.md');
  const usagePath = path.resolve(__dirname, 'docs', 'USAGE.md');
  const troubleshootingPath = path.resolve(__dirname, 'docs', 'TROUBLESHOOTING.md');

  const proxySource = fs.readFileSync(proxyPath, 'utf8');
  const docsReadme = fs.readFileSync(docsReadmePath, 'utf8');
  const usage = fs.readFileSync(usagePath, 'utf8');
  const troubleshooting = fs.readFileSync(troubleshootingPath, 'utf8');

  assert.match(proxySource, /const prefixedName = `\$\{serverId\}_\$\{tool\.name\}`;/);
  assert.match(proxySource, /if \(this\.toolRegistry\.has\(prefixedName\)\)/);
  assert.match(proxySource, /Skipping duplicate proxied tool/);
  assert.match(proxySource, /duplicate\(s\) skipped/);
  assert.match(proxySource, /Duplicate collision summary/);
  assert.match(proxySource, /first_registration_wins/);
  assert.match(proxySource, /continue;/);

  assert.match(usage, /prefixed tool name format `\$\{serverId\}_\$\{tool\.name\}`/i);
  assert.match(usage, /keeps the first registration.*logs a warning/i);

  assert.match(troubleshooting, /Skipping duplicate proxied tool/i);
  assert.match(troubleshooting, /already registered/i);

  assert.match(docsReadme, /Tool prefix collision guard: `test-tool-prefix-collision-validation\.js`/);

  console.log('Tool prefix collision validation passed.');
}

try {
  run();
} catch (error) {
  console.error('Tool prefix collision validation failed:', error);
  process.exit(1);
}
