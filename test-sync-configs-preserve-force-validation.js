'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
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

const forcedEntry = {
  command: 'node',
  args: [path.join(resolveCanonicalProjectRoot(), 'dist', 'index.js')],
};

function getClaudeDesktopSetup(tempRoot) {
  const tempHome = path.join(tempRoot, 'home');
  const tempAppData = path.join(tempRoot, 'appdata');

  if (process.platform === 'win32') {
    return {
      configPath: path.join(tempAppData, 'Claude', 'claude_desktop_config.json'),
      detectDir: path.join(tempAppData, 'Claude'),
      env: { HOME: tempHome, USERPROFILE: tempHome, APPDATA: tempAppData },
    };
  }

  if (process.platform === 'darwin') {
    return {
      configPath: path.join(tempHome, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
      detectDir: path.join(tempHome, 'Library', 'Application Support', 'Claude'),
      env: { HOME: tempHome, USERPROFILE: tempHome, APPDATA: tempAppData },
    };
  }

  return {
    configPath: path.join(tempHome, '.config', 'claude', 'claude_desktop_config.json'),
    detectDir: path.join(tempHome, '.config', 'claude'),
    env: { HOME: tempHome, USERPROFILE: tempHome, APPDATA: tempAppData },
  };
}

function createIsolatedEnvWithConfig(initialConfig) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-sync-preserve-force-'));
  const setup = getClaudeDesktopSetup(tempRoot);
  fs.mkdirSync(setup.detectDir, { recursive: true });

  if (initialConfig) {
    fs.writeFileSync(setup.configPath, JSON.stringify(initialConfig, null, 2) + '\n');
  }

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

function validateApplyPreservesExistingByDefault() {
  const existing = {
    mcpServers: {
      'evokore-mcp': {
        command: 'python',
        args: ['/custom/server.py'],
      },
    },
  };
  const { tempRoot, configPath, env } = createIsolatedEnvWithConfig(existing);
  try {
    const result = runSync(['--apply'], env);
    assert.strictEqual(result.status, 0, `Expected exit code 0, got ${result.status}\n${result.stderr}`);
    assert.match(result.stdout, /Entry mode:\s+PRESERVE EXISTING/i);

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.deepStrictEqual(config.mcpServers['evokore-mcp'], existing.mcpServers['evokore-mcp']);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function validateApplyForceOverwritesExistingEntry() {
  const existing = {
    mcpServers: {
      'evokore-mcp': {
        command: 'python',
        args: ['/custom/server.py'],
      },
    },
  };
  const { tempRoot, configPath, env } = createIsolatedEnvWithConfig(existing);
  try {
    const result = runSync(['--apply', '--force'], env);
    assert.strictEqual(result.status, 0, `Expected exit code 0, got ${result.status}\n${result.stderr}`);
    assert.match(result.stdout, /Entry mode:\s+FORCE OVERWRITE/i);

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.deepStrictEqual(config.mcpServers['evokore-mcp'], forcedEntry);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function validateDryRunShowsExistingEntryAndAction() {
  const existing = {
    mcpServers: {
      'evokore-mcp': {
        command: 'python',
        args: ['/custom/server.py'],
      },
    },
  };
  const { tempRoot, configPath, env } = createIsolatedEnvWithConfig(existing);
  try {
    const result = runSync([], env);
    assert.strictEqual(result.status, 0, `Expected exit code 0, got ${result.status}\n${result.stderr}`);
    assert.match(result.stdout, /Existing evokore-mcp entry:/i);
    assert.match(result.stdout, /Action:\s+Preserve existing entry/i);
    assert.match(result.stdout, /Resulting evokore-mcp entry:/i);

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.deepStrictEqual(config.mcpServers['evokore-mcp'], existing.mcpServers['evokore-mcp']);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function validateConflictingEntryFlagsFailNonZero() {
  const { tempRoot, env } = createIsolatedEnvWithConfig(null);
  try {
    const result = runSync(['--force', '--preserve-existing'], env);
    assert.notStrictEqual(result.status, 0, 'Conflicting entry flags should fail non-zero');
    const combinedOutput = `${result.stdout}\n${result.stderr}`;
    assert.match(combinedOutput, /--force and --preserve-existing cannot be used together/i);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function run() {
  validateApplyPreservesExistingByDefault();
  validateApplyForceOverwritesExistingEntry();
  validateDryRunShowsExistingEntryAndAction();
  validateConflictingEntryFlagsFailNonZero();
  console.log('Sync configs preserve/force validation passed.');
}

try {
  run();
} catch (error) {
  console.error('Sync configs preserve/force validation failed:', error);
  process.exit(1);
}
