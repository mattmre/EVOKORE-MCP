#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { sanitizeId } = require('./hook-observability');

const EVOKORE_HOME = path.join(os.homedir(), '.evokore');
const SESSIONS_DIR = path.join(EVOKORE_HOME, 'sessions');
const CACHE_DIR = path.join(EVOKORE_HOME, 'cache');
const LOGS_DIR = path.join(EVOKORE_HOME, 'logs');
const CONTINUITY_VERSION = 1;

function ensureRuntimeDirs() {
  for (const dirPath of [EVOKORE_HOME, SESSIONS_DIR, CACHE_DIR, LOGS_DIR]) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
}

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

function countJsonlEntries(filePath) {
  try {
    if (!fs.existsSync(filePath)) return 0;
    const content = fs.readFileSync(filePath, 'utf8').trim();
    return content ? content.split(/\r?\n/).filter(Boolean).length : 0;
  } catch {
    return 0;
  }
}

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

function readSessionState(sessionId) {
  ensureRuntimeDirs();
  const { sessionStatePath } = getSessionPaths(sessionId);

  if (!fs.existsSync(sessionStatePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(sessionStatePath, 'utf8'));
  } catch {
    return null;
  }
}

function buildBaseState(sessionId, existingState) {
  const now = new Date().toISOString();
  const paths = getSessionPaths(sessionId);
  const taskStats = countTaskStats(paths.tasksPath);

  return {
    continuityVersion: CONTINUITY_VERSION,
    sessionId: paths.sessionId,
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

module.exports = {
  CONTINUITY_VERSION,
  EVOKORE_HOME,
  SESSIONS_DIR,
  CACHE_DIR,
  LOGS_DIR,
  ensureRuntimeDirs,
  getSessionPaths,
  readSessionState,
  writeSessionState
};
