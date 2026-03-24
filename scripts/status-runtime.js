#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { sanitizeId } = require('./hook-observability');
const { readSessionState } = require('./session-continuity');
const {
  findClaudeMemoryDir,
  findLatestSessionStateForWorkspace,
  getCanonicalRepoRoot,
  getProjectState
} = require('./claude-memory');

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const COLORS = {
  slate:   '\x1b[38;2;148;163;184m',
  branch:  '\x1b[36m',         // cyan
  clean:   '\x1b[32m',         // green
  warn:    '\x1b[33m',         // yellow
  elevated:'\x1b[38;5;208m',   // orange
  critical:'\x1b[31m',         // red
  purpose: '\x1b[38;2;191;219;254m',
  info:    '\x1b[38;2;129;140;248m',
  model:   '\x1b[36m',         // cyan (matches claude-hud)
  git:     '\x1b[35m',         // magenta (matches claude-hud git:() parens)
  path:    '\x1b[33m',         // yellow (matches claude-hud project path)
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

// --- Model name ---

function getModelName(payload) {
  const displayName = payload && payload.model && payload.model.display_name;
  if (displayName && displayName.trim()) return displayName.trim();
  const modelId = payload && payload.model && payload.model.id;
  if (!modelId) return null;
  // Normalize IDs like "claude-sonnet-4-6" → "Claude Sonnet 4.6"
  const m = modelId.match(/claude-(opus|sonnet|haiku)-(\d+)(?:-(\d+))?/i);
  if (m) {
    const family = m[1][0].toUpperCase() + m[1].slice(1);
    const version = m[3] ? `${m[2]}.${m[3]}` : m[2];
    return `Claude ${family} ${version}`;
  }
  return modelId;
}

// --- Context window ---

function parseContext(payload) {
  const cw = payload && payload.context_window;
  const currentUsage = (cw && cw.current_usage) || {};
  const inputTokens = Number(currentUsage.input_tokens || 0);
  const cacheCreate = Number(currentUsage.cache_creation_input_tokens || 0);
  const cacheRead = Number(currentUsage.cache_read_input_tokens || 0);
  const outputTokens = Number(currentUsage.output_tokens || 0);
  const maxTokens = Number((cw && cw.context_window_size) ? cw.context_window_size : 200000);
  let usedPercentage = Number((cw && cw.used_percentage) ? cw.used_percentage : 0);

  const totalTokens = inputTokens + cacheCreate + cacheRead;
  if (!usedPercentage && maxTokens > 0 && totalTokens > 0) {
    usedPercentage = Math.round((totalTokens / maxTokens) * 100);
  }

  return { inputTokens, outputTokens, cacheCreate, cacheRead, maxTokens, usedPercentage, totalTokens };
}

// --- Colored context bar (claude-hud style) ---

function getContextColor(pct) {
  if (pct >= 85) return COLORS.critical;
  if (pct >= 70) return COLORS.warn;
  return COLORS.clean;
}

function coloredBar(pct, width) {
  const safeWidth = Math.max(0, Math.round(width));
  const safePct = Math.min(100, Math.max(0, pct));
  const filled = Math.round((safePct / 100) * safeWidth);
  const empty = safeWidth - filled;
  const color = getContextColor(safePct);
  return `${color}${'█'.repeat(filled)}${DIM}${'░'.repeat(empty)}${RESET}`;
}

// --- Git file stats (Starship-compatible) ---

function parseFileStats(changes) {
  const stats = { modified: 0, added: 0, deleted: 0, untracked: 0 };
  for (const line of changes) {
    if (!line || line.length < 2) continue;
    const index = line[0];
    const worktree = line[1];
    if (line.startsWith('??')) {
      stats.untracked++;
    } else if (index === 'A') {
      stats.added++;
    } else if (index === 'D' || worktree === 'D') {
      stats.deleted++;
    } else if (index === 'M' || worktree === 'M' || index === 'R' || index === 'C') {
      stats.modified++;
    }
  }
  return stats;
}

// --- EVOKORE state dir helper ---

function evokoreStateDir() {
  return path.join(os.homedir(), '.evokore');
}

// --- K: last tool used (from session manifest) ---
// sessionState.lastToolName is already available — no extra I/O.

// --- O: session age ---

function getSessionAge(sessionState) {
  const createdAt = sessionState && (sessionState.createdAt || sessionState.created);
  if (!createdAt) return null;
  const ms = Date.now() - new Date(createdAt).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  const totalMins = Math.floor(ms / 60000);
  if (totalMins < 60) return `${totalMins}m`;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// --- Q: cache hit ratio ---

function getCacheHitRatio(context) {
  const total = context.inputTokens + context.cacheCreate + context.cacheRead;
  if (total === 0) return null;
  return Math.round((context.cacheRead / total) * 100);
}

// --- V: damage-control blocks this session ---

function getDamageControlBlocks(sessionId) {
  if (!sessionId) return null;
  try {
    const logPath = path.join(evokoreStateDir(), 'logs', 'hooks.jsonl');
    const raw = safeRead(logPath);
    if (!raw) return null;
    let blocks = 0;
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.hook === 'damage-control' && entry.event === 'block' && entry.session_id === sessionId) {
          blocks++;
        }
      } catch { /* skip malformed lines */ }
    }
    return blocks;
  } catch {
    return null;
  }
}

