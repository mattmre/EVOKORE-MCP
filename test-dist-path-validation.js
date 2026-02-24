'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

function run() {
  const usagePath = path.resolve(__dirname, 'docs', 'USAGE.md');
  const troubleshootingPath = path.resolve(__dirname, 'docs', 'TROUBLESHOOTING.md');
  const syncScriptPath = path.resolve(__dirname, 'scripts', 'sync-configs.js');

  const usage = fs.readFileSync(usagePath, 'utf8');
  const troubleshooting = fs.readFileSync(troubleshootingPath, 'utf8');

  assert.match(usage, /dist\/index\.js/);
  assert.doesNotMatch(usage, /EVOKORE-MCP\/src\/index\.js/);

  assert.match(troubleshooting, /dist\/index\.js/);
  assert.doesNotMatch(troubleshooting, /EVOKORE-MCP\/src\/index\.js/);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-dist-path-'));
  const tempHome = path.join(tempRoot, 'home');
  const tempAppData = path.join(tempRoot, 'appdata');

  let detectDir;
  if (process.platform === 'win32') {
    detectDir = path.join(tempAppData, 'Claude');
  } else if (process.platform === 'darwin') {
    detectDir = path.join(tempHome, 'Library', 'Application Support', 'Claude');
  } else {
    detectDir = path.join(tempHome, '.config', 'claude');
  }

  fs.mkdirSync(detectDir, { recursive: true });

  try {
    const result = spawnSync(process.execPath, [syncScriptPath, '--dry-run', 'claude-desktop'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: tempHome,
        USERPROFILE: tempHome,
        APPDATA: tempAppData,
      },
    });

    assert.strictEqual(result.status, 0, `Expected exit code 0, got ${result.status}\n${result.stderr}`);

    const output = `${result.stdout}\n${result.stderr}`;
    const expectedDistPath = path.resolve(__dirname, 'dist', 'index.js');
    const unexpectedSrcPath = path.resolve(__dirname, 'src', 'index.js');

    assert.ok(output.includes(expectedDistPath), `Expected output to include dist entry path: ${expectedDistPath}`);
    assert.ok(!output.includes(unexpectedSrcPath), `Output should not reference src entry path: ${unexpectedSrcPath}`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  console.log('Dist path documentation validation passed.');
}

try {
  run();
} catch (error) {
  console.error('Dist path documentation validation failed:', error);
  process.exit(1);
}
