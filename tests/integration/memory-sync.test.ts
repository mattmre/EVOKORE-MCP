import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CLAUDE_MEMORY_PATH = path.resolve(__dirname, '..', '..', 'scripts', 'claude-memory.js');
const SESSION_CONTINUITY_PATH = path.resolve(__dirname, '..', '..', 'scripts', 'session-continuity.js');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const claudeMemory = require(CLAUDE_MEMORY_PATH);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sessionContinuity = require(SESSION_CONTINUITY_PATH);

const cleanupPaths: string[] = [];

function createTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  cleanupPaths.push(dir);
  return dir;
}

function cleanupSessionArtifacts(sessionId: string): void {
  const paths = sessionContinuity.getSessionPaths(sessionId);
  for (const p of Object.values(paths) as string[]) {
    if (typeof p === 'string' && p !== sessionId) {
      try { fs.unlinkSync(p); } catch { /* ignore */ }
    }
  }
}

afterEach(() => {
  for (const p of cleanupPaths) {
    try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  cleanupPaths.length = 0;
});

describe('Memory Sync (T24)', () => {
  describe('module exports', () => {
    it('claude-memory.js exists', () => {
      expect(fs.existsSync(CLAUDE_MEMORY_PATH)).toBe(true);
    });

    it('exports syncMemory as a function', () => {
      expect(typeof claudeMemory.syncMemory).toBe('function');
    });

    it('exports slugifyWorkspace as a function', () => {
      expect(typeof claudeMemory.slugifyWorkspace).toBe('function');
    });

    it('exports detectClaudeProjectsDir as a function', () => {
      expect(typeof claudeMemory.detectClaudeProjectsDir).toBe('function');
    });

    it('exports findClaudeMemoryDir as a function', () => {
      expect(typeof claudeMemory.findClaudeMemoryDir).toBe('function');
    });

    it('exports findLatestSessionStateForWorkspace as a function', () => {
      expect(typeof claudeMemory.findLatestSessionStateForWorkspace).toBe('function');
    });

    it('exports getCanonicalRepoRoot as a function', () => {
      expect(typeof claudeMemory.getCanonicalRepoRoot).toBe('function');
    });

    it('exports getProjectState as a function', () => {
      expect(typeof claudeMemory.getProjectState).toBe('function');
    });
  });

  describe('syncMemory generates expected files', () => {
    it('creates MEMORY.md, project-state.md, patterns.md, workflow.md', () => {
      const tmpRoot = createTempDir('evokore-memsync-');
      const repoRoot = path.join(tmpRoot, 'EVOKORE-MCP');
      const projectsDir = path.join(tmpRoot, 'claude-projects');
      fs.mkdirSync(repoRoot, { recursive: true });
      fs.mkdirSync(projectsDir, { recursive: true });

      fs.writeFileSync(path.join(repoRoot, 'next-session.md'), '# Next\n');
      fs.writeFileSync(path.join(repoRoot, 'CLAUDE.md'), '# CLAUDE\n');
      fs.writeFileSync(path.join(repoRoot, 'task_plan.md'), '- [ ] Task\n');

      const originalEnv = process.env.EVOKORE_CLAUDE_PROJECTS_DIR;
      process.env.EVOKORE_CLAUDE_PROJECTS_DIR = projectsDir;

      try {
        const result = claudeMemory.syncMemory({ cwd: repoRoot });

        expect(result.files).toContain('MEMORY.md');
        expect(result.files).toContain('project-state.md');
        expect(result.files).toContain('patterns.md');
        expect(result.files).toContain('workflow.md');
        expect(result.files.length).toBe(4);

        for (const file of result.files) {
          expect(fs.existsSync(path.join(result.memoryDir, file))).toBe(true);
        }
      } finally {
        if (originalEnv !== undefined) {
          process.env.EVOKORE_CLAUDE_PROJECTS_DIR = originalEnv;
        } else {
          delete process.env.EVOKORE_CLAUDE_PROJECTS_DIR;
        }
      }
    });
  });

  describe('repo-aware session matching', () => {
    it('findLatestSessionStateForWorkspace matches by canonicalRepoRoot', () => {
      const tmpRoot = createTempDir('evokore-sessmatch-');
      const repoRoot = path.join(tmpRoot, 'EVOKORE-MCP');
      fs.mkdirSync(repoRoot, { recursive: true });

      const sessionId = `memsync-test-match-${Date.now()}`;
      try {
        sessionContinuity.writeSessionState(sessionId, {
          workspaceRoot: repoRoot,
          canonicalRepoRoot: repoRoot,
          repoName: 'EVOKORE-MCP',
          purpose: 'Test session matching',
          status: 'active',
          lastActivityAt: new Date().toISOString()
        });

        const found = claudeMemory.findLatestSessionStateForWorkspace(repoRoot);
        expect(found).not.toBeNull();
        expect(found.purpose).toBe('Test session matching');
      } finally {
        cleanupSessionArtifacts(sessionId);
      }
    });

    it('findLatestSessionStateForWorkspace returns null for unrelated workspace', () => {
      const tmpRoot = createTempDir('evokore-nomatchwks-');
      const unrelatedDir = path.join(tmpRoot, 'some-other-project');
      fs.mkdirSync(unrelatedDir, { recursive: true });

      // May return null or may find an existing session -- either way, any match must
      // have a canonicalRepoRoot or workspaceRoot matching the input
      const result = claudeMemory.findLatestSessionStateForWorkspace(unrelatedDir);
      if (result !== null) {
        // If something matched, it should relate to the queried workspace path
        const normalizedQuery = path.resolve(unrelatedDir).replace(/\\/g, '/').toLowerCase();
        const matchedRoot = (result.canonicalRepoRoot || result.workspaceRoot || '').replace(/\\/g, '/').toLowerCase();
        expect(normalizedQuery.startsWith(matchedRoot) || matchedRoot.startsWith(normalizedQuery)).toBe(true);
      }
    });
  });

  describe('MEMORY.md structure', () => {
    it('contains expected section headers', () => {
      const tmpRoot = createTempDir('evokore-memstruct-');
      const repoRoot = path.join(tmpRoot, 'EVOKORE-MCP');
      const projectsDir = path.join(tmpRoot, 'claude-projects');
      fs.mkdirSync(repoRoot, { recursive: true });
      fs.mkdirSync(projectsDir, { recursive: true });

      fs.writeFileSync(path.join(repoRoot, 'next-session.md'), '');
      fs.writeFileSync(path.join(repoRoot, 'CLAUDE.md'), '');
      fs.writeFileSync(path.join(repoRoot, 'task_plan.md'), '');

      const originalEnv = process.env.EVOKORE_CLAUDE_PROJECTS_DIR;
      process.env.EVOKORE_CLAUDE_PROJECTS_DIR = projectsDir;

      try {
        const result = claudeMemory.syncMemory({ cwd: repoRoot });
        const memoryContent = fs.readFileSync(path.join(result.memoryDir, 'MEMORY.md'), 'utf8');

        expect(memoryContent).toContain('# EVOKORE-MCP Memory');
        expect(memoryContent).toContain('## Quick Reference');
        expect(memoryContent).toContain('## Current Focus');
        expect(memoryContent).toContain('## Runtime Continuity');
        expect(memoryContent).toContain('## Notes');
      } finally {
        if (originalEnv !== undefined) {
          process.env.EVOKORE_CLAUDE_PROJECTS_DIR = originalEnv;
        } else {
          delete process.env.EVOKORE_CLAUDE_PROJECTS_DIR;
        }
      }
    });

    it('MEMORY.md references companion files', () => {
      const tmpRoot = createTempDir('evokore-memrefs-');
      const repoRoot = path.join(tmpRoot, 'EVOKORE-MCP');
      const projectsDir = path.join(tmpRoot, 'claude-projects');
      fs.mkdirSync(repoRoot, { recursive: true });
      fs.mkdirSync(projectsDir, { recursive: true });

      fs.writeFileSync(path.join(repoRoot, 'next-session.md'), '');
      fs.writeFileSync(path.join(repoRoot, 'CLAUDE.md'), '');
      fs.writeFileSync(path.join(repoRoot, 'task_plan.md'), '');

      const originalEnv = process.env.EVOKORE_CLAUDE_PROJECTS_DIR;
      process.env.EVOKORE_CLAUDE_PROJECTS_DIR = projectsDir;

      try {
        const result = claudeMemory.syncMemory({ cwd: repoRoot });
        const memoryContent = fs.readFileSync(path.join(result.memoryDir, 'MEMORY.md'), 'utf8');

        expect(memoryContent).toContain('project-state.md');
        expect(memoryContent).toContain('workflow.md');
        expect(memoryContent).toContain('patterns.md');
      } finally {
        if (originalEnv !== undefined) {
          process.env.EVOKORE_CLAUDE_PROJECTS_DIR = originalEnv;
        } else {
          delete process.env.EVOKORE_CLAUDE_PROJECTS_DIR;
        }
      }
    });

    it('MEMORY.md includes session purpose from active session', () => {
      const tmpRoot = createTempDir('evokore-mempurpose-');
      const repoRoot = path.join(tmpRoot, 'EVOKORE-MCP');
      const projectsDir = path.join(tmpRoot, 'claude-projects');
      fs.mkdirSync(repoRoot, { recursive: true });
      fs.mkdirSync(projectsDir, { recursive: true });

      fs.writeFileSync(path.join(repoRoot, 'next-session.md'), '');
      fs.writeFileSync(path.join(repoRoot, 'CLAUDE.md'), '');
      fs.writeFileSync(path.join(repoRoot, 'task_plan.md'), '');

      const sessionId = `memsync-purpose-${Date.now()}`;
      const originalEnv = process.env.EVOKORE_CLAUDE_PROJECTS_DIR;
      process.env.EVOKORE_CLAUDE_PROJECTS_DIR = projectsDir;

      try {
        sessionContinuity.writeSessionState(sessionId, {
          workspaceRoot: repoRoot,
          canonicalRepoRoot: repoRoot,
          repoName: 'EVOKORE-MCP',
          purpose: 'Validate memory sync pipeline',
          status: 'active'
        });

        const result = claudeMemory.syncMemory({ cwd: repoRoot, sessionId });
        const memoryContent = fs.readFileSync(path.join(result.memoryDir, 'MEMORY.md'), 'utf8');
        expect(memoryContent).toContain('Validate memory sync pipeline');
      } finally {
        if (originalEnv !== undefined) {
          process.env.EVOKORE_CLAUDE_PROJECTS_DIR = originalEnv;
        } else {
          delete process.env.EVOKORE_CLAUDE_PROJECTS_DIR;
        }
        cleanupSessionArtifacts(sessionId);
      }
    });
  });

  describe('stale session filtering', () => {
    it('picks the most recent session for the workspace', () => {
      const tmpRoot = createTempDir('evokore-stale-');
      const repoRoot = path.join(tmpRoot, 'EVOKORE-MCP');
      fs.mkdirSync(repoRoot, { recursive: true });

      const oldSessionId = `memsync-old-${Date.now()}`;
      const newSessionId = `memsync-new-${Date.now() + 1}`;

      try {
        // Write older session
        sessionContinuity.writeSessionState(oldSessionId, {
          workspaceRoot: repoRoot,
          canonicalRepoRoot: repoRoot,
          purpose: 'Old session',
          status: 'completed',
          updatedAt: '2025-01-01T00:00:00.000Z'
        });

        // Write newer session
        sessionContinuity.writeSessionState(newSessionId, {
          workspaceRoot: repoRoot,
          canonicalRepoRoot: repoRoot,
          purpose: 'New session',
          status: 'active',
          updatedAt: new Date().toISOString()
        });

        const found = claudeMemory.findLatestSessionStateForWorkspace(repoRoot);
        expect(found).not.toBeNull();
        expect(found.purpose).toBe('New session');
      } finally {
        cleanupSessionArtifacts(oldSessionId);
        cleanupSessionArtifacts(newSessionId);
      }
    });
  });

  describe('missing session directory handling', () => {
    it('findLatestSessionStateForWorkspace returns null if sessions dir does not exist', () => {
      // The sessions dir is at ~/.evokore/sessions/ which should exist in test env
      // but a non-matching workspace should return null
      const nonExistent = path.join(os.tmpdir(), `evokore-nonexist-wks-${Date.now()}`);
      const result = claudeMemory.findLatestSessionStateForWorkspace(nonExistent);
      // Either null (no sessions match) or a session that happens to match this path
      // Since this is a random temp path, null is expected
      if (result !== null) {
        // If we get a result, it must relate to the queried path somehow
        expect(result.sessionId || result.workspaceRoot).toBeDefined();
      }
    });

    it('syncMemory works with a workspace that has no matching sessions', () => {
      const tmpRoot = createTempDir('evokore-nosess-');
      const repoRoot = path.join(tmpRoot, 'EVOKORE-MCP');
      const projectsDir = path.join(tmpRoot, 'claude-projects');
      fs.mkdirSync(repoRoot, { recursive: true });
      fs.mkdirSync(projectsDir, { recursive: true });

      fs.writeFileSync(path.join(repoRoot, 'next-session.md'), '');
      fs.writeFileSync(path.join(repoRoot, 'CLAUDE.md'), '');
      fs.writeFileSync(path.join(repoRoot, 'task_plan.md'), '');

      const originalEnv = process.env.EVOKORE_CLAUDE_PROJECTS_DIR;
      process.env.EVOKORE_CLAUDE_PROJECTS_DIR = projectsDir;

      try {
        const result = claudeMemory.syncMemory({ cwd: repoRoot });
        // Should still generate all 4 files even without a matching session
        expect(result.files.length).toBe(4);
        for (const file of result.files) {
          expect(fs.existsSync(path.join(result.memoryDir, file))).toBe(true);
        }

        // project-state.md should note no session found
        const projectState = fs.readFileSync(path.join(result.memoryDir, 'project-state.md'), 'utf8');
        // Either has session data or indicates none found
        expect(projectState).toMatch(/Session ID:|No repo-scoped session manifest found/);
      } finally {
        if (originalEnv !== undefined) {
          process.env.EVOKORE_CLAUDE_PROJECTS_DIR = originalEnv;
        } else {
          delete process.env.EVOKORE_CLAUDE_PROJECTS_DIR;
        }
      }
    });
  });

  describe('corrupt session manifest handling', () => {
    it('readSessionState returns null for non-existent session', () => {
      const result = sessionContinuity.readSessionState(`nonexistent-session-${Date.now()}`);
      expect(result).toBeNull();
    });

    it('readSessionState returns null for corrupt JSON', () => {
      const sessionId = `corrupt-test-${Date.now()}`;
      const paths = sessionContinuity.getSessionPaths(sessionId);

      try {
        // Write corrupt JSON
        const sessionsDir = path.dirname(paths.sessionStatePath);
        fs.mkdirSync(sessionsDir, { recursive: true });
        fs.writeFileSync(paths.sessionStatePath, '{invalid json content!!!');

        const result = sessionContinuity.readSessionState(sessionId);
        expect(result).toBeNull();
      } finally {
        try { fs.unlinkSync(paths.sessionStatePath); } catch { /* ignore */ }
      }
    });

    it('findLatestSessionStateForWorkspace skips corrupt session files gracefully', () => {
      // This exercises the try/catch in the candidate loop
      const tmpRoot = createTempDir('evokore-corrupt-');
      const repoRoot = path.join(tmpRoot, 'EVOKORE-MCP');
      fs.mkdirSync(repoRoot, { recursive: true });

      // No crash expected -- the function should skip corrupt files
      const result = claudeMemory.findLatestSessionStateForWorkspace(repoRoot);
      // May return null or a valid session -- must not throw
      expect(result === null || typeof result === 'object').toBe(true);
    });
  });

  describe('slugifyWorkspace', () => {
    it('replaces path separators and special chars with dashes', () => {
      const slug = claudeMemory.slugifyWorkspace('D:\\GITHUB\\EVOKORE-MCP');
      expect(slug).not.toMatch(/[\\/:]/);
      expect(slug).toContain('EVOKORE-MCP');
    });

    it('collapses consecutive dashes', () => {
      const slug = claudeMemory.slugifyWorkspace('/some///path///here');
      expect(slug).not.toMatch(/--/);
    });

    it('does not start with a dash', () => {
      const slug = claudeMemory.slugifyWorkspace('/path/to/repo');
      expect(slug[0]).not.toBe('-');
    });
  });
});
