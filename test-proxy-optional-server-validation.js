'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

test('optional child server runtime validation', () => {
  const proxyPath = path.resolve(__dirname, 'src', 'ProxyManager.ts');
  const proxySource = fs.readFileSync(proxyPath, 'utf8');

  assert.match(proxySource, /cwd\?: string;/);
  assert.match(proxySource, /disabled\?: boolean;/);
  assert.match(proxySource, /private resolveConfigString\(serverId: string, key: string, value\?: string\): string \| undefined/);
  assert.match(proxySource, /private resolveConfigArgs\(serverId: string, args\?: string\[\]\): string\[\]/);
  assert.match(proxySource, /const resolvedUrl = this\.resolveConfigString\(serverId, "url", serverConfig\.url\);/);
  assert.match(proxySource, /const resolvedCommand = this\.resolveConfigString\(serverId, "command", serverConfig\.command\);/);
  assert.match(proxySource, /const resolvedArgs = this\.resolveConfigArgs\(serverId, serverConfig\.args\);/);
  assert.match(proxySource, /const resolvedCwd = this\.resolveConfigString\(serverId, "cwd", serverConfig\.cwd\);/);
  assert.match(proxySource, /cwd: resolvedCwd/);
  assert.match(proxySource, /\.filter\(\(\[, serverConfig\]\) => !serverConfig\.disabled\)/);
  assert.match(proxySource, /if \(serverConfig\.cwd\) sanitizedServer\.cwd = serverConfig\.cwd;/);
  assert.match(proxySource, /if \(serverConfig\.disabled !== undefined\) sanitizedServer\.disabled = serverConfig\.disabled;/);
});
