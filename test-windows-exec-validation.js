'use strict';


const assert = require('assert');
const fs = require('fs');
const path = require('path');

test('Windows executable fallback validation', () => {
  const proxyPath = path.resolve(__dirname, 'src', 'ProxyManager.ts');
  const resolveHelperPath = path.resolve(__dirname, 'src', 'utils', 'resolveCommandForPlatform.ts');
  const proxySource = fs.readFileSync(proxyPath, 'utf8');
  const helperSource = fs.readFileSync(resolveHelperPath, 'utf8');

  assert.match(helperSource, /export function resolveCommandForPlatform\(/);
  assert.match(helperSource, /platform: NodeJS\.Platform = process\.platform/);
  assert.match(helperSource, /if \(platform === "win32" && command === "npx"\)\s*\{\s*return "npx\.cmd";\s*\}/s);
  assert.doesNotMatch(helperSource, /command === "uv"\s*&&[\s\S]*"uv\.cmd"/);
  assert.doesNotMatch(helperSource, /command === "uvx"\s*&&[\s\S]*"uvx\.cmd"/);

  assert.match(proxySource, /import \{ resolveCommandForPlatform \} from "\.\/utils\/resolveCommandForPlatform";/);
  assert.match(proxySource, /const cmd = resolveCommandForPlatform\(serverConfig\.command\);/);
});
