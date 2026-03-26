#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const { readSessionState, resolveCanonicalRepoRoot } = require('./session-continuity');

function normalizePath(value) {
  return path.resolve(String(value || '')).replace(/\\/g, '/').toLowerCase();
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function getCanonicalRepoRoot(startDir = process.cwd()) {
  return resolveCanonicalRepoRoot(startDir);
}

function slugifyWorkspace(workspaceRoot) {
  return path.resolve(workspaceRoot)
    .replace(/:/g, '-')
    .replace(/[\\/]+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-/, '');
}

function detectClaudeProjectsDir() {
  if (process.env.EVOKORE_CLAUDE_PROJECTS_DIR) {
    return path.resolve(process.env.EVOKORE_CLAUDE_PROJECTS_DIR);
  }
  return path.join(os.homedir(), '.claude', 'projects');
}

function findClaudeMemoryDir(workspaceRoot) {
  if (process.env.EVOKORE_CLAUDE_MEMORY_DIR) {
    return path.resolve(process.env.EVOKORE_CLAUDE_MEMORY_DIR);
  }

  const projectsDir = detectClaudeProjectsDir();
  ensureDir(projectsDir);

  const canonicalRoot = path.resolve(workspaceRoot);
  const expectedSlug = slugifyWorkspace(canonicalRoot);
  const expectedMemoryDir = path.join(projectsDir, expectedSlug, 'memory');
  if (fs.existsSync(path.dirname(expectedMemoryDir))) {
    return expectedMemoryDir;
  }

  const repoName = path.basename(canonicalRoot).toLowerCase();
  const projectDirs = fs.existsSync(projectsDir)
    ? fs.readdirSync(projectsDir)
      .map((entry) => path.join(projectsDir, entry))
      .filter((entryPath) => fs.existsSync(entryPath) && fs.statSync(entryPath).isDirectory())
    : [];

  const normalizedRoot = normalizePath(canonicalRoot);
  for (const projectDir of projectDirs) {
    const memoryDir = path.join(projectDir, 'memory');
    if (!fs.existsSync(memoryDir)) continue;
    if (path.basename(projectDir).toLowerCase() === expectedSlug.toLowerCase()) {
      return memoryDir;
    }
    if (path.basename(projectDir).toLowerCase().endsWith(repoName)) {
      return memoryDir;
    }
    const maybeStatePath = path.join(projectDir, 'memory', 'project-state.md');
    const content = safeRead(maybeStatePath);
    if (content && content.toLowerCase().includes(normalizedRoot)) {
      return memoryDir;
    }
  }

  return expectedMemoryDir;
}

function findLatestSessionStateForWorkspace(workspaceRoot) {
  const sessionsDir = path.join(os.homedir(), '.evokore', 'sessions');
  if (!fs.existsSync(sessionsDir)) return null;

  const normalizedRoot = normalizePath(workspaceRoot);
  const candidates = fs.readdirSync(sessionsDir)
    .filter((name) => name.endsWith('.json') && !name.endsWith('-tasks.json'))
    .map((name) => path.join(sessionsDir, name));

  let latest = null;
  for (const candidate of candidates) {
    let state = null;
    try {
      state = JSON.parse(fs.readFileSync(candidate, 'utf8'));
    } catch {
      continue;
    }

    const workspacePath = state && state.workspaceRoot ? normalizePath(state.workspaceRoot) : null;
    const canonicalRepoRoot = state && state.canonicalRepoRoot ? normalizePath(state.canonicalRepoRoot) : null;
    if (!canonicalRepoRoot && !workspacePath) {
      continue;
    }
    if (canonicalRepoRoot && canonicalRepoRoot !== normalizedRoot) {
      continue;
    }
    if (!canonicalRepoRoot && workspacePath && workspacePath !== normalizedRoot && !workspacePath.startsWith(`${normalizedRoot}/.orchestrator/worktrees/`)) {
      continue;
    }

    const ts = new Date(state && state.updatedAt ? state.updatedAt : fs.statSync(candidate).mtime.toISOString()).getTime();
    if (!latest || ts > latest.ts) {
      latest = { ts, state };
    }
  }

  return latest ? latest.state : null;
}

function getGitValue(args, cwd, fallback = null) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return fallback;
  }
}

