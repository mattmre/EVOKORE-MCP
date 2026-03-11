#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { sanitizeId } = require('./hook-observability');
const { readSessionState } = require('./session-continuity');
const {
  findClaudeMemoryDir,
  findLatestSessionStateForWorkspace,
  getCanonicalRepoRoot,
  getProjectState
} = require('./claude-memory');

const RESET = '\x1b[0m';
const COLORS = {
  slate: '\x1b[38;2;148;163;184m',
  branch: '\x1b[38;2;96;165;250m',
  clean: '\x1b[38;2;74;222;128m',
  warn: '\x1b[38;2;251;191;36m',
  elevated: '\x1b[38;2;251;146;60m',
  critical: '\x1b[38;2;251;113;133m',
  purpose: '\x1b[38;2;191;219;254m',
  info: '\x1b[38;2;129;140;248m'
};

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function truncate(value, maxLength) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function parseContext(payload) {
  const currentUsage = payload && payload.context_window && payload.context_window.current_usage
    ? payload.context_window.current_usage
    : {};
  const inputTokens = Number(currentUsage.input_tokens || 0);
  const outputTokens = Number(currentUsage.output_tokens || 0);
  const maxTokens = Number(payload && payload.context_window && payload.context_window.context_window_size
    ? payload.context_window.context_window_size
    : 200000);
  let usedPercentage = Number(payload && payload.context_window && payload.context_window.used_percentage
    ? payload.context_window.used_percentage
    : 0);

  if (!usedPercentage && maxTokens > 0 && (inputTokens > 0 || outputTokens > 0)) {
    usedPercentage = Math.round(((inputTokens + outputTokens) / maxTokens) * 100);
  }

  return {
    inputTokens,
    outputTokens,
    maxTokens,
    usedPercentage
  };
}

function parseManagedProjectState(memoryDir) {
  if (!memoryDir) return null;
  const content = safeRead(path.join(memoryDir, 'project-state.md'));
  if (!content) return null;

  const snapshot = {};
  for (const line of content.split(/\r?\n/)) {
    let match = line.match(/^- Branch: `([^`]+)`$/);
    if (match) snapshot.branch = match[1];
    match = line.match(/^- HEAD: `([^`]+)`$/);
    if (match) snapshot.head = match[1];
    match = line.match(/^- Latest session purpose: (.+)$/);
    if (match) snapshot.purpose = match[1].trim();
    match = line.match(/^- Latest session activity: (.+)$/);
    if (match) snapshot.lastActivityAt = match[1].trim();
  }

  return Object.keys(snapshot).length > 0 ? snapshot : null;
}

function getSessionId(payload) {
  const candidate = payload && (payload.session_id || payload.sessionId || payload.session);
  if (candidate) return sanitizeId(candidate);
  if (process.env.CLAUDE_SESSION_ID) return sanitizeId(process.env.CLAUDE_SESSION_ID);
  return null;
}

function hasValidRepoScope(sessionState, workspaceRoot) {
  if (!sessionState) return false;
  if (sessionState.canonicalRepoRoot) {
    return path.resolve(sessionState.canonicalRepoRoot) === path.resolve(workspaceRoot);
  }
  if (sessionState.workspaceRoot) {
    const resolvedWorkspace = path.resolve(sessionState.workspaceRoot);
    const resolvedRepo = path.resolve(workspaceRoot);
    return resolvedWorkspace === resolvedRepo
      || resolvedWorkspace.startsWith(path.join(resolvedRepo, '.orchestrator', 'worktrees'));
  }
  return false;
}

function resolveSessionState(workspaceRoot, sessionId) {
  if (sessionId) {
    const directState = readSessionState(sessionId);
    if (hasValidRepoScope(directState, workspaceRoot)) {
      return directState;
    }
  }

  return findLatestSessionStateForWorkspace(workspaceRoot);
}

function deriveContinuityHealth(sessionState) {
  if (!sessionState) {
    return { label: 'missing', severity: 'critical', detail: 'no manifest' };
  }

  if (!sessionState.purpose || sessionState.status === 'awaiting-purpose') {
    return { label: 'awaiting-purpose', severity: 'warn', detail: 'purpose missing' };
  }

  const updatedAt = sessionState.updatedAt ? new Date(sessionState.updatedAt).getTime() : 0;
  if (!updatedAt || Number.isNaN(updatedAt)) {
    return { label: 'degraded', severity: 'elevated', detail: 'bad timestamp' };
  }

  const ageMs = Date.now() - updatedAt;
  if (ageMs > 24 * 60 * 60 * 1000) {
    return { label: 'stale', severity: 'elevated', detail: 'older than 24h' };
  }

  const artifacts = sessionState.artifacts || {};
  const missingArtifacts = ['sessionStatePath', 'replayLogPath', 'evidenceLogPath', 'tasksPath']
    .filter((key) => !artifacts[key]);
  if (missingArtifacts.length > 0) {
    return { label: 'degraded', severity: 'elevated', detail: 'artifact pointers missing' };
  }

  return { label: 'healthy', severity: 'clean', detail: 'manifest current' };
}

function getChangeSummary(projectState) {
  const changes = Array.isArray(projectState.changes) ? projectState.changes : [];
  const summary = { staged: 0, modified: 0, untracked: 0 };

  for (const line of changes) {
    if (/^\?\?/.test(line)) {
      summary.untracked += 1;
      continue;
    }
    const stagedCode = line[0];
    const worktreeCode = line[1];
    if (stagedCode && stagedCode !== ' ') summary.staged += 1;
    if (worktreeCode && worktreeCode !== ' ') summary.modified += 1;
  }

  return summary;
}

