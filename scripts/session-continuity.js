#!/usr/bin/env node
// @AI:NAV[SEC:requires] Module requires and constants
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { sanitizeId } = require('./hook-observability');
// @AI:NAV[END:requires]

const EVOKORE_HOME = path.join(os.homedir(), '.evokore');
const SESSIONS_DIR = path.join(EVOKORE_HOME, 'sessions');
const CACHE_DIR = path.join(EVOKORE_HOME, 'cache');
const LOGS_DIR = path.join(EVOKORE_HOME, 'logs');
const CONTINUITY_VERSION = 1;

// @AI:NAV[SEC:fn-ensureruntimedirs] function ensureRuntimeDirs
function ensureRuntimeDirs() {
  for (const dirPath of [EVOKORE_HOME, SESSIONS_DIR, CACHE_DIR, LOGS_DIR]) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
}
// @AI:NAV[END:fn-ensureruntimedirs]

// @AI:NAV[SEC:fn-resolvecanonicalreporoot] function resolveCanonicalRepoRoot
function resolveCanonicalRepoRoot(startDir = process.cwd()) {
  const cwd = path.resolve(startDir);
  try {
    const gitCommonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    const resolvedGitCommonDir = path.resolve(cwd, gitCommonDir);
    if (path.basename(resolvedGitCommonDir).toLowerCase() === '.git') {
      return path.dirname(resolvedGitCommonDir);
    }
  } catch {
    // best effort only
  }
  return cwd;
}
// @AI:NAV[END:fn-resolvecanonicalreporoot]

// @AI:NAV[SEC:fn-getsessionpaths] function getSessionPaths
function getSessionPaths(sessionId) {
  const sanitizedSessionId = sanitizeId(sessionId);
  return {
    sessionId: sanitizedSessionId,
    sessionStatePath: path.join(SESSIONS_DIR, `${sanitizedSessionId}.json`),
    replayLogPath: path.join(SESSIONS_DIR, `${sanitizedSessionId}-replay.jsonl`),
    evidenceLogPath: path.join(SESSIONS_DIR, `${sanitizedSessionId}-evidence.jsonl`),
    tasksPath: path.join(SESSIONS_DIR, `${sanitizedSessionId}-tasks.json`)
  };
}
// @AI:NAV[END:fn-getsessionpaths]

// @AI:NAV[SEC:fn-countjsonlentries] function countJsonlEntries
function countJsonlEntries(filePath) {
  try {
    if (!fs.existsSync(filePath)) return 0;
    const content = fs.readFileSync(filePath, 'utf8').trim();
    return content ? content.split(/\r?\n/).filter(Boolean).length : 0;
  } catch {
    return 0;
  }
}
// @AI:NAV[END:fn-countjsonlentries]

// @AI:NAV[SEC:fn-counttaskstats] function countTaskStats
function countTaskStats(tasksPath) {
  try {
    if (!fs.existsSync(tasksPath)) {
      return { totalTasks: 0, incompleteTasks: 0 };
    }

    const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
    if (!Array.isArray(tasks)) {
      return { totalTasks: 0, incompleteTasks: 0 };
    }

    const incompleteTasks = tasks.filter((task) => !task || task.done !== true).length;
    return {
      totalTasks: tasks.length,
      incompleteTasks
    };
  } catch {
    return { totalTasks: 0, incompleteTasks: 0 };
  }
}
// @AI:NAV[END:fn-counttaskstats]