// --- X: pending HITL approvals ---

function getPendingApprovalCount() {
  try {
    const filePath = path.join(evokoreStateDir(), 'pending-approvals.json');
    const raw = safeRead(filePath);
    if (!raw) return 0;
    const approvals = JSON.parse(raw);
    if (!Array.isArray(approvals)) return 0;
    const now = Date.now();
    return approvals.filter(a => a && a.expiresAt > now).length;
  } catch {
    return 0;
  }
}

// --- MCP server count ---

function getMcpServerCount() {
  try {
    const cfgPath = process.env.EVOKORE_MCP_CONFIG_PATH
      || path.join(__dirname, '..', 'mcp.config.json');
    const raw = fs.readFileSync(cfgPath, 'utf8');
    const cfg = JSON.parse(raw);
    const servers = cfg && cfg.servers ? Object.keys(cfg.servers) : [];
    return servers.length;
  } catch {
    return null;
  }
}

// --- Token formatting ---

function fmtK(n) {
  if (!Number.isFinite(n)) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

// --- Session/memory helpers ---

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
      || resolvedWorkspace.startsWith(path.join(resolvedRepo, '.claude', 'worktrees'));
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

// --- Color helpers ---

function pickColor(severity) {
  switch (severity) {
    case 'clean':    return COLORS.clean;
    case 'warn':     return COLORS.warn;
    case 'elevated': return COLORS.elevated;
    case 'critical': return COLORS.critical;
    default:         return COLORS.slate;
  }
}

// --- Segment renderers ---

/**
 * Line 1, segment 1: [model] ████████░░ 53% 102k/200k
 */
function renderModelContextSegment(modelName, context, useAnsi) {
  const pct = Math.max(0, Math.min(100, Math.round(context.usedPercentage)));
  const bar = coloredBar(pct, 10);
  const pctColor = getContextColor(pct);
  const pctStr = useAnsi ? `${pctColor}${pct}%${RESET}` : `${pct}%`;

  // [A] total tokens: 102k/200k
  const totalStr = context.maxTokens > 0
    ? ` ${DIM}${fmtK(context.totalTokens)}/${fmtK(context.maxTokens)}${RESET}`
    : '';

  const modelStr = modelName
    ? (useAnsi ? `${COLORS.model}[${modelName}]${RESET}` : `[${modelName}]`)
    : null;

  const base = useAnsi ? `${bar} ${pctStr}${totalStr}` : `ctx ${pct}% ${fmtK(context.totalTokens)}/${fmtK(context.maxTokens)}`;
  return modelStr ? `${modelStr} ${base}` : base;
}

/**
 * K: last tool used: last:Bash
 */
function renderLastToolSegment(sessionState, useAnsi) {
  const tool = sessionState && sessionState.lastToolName;
  if (!tool) return null;
  const label = `last:${tool}`;
  return useAnsi ? `${DIM}${label}${RESET}` : label;
}

/**
 * O: session age: 16m old
 */
function renderSessionAgeSegment(sessionState, useAnsi) {
  const age = getSessionAge(sessionState);
  if (!age) return null;
  const label = `${age} old`;
  return useAnsi ? `${DIM}${label}${RESET}` : label;
}

/**
 * Q: cache hit ratio: cache:39%
 */
function renderCacheRatioSegment(context, useAnsi) {
  const ratio = getCacheHitRatio(context);
  if (ratio === null) return null;
  const label = `cache:${ratio}%`;
  return useAnsi ? `${DIM}${label}${RESET}` : label;
}

/**
 * V: damage-control blocks: 3 blocked  (orange if >0)
 */
function renderDamageControlSegment(blocks, useAnsi) {
  if (blocks === null) return null;
  const label = blocks > 0 ? `${blocks} blocked` : '0 blocked';
  if (!useAnsi) return label;
  return blocks > 0
    ? `${COLORS.elevated}${label}${RESET}`
    : `${DIM}${label}${RESET}`;
}

/**
 * X: pending HITL approvals: 1 pending  (red/urgent if >0)
 */
function renderPendingApprovalsSegment(count, useAnsi) {
  if (!count) return null;  // hide when 0
  const label = `${count} pending`;
  return useAnsi ? `${COLORS.critical}${label}${RESET}` : label;
}

/**
 * Line 2, token breakdown: in:86k cache:16k out:3k
 */
function renderTokenBreakdownSegment(context, useAnsi) {
  if (!context.totalTokens && !context.outputTokens) return null;
  const cache = context.cacheCreate + context.cacheRead;
  const parts = [];
  if (context.inputTokens > 0) parts.push(`in:${fmtK(context.inputTokens)}`);
  if (cache > 0)               parts.push(`cache:${fmtK(cache)}`);
  if (context.outputTokens > 0) parts.push(`out:${fmtK(context.outputTokens)}`);
  if (parts.length === 0) return null;
  const label = parts.join(' ');
  return useAnsi ? `${DIM}${label}${RESET}` : label;
}

/**
 * Line 2, MCP server count: 5 MCPs
 */
function renderMcpSegment(mcpCount, useAnsi) {
  if (mcpCount === null) return null;
  const label = `${mcpCount} MCPs`;
  return useAnsi ? `${COLORS.info}${label}${RESET}` : label;
}

/**
 * Line 2, session ID: sess:a7b3c9d1
 */
function renderSessionIdSegment(sessionId, useAnsi) {
  if (!sessionId) return null;
  const short = sessionId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
  if (!short) return null;
  const label = `sess:${short}`;
  return useAnsi ? `${DIM}${label}${RESET}` : label;
}

/**
 * Line 1, segment 2: git:(main* !2 +1 ?3)
 */
function renderGitSegment(projectState, useAnsi) {
  const { branch, changes } = projectState;
  if (!branch || branch === 'unknown') return null;

  const stats = parseFileStats(changes || []);
  const isDirty = (changes || []).length > 0;

  const branchLabel = isDirty ? `${branch}*` : branch;
  const statParts = [];
  if (stats.modified > 0) statParts.push(`!${stats.modified}`);
  if (stats.added > 0)    statParts.push(`+${stats.added}`);
  if (stats.deleted > 0)  statParts.push(`✘${stats.deleted}`);
  if (stats.untracked > 0) statParts.push(`?${stats.untracked}`);

  const inner = statParts.length > 0
    ? `${branchLabel} ${statParts.join(' ')}`
    : branchLabel;

  if (!useAnsi) return `git:(${inner})`;
  return `${COLORS.git}git:(${RESET}${COLORS.branch}${inner}${RESET}${COLORS.git})${RESET}`;
}

/**
 * Line 1, segment 3: repo name (yellow)
 */
function renderRepoSegment(projectState, useAnsi) {
  const name = projectState && projectState.repoName;
  if (!name) return null;
  return useAnsi ? `${COLORS.path}${name}${RESET}` : name;
}

/**
 * Line 2 segments (EVOKORE-specific)
 */
function renderPurposeSegment(purpose, useAnsi, maxLength) {
  const display = truncate(purpose || 'no purpose recorded', maxLength);
  return useAnsi ? `${COLORS.purpose}${display}${RESET}` : display;
}

function renderTasksSegment(sessionState, useAnsi) {
  const metrics = sessionState && sessionState.metrics ? sessionState.metrics : {};
  const incomplete = Number(metrics.incompleteTasks || 0);
  const total = Number(metrics.totalTasks || 0);
  const label = incomplete > 0 ? `${incomplete}/${total || incomplete} open` : '0 open';
  if (!useAnsi) return label;
  const severity = incomplete >= 5 ? 'critical' : incomplete > 0 ? 'warn' : 'clean';
  return `${pickColor(severity)}${label}${RESET}`;
}

function renderContinuitySegment(health, sessionState, useAnsi) {
  const metrics = sessionState && sessionState.metrics ? sessionState.metrics : {};
  const replayEntries = Number(metrics.replayEntries || 0);
  const evidenceEntries = Number(metrics.evidenceEntries || 0);
  const label = `${health.label} ${replayEntries}r/${evidenceEntries}e`;
  return useAnsi ? `${pickColor(health.severity)}${label}${RESET}` : label;
}

// --- Snapshot builder ---

function buildStatusSnapshot(payload = {}, options = {}) {
  // Prefer the payload's CWD (the active Claude session directory) over the
  // script's own process.cwd(), which is the EVOKORE repo and not the project
  // the user is actually working in.
  const activeCwd = path.resolve(
    (payload.workspace && payload.workspace.current_dir)
      || payload.cwd
      || options.cwd
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
  const modelName = getModelName(payload);
  const mcpCount = getMcpServerCount();
  const damageBlocks = getDamageControlBlocks(sessionId);
  const pendingApprovals = getPendingApprovalCount();

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
    health,
    modelName,
    mcpCount,
    damageBlocks,
    pendingApprovals
  };
}

// --- Renderer ---

function sep(useAnsi) {
  return useAnsi ? ` ${COLORS.slate}│${RESET} ` : ' | ';
}

function renderStatusLine(snapshot, options = {}) {
  const width = Number(options.width || process.stdout.columns || 100);
  const useAnsi = options.ansi !== false;
  const compact = width < 60;
  const mini = width >= 60 && width < 95;
  const s = sep(useAnsi);

  // === Line 1: model + context bar + git + path ===
  const line1Parts = [];

  const modelCtx = renderModelContextSegment(snapshot.modelName, snapshot.context, useAnsi);
  line1Parts.push(modelCtx);

  const gitSeg = renderGitSegment(snapshot.projectState, useAnsi);
  if (gitSeg) line1Parts.push(gitSeg);

  if (!compact) {
    const repoSeg = renderRepoSegment(snapshot.projectState, useAnsi);
    if (repoSeg) line1Parts.push(repoSeg);
  }

  const line1 = line1Parts.join(s);

  const brand = useAnsi ? `${COLORS.slate}EVOKORE${RESET}` : 'EVOKORE';
  const repoName = snapshot.projectState && snapshot.projectState.repoName;
  const repoLabel = repoName
    ? (useAnsi ? `${COLORS.path}${repoName}${RESET}` : repoName)
    : null;

  // === Line 2: brand + repo + purpose + tasks + approvals ===
  const line2Parts = [];
  if (repoLabel) line2Parts.push(repoLabel);
  if (!compact) {
    line2Parts.push(renderPurposeSegment(snapshot.purpose, useAnsi, mini ? 30 : 48));
  }
  const approvalSeg = renderPendingApprovalsSegment(snapshot.pendingApprovals, useAnsi);
  if (approvalSeg) line2Parts.push(approvalSeg);
  line2Parts.push(`tasks ${renderTasksSegment(snapshot.sessionState, useAnsi)}`);
  const line2 = `${brand}${s}${line2Parts.join(s)}`;

  // === Line 3: continuity + last tool + session age + token breakdown ===
  const line3Parts = [];
  line3Parts.push(`continuity ${renderContinuitySegment(snapshot.health, snapshot.sessionState, useAnsi)}`);
  const lastToolSeg = renderLastToolSegment(snapshot.sessionState, useAnsi);
  if (lastToolSeg) line3Parts.push(lastToolSeg);
  const ageSeg = renderSessionAgeSegment(snapshot.sessionState, useAnsi);
  if (ageSeg) line3Parts.push(ageSeg);
  const tokBreak = renderTokenBreakdownSegment(snapshot.context, useAnsi);
  if (tokBreak) line3Parts.push(tokBreak);
  const line3 = line3Parts.join(s);

  // === Line 4: cache ratio + damage-control + MCPs + session ID ===
  const line4Parts = [];
  const cacheSeg = renderCacheRatioSegment(snapshot.context, useAnsi);
  if (cacheSeg) line4Parts.push(cacheSeg);
  const dcSeg = renderDamageControlSegment(snapshot.damageBlocks, useAnsi);
  if (dcSeg) line4Parts.push(dcSeg);
  const mcpSeg = renderMcpSegment(snapshot.mcpCount, useAnsi);
  if (mcpSeg) line4Parts.push(mcpSeg);
  const sessSeg = renderSessionIdSegment(snapshot.sessionId, useAnsi);
  if (sessSeg) line4Parts.push(sessSeg);
  const line4 = line4Parts.join(s);

  return [line1, line2, line3, line4].filter(Boolean).join('\n');
}

module.exports = {
  buildStatusSnapshot,
  renderStatusLine,
  deriveContinuityHealth,
  parseManagedProjectState,
  parseContext
};
