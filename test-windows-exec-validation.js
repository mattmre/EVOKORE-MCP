'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function run() {
  const proxyPath = path.resolve(__dirname, 'src', 'ProxyManager.ts');
  const proxySource = fs.readFileSync(proxyPath, 'utf8');

  assert.match(proxySource, /const isWindows = process\.platform === "win32";/);
  assert.match(proxySource, /if \(isWindows && cmd === "npx"\)/);
  assert.match(proxySource, /cmd = "npx\.cmd";/);

  console.log('Windows executable fallback validation passed.');
}

try {
  run();
} catch (error) {
  console.error('Windows executable fallback validation failed:', error);
  process.exit(1);
}
