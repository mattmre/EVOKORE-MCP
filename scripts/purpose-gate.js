#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { writeHookEvent, sanitizeId } = require('./hook-observability');

const SESSIONS_DIR = path.join(os.homedir(), '.evokore', 'sessions');
const CACHE_DIR = path.join(os.homedir(), '.evokore', 'cache');

function ensureDir() {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

/**
 * Build a compact status line from cached data only (no network calls).
 * Returns null if the feature is disabled or no cache is available.
 * Controlled by EVOKORE_STATUS_HOOK=true (opt-in, default off).
 */
function getStatusLine() {
  if (process.env.EVOKORE_STATUS_HOOK !== 'true') return null;

  try {
    const parts = [];

    // Location (from cache only — written by status.js)
    const locCache = path.join(CACHE_DIR, 'location.json');
    if (fs.existsSync(locCache)) {
      try {
        const loc = JSON.parse(fs.readFileSync(locCache, 'utf8'));
        if (loc.city) parts.push(loc.city + (loc.regionName ? ', ' + loc.regionName : ''));
      } catch { /* skip */ }
    }

    // Weather (from cache only — written by status.js)
    const weatherCache = path.join(CACHE_DIR, 'weather.json');
    if (fs.existsSync(weatherCache)) {
      try {
        const weather = fs.readFileSync(weatherCache, 'utf8').trim();
        if (weather && weather !== '?') parts.push(weather);
      } catch { /* skip */ }
    }

    // Current time
    parts.push(new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }));

    // Skill count (filesystem read, no network)
    try {
      const skillsDir = path.resolve(__dirname, '../SKILLS');
      if (fs.existsSync(skillsDir)) {
        let count = 0;
        const categories = fs.readdirSync(skillsDir);
        for (const cat of categories) {
          const catPath = path.join(skillsDir, cat);
          if (fs.statSync(catPath).isDirectory()) {
            count += fs.readdirSync(catPath).length;
          }
        }
        if (count > 0) parts.push(count + ' skills');
      }
    } catch { /* skip */ }

    if (parts.length === 0) return null;
    return '[EVOKORE Status] ' + parts.join(' | ');
  } catch {
    return null;
  }
}

let input = '';
process.stdin.on('data', (chunk) => input += chunk);
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(input);
    const sessionId = sanitizeId(payload.session_id);
    const userMessage = payload.user_message || payload.tool_input?.user_message || '';

    ensureDir();
    const stateFile = path.join(SESSIONS_DIR, `${sessionId}.json`);

    let state = null;
    if (fs.existsSync(stateFile)) {
      try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { state = null; }
    }

    // Build optional status line (cache-only, no network)
    const statusLine = getStatusLine();

    if (!state) {
      // First prompt — ask for purpose
      fs.writeFileSync(stateFile, JSON.stringify({ purpose: null, created: new Date().toISOString() }));
      writeHookEvent({
        hook: 'purpose-gate',
        event: 'state_initialized',
        session_id: sessionId
      });
      const contextParts = [
        '[EVOKORE Purpose Gate] This is a new session.',
        'Before proceeding, ask the user: "What is the goal for this session?"',
        'Frame it naturally — e.g., "What are we working on today?"',
        'Wait for their response before doing anything else.'
      ];
      if (statusLine) contextParts.push(statusLine);
      const result = { additionalContext: contextParts.join(' ') };
      console.log(JSON.stringify(result));
    } else if (state.purpose === null) {
      // Second prompt — save purpose
      const purpose = userMessage.slice(0, 500);
      state.purpose = purpose;
      state.set_at = new Date().toISOString();
      fs.writeFileSync(stateFile, JSON.stringify(state));
      writeHookEvent({
        hook: 'purpose-gate',
        event: 'purpose_recorded',
        session_id: sessionId
      });
      const contextParts = [
        `[EVOKORE Purpose Gate] Session purpose recorded: "${purpose}".`,
        'Acknowledge the goal briefly and proceed with the task.'
      ];
      if (statusLine) contextParts.push(statusLine);
      const result = { additionalContext: contextParts.join(' ') };
      console.log(JSON.stringify(result));
    } else {
      // Subsequent prompts — remind of purpose
      writeHookEvent({
        hook: 'purpose-gate',
        event: 'purpose_reminder',
        session_id: sessionId
      });
      let context = `[EVOKORE Purpose Gate] Session purpose: "${state.purpose}". Stay focused on this goal.`;
      if (statusLine) context += ' ' + statusLine;
      const result = { additionalContext: context };
      console.log(JSON.stringify(result));
    }
  } catch (error) {
    writeHookEvent({
      hook: 'purpose-gate',
      event: 'fail_safe_error',
      error: String(error && error.message ? error.message : error)
    });
  }
  process.exit(0);
});
