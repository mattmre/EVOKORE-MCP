#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const SESSIONS_DIR = path.join(os.homedir(), '.evokore', 'sessions');

/**
 * Repo Audit Hook Runtime (UserPromptSubmit)
 *
 * Runs repo-state-audit on the first prompt of a session and injects any
 * warnings as additionalContext.  Enabled by default; opt-out by setting
 * EVOKORE_REPO_AUDIT_HOOK=false in the environment.
 *
 * Fail-safe: every error path exits 0 so the session is never blocked.
 */

let input = '';
process.stdin.on('data', (chunk) => input += chunk);
process.stdin.on('end', () => {
  try {
    // Opt-out gate — enabled by default
    if (process.env.EVOKORE_REPO_AUDIT_HOOK === 'false') {
      process.exit(0);
    }

    const payload = JSON.parse(input);
    const sessionId = String(payload.session_id || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');

    // Only run once per session (marker file)
    const markerFile = path.join(SESSIONS_DIR, sessionId + '-audit-done');
    if (fs.existsSync(markerFile)) {
      process.exit(0);
    }

    // Import the audit module directly (no subprocess overhead)
    const { collectAudit } = require('./repo-state-audit');
    const audit = collectAudit({ cwd: process.cwd() });

    // Collect warnings relevant to session start
    const warnings = [];

    if (audit.divergenceFromMain && audit.divergenceFromMain.behind > 0) {
      warnings.push(`Branch is ${audit.divergenceFromMain.behind} commit(s) behind main.`);
    }
    if (audit.staleLocalBranches && audit.staleLocalBranches.length > 0) {
      warnings.push(`${audit.staleLocalBranches.length} stale local branch(es) found.`);
    }
    if (audit.controlPlane) {
      const driftCount = (audit.controlPlane.modified || []).length + (audit.controlPlane.untracked || []).length;
      if (driftCount > 0) {
        warnings.push(`${driftCount} control-plane file(s) have local drift.`);
      }
    }
    if (audit.worktrees && audit.worktrees.length > 1) {
      warnings.push(`${audit.worktrees.length} worktrees active.`);
    }

    // Write marker so audit does not re-run on subsequent prompts
    if (!fs.existsSync(SESSIONS_DIR)) {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }
    fs.writeFileSync(markerFile, new Date().toISOString());

    if (warnings.length === 0) {
      // Clean state — nothing to inject
      process.exit(0);
    }

    const result = {
      additionalContext: '[EVOKORE Repo Audit] ' + warnings.join(' ')
    };
    console.log(JSON.stringify(result));
  } catch (err) {
    process.stderr.write(JSON.stringify({
      hook: 'repo-audit-hook',
      event: 'hook_error',
      error: err?.message || String(err),
      ts: new Date().toISOString(),
    }) + '\n');
  }
  process.exit(0);
});
