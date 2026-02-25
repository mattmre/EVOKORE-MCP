'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT_PATH = path.resolve(__dirname, 'scripts', 'validate-tracker-consistency.js');

function runValidationWithHome(homeDir) {
  return spawnSync('node', [SCRIPT_PATH], {
    cwd: __dirname,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: homeDir,
      USERPROFILE: homeDir
    }
  });
}

function run() {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-consistency-home-'));
  const logPath = path.join(tempHome, '.evokore', 'logs', 'orchestration-tracker.jsonl');

  try {
    const result = runValidationWithHome(tempHome);
    assert.strictEqual(
      result.status,
      0,
      `Expected tracker consistency validation to pass.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`
    );
    assert.ok(fs.existsSync(logPath), 'Expected orchestration tracker JSONL log to be created.');

    const lines = fs
      .readFileSync(logPath, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean);
    assert.ok(lines.length > 0, 'Expected at least one log entry.');

    const entry = JSON.parse(lines[lines.length - 1]);
    assert.strictEqual(entry.result, 'pass');
    assert.strictEqual(entry.check, 'tracker-consistency');
    assert.ok(typeof entry.ts === 'string' && entry.ts.length > 0, 'Expected ts string in log entry.');
    assert.ok(entry.details, 'Expected details in log entry.');

    console.log('Tracker consistency validation test passed.');
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

try {
  run();
} catch (error) {
  console.error('Tracker consistency validation test failed:', error);
  process.exit(1);
}
