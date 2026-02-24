'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function run() {
  const usagePath = path.resolve(__dirname, 'docs', 'USAGE.md');
  const troubleshootingPath = path.resolve(__dirname, 'docs', 'TROUBLESHOOTING.md');

  const usage = fs.readFileSync(usagePath, 'utf8');
  const troubleshooting = fs.readFileSync(troubleshootingPath, 'utf8');

  assert.match(usage, /dist\/index\.js/);
  assert.doesNotMatch(usage, /EVOKORE-MCP\/src\/index\.js/);

  assert.match(troubleshooting, /dist\/index\.js/);
  assert.doesNotMatch(troubleshooting, /EVOKORE-MCP\/src\/index\.js/);

  console.log('Dist path documentation validation passed.');
}

try {
  run();
} catch (error) {
  console.error('Dist path documentation validation failed:', error);
  process.exit(1);
}
