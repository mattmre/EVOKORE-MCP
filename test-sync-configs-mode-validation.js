'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function runSync(repoRoot, tempRoot, args) {
  const scriptPath = path.join(repoRoot, 'scripts', 'sync-configs.js');
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: tempRoot,
      USERPROFILE: tempRoot,
      APPDATA: path.join(tempRoot, 'AppData', 'Roaming'),
    },
  });
}

function run() {
  const repoRoot = __dirname;
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-configs-mode-'));
  try {
    const appData = path.join(tempRoot, 'AppData', 'Roaming');
    let configPath;
    if (process.platform === 'win32') {
      configPath = path.join(appData, 'Claude', 'claude_desktop_config.json');
    } else if (process.platform === 'darwin') {
      configPath = path.join(tempRoot, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    } else {
      configPath = path.join(tempRoot, '.config', 'claude', 'claude_desktop_config.json');
    }
    const claudeDir = path.dirname(configPath);

    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ mcpServers: { existing: { command: 'echo', args: ['ok'] } } }, null, 2) + '\n');
    const baseline = fs.readFileSync(configPath, 'utf8');

    const dryRun = runSync(repoRoot, tempRoot, ['--dry-run', 'claude-desktop']);
    assert.strictEqual(dryRun.status, 0, `dry-run should exit 0.\nstdout:\n${dryRun.stdout}\nstderr:\n${dryRun.stderr}`);
    assert.strictEqual(fs.readFileSync(configPath, 'utf8'), baseline, 'dry-run should not modify config file');

    const apply = runSync(repoRoot, tempRoot, ['--apply', 'claude-desktop']);
    assert.strictEqual(apply.status, 0, `apply should exit 0.\nstdout:\n${apply.stdout}\nstderr:\n${apply.stderr}`);
    const updated = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.ok(updated.mcpServers, 'mcpServers should exist after apply');
    assert.ok(updated.mcpServers['evokore-mcp'], 'apply should write evokore-mcp entry');
    assert.strictEqual(updated.mcpServers['evokore-mcp'].command, 'node');
    assert.ok(Array.isArray(updated.mcpServers['evokore-mcp'].args), 'evokore-mcp args should be an array');
    assert.ok(updated.mcpServers['evokore-mcp'].args[0].endsWith(path.join('dist', 'index.js')), 'entrypoint should target dist/index.js');

    const invalid = runSync(repoRoot, tempRoot, ['--dry-run', '--apply', 'claude-desktop']);
    assert.notStrictEqual(invalid.status, 0, 'invalid mode combination should fail non-zero');
    const combinedOutput = `${invalid.stdout}\n${invalid.stderr}`;
    assert.match(combinedOutput, /Use either --dry-run or --apply, not both/);

    const unknownFlag = runSync(repoRoot, tempRoot, ['--apply', '--nope', 'claude-desktop']);
    assert.notStrictEqual(unknownFlag.status, 0, 'unknown flag should fail non-zero');
    assert.match(`${unknownFlag.stdout}\n${unknownFlag.stderr}`, /Unknown flag\(s\): --nope/);

    const unknownTarget = runSync(repoRoot, tempRoot, ['--apply', 'not-a-target']);
    assert.notStrictEqual(unknownTarget.status, 0, 'unknown target should fail non-zero');
    assert.match(`${unknownTarget.stdout}\n${unknownTarget.stderr}`, /Unknown target\(s\): not-a-target/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  console.log('Sync config mode validation passed.');
}

try {
  run();
} catch (error) {
  console.error('Sync config mode validation failed:', error);
  process.exit(1);
}
