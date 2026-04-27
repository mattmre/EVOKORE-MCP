'use strict';


const assert = require('assert');
const fs = require('fs');
const path = require('path');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('version/config consistency validation', () => {
  const packageJsonPath = path.resolve(__dirname, 'package.json');
  const srcIndexPath = path.resolve(__dirname, 'src', 'index.ts');
  const distIndexPath = path.resolve(__dirname, 'dist', 'index.js');
  const readmePath = path.resolve(__dirname, 'README.md');
  const envExamplePath = path.resolve(__dirname, '.env.example');

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const srcIndex = fs.readFileSync(srcIndexPath, 'utf8');
  const distIndex = fs.readFileSync(distIndexPath, 'utf8');
  const readme = fs.readFileSync(readmePath, 'utf8');
  const envExample = fs.readFileSync(envExamplePath, 'utf8');

  const escapedVersion = escapeRegExp(packageJson.version);

  assert.match(srcIndex, new RegExp(`const SERVER_VERSION = "${escapedVersion}";`));
  assert.match(srcIndex, new RegExp(`version: SERVER_VERSION`));
  assert.match(srcIndex, /path\.resolve\(__dirname, "\.\.\/\.env"\), quiet: true/);
  assert.match(srcIndex, new RegExp(`\\[EVOKORE\\] v\\$\\{SERVER_VERSION\\} Enterprise Router running on stdio`));

  assert.match(distIndex, new RegExp(`const SERVER_VERSION = "${escapedVersion}";`));
  assert.match(distIndex, /version: SERVER_VERSION/);
  assert.match(distIndex, new RegExp(`\\[EVOKORE\\] v\\$\\{SERVER_VERSION\\} Enterprise Router running on stdio`));

  assert.match(readme, /^# EVOKORE-MCP$/m);
  assert.doesNotMatch(readme, /^# EVOKORE-MCP v/i);
  assert.doesNotMatch(readme, /^## .*v\d+\.\d+\.\d+.*Highlights$/m);

  // v3.1+ flipped the default to dynamic. The env var only appears as the
  // commented-out legacy safety-pin opt-out; the comment block must still
  // reference both modes so operators can find the escape hatch.
  assert.match(envExample, /EVOKORE_TOOL_DISCOVERY_MODE=legacy/);
  assert.match(envExample, /Tool discovery mode\. Default: dynamic/);
  assert.match(envExample, /set to "dynamic"/);
  assert.match(envExample, /pre-v3\.1 behavior/);
  assert.doesNotMatch(envExample, /^EVOKORE_DISCOVERY_MODE=/m);
  assert.doesNotMatch(envExample, /"full" = all tools visible, "gated" = discovery-based/);
});