function getProjectState(repoRoot, activeCwd) {
  const canonicalRoot = path.resolve(repoRoot);
  const worktreeRoot = path.resolve(activeCwd || repoRoot);
  const branch = getGitValue(['branch', '--show-current'], worktreeRoot, 'unknown');
  const head = getGitValue(['rev-parse', '--short', 'HEAD'], worktreeRoot, 'unknown');
  const statusLines = getGitValue(['status', '--short'], worktreeRoot, '') || '';
  const changes = statusLines
    .split(/\r?\n/)
    .filter(Boolean);

  return {
    workspaceRoot: canonicalRoot,
    activeWorktree: worktreeRoot,
    repoName: path.basename(canonicalRoot),
    branch,
    head,
    changes,
    dirty: changes.length > 0
  };
}

function pickTaskLine(taskPlanContent) {
  if (!taskPlanContent) return '- No root task plan available.';
  const lines = taskPlanContent.split(/\r?\n/);
  const activeLine = lines.find((line) => /^\s*-\s+\[\s\]\s+Slice 10: T19/.test(line))
    || lines.find((line) => /^\s*-\s+\[\s\]\s+T19:/.test(line))
    || lines.find((line) => /^\s*-\s+\[\s\]\s+/.test(line))
    || lines.find((line) => /^\s*-\s+\[x\]\s+Slice 9: T18/.test(line));
  return activeLine ? activeLine.replace(/^\s*/, '') : '- No active slice recorded.';
}

function buildManagedFiles(options) {
  const {
    projectState,
    sessionState,
    nextSessionContent,
    claudeContent,
    taskPlanContent
  } = options;

  const latestPurpose = sessionState && sessionState.purpose ? sessionState.purpose : 'No active session purpose recorded.';
  const latestActivity = sessionState && sessionState.lastActivityAt ? sessionState.lastActivityAt : 'unknown';
  const lastEvidence = sessionState && sessionState.lastEvidenceId ? `${sessionState.lastEvidenceId} (${sessionState.lastEvidenceType || 'unknown'})` : 'none';
  const nextAction = pickTaskLine(taskPlanContent);

  const memoryMd = `# EVOKORE-MCP Memory

## Quick Reference
- See [project-state.md](project-state.md) for the current branch, head commit, repo path, and latest session manifest snapshot.
- See [workflow.md](workflow.md) for the sequential roadmap gate, session-wrap contract, and restart order.
- See [patterns.md](patterns.md) for stable repo conventions that should survive across sessions.

## Current Focus
- Active repo: \`${projectState.repoName}\`
- Current branch in this workspace: \`${projectState.branch}\`
- Current HEAD: \`${projectState.head}\`
- Latest recorded session purpose: ${latestPurpose}
- Latest recorded activity: ${latestActivity}
- Next roadmap action: ${nextAction}

## Runtime Continuity
- Session manifest: \`~/.evokore/sessions/{sessionId}.json\`
- Replay log: \`~/.evokore/sessions/*-replay.jsonl\`
- Evidence log: \`~/.evokore/sessions/*-evidence.jsonl\`
- Task state: \`~/.evokore/sessions/*-tasks.json\`
- Claude memory dir: managed by \`node scripts/sync-memory.js\`

## Notes
- This memory set is managed by EVOKORE's auto-memory sync. Update the generating script rather than hand-editing derived state.
- Keep durable operator guidance in \`CLAUDE.md\`; keep stable project knowledge and current state here.
`;

  const projectStateMd = `# Project State

- Repo path: \`${projectState.workspaceRoot}\`
- Repo name: \`${projectState.repoName}\`
- Branch: \`${projectState.branch}\`
- HEAD: \`${projectState.head}\`
- Dirty working tree: ${projectState.dirty ? 'yes' : 'no'}
- Latest session purpose: ${latestPurpose}
- Latest session activity: ${latestActivity}
- Last evidence item: ${lastEvidence}

## Working Tree Snapshot
${projectState.changes.length > 0
    ? projectState.changes.map((line) => `- \`${line}\``).join('\n')
    : '- Clean working tree in the T19 worktree when synced.'}

## Session Manifest Snapshot
${sessionState
    ? `- Session ID: \`${sessionState.sessionId}\`
- Status: \`${sessionState.status}\`
- Replay entries: ${sessionState.metrics && sessionState.metrics.replayEntries !== undefined ? sessionState.metrics.replayEntries : 0}
- Evidence entries: ${sessionState.metrics && sessionState.metrics.evidenceEntries !== undefined ? sessionState.metrics.evidenceEntries : 0}
- Incomplete tasks: ${sessionState.metrics && sessionState.metrics.incompleteTasks !== undefined ? sessionState.metrics.incompleteTasks : 0}`
    : '- No repo-scoped session manifest found yet.'}
