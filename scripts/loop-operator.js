'use strict';
/**
 * Loop Operator — degenerate iteration detector for EVOKORE subagent monitoring.
 * Reads the session manifest's subagents[] array and identifies repeated-error
 * and stalled patterns. Returns intervention recommendations.
 *
 * Part of ECC Phase 3. Integrates with subagent-tracker (Phase 2) via the
 * session manifest's subagents[] field.
 */

const { readSessionState } = require('./session-continuity');

const DEFAULTS = {
  errorThreshold: 3,
  stallWindowMs: 10 * 60 * 1000,
  lookbackCount: 20,
};

/**
 * Analyze a subagents array for degenerate iteration patterns.
 * Pure function — no side effects, no I/O.
 *
 * @param {Array<{id:string, ts:string, outcome:string, description:string}>} subagents
 * @param {object} opts - Override thresholds
 * @returns {{ isDegenerate: boolean, pattern: string|null, recommendation: string|null, evidence: string[], count: number }}
 */
function detectLoop(subagents, opts = {}) {
  const { errorThreshold, stallWindowMs, lookbackCount } = { ...DEFAULTS, ...opts };
  const recent = subagents.slice(-lookbackCount);

  // Pattern 1: same error description repeated > errorThreshold times
  const errorCounts = {};
  for (const entry of recent) {
    if (entry.outcome === 'error' && entry.description) {
      const key = entry.description.slice(0, 100);
      errorCounts[key] = (errorCounts[key] || 0) + 1;
    }
  }

  for (const [pattern, count] of Object.entries(errorCounts)) {
    if (count > errorThreshold) {
      return {
        isDegenerate: true,
        pattern: 'repeated-error',
        recommendation: count > errorThreshold * 2 ? 'terminate' : 'change-approach',
        evidence: recent
          .filter(e => e.description && e.description.slice(0, 100) === pattern)
          .map(e => e.id),
        count,
      };
    }
  }

  // Pattern 2: all recent calls within stall window returned errors
  const now = Date.now();
  const withinWindow = recent.filter(
    e => (now - new Date(e.ts).getTime()) < stallWindowMs
  );
  if (withinWindow.length >= 2 && withinWindow.every(e => e.outcome === 'error')) {
    return {
      isDegenerate: true,
      pattern: 'stalled',
      recommendation: 'escalate',
      evidence: withinWindow.map(e => e.id),
      count: withinWindow.length,
    };
  }

  return { isDegenerate: false, pattern: null, recommendation: null, evidence: [], count: 0 };
}

/**
 * Read session state and check for degenerate agent loops.
 *
 * @param {string} sessionId
 * @param {object} opts - Override thresholds
 * @returns {Promise<{isDegenerate:boolean, pattern:string|null, recommendation:string|null, evidence:string[], count:number}>}
 */
async function checkSession(sessionId, opts = {}) {
  const state = await readSessionState(sessionId);
  const subagents = state?.subagents ?? [];
  return detectLoop(subagents, opts);
}

module.exports = { detectLoop, checkSession, DEFAULTS };
