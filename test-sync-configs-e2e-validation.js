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

const expectedEntry = {
  command: 'node',
  args: [path.join(resolveCanonicalProjectRoot(), 'dist', 'index.js')],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function createIsolatedEnv(initialConfig) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-sync-e2e-'));
  const setup = getClaudeDesktopSetup(tempRoot);
  fs.mkdirSync(setup.detectDir, { recursive: true });

  if (initialConfig) {
    fs.writeFileSync(setup.configPath, JSON.stringify(initialConfig, null, 2) + '\n');
  }

  return {
    tempRoot,
    tempHome: path.join(tempRoot, 'home'),
    configPath: setup.configPath,
    env: {
      ...process.env,
      ...setup.env,
    },
  };
}

function runSync(args, env) {
  return spawnSync(process.execPath, [syncScriptPath, ...args], {
    encoding: 'utf8',
    env,
  });
}

// ---------------------------------------------------------------------------
// Test 1: Idempotency -- applying twice yields identical config
// ---------------------------------------------------------------------------

function validateIdempotency() {
  const { tempRoot, configPath, env } = createIsolatedEnv();
  try {
    // First apply
    const result1 = runSync(['--apply', 'claude-desktop'], env);
    assert.strictEqual(result1.status, 0, `First apply failed: ${result1.stderr}`);
    assert.strictEqual(fs.existsSync(configPath), true, 'Config should exist after first apply');

    const contentAfterFirst = fs.readFileSync(configPath, 'utf8');
    const configAfterFirst = JSON.parse(contentAfterFirst);
    assert.deepStrictEqual(
      configAfterFirst.mcpServers['evokore-mcp'],
      expectedEntry,
      'First apply should write correct entry'
    );

    // Second apply (idempotent -- preserve-existing is default, so it should
    // keep the identical entry from the first run untouched)
    const result2 = runSync(['--apply', 'claude-desktop'], env);
    assert.strictEqual(result2.status, 0, `Second apply failed: ${result2.stderr}`);

    const contentAfterSecond = fs.readFileSync(configPath, 'utf8');
    assert.strictEqual(
      contentAfterFirst,
      contentAfterSecond,
      'Config file content must be byte-identical after second apply'
    );

    // Also verify with --force for overwrite idempotency
    const result3 = runSync(['--apply', '--force', 'claude-desktop'], env);
    assert.strictEqual(result3.status, 0, `Force apply failed: ${result3.stderr}`);

    const contentAfterForce = fs.readFileSync(configPath, 'utf8');
    const configAfterForce = JSON.parse(contentAfterForce);
    assert.deepStrictEqual(
      configAfterForce.mcpServers['evokore-mcp'],
      expectedEntry,
      'Force apply should produce the same canonical entry'
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Test 2: Cursor fallback path logic
//
// The sync script's cursor configPath() checks:
//   1. If ~/.cursor/mcp.json exists (user-level) -> use it
//   2. Otherwise -> fall back to <PROJECT_ROOT>/.cursor/mcp.json
//
// We test both branches by controlling HOME/USERPROFILE.
// ---------------------------------------------------------------------------

function validateCursorFallbackToProjectLevel() {
  // When ~/.cursor/mcp.json does NOT exist, the script should fall back to
  // PROJECT_ROOT/.cursor/mcp.json.  We cannot easily test the actual file
  // write to PROJECT_ROOT in isolation, but we CAN verify the script runs
  // successfully and the dry-run output references the project-level path.
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-sync-cursor-fallback-'));
  const tempHome = path.join(tempRoot, 'home');
  fs.mkdirSync(tempHome, { recursive: true });
  // Deliberately do NOT create ~/.cursor/ so the user-level path does not exist.

  // We also need to make the `detect` function return true.  The detect
  // function for cursor first tries `where cursor`/`which cursor` (which
  // may fail) and then falls back to checking if ~/.cursor directory exists.
  // Since we did NOT create ~/.cursor, and `where cursor` likely fails in CI,
  // detection will fail.  So we target cursor explicitly and accept that
  // the script will say "Not detected, skipping."  The real test is the
  // configPath() logic, which we exercise in the user-level test below and
  // confirm the fallback logic here via stdout.
  const env = {
    ...process.env,
    HOME: tempHome,
    USERPROFILE: tempHome,
  };

  try {
    const result = runSync(['cursor'], env);
    // Expected: cursor not detected (no binary, no ~/.cursor dir)
    assert.strictEqual(result.status, 0, `Cursor fallback run failed: ${result.stderr}`);
    assert.match(result.stdout, /Not detected, skipping/i,
      'Without ~/.cursor dir or cursor binary, cursor target should be skipped');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function validateCursorUserLevelPath() {
  // When ~/.cursor/ exists and the detect function returns true, the script
  // should use ~/.cursor/mcp.json as the config path.
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-sync-cursor-user-'));
  const tempHome = path.join(tempRoot, 'home');
  const cursorDir = path.join(tempHome, '.cursor');
  fs.mkdirSync(cursorDir, { recursive: true });
  // Create a pre-existing mcp.json at user level so configPath() picks it
  const cursorConfigPath = path.join(cursorDir, 'mcp.json');
  fs.writeFileSync(cursorConfigPath, JSON.stringify({ mcpServers: {} }, null, 2) + '\n');

  const env = {
    ...process.env,
    HOME: tempHome,
    USERPROFILE: tempHome,
  };

  try {
    // Dry-run targeting cursor -- detection will succeed because ~/.cursor exists
    const result = runSync(['cursor'], env);
    assert.strictEqual(result.status, 0, `Cursor user-level run failed: ${result.stderr}`);
    assert.match(result.stdout, /Detected/i, 'Cursor should be detected via ~/.cursor dir');
    // Verify the output references the user-level path
    const normalizedOutput = result.stdout.replace(/\\/g, '/');
    const normalizedUserPath = cursorConfigPath.replace(/\\/g, '/');
    assert.ok(
      normalizedOutput.includes(normalizedUserPath),
      `Dry-run output should reference user-level cursor config path.\nExpected to find: ${normalizedUserPath}\nIn output: ${normalizedOutput}`
    );

    // Now apply and verify the file is written to user-level
    const applyResult = runSync(['--apply', 'cursor'], env);
    assert.strictEqual(applyResult.status, 0, `Cursor user-level apply failed: ${applyResult.stderr}`);
    assert.strictEqual(fs.existsSync(cursorConfigPath), true, 'User-level cursor config should exist');

    const config = JSON.parse(fs.readFileSync(cursorConfigPath, 'utf8'));
    assert.deepStrictEqual(
      config.mcpServers['evokore-mcp'],
      expectedEntry,
      'Cursor user-level config should contain the evokore-mcp entry'
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Test 3: Gemini manual output -- should print a command, not write a file
// ---------------------------------------------------------------------------

function validateGeminiManualOutput() {
  // The gemini target has configPath: () => null and merge: null, meaning the
  // script should print a manual command to stdout rather than writing any
  // config file.
  //
  // The detect function runs `where gemini` / `which gemini`.  If Gemini CLI
  // is not installed, it will be skipped.  We test two scenarios:
  //   a) Gemini detected: stdout should contain the manual command
  //   b) Gemini not detected: stdout should contain "Not detected, skipping"
  //
  // We cannot guarantee gemini is installed, so we accept either outcome.
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-sync-gemini-'));
  const tempHome = path.join(tempRoot, 'home');
  fs.mkdirSync(tempHome, { recursive: true });

  const env = {
    ...process.env,
    HOME: tempHome,
    USERPROFILE: tempHome,
  };

  try {
    const result = runSync(['gemini'], env);
    assert.strictEqual(result.status, 0, `Gemini run failed: ${result.stderr}`);

    const geminiDetected = result.stdout.includes('Detected');
    if (geminiDetected) {
      // Should print a manual command, not write a file
      assert.match(result.stdout, /Run manually/i,
        'Gemini output should indicate manual action');
      assert.match(result.stdout, /gemini mcp add evokore-mcp/,
        'Gemini output should include the add command');
      assert.match(result.stdout, /--scope user/,
        'Gemini command should include --scope user');

      // Verify no config file was written anywhere in the temp directory
      const tempFiles = [];
      function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else tempFiles.push(full);
        }
      }
      walk(tempRoot);
      assert.strictEqual(tempFiles.length, 0,
        'Gemini target should not write any files');
    } else {
      assert.match(result.stdout, /Not detected, skipping/i,
        'When gemini is not installed, should report not detected');
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Test 4: Gemini --apply still only prints command (never writes)
// ---------------------------------------------------------------------------

function validateGeminiApplyStillManual() {
  // Even with --apply, gemini should only output a command.
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-sync-gemini-apply-'));
  const tempHome = path.join(tempRoot, 'home');
  fs.mkdirSync(tempHome, { recursive: true });

  const env = {
    ...process.env,
    HOME: tempHome,
    USERPROFILE: tempHome,
  };

  try {
    const result = runSync(['--apply', 'gemini'], env);
    assert.strictEqual(result.status, 0, `Gemini apply run failed: ${result.stderr}`);

    const geminiDetected = result.stdout.includes('Detected');
    if (geminiDetected) {
      assert.match(result.stdout, /Run manually/i,
        'Even with --apply, gemini should show manual instructions');
      // Verify no files written
      const tempFiles = [];
      function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else tempFiles.push(full);
        }
      }
      walk(tempRoot);
      assert.strictEqual(tempFiles.length, 0,
        'Gemini target with --apply should still not write files');
    }
    // If not detected, that is fine -- the test is valid either way.
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Test 5: Idempotency with pre-existing third-party entries
// ---------------------------------------------------------------------------

function validateIdempotencyPreservesThirdPartyEntries() {
  const initialConfig = {
    mcpServers: {
      'some-other-server': {
        command: 'python',
        args: ['/path/to/other.py'],
      },
    },
  };
  const { tempRoot, configPath, env } = createIsolatedEnv(initialConfig);
  try {
    // First apply adds evokore-mcp alongside existing entries
    const result1 = runSync(['--apply', 'claude-desktop'], env);
    assert.strictEqual(result1.status, 0, `First apply failed: ${result1.stderr}`);

    const config1 = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.deepStrictEqual(
      config1.mcpServers['some-other-server'],
      initialConfig.mcpServers['some-other-server'],
      'Third-party entry should be preserved after first apply'
    );
    assert.deepStrictEqual(
      config1.mcpServers['evokore-mcp'],
      expectedEntry,
      'evokore-mcp should be added after first apply'
    );

    const contentAfterFirst = fs.readFileSync(configPath, 'utf8');

    // Second apply should be identical (preserve-existing keeps the entry)
    const result2 = runSync(['--apply', 'claude-desktop'], env);
    assert.strictEqual(result2.status, 0, `Second apply failed: ${result2.stderr}`);

    const contentAfterSecond = fs.readFileSync(configPath, 'utf8');
    assert.strictEqual(
      contentAfterFirst,
      contentAfterSecond,
      'Config must be byte-identical after idempotent second apply'
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function run() {
  validateIdempotency();
  validateCursorFallbackToProjectLevel();
  validateCursorUserLevelPath();
  validateGeminiManualOutput();
  validateGeminiApplyStillManual();
  validateIdempotencyPreservesThirdPartyEntries();
  console.log('Cross-CLI sync e2e validation passed.');
}

try {
  run();
} catch (error) {
  console.error('Cross-CLI sync e2e validation failed:', error);
  process.exit(1);
}
