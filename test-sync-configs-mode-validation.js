'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const syncScriptPath = path.resolve(__dirname, 'scripts', 'sync-configs.js');

function getClaudeDesktopConfigPath(tempRoot) {
  const tempHome = path.join(tempRoot, 'home');
  const tempAppData = path.join(tempRoot, 'appdata');

  if (process.platform === 'win32') {
    return {
      configPath: path.join(tempAppData, 'Claude', 'claude_desktop_config.json'),
      detectDir: path.join(tempAppData, 'Claude'),
      env: {
        HOME: tempHome,
        USERPROFILE: tempHome,
        APPDATA: tempAppData,
      },
    };
  }

  if (process.platform === 'darwin') {
    return {
      configPath: path.join(tempHome, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
      detectDir: path.join(tempHome, 'Library', 'Application Support', 'Claude'),
      env: {
        HOME: tempHome,
        USERPROFILE: tempHome,
        APPDATA: tempAppData,
      },
    };
  }

  return {
    configPath: path.join(tempHome, '.config', 'claude', 'claude_desktop_config.json'),
    detectDir: path.join(tempHome, '.config', 'claude'),
    env: {
      HOME: tempHome,
      USERPROFILE: tempHome,
      APPDATA: tempAppData,
    },
  };
}

function createIsolatedEnv() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-sync-modes-'));
  const setup = getClaudeDesktopConfigPath(tempRoot);
  fs.mkdirSync(setup.detectDir, { recursive: true });

  return {
    tempRoot,
    configPath: setup.configPath,
    env: {
      ...process.env,
      ...setup.env,
    },
  };
}

function runSync(args, env) {
  return spawnSync(process.execPath, [syncScriptPath, ...args, 'claude-desktop'], {
    encoding: 'utf8',
    env,
  });
}

function validateDefaultDryRunDoesNotWrite() {
  const { tempRoot, configPath, env } = createIsolatedEnv();
  try {
    const result = runSync([], env);
    assert.strictEqual(result.status, 0, `Expected exit code 0, got ${result.status}\n${result.stderr}`);
    assert.match(result.stdout, /Mode: DRY RUN/);
    assert.strictEqual(fs.existsSync(configPath), false, 'Default mode should not write config');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function validateApplyWritesConfig() {
  const { tempRoot, configPath, env } = createIsolatedEnv();
  try {
    const result = runSync(['--apply'], env);
    assert.strictEqual(result.status, 0, `Expected exit code 0, got ${result.status}\n${result.stderr}`);
    assert.match(result.stdout, /Mode: APPLY/);
    assert.strictEqual(fs.existsSync(configPath), true, '--apply should write config');

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.ok(config.mcpServers && config.mcpServers['evokore-mcp'], 'evokore-mcp config should exist');
    assert.strictEqual(config.mcpServers['evokore-mcp'].command, 'node');
    assert.deepStrictEqual(config.mcpServers['evokore-mcp'].args, [path.resolve(__dirname, 'dist', 'index.js')]);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function validateConflictingFlagsFailNonZero() {
  const { tempRoot, env } = createIsolatedEnv();
  try {
    const result = runSync(['--dry-run', '--apply'], env);
    assert.notStrictEqual(result.status, 0, 'Conflicting flags should fail non-zero');
    const combinedOutput = `${result.stdout}\n${result.stderr}`;
    assert.match(combinedOutput, /cannot be used together/i);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function validateUnknownTargetFailsNonZero() {
  const { tempRoot, env } = createIsolatedEnv();
  try {
    const result = runSync(['unknown-target'], env);
    assert.notStrictEqual(result.status, 0, 'Unknown target should fail non-zero');
    const combinedOutput = `${result.stdout}\n${result.stderr}`;
    assert.match(combinedOutput, /unknown target\(s\):\s*unknown-target/i);
    assert.match(combinedOutput, /supported targets:/i);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function run() {
  validateDefaultDryRunDoesNotWrite();
  validateApplyWritesConfig();
  validateConflictingFlagsFailNonZero();
  validateUnknownTargetFailsNonZero();
  console.log('Sync configs mode validation passed.');
}

try {
  run();
} catch (error) {
  console.error('Sync configs mode validation failed:', error);
  process.exit(1);
}
