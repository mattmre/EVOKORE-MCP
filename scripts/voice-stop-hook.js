#!/usr/bin/env node
'use strict';

/**
 * Voice Stop Hook
 *
 * Fires on the Claude Code Stop event. Reads the session manifest and tasks,
 * builds a natural spoken summary, and forwards it to the VoiceSidecar over
 * WebSocket. Always exits 0 — never blocks the stop.
 *
 * Requires the VoiceSidecar to be running: node dist/VoiceSidecar.js
 * Silently no-ops if the sidecar is offline.
 *
 * Persona: 'reviewer' (Josh voice) for session summaries.
 * Override with VOICE_SIDECAR_PERSONA env var.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');
const { writeHookEvent, sanitizeId } = require('./hook-observability');

const HOST = process.env.VOICE_SIDECAR_HOST || '127.0.0.1';
const PORT = Number(process.env.VOICE_SIDECAR_PORT) || 8888;
const PERSONA = process.env.VOICE_SIDECAR_PERSONA || 'reviewer';
const SESSIONS_DIR = path.join(os.homedir(), '.evokore', 'sessions');

// --- Data loading ---

function loadSessionState(sessionId) {
  try {
    const p = path.join(SESSIONS_DIR, `${sessionId}.json`);
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function loadTasks(sessionId) {
  try {
    const p = path.join(SESSIONS_DIR, `${sessionId}-tasks.json`);
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return [];
  }
}

// --- Session age formatting (spoken-friendly) ---

function spokenAge(createdAt) {
  if (!createdAt) return null;
  const ms = Date.now() - new Date(createdAt).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  const totalMins = Math.floor(ms / 60000);
  if (totalMins < 1) return 'less than a minute';
  if (totalMins < 60) return `${totalMins} minute${totalMins === 1 ? '' : 's'}`;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const hourPart = `${h} hour${h === 1 ? '' : 's'}`;
  const minPart = m > 0 ? ` and ${m} minute${m === 1 ? '' : 's'}` : '';
  return `${hourPart}${minPart}`;
}

// --- Summary builder ---

/**
 * Builds a natural spoken summary from session state + tasks.
 * All output is prose, no markdown or symbols.
 */
function buildSummary(sessionState, tasks) {
  const parts = [];

  // Opening
  const incomplete = tasks.filter(t => !t.done);
  const done = tasks.filter(t => t.done);
  const hasTasks = tasks.length > 0;
  const allDone = hasTasks && incomplete.length === 0;

  if (allDone) {
    parts.push('Session complete.');
  } else if (hasTasks && incomplete.length > 0) {
    parts.push('Session paused.');
  } else {
    parts.push('Session complete.');
  }

  // Purpose
  const purpose = sessionState && sessionState.purpose;
  if (purpose && purpose !== 'no purpose recorded') {
    parts.push(`Purpose: ${purpose}.`);
  }

  // Task progress
  if (hasTasks) {
    if (allDone) {
      parts.push(`All ${tasks.length} task${tasks.length === 1 ? '' : 's'} done.`);
    } else {
      parts.push(`${incomplete.length} of ${tasks.length} task${tasks.length === 1 ? '' : 's'} remain open.`);
    }
  }

  // Evidence + tool calls
  const metrics = (sessionState && sessionState.metrics) || {};
  const evidenceCount = Number(metrics.evidenceEntries || 0);
  const replayCount = Number(metrics.replayEntries || 0);

  if (evidenceCount > 0 && replayCount > 0) {
    parts.push(`${evidenceCount} evidence entr${evidenceCount === 1 ? 'y' : 'ies'} and ${replayCount} tool call${replayCount === 1 ? '' : 's'} captured.`);
  } else if (evidenceCount > 0) {
    parts.push(`${evidenceCount} evidence entr${evidenceCount === 1 ? 'y' : 'ies'} captured.`);
  } else if (replayCount > 0) {
    parts.push(`${replayCount} tool call${replayCount === 1 ? '' : 's'} recorded.`);
  }

  // Session age
  const age = spokenAge(sessionState && (sessionState.createdAt || sessionState.created));
  if (age) {
    parts.push(`Session ran for ${age}.`);
  }

  return parts.join(' ');
}

// --- WebSocket delivery ---

function sendToSidecar(text, sessionId) {
  return new Promise((resolve) => {
    const message = JSON.stringify({ text, persona: PERSONA, flush: true });

    const ws = new WebSocket(`ws://${HOST}:${PORT}`);
    const timeout = setTimeout(() => {
      ws.terminate();
      resolve({ sent: false, reason: 'timeout' });
    }, 5000);

    ws.on('open', () => {
      ws.send(message, () => {
        clearTimeout(timeout);
        ws.close();
        resolve({ sent: true });
      });
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ sent: false, reason: err.code || err.message });
    });
  });
}

// --- Main hook ---

let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', async () => {
  try {
    const payload = JSON.parse(input);
    const sessionId = sanitizeId(payload.session_id);

    if (!sessionId) {
      writeHookEvent({ hook: 'voice-stop', event: 'skip', reason: 'no_session_id' });
      process.exit(0);
    }

    const sessionState = loadSessionState(sessionId);
    const tasks = loadTasks(sessionId);
    const summary = buildSummary(sessionState, tasks);

    const result = await sendToSidecar(summary, sessionId);

    writeHookEvent({
      hook: 'voice-stop',
      event: result.sent ? 'sent' : 'sidecar_unavailable',
      session_id: sessionId,
      summary_length: summary.length,
      ...(result.reason ? { reason: result.reason } : {})
    });
  } catch (err) {
    // Fail safe — never block stop
    writeHookEvent({
      hook: 'voice-stop',
      event: 'fail_safe',
      error: String(err && err.message ? err.message : err)
    });
  }

  process.exit(0);
});
