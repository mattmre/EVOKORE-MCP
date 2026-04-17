'use strict';


const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawnSync } = require('child_process');

const syncScriptPath = path.resolve(__dirname, 'scripts', 'sync-configs.js');
function resolveCanonicalProjectRoot() {
  try {
    const commonDirRaw = execSync('git rev-parse --git-common-dir', {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
    if (commonDirRaw) {
      const resolvedCommonDir = path.resolve(__dirname, commonDirRaw);
      if (path.basename(resolvedCommonDir).toLowerCase() === '.git') {
        return path.dirname(resolvedCommonDir);
      }
    }
  } catch {
    // Fall back to the current project root outside git worktrees.
  }

  return path.resolve(__dirname);
}

const expectedEntryPoint = path.join(resolveCanonicalProjectRoot(), 'dist', 'index.js');

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
  fs.mkdirSync(path.join(setup.env.HOME, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(setup.env.HOME, '.copilot'), { recursive: true });
  fs.mkdirSync(path.join(setup.env.HOME, '.codex'), { recursive: true });

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
    assert.deepStrictEqual(config.mcpServers['evokore-mcp'].args, [expectedEntryPoint]);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function validateClaudeCodeApplyPrefersNativeConfig() {
  const { tempRoot, env } = createIsolatedEnv();
  const nativeClaudeConfig = path.join(env.HOME, '.claude.json');
  const legacyClaudeConfig = path.join(env.HOME, '.claude', 'settings.json');
  fs.writeFileSync(nativeClaudeConfig, '{}\n');
  fs.writeFileSync(legacyClaudeConfig, '{}\n');
  try {
    const result = spawnSync(process.execPath, [syncScriptPath, '--apply', 'claude-code'], {
      encoding: 'utf8',
      env,
    });
    assert.strictEqual(result.status, 0, `Expected exit code 0, got ${result.status}\n${result.stderr}`);

    const nativeConfig = JSON.parse(fs.readFileSync(nativeClaudeConfig, 'utf8'));
    const legacyConfig = JSON.parse(fs.readFileSync(legacyClaudeConfig, 'utf8'));
    assert.strictEqual(nativeConfig.mcpServers['evokore-mcp'].command, 'node');
    assert.deepStrictEqual(nativeConfig.mcpServers['evokore-mcp'].args, [expectedEntryPoint]);
    assert.strictEqual(legacyConfig.mcpServers, undefined);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function validateCopilotApplyWritesConfig() {
  const { tempRoot, env } = createIsolatedEnv();
  const copilotConfigPath = path.join(env.HOME, '.copilot', 'mcp-config.json');
  try {
    const result = spawnSync(process.execPath, [syncScriptPath, '--apply', 'copilot'], {
      encoding: 'utf8',
      env,
    });
    assert.strictEqual(result.status, 0, `Expected exit code 0, got ${result.status}\n${result.stderr}`);
    const config = JSON.parse(fs.readFileSync(copilotConfigPath, 'utf8'));
    assert.deepStrictEqual(config.mcpServers['evokore-mcp'], {
      type: 'local',
      command: 'node',
      args: [expectedEntryPoint],
      tools: ['*'],
    });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function validateCodexApplyWritesConfig() {
  const { tempRoot, env } = createIsolatedEnv();
  const codexConfigPath = path.join(env.HOME, '.codex', 'config.toml');
  fs.writeFileSync(codexConfigPath, 'model = "gpt-5.4"\n');
  try {
    const result = spawnSync(process.execPath, [syncScriptPath, '--apply', 'codex'], {
      encoding: 'utf8',
      env,
    });
    assert.strictEqual(result.status, 0, `Expected exit code 0, got ${result.status}\n${result.stderr}`);
    const configText = fs.readFileSync(codexConfigPath, 'utf8');
    assert.match(configText, /\[mcp_servers\.evokore-mcp\]/);
    assert.match(configText, /command = 'node'/);
    assert.match(configText, /args = \['.*dist[\\/]index\.js'\]/);
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

test('sync configs mode validation', () => {
  validateDefaultDryRunDoesNotWrite();
  validateApplyWritesConfig();
  validateClaudeCodeApplyPrefersNativeConfig();
  validateCopilotApplyWritesConfig();
  validateCodexApplyWritesConfig();
  validateConflictingFlagsFailNonZero();
  validateUnknownTargetFailsNonZero();
});