// Phase 0-D: prefer the append-only JSONL manifest when present so readers
// transparently benefit from hooks that no longer dual-write the legacy
// `{sessionId}.json` snapshot. Falls back to the legacy JSON file if the
// manifest is missing or the dist module is unavailable.
// @AI:NAV[SEC:fn-foldmanifestsync] function foldManifestSync
function foldManifestSync(manifestPath, sessionId) {
  try {
    if (!fs.existsSync(manifestPath)) return null;
    const raw = fs.readFileSync(manifestPath, 'utf8');
    if (!raw.trim()) return null;
    const state = {
      continuityVersion: CONTINUITY_VERSION,
      sessionId: sanitizeId(sessionId)
    };
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let evt;
      try { evt = JSON.parse(trimmed); } catch { continue; }
      if (!evt || typeof evt !== 'object') continue;

      if (evt.type === '__snapshot__' && evt.payload && typeof evt.payload === 'object') {
        Object.assign(state, evt.payload);
        continue;
      }

      if (typeof evt.ts === 'string' && evt.ts) {
        state.updatedAt = evt.ts;
      }

      const p = (evt.payload && typeof evt.payload === 'object') ? evt.payload : {};
      switch (evt.type) {
        case 'session_initialized':
          if (!state.createdAt) { state.created = evt.ts; state.createdAt = evt.ts; }
          if (p.workspaceRoot) state.workspaceRoot = p.workspaceRoot;
          if (p.canonicalRepoRoot) state.canonicalRepoRoot = p.canonicalRepoRoot;
          if (p.repoName) state.repoName = p.repoName;
          state.status = 'awaiting-purpose';
          if (state.purpose === undefined) state.purpose = null;
          break;
        case 'purpose_recorded':
          state.purpose = p.purpose || null;
          state.status = 'active';
          state.lastPromptAt = evt.ts;
          state.lastActivityAt = evt.ts;
          if (p.purposeSetAt) state.purposeSetAt = p.purposeSetAt;
          if (p.modeSetAt) state.set_at = p.modeSetAt;
          if (p.mode) state.mode = p.mode;
          break;
        case 'purpose_reminder':
          state.status = 'active';
          state.lastPromptAt = evt.ts;
          state.lastActivityAt = evt.ts;
          break;
        case 'tool_invoked':
          state.lastToolName = p.tool;
          state.lastReplayAt = evt.ts;
          state.lastActivityAt = evt.ts;
          break;
        case 'evidence_captured':
          state.lastEvidenceId = p.evidence_id;
          state.lastEvidenceType = p.evidence_type;
          state.lastToolName = p.tool || state.lastToolName;
          state.lastEvidenceAt = evt.ts;
          state.lastActivityAt = evt.ts;
          break;
        case 'task_action':
          state.lastTaskAction = p.action;
          state.lastActivityAt = evt.ts;
          break;
        case 'stop_check':
          state.lastStopCheckAt = evt.ts;
          state.lastStopCheckResult = p.result;
          state.lastActivityAt = evt.ts;
          break;
        case 'subagent_tracked':
          state.lastSubagentAt = evt.ts;
          state.lastSubagentId = p.subagent_id;
          state.activeSubagentCount =
            (typeof state.activeSubagentCount === 'number' ? state.activeSubagentCount : 0) + 1;
          state.lastActivityAt = evt.ts;
          break;
        case 'pre_compact':
          state.preCompactAt = evt.ts;
          state.lastActivityAt = evt.ts;
          break;
        default:
          break;
      }
    }
    return state;
  } catch {
    return null;
  }
}
// @AI:NAV[END:fn-foldmanifestsync]

// @AI:NAV[SEC:fn-readsessionstate] function readSessionState
function readSessionState(sessionId) {
  ensureRuntimeDirs();
  const paths = getSessionPaths(sessionId);
  const manifestFilePath = path.join(SESSIONS_DIR, `${paths.sessionId}.jsonl`);

  // Prefer JSONL manifest (Phase 0-D canonical write path).
  const manifestState = foldManifestSync(manifestFilePath, sessionId);
  if (manifestState) {
    // Enrich with legacy `.json` fields (e.g., `subagents`, `preCompactSnapshot`,
    // `lastEditedFile`) that wave-2 hooks still write alongside the manifest.
    if (fs.existsSync(paths.sessionStatePath)) {
      try {
        const legacy = JSON.parse(fs.readFileSync(paths.sessionStatePath, 'utf8'));
        if (legacy && typeof legacy === 'object') {
          // Manifest fields win; only copy keys the manifest did not produce.
          for (const [key, value] of Object.entries(legacy)) {
            if (!(key in manifestState)) {
              manifestState[key] = value;
            }
          }
        }
      } catch {
        // best effort
      }
    }
    // Always layer in live-computed artifacts + metrics so readers that
    // expect the legacy shape (status-runtime, session-continuity test,
    // claude-memory) keep working without a `.json` snapshot on disk.
    const taskStats = countTaskStats(paths.tasksPath);
    manifestState.artifacts = Object.assign(
      {
        sessionStatePath: paths.sessionStatePath,
        replayLogPath: paths.replayLogPath,
        evidenceLogPath: paths.evidenceLogPath,
        tasksPath: paths.tasksPath
      },
      manifestState.artifacts || {}
    );
    manifestState.metrics = Object.assign(
      {
        replayEntries: countJsonlEntries(paths.replayLogPath),
        evidenceEntries: countJsonlEntries(paths.evidenceLogPath),
        totalTasks: taskStats.totalTasks,
        incompleteTasks: taskStats.incompleteTasks
      },
      manifestState.metrics || {}
    );
    // Ensure sessionId is the sanitized form, not the raw `sessionId` field
    // from a snapshot payload that might have un-sanitized characters.
    manifestState.sessionId = paths.sessionId;
    return manifestState;
  }

  if (!fs.existsSync(paths.sessionStatePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(paths.sessionStatePath, 'utf8'));
  } catch {
    return null;
  }
}
// @AI:NAV[END:fn-readsessionstate]

