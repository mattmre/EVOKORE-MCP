#!/usr/bin/env node
'use strict';

// PostToolUse hook: Auto-captures evidence after significant operations
// State: ~/.evokore/sessions/{sessionId}-evidence.jsonl
// Captures: test runs (Bash with test/jest/vitest/npm test),
//           file writes (Write/Edit tools),
//           git operations (commit, push, merge)
// Format: {ts, type, tool, summary, evidence_id}
// MUST exit 0 on all errors (fail-safe)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { writeHookEvent, sanitizeId } = require('./hook-observability');
const { pruneOldSessions } = require('./log-rotation');
const { SESSIONS_DIR } = require('./session-continuity');

// Phase 0-C: dual-write to append-only JSONL manifest. Require is wrapped so
// a missing dist build fails open to legacy writeSessionState.
let appendEvent = () => {};
try {
  // eslint-disable-next-line global-require
  ({ appendEvent } = require('../dist/SessionManifest.js'));
} catch {
  // Fail open.
}

// Patterns that indicate a test run in a Bash command
const TEST_PATTERNS = [
  /\bnpm\s+test\b/i,
  /\bnpm\s+run\s+test\b/i,
  /\bvitest\b/i,
  /\bjest\b/i,
  /\bpytest\b/i,
  /\bmocha\b/i,
  /\bcargo\s+test\b/i,
  /\bgo\s+test\b/i,
  /\bnpx\s+(vitest|jest)\b/i
];

// Patterns that indicate a git operation in a Bash command
const GIT_PATTERNS = [
  { re: /\bgit\s+commit\b/i, op: 'commit' },
  { re: /\bgit\s+push\b/i, op: 'push' },
  { re: /\bgit\s+merge\b/i, op: 'merge' },
  { re: /\bgit\s+tag\b/i, op: 'tag' }
];

function ensureDir() {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

/**
 * Read the current evidence count for this session to assign sequential IDs.
 * Returns the next evidence number (1-based).
 */
function getNextEvidenceNumber(evidencePath) {
  try {
    if (!fs.existsSync(evidencePath)) return 1;
    const content = fs.readFileSync(evidencePath, 'utf8').trim();
    if (!content) return 1;
    return content.split('\n').length + 1;
  } catch {
    return 1;
  }
}

function formatEvidenceId(num) {
  return `E-${String(num).padStart(3, '0')}`;
}

/**
 * SHA-256 proof chain: hash(prev_hash + canonical(entry core fields)).
 * Produces a tamper-evident chain over the evidence log.
 */
function computeProofHash(prevHash, entry) {
  const payload = JSON.stringify({
    agentId: entry.agent_id || 'unknown',
    toolName: entry.tool,
    toolInput: entry.tool_input || {},
    prevHash
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Read the last evidence entry's proof_hash to continue the chain.
 * Returns 64 zeros if the file is missing, empty, or unreadable.
 */
function getLastHash(evidencePath) {
  try {
    const content = fs.readFileSync(evidencePath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    if (!lines.length) return '0'.repeat(64);
    const last = JSON.parse(lines[lines.length - 1]);
    return last.proof_hash || '0'.repeat(64);
  } catch {
    return '0'.repeat(64);
  }
}

/**
 * Classify a Bash command and return evidence type + summary, or null if not significant.
 */
function classifyBashCommand(command) {
  if (!command) return null;

  // Check for test runs
  for (const pattern of TEST_PATTERNS) {
    if (pattern.test(command)) {
      return {
        type: 'test-result',
        summary: command.slice(0, 200)
      };
    }
  }

  // Check for git operations
  for (const { re, op } of GIT_PATTERNS) {
    if (re.test(command)) {
      return {
        type: 'git-operation',
        summary: `git ${op}: ${command.slice(0, 180)}`
      };
    }
  }

  return null;
}

/**
 * Classify a Write or Edit tool call and return evidence entry.
 */
function classifyFileChange(toolName, toolInput) {
  const filePath = toolInput.file_path || toolInput.path || '';
  if (!filePath) return null;

  return {
    type: 'file-change',
    summary: `${toolName}: ${filePath}`
  };
}

let input = '';
process.stdin.on('data', (chunk) => input += chunk);
process.stdin.on('end', () => {
  try {
    try { pruneOldSessions(SESSIONS_DIR); } catch { /* best effort */ }

    const payload = JSON.parse(input);
    const sessionId = sanitizeId(payload.session_id);
    const toolName = payload.tool_name || '';
    const toolInput = payload.tool_input || {};

    let classification = null;

    if (toolName === 'Bash') {
      classification = classifyBashCommand(toolInput.command);
    } else if (toolName === 'Write' || toolName === 'Edit') {
      classification = classifyFileChange(toolName, toolInput);
    }

    // Only capture evidence for significant operations
    if (!classification) {
      process.exit(0);
      return;
    }

    ensureDir();

    const evidencePath = path.join(SESSIONS_DIR, `${sessionId}-evidence.jsonl`);
    const evidenceNum = getNextEvidenceNumber(evidencePath);
    const evidenceId = formatEvidenceId(evidenceNum);

    const entry = {
      ts: new Date().toISOString(),
      type: classification.type,
      tool: toolName,
      tool_input: toolInput,
      agent_id: payload.agent_id || 'unknown',
      summary: classification.summary,
      evidence_id: evidenceId,
      exit_code: payload.tool_response?.metadata?.exit_code ?? null,
      passed: payload.tool_response?.is_error !== true,
      invocation_ts: new Date().toISOString()
    };

    // Wave 2 Phase 3.5-A: SHA-256 proof chain over evidence entries.
    const prevHash = getLastHash(evidencePath);
    const proofHash = computeProofHash(prevHash, entry);
    entry.prev_hash = prevHash;
    entry.proof_hash = proofHash;

    fs.appendFileSync(evidencePath, JSON.stringify(entry) + '\n');
    appendEvent(sessionId, {
      type: 'evidence_captured',
      payload: {
        evidence_id: evidenceId,
        evidence_type: classification.type,
        tool: toolName,
        summary: classification.summary,
        exit_code: entry.exit_code,
        passed: entry.passed
      }
    });

    writeHookEvent({
      hook: 'evidence-capture',
      event: 'evidence_captured',
      session_id: sessionId,
      tool: toolName,
      evidence_type: classification.type,
      evidence_id: evidenceId
    });
  } catch (error) {
    // Never fail — always exit 0
    writeHookEvent({
      hook: 'evidence-capture',
      event: 'fail_safe_error',
      error: String(error && error.message ? error.message : error)
    });
  }
  process.exit(0);
});
