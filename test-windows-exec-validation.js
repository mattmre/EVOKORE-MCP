'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function run() {
  const proxyPath = path.resolve(__dirname, 'src', 'ProxyManager.ts');
  const proxySource = fs.readFileSync(proxyPath, 'utf8');

  assert.match(proxySource, /private resolveCommandForPlatform\(command: string\): string \{/);
  assert.match(proxySource, /if \(process\.platform === "win32" && command === "npx"\)\s*\{\s*return "npx\.cmd";\s*\}/s);
  assert.match(proxySource, /const cmd = this\.resolveCommandForPlatform\(serverConfig\.command\);/);
  assert.doesNotMatch(proxySource, /command === "uv"\s*&&[\s\S]*"uv\.cmd"/);
  assert.doesNotMatch(proxySource, /command === "uvx"\s*&&[\s\S]*"uvx\.cmd"/);

  console.log('Windows executable fallback validation passed.');
}

try {
  run();
} catch (error) {
  console.error('Windows executable fallback validation failed:', error);
  process.exit(1);
}
