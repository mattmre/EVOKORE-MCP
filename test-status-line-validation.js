'use strict';


const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { runNodeScript, makeSessionId } = require('./tests/helpers/hook-test-helper');
const { getSessionPaths, writeSessionState, resolveCanonicalRepoRoot } = require('./scripts/session-continuity');

function cleanup(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true, recursive: true });
  }
}

test('status-line validation', () => {
  console.log('Running status-line validation...');

  const activeWorktree = path.resolve(__dirname);
  const workspaceRoot = resolveCanonicalRepoRoot(activeWorktree);
  const activeBranch = execFileSync('git', ['branch', '--show-current'], {
    cwd: activeWorktree,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  }).trim();
  const memoryDir = path.join(os.tmpdir(), `evokore-memory-${Date.now()}`);
  fs.mkdirSync(memoryDir, { recursive: true });

  const liveSessionId = makeSessionId('status-live');
  const livePaths = getSessionPaths(liveSessionId);
  cleanup(livePaths.sessionStatePath);
  cleanup(livePaths.tasksPath);
  fs.writeFileSync(livePaths.tasksPath, JSON.stringify([
    { text: 'Ship T21', done: false },
    { text: 'Update docs', done: true }
  ], null, 2));

  writeSessionState(liveSessionId, {
    workspaceRoot,
    canonicalRepoRoot: workspaceRoot,
    repoName: path.basename(workspaceRoot),
    purpose: 'Ship live status line display',
    purposeSetAt: new Date().toISOString(),
    set_at: new Date().toISOString(),
    status: 'active',
    lastActivityAt: new Date().toISOString()
  });

  const liveResult = runNodeScript(
    'scripts/status.js',
    {
      session_id: liveSessionId,
      workspace: { current_dir: activeWorktree },
      context_window: {
        current_usage: { input_tokens: 42000, output_tokens: 2000 },
        context_window_size: 100000
      }
    },
    {
      env: {
        EVOKORE_CLAUDE_MEMORY_DIR: memoryDir
      }
    }
  );

  assert.strictEqual(liveResult.status, 0);
  assert.match(liveResult.cleanStdout, /EVOKORE/i);
  assert.match(liveResult.cleanStdout, new RegExp(activeBranch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  assert.match(liveResult.cleanStdout, /purpose Ship live status line display/i);
  assert.match(liveResult.cleanStdout, /tasks 1\/2 open/i);
  assert.match(liveResult.cleanStdout, /continuity healthy 0r\/0e/i);
  assert.match(liveResult.cleanStdout, /ctx 44%/i);

  cleanup(livePaths.sessionStatePath);
  cleanup(livePaths.tasksPath);

  const isolatedWorkspace = path.join(os.tmpdir(), `evokore-status-fallback-${Date.now()}`);
  fs.mkdirSync(isolatedWorkspace, { recursive: true });

  fs.writeFileSync(path.join(memoryDir, 'project-state.md'), `# Project State

- Repo path: \`${isolatedWorkspace}\`
- Repo name: \`EVOKORE-MCP\`
- Branch: \`memory-fallback\`
- HEAD: \`deadbee\`
- Dirty working tree: no
- Latest session purpose: Memory fallback purpose
- Latest session activity: 2026-03-11T00:00:00.000Z
- Last evidence item: none
`);

  const isolatedHome = path.join(os.tmpdir(), `evokore-status-home-${Date.now()}`);
  fs.mkdirSync(path.join(isolatedHome, '.evokore', 'sessions'), { recursive: true });

  const fallbackResult = runNodeScript(
    'scripts/status.js',
    {
      session_id: 'status-fallback-nonexistent-' + Date.now(),
      workspace: { current_dir: isolatedWorkspace }
    },
    {
      env: {
        EVOKORE_CLAUDE_MEMORY_DIR: memoryDir,
        HOME: isolatedHome,
        USERPROFILE: isolatedHome
      }
    }
  );

  assert.strictEqual(fallbackResult.status, 0);
  assert.match(fallbackResult.cleanStdout, /purpose Memory fallback purpose/i);

  cleanup(isolatedWorkspace);
  cleanup(isolatedHome);
  cleanup(memoryDir);
});
