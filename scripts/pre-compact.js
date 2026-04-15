#!/usr/bin/env node
'use strict';

// PreCompact hook: captures a lightweight session snapshot immediately
// before Claude Code compacts the conversation context. The snapshot is
// written into the session manifest (`preCompactSnapshot`) AND saved as a
// sidecar JSON file `<sessionId>-pre-compact.json` inside SESSIONS_DIR so
// post-compaction replay reconstruction has a stable rehydration point.
//
// Always exits 0 — fail-safe, never blocks compaction.

const fs = require('fs');
const path = require('path');
const { sanitizeId, writeHookEvent } = require('./hook-observability');
const {
  readSessionState,
  writeSessionState,
  getSessionPaths,
  SESSIONS_DIR
} = require('./session-continuity');

// Phase 0-D: emit a `pre_compact` event on every PreCompact trigger. Legacy
// writeSessionState remains because it persists `preCompactSnapshot`, a rich
// structured payload not modeled on the manifest yet.
let appendEvent = () => {};
try {
  // eslint-disable-next-line global-require
  ({ appendEvent } = require('../dist/SessionManifest.js'));
} catch {
  // Fail open.
}

function tailLines(filePath, maxLines) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw) return [];
    const lines = raw.split(/\r?\n/).filter(Boolean);
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}

function parseJsonLines(lines) {
  const out = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line));
    } catch {
      // skip malformed entries
    }
  }
  return out;
}

let inputData = '';
process.stdin.on('data', (chunk) => { inputData += chunk; });
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(inputData || '{}');
    const rawId = payload.session_id || '';
    const sessionId = sanitizeId(rawId);
    const trigger = payload.trigger || payload.reason || null;
    const ts = new Date().toISOString();

    const paths = getSessionPaths(sessionId);
    const sessionState = readSessionState(sessionId) || {};

    // Pull open tasks (try/catch — missing file is fine)
    let incompleteTasks = [];
    try {
      if (fs.existsSync(paths.tasksPath)) {
        const taskRaw = fs.readFileSync(paths.tasksPath, 'utf8');
        const parsed = JSON.parse(taskRaw);
        if (Array.isArray(parsed)) {
          incompleteTasks = parsed.filter((t) => {
            if (!t || typeof t !== 'object') return false;
            if (t.done === true) return false;
            if (t.status && t.status === 'completed') return false;
            return true;
          });
        }
      }
    } catch {
      incompleteTasks = [];
    }

    // Tail replay log (last 20 entries) — pull recent tool names / files
    const replayTail = parseJsonLines(tailLines(paths.replayLogPath, 20));
    const recentTools = replayTail.map((e) => e && e.tool).filter(Boolean);
    const recentFiles = replayTail
      .map((e) => e && e.summary)
      .filter((s) => typeof s === 'string' && s.length > 0)
      .slice(-10);
    const lastToolName = recentTools.length > 0
      ? recentTools[recentTools.length - 1]
      : (sessionState.lastToolName || null);

    // Tail evidence log (last 10 entries)
    const evidenceTail = parseJsonLines(tailLines(paths.evidenceLogPath, 10));
    const recentEvidenceIds = evidenceTail
      .map((e) => e && e.evidence_id)
      .filter(Boolean);

    const subagentCount = Array.isArray(sessionState.subagents)
      ? sessionState.subagents.length
      : 0;

    const preCompactSnapshot = {
      ts,
      purpose: sessionState.purpose || null,
      trigger,
      incompleteTasks,
      recentTools,
      recentFiles,
      recentEvidenceIds,
      lastToolName,
      subagentCount,
      lastActivityAt: sessionState.lastActivityAt || null
    };

    try {
      appendEvent(sessionId, {
        type: 'pre_compact',
        payload: {
          trigger,
          incompleteTasks: incompleteTasks.length,
          recentEvidence: recentEvidenceIds.length,
          lastToolName
        }
      });
    } catch {
      // best effort
    }

    try {
      writeSessionState(sessionId, {
        preCompactSnapshot,
        preCompactAt: ts
      });
    } catch {
      // best effort
    }

    // Sidecar file for durable post-compact rehydration
    try {
      if (!fs.existsSync(SESSIONS_DIR)) {
        fs.mkdirSync(SESSIONS_DIR, { recursive: true });
      }
      const sidecarPath = path.join(SESSIONS_DIR, sessionId + '-pre-compact.json');
      fs.writeFileSync(sidecarPath, JSON.stringify(preCompactSnapshot, null, 2));
    } catch {
      // best effort
    }

    try {
      writeHookEvent({
        hook: 'pre-compact',
        event: 'state_preserved',
        session_id: sessionId,
        trigger,
        incomplete_tasks: incompleteTasks.length,
        recent_evidence: recentEvidenceIds.length
      });
    } catch {
      // best effort
    }
  } catch (err) {
    try {
      writeHookEvent({
        hook: 'pre-compact',
        event: 'fail_safe_error',
        error: String(err && err.message ? err.message : err)
      });
    } catch { /* never throw from fail-safe path */ }
  }
  process.exit(0);
});
