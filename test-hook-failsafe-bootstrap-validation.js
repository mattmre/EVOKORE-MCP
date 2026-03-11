'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function run() {
  console.log('Running hook fail-safe bootstrap validation...');

  const logsDir = path.join(os.homedir(), '.evokore', 'logs');
  const hooksLogPath = path.join(logsDir, 'hooks.jsonl');
  if (fs.existsSync(hooksLogPath)) {
    fs.rmSync(hooksLogPath, { force: true });
  }

  const loaderPath = path.resolve(__dirname, 'scripts', 'hooks', 'fail-safe-loader.js');
  const missingModulePath = path.resolve(__dirname, 'scripts', 'hooks', 'runtime', 'missing-hook.js');
  const inlineScript = `
    const path = require('path');
    const { requireHookSafely } = require(process.argv[1]);
    requireHookSafely({
      hookName: 'bootstrap-test',
      modulePath: process.argv[2]
    });
  `;

  const result = spawnSync(
    process.execPath,
    ['-e', inlineScript, loaderPath, missingModulePath],
    {
      input: JSON.stringify({ session_id: 'bootstrap-test-session' }),
      encoding: 'utf8'
    }
  );

  assert.strictEqual(result.status, 0, 'bootstrap loader should fail safe with exit code 0');
  assert.ok(fs.existsSync(hooksLogPath), 'bootstrap loader should emit a hooks log entry');

  const entries = fs.readFileSync(hooksLogPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  const bootstrapEntry = entries.find((entry) => entry.hook === 'bootstrap-test' && entry.event === 'bootstrap_fail_safe');
  assert.ok(bootstrapEntry, 'bootstrap fail-safe entry should be present in hooks log');
  assert.match(bootstrapEntry.error || '', /Cannot find module/i);

  console.log('Hook fail-safe bootstrap validation passed.');
}

try {
  run();
} catch (error) {
  console.error('Hook fail-safe bootstrap validation failed:', error);
  process.exit(1);
}