`;

  const patternsMd = `# Stable Patterns

## Hook and Continuity Rules
- Hook entrypoints are canonical under \`scripts/hooks/*.js\`, with legacy top-level wrappers preserved for compatibility.
- All hooks must fail safe and exit 0 on unexpected errors.
- Runtime continuity is anchored in the session manifest at \`~/.evokore/sessions/{sessionId}.json\`.
- Replay, evidence, and TillDone files remain append-only sibling artifacts; do not replace them with a second state store.

## Repo Workflow Rules
- Work sequentially through the roadmap slices and keep one PR per slice.
- Use fresh worktrees for each slice to reduce context drift.
- Keep shared trackers (\`next-session.md\`, session logs, root planning files) on the root control plane, not feature branches, until the slice lands.
- Use \`.commit-msg.txt\` with \`git commit -F\` when damage-control may misread inline shell strings.

## Current Architecture Notes
- Skill indexing is recursive and currently indexes roughly 336 skills.
- \`resolve_workflow\` uses aliases, semantic hints, and reranking to prefer actionable root skills.
- \`scripts/sync-configs.js\` resolves the canonical git common root and supports \`EVOKORE_SYNC_PROJECT_ROOT\` for explicit overrides.
- PR metadata validation may require a fresh sync commit if the PR body is fixed after creation.
`;

  const workflowMd = `# Workflow

## Sequential Roadmap Gate
- Latest handoff doc: \`next-session.md\`
- Active root control plane: \`task_plan.md\`, \`findings.md\`, \`progress.md\`
- Current next action from plan: ${nextAction}

## Session Wrap Contract
- Write a durable session log in \`docs/session-logs/\`
- Refresh \`next-session.md\` with the exact next restart point
- Update \`CLAUDE.md\` only with durable operator learnings
- Validate \`test-next-session-freshness-validation.js\`, \`test-ops-docs-validation.js\`, and \`test-tracker-consistency-validation.js\`

## Current Next-Session Snapshot
${(nextSessionContent || '').split(/\r?\n/).slice(0, 20).map((line) => line || '').join('\n')}

## CLAUDE Highlights
${(claudeContent || '').split(/\r?\n/).filter((line) => line.startsWith('- **')).slice(0, 10).join('\n')}
`;

  return {
    'MEMORY.md': memoryMd.trim() + '\n',
    'project-state.md': projectStateMd.trim() + '\n',
    'patterns.md': patternsMd.trim() + '\n',
    'workflow.md': workflowMd.trim() + '\n'
  };
}

function syncMemory(options = {}) {
  const quiet = Boolean(options.quiet);
  try {
    const activeCwd = path.resolve(options.cwd || process.cwd());
    const workspaceRoot = getCanonicalRepoRoot(activeCwd);
    const memoryDir = findClaudeMemoryDir(workspaceRoot);
    ensureDir(memoryDir);

    const sessionState = (options.sessionId ? readSessionState(options.sessionId) : null)
      || findLatestSessionStateForWorkspace(workspaceRoot);
    const projectState = getProjectState(workspaceRoot, activeCwd);
    const nextSessionContent = safeRead(path.join(workspaceRoot, 'next-session.md')) || '';
    const claudeContent = safeRead(path.join(workspaceRoot, 'CLAUDE.md')) || '';
    const taskPlanContent = safeRead(path.join(workspaceRoot, 'task_plan.md')) || '';

    const files = buildManagedFiles({
      projectState,
      sessionState,
      nextSessionContent,
      claudeContent,
      taskPlanContent
    });

    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(memoryDir, name), content);
    }

    return {
      synced: true,
      workspaceRoot,
      activeCwd,
      memoryDir,
      files: Object.keys(files),
      sessionState
    };
  } catch (err) {
    if (process.env.EVOKORE_DEBUG) {
      process.stderr.write(`[claude-memory] syncMemory error: ${err && err.message ? err.message : err}\n`);
    }
    return {
      synced: false,
      error: String(err && err.message ? err.message : err)
    };
  }
}

if (require.main === module) {
  const result = syncMemory();
  process.stdout.write(JSON.stringify(result, null, 2));
}

module.exports = {
  slugifyWorkspace,
  detectClaudeProjectsDir,
  findClaudeMemoryDir,
  findLatestSessionStateForWorkspace,
  getCanonicalRepoRoot,
  getProjectState,
  syncMemory
};
