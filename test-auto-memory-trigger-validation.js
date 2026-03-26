'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const TILLDONE_PATH = path.resolve(__dirname, 'scripts', 'tilldone.js');
const CLAUDE_MEMORY_PATH = path.resolve(__dirname, 'scripts', 'claude-memory.js');
const ENV_EXAMPLE_PATH = path.resolve(__dirname, '.env.example');

const { syncMemory } = require(CLAUDE_MEMORY_PATH);
const { getSessionPaths, writeSessionState } = require('./scripts/session-continuity');

function cleanup(paths) {
  for (const target of paths) {
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
  }
}

function cleanupSessionArtifacts(sessionId) {
  const paths = getSessionPaths(sessionId);
  for (const p of Object.values(paths)) {
    if (typeof p === 'string' && p !== sessionId) {
      try { fs.unlinkSync(p); } catch { /* ignore */ }
    }
  }
}

test('auto-memory trigger: tilldone.js contains auto-memory sync code', () => {
  const source = fs.readFileSync(TILLDONE_PATH, 'utf8');

  // Must require claude-memory
  assert.ok(source.includes("require('./claude-memory')"), 'tilldone.js must require claude-memory');

  // Must have auto_memory_sync event
  assert.ok(source.includes('auto_memory_sync'), 'tilldone.js must emit auto_memory_sync event');

  // Must call syncMemory with quiet: true
  assert.ok(source.includes('quiet: true'), 'tilldone.js must pass quiet: true to syncMemory');

  // Must check EVOKORE_AUTO_MEMORY_SYNC
  assert.ok(source.includes('EVOKORE_AUTO_MEMORY_SYNC'), 'tilldone.js must check EVOKORE_AUTO_MEMORY_SYNC');

  // Must be wrapped in try/catch
  assert.match(source, /try\s*\{[\s\S]*?syncMemory[\s\S]*?\}\s*catch\s*\(/, 'auto-memory sync must be in try/catch');

  // process.exit(0) must come after auto_memory_sync block
  const autoMemoryIdx = source.indexOf('auto_memory_sync');
  const exitIdx = source.indexOf('process.exit(0)', autoMemoryIdx);
  assert.ok(exitIdx > autoMemoryIdx, 'process.exit(0) must come after auto-memory sync block');
});

test('auto-memory trigger: syncMemory supports quiet option', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-amtrig-'));
  const repoRoot = path.join(tmpRoot, 'EVOKORE-MCP');
  const projectsDir = path.join(tmpRoot, 'claude-projects');
  fs.mkdirSync(repoRoot, { recursive: true });
  fs.mkdirSync(projectsDir, { recursive: true });

  fs.writeFileSync(path.join(repoRoot, 'next-session.md'), '');
  fs.writeFileSync(path.join(repoRoot, 'CLAUDE.md'), '');
  fs.writeFileSync(path.join(repoRoot, 'task_plan.md'), '');

  const origEnv = process.env.EVOKORE_CLAUDE_PROJECTS_DIR;
  process.env.EVOKORE_CLAUDE_PROJECTS_DIR = projectsDir;

  try {
    const result = syncMemory({ cwd: repoRoot, quiet: true });
    assert.strictEqual(result.synced, true, 'syncMemory should return synced: true');
    assert.ok(result.files.includes('MEMORY.md'), 'should include MEMORY.md');
    assert.ok(result.memoryDir, 'should include memoryDir');
  } finally {
    if (origEnv !== undefined) {
      process.env.EVOKORE_CLAUDE_PROJECTS_DIR = origEnv;
    } else {
      delete process.env.EVOKORE_CLAUDE_PROJECTS_DIR;
    }
    cleanup([tmpRoot]);
  }
});

test('auto-memory trigger: env example documents EVOKORE_AUTO_MEMORY_SYNC', () => {
  const content = fs.readFileSync(ENV_EXAMPLE_PATH, 'utf8');
  assert.ok(content.includes('EVOKORE_AUTO_MEMORY_SYNC'), 'env example must document EVOKORE_AUTO_MEMORY_SYNC');
});

test('auto-memory trigger: syncMemory backward compatibility', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-amcompat-'));
  const repoRoot = path.join(tmpRoot, 'EVOKORE-MCP');
  const projectsDir = path.join(tmpRoot, 'claude-projects');
  fs.mkdirSync(repoRoot, { recursive: true });
  fs.mkdirSync(projectsDir, { recursive: true });

  fs.writeFileSync(path.join(repoRoot, 'next-session.md'), '');
  fs.writeFileSync(path.join(repoRoot, 'CLAUDE.md'), '');
  fs.writeFileSync(path.join(repoRoot, 'task_plan.md'), '');

  const origEnv = process.env.EVOKORE_CLAUDE_PROJECTS_DIR;
  process.env.EVOKORE_CLAUDE_PROJECTS_DIR = projectsDir;

  try {
    // Without quiet option (default, backward-compatible)
    const result = syncMemory({ cwd: repoRoot });
    assert.strictEqual(result.synced, true, 'syncMemory should return synced: true by default');
    assert.ok(result.workspaceRoot, 'should include workspaceRoot');
    assert.ok(result.activeCwd, 'should include activeCwd');
    assert.ok(result.memoryDir, 'should include memoryDir');
    assert.strictEqual(result.files.length, 4, 'should generate 4 files');
  } finally {
    if (origEnv !== undefined) {
      process.env.EVOKORE_CLAUDE_PROJECTS_DIR = origEnv;
    } else {
      delete process.env.EVOKORE_CLAUDE_PROJECTS_DIR;
    }
    cleanup([tmpRoot]);
  }
});

test('auto-memory trigger: fail-safe catch does not exit non-zero', () => {
  const source = fs.readFileSync(TILLDONE_PATH, 'utf8');
  const catchIdx = source.indexOf('catch (memErr)');
  assert.ok(catchIdx > -1, 'must have catch (memErr) block');

  const afterCatch = source.substring(catchIdx);
  const nextExit0 = afterCatch.indexOf('process.exit(0)');
  assert.ok(nextExit0 > -1, 'process.exit(0) must follow catch block');

  const catchBlock = afterCatch.substring(0, nextExit0);
  assert.ok(!catchBlock.includes('process.exit(2)'), 'catch block must not exit(2)');
  assert.ok(!catchBlock.includes('process.exit(1)'), 'catch block must not exit(1)');
});
