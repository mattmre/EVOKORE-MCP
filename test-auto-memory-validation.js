'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  slugifyWorkspace,
  findClaudeMemoryDir,
  syncMemory
} = require('./scripts/claude-memory');
const { writeSessionState, getSessionPaths } = require('./scripts/session-continuity');

function cleanup(paths) {
  for (const target of paths) {
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
  }
}

function run() {
  console.log('Running auto-memory validation...');

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-memory-'));
  const repoRoot = path.join(tmpRoot, 'EVOKORE-MCP');
  const projectsDir = path.join(tmpRoot, 'claude-projects');
  fs.mkdirSync(repoRoot, { recursive: true });
  fs.mkdirSync(projectsDir, { recursive: true });

  fs.writeFileSync(path.join(repoRoot, 'next-session.md'), '# Next Session Priorities\n\n## Current Handoff State\n- main\n');
  fs.writeFileSync(path.join(repoRoot, 'CLAUDE.md'), '# CLAUDE\n\n- **Session Continuity Manifest:** shared runtime state.\n');
  fs.writeFileSync(path.join(repoRoot, 'task_plan.md'), '- [ ] Slice 10: T19 Auto-memory system\n');

  process.env.EVOKORE_CLAUDE_PROJECTS_DIR = projectsDir;

  const expectedSlug = slugifyWorkspace(repoRoot);
  assert.ok(expectedSlug.includes('EVOKORE-MCP'));
  assert.ok(!/[\\/]/.test(expectedSlug));

  const memoryDir = findClaudeMemoryDir(repoRoot);
  assert.ok(memoryDir.endsWith(path.join(expectedSlug, 'memory')));

  const sessionId = 'memory-sync-test';
  const sessionPaths = getSessionPaths(sessionId);
  cleanup([sessionPaths.sessionStatePath, sessionPaths.replayLogPath, sessionPaths.evidenceLogPath, sessionPaths.tasksPath]);
  writeSessionState(sessionId, {
    workspaceRoot: repoRoot,
    repoName: 'EVOKORE-MCP',
    purpose: 'Keep memory synchronized',
    status: 'active',
    lastActivityAt: '2026-03-11T20:00:00.000Z',
    lastEvidenceId: 'E-007',
    lastEvidenceType: 'test-result'
  });

  const result = syncMemory({ cwd: repoRoot, sessionId });
  assert.strictEqual(result.memoryDir, memoryDir);
  assert.ok(fs.existsSync(path.join(memoryDir, 'MEMORY.md')));
  assert.ok(fs.existsSync(path.join(memoryDir, 'project-state.md')));
  assert.ok(fs.existsSync(path.join(memoryDir, 'patterns.md')));
  assert.ok(fs.existsSync(path.join(memoryDir, 'workflow.md')));

  const memoryContent = fs.readFileSync(path.join(memoryDir, 'MEMORY.md'), 'utf8');
  assert.match(memoryContent, /Latest recorded session purpose: Keep memory synchronized/);
  assert.match(memoryContent, /workflow\.md/);

  const projectStateContent = fs.readFileSync(path.join(memoryDir, 'project-state.md'), 'utf8');
  assert.match(projectStateContent, /No active session purpose recorded|Keep memory synchronized/);
  assert.match(projectStateContent, /Session ID: `memory-sync-test`/);

  const workflowContent = fs.readFileSync(path.join(memoryDir, 'workflow.md'), 'utf8');
  assert.match(workflowContent, /Slice 10: T19 Auto-memory system/);

  delete process.env.EVOKORE_CLAUDE_PROJECTS_DIR;
  cleanup([tmpRoot, sessionPaths.sessionStatePath, sessionPaths.replayLogPath, sessionPaths.evidenceLogPath, sessionPaths.tasksPath]);
  console.log('Auto-memory validation passed.');
}

try {
  run();
} catch (error) {
  console.error('Auto-memory validation failed:', error);
  process.exit(1);
}