function pickColor(severity) {
  switch (severity) {
    case 'clean':
      return COLORS.clean;
    case 'warn':
      return COLORS.warn;
    case 'elevated':
      return COLORS.elevated;
    case 'critical':
      return COLORS.critical;
    default:
      return COLORS.slate;
  }
}

function formatSegment(label, value) {
  return `${label} ${value}`;
}

function renderBranchSegment(projectState, useAnsi) {
  const changeSummary = getChangeSummary(projectState);
  const totalChanges = changeSummary.staged + changeSummary.modified + changeSummary.untracked;
  const branchValue = totalChanges > 0
    ? `${projectState.branch} +${totalChanges}`
    : `${projectState.branch} clean`;
  if (!useAnsi) {
    return branchValue;
  }
  return `${COLORS.branch}${projectState.branch}${RESET} ${totalChanges > 0 ? `${COLORS.elevated}+${totalChanges}${RESET}` : `${COLORS.clean}clean${RESET}`}`;
}

function renderPurposeSegment(purpose, useAnsi, maxLength) {
  const display = truncate(purpose || 'no purpose recorded', maxLength);
  if (!useAnsi) {
    return display;
  }
  return `${COLORS.purpose}${display}${RESET}`;
}

function renderTasksSegment(sessionState, useAnsi) {
  const metrics = sessionState && sessionState.metrics ? sessionState.metrics : {};
  const incomplete = Number(metrics.incompleteTasks || 0);
  const total = Number(metrics.totalTasks || 0);
  const label = incomplete > 0 ? `${incomplete}/${total || incomplete} open` : '0 open';
  if (!useAnsi) {
    return label;
  }
  const severity = incomplete >= 5 ? 'critical' : incomplete > 0 ? 'warn' : 'clean';
  return `${pickColor(severity)}${label}${RESET}`;
}

function renderContinuitySegment(health, sessionState, useAnsi) {
  const metrics = sessionState && sessionState.metrics ? sessionState.metrics : {};
  const replayEntries = Number(metrics.replayEntries || 0);
  const evidenceEntries = Number(metrics.evidenceEntries || 0);
  const label = `${health.label} ${replayEntries}r/${evidenceEntries}e`;
  if (!useAnsi) {
    return label;
  }
  return `${pickColor(health.severity)}${label}${RESET}`;
}

function renderContextSegment(context, useAnsi) {
  if (!context || !context.usedPercentage) return null;
  const pct = Math.max(0, Math.min(100, Math.round(context.usedPercentage)));
  if (!useAnsi) {
    return `${pct}%`;
  }
  const severity = pct >= 80 ? 'critical' : pct >= 60 ? 'elevated' : pct >= 40 ? 'warn' : 'clean';
  return `${pickColor(severity)}${pct}%${RESET}`;
}

function buildStatusSnapshot(payload = {}, options = {}) {
  const activeCwd = path.resolve(
    options.cwd
      || (payload.workspace && payload.workspace.current_dir)
      || payload.cwd
      || process.cwd()
  );
  const workspaceRoot = getCanonicalRepoRoot(activeCwd);
  const sessionId = getSessionId(payload);
  const sessionState = resolveSessionState(workspaceRoot, sessionId);
  const projectState = getProjectState(workspaceRoot, activeCwd);
  const context = parseContext(payload);
  const memoryDir = findClaudeMemoryDir(workspaceRoot);
  const managedProjectState = parseManagedProjectState(memoryDir);
  const health = deriveContinuityHealth(sessionState);

  const purpose = sessionState && sessionState.purpose
    ? sessionState.purpose
    : managedProjectState && managedProjectState.purpose
      ? managedProjectState.purpose
      : 'no purpose recorded';

  return {
    activeCwd,
    workspaceRoot,
    sessionId,
    projectState,
    sessionState,
    managedProjectState,
    memoryDir,
    context,
    purpose,
    health
  };
}

function renderStatusLine(snapshot, options = {}) {
  const width = Number(options.width || process.stdout.columns || 100);
  const useAnsi = options.ansi !== false;
  const compact = width < 60;
  const mini = width >= 60 && width < 95;

  const segments = [];
  segments.push(renderBranchSegment(snapshot.projectState, useAnsi));

  if (!compact) {
    segments.push(formatSegment('purpose', renderPurposeSegment(snapshot.purpose, useAnsi, mini ? 30 : 48)));
  }

  segments.push(formatSegment('tasks', renderTasksSegment(snapshot.sessionState, useAnsi)));
  segments.push(formatSegment('continuity', renderContinuitySegment(snapshot.health, snapshot.sessionState, useAnsi)));

  const contextSegment = renderContextSegment(snapshot.context, useAnsi);
  if (contextSegment) {
    segments.push(formatSegment('ctx', contextSegment));
  }

  if (!compact && snapshot.projectState.head && snapshot.projectState.head !== 'unknown') {
    segments.push(formatSegment('head', useAnsi ? `${COLORS.info}${snapshot.projectState.head}${RESET}` : snapshot.projectState.head));
  }

  return `${useAnsi ? `${COLORS.slate}EVOKORE${RESET} ` : '[EVOKORE Status] '}${segments.join(useAnsi ? ` ${COLORS.slate}|${RESET} ` : ' | ')}`;
}

module.exports = {
  buildStatusSnapshot,
  renderStatusLine,
  deriveContinuityHealth,
  parseManagedProjectState,
  parseContext
};