// @AI:NAV[SEC:fn-buildbasestate] function buildBaseState
function buildBaseState(sessionId, existingState) {
  const now = new Date().toISOString();
  const paths = getSessionPaths(sessionId);
  const taskStats = countTaskStats(paths.tasksPath);
  const workspaceRoot = existingState && existingState.workspaceRoot ? existingState.workspaceRoot : process.cwd();
  const canonicalRepoRoot = existingState && existingState.canonicalRepoRoot
    ? existingState.canonicalRepoRoot
    : resolveCanonicalRepoRoot(workspaceRoot);

  return {
    continuityVersion: CONTINUITY_VERSION,
    sessionId: paths.sessionId,
    workspaceRoot,
    canonicalRepoRoot,
    repoName: existingState && existingState.repoName ? existingState.repoName : path.basename(workspaceRoot),
    purpose: existingState && existingState.purpose !== undefined ? existingState.purpose : null,
    created: existingState && existingState.created ? existingState.created : now,
    createdAt: existingState && existingState.createdAt ? existingState.createdAt : (existingState && existingState.created ? existingState.created : now),
    updatedAt: now,
    status: existingState && existingState.status ? existingState.status : 'new',
    set_at: existingState && existingState.set_at ? existingState.set_at : null,
    purposeSetAt: existingState && existingState.purposeSetAt ? existingState.purposeSetAt : (existingState && existingState.set_at ? existingState.set_at : null),
    lastPromptAt: existingState && existingState.lastPromptAt ? existingState.lastPromptAt : null,
    lastActivityAt: existingState && existingState.lastActivityAt ? existingState.lastActivityAt : null,
    lastReplayAt: existingState && existingState.lastReplayAt ? existingState.lastReplayAt : null,
    lastEvidenceAt: existingState && existingState.lastEvidenceAt ? existingState.lastEvidenceAt : null,
    lastToolName: existingState && existingState.lastToolName ? existingState.lastToolName : null,
    lastEvidenceId: existingState && existingState.lastEvidenceId ? existingState.lastEvidenceId : null,
    lastEvidenceType: existingState && existingState.lastEvidenceType ? existingState.lastEvidenceType : null,
    lastTaskAction: existingState && existingState.lastTaskAction ? existingState.lastTaskAction : null,
    lastStopCheckAt: existingState && existingState.lastStopCheckAt ? existingState.lastStopCheckAt : null,
    lastStopCheckResult: existingState && existingState.lastStopCheckResult ? existingState.lastStopCheckResult : null,
    artifacts: {
      sessionStatePath: paths.sessionStatePath,
      replayLogPath: paths.replayLogPath,
      evidenceLogPath: paths.evidenceLogPath,
      tasksPath: paths.tasksPath
    },
    metrics: {
      replayEntries: countJsonlEntries(paths.replayLogPath),
      evidenceEntries: countJsonlEntries(paths.evidenceLogPath),
      totalTasks: taskStats.totalTasks,
      incompleteTasks: taskStats.incompleteTasks
    }
  };
}
// @AI:NAV[END:fn-buildbasestate]

// @AI:NAV[SEC:fn-writesessionstate] function writeSessionState
function writeSessionState(sessionId, patch = {}) {
  ensureRuntimeDirs();
  const existingState = readSessionState(sessionId);
  const baseState = buildBaseState(sessionId, existingState);
  const nextState = Object.assign(baseState, patch || {});

  const mergedArtifacts = Object.assign(
    {},
    existingState && existingState.artifacts ? existingState.artifacts : {},
    baseState.artifacts,
    patch && patch.artifacts ? patch.artifacts : {}
  );
  const mergedMetrics = Object.assign(
    {},
    existingState && existingState.metrics ? existingState.metrics : {},
    baseState.metrics,
    patch && patch.metrics ? patch.metrics : {}
  );

  nextState.continuityVersion = CONTINUITY_VERSION;
  nextState.artifacts = mergedArtifacts;
  nextState.metrics = mergedMetrics;
  nextState.updatedAt = new Date().toISOString();

  if (!nextState.created) {
    nextState.created = nextState.updatedAt;
  }
  if (!nextState.createdAt) {
    nextState.createdAt = nextState.created;
  }
  if (nextState.purposeSetAt && !nextState.set_at) {
    nextState.set_at = nextState.purposeSetAt;
  }
  if (nextState.set_at && !nextState.purposeSetAt) {
    nextState.purposeSetAt = nextState.set_at;
  }

  fs.writeFileSync(nextState.artifacts.sessionStatePath, JSON.stringify(nextState, null, 2));
  return nextState;
}
// @AI:NAV[END:fn-writesessionstate]

module.exports = {
  CONTINUITY_VERSION,
  EVOKORE_HOME,
  SESSIONS_DIR,
  CACHE_DIR,
  LOGS_DIR,
  ensureRuntimeDirs,
  getSessionPaths,
  readSessionState,
  writeSessionState,
  resolveCanonicalRepoRoot
};
