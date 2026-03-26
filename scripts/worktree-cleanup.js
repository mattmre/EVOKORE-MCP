#!/usr/bin/env node
'use strict';

/**
 * Stale Worktree Cleanup Automation (M3.4)
 *
 * Usage: node scripts/worktree-cleanup.js [options]
 *   --dry-run     Show what would be cleaned (default)
 *   --apply       Actually perform cleanup
 *   --force       Also remove worktrees with uncommitted changes
 *   --max-age N   Override age threshold in days (default: 7)
 *   --json        Machine-readable output
 *
 * Safety: the root worktree is always skipped. By default the script
 * only reports what it would do; pass --apply to execute removals.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

// ---------------------------------------------------------------------------
// Re-use helpers from repo-state-audit.js
// ---------------------------------------------------------------------------
const { parseWorktreePorcelain } = require('./repo-state-audit');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DEFAULT_MAX_AGE_DAYS = 7;
const EVOKORE_DIR = path.join(os.homedir(), '.evokore');
const LOGS_DIR = path.join(EVOKORE_DIR, 'logs');
const SESSIONS_DIR = path.join(EVOKORE_DIR, 'sessions');
const CLEANUP_LOG = path.join(LOGS_DIR, 'worktree-cleanup.jsonl');

// ---------------------------------------------------------------------------
// Git command helpers (same pattern as repo-state-audit.js)
// ---------------------------------------------------------------------------
function runCommand(command, args, opts = {}) {
  return execFileSync(command, args, {
    cwd: opts.cwd || process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).replace(/[\r\n]+$/, '');
}

function runCommandBestEffort(command, args, opts = {}) {
  try {
    return runCommand(command, args, opts);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {
    apply: false,
    force: false,
    json: false,
    maxAge: DEFAULT_MAX_AGE_DAYS,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--apply') flags.apply = true;
    else if (arg === '--dry-run') flags.apply = false;
    else if (arg === '--force') flags.force = true;
    else if (arg === '--json') flags.json = true;
    else if (arg === '--max-age') {
      const val = Number(args[++i]);
      if (!Number.isNaN(val) && val > 0) flags.maxAge = val;
    }
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Staleness classification
// ---------------------------------------------------------------------------

/**
 * Get the commit date (Unix epoch seconds) for a given ref/sha.
 */
function getCommitEpoch(ref, cwd) {
  const raw = runCommandBestEffort('git', ['log', '-1', '--format=%ct', ref], { cwd });
  if (!raw) return null;
  const epoch = Number(raw.trim());
  return Number.isNaN(epoch) ? null : epoch;
}

/**
 * Check if a branch's upstream is gone.
 */
function isUpstreamGone(branch, cwd) {
  const track = runCommandBestEffort(
    'git',
    ['for-each-ref', '--format=%(upstream:track)', `refs/heads/${branch}`],
    { cwd }
  );
  return track != null && track.includes('gone');
}

/**
 * Check if a branch is merged into origin/main.
 */
function isMergedIntoMain(branchTip, cwd) {
  const result = runCommandBestEffort(
    'git',
    ['merge-base', '--is-ancestor', branchTip, 'origin/main'],
    { cwd }
  );
  // merge-base --is-ancestor exits 0 if true, non-zero if false
  return result != null;
}

/**
 * Classify a worktree's staleness.
 * Returns an array of reason strings (empty if not stale).
 */
function classifyWorktree(wt, maxAgeDays, cwd) {
  const reasons = [];
  const cutoffEpoch = Math.floor(Date.now() / 1000) - (maxAgeDays * 24 * 60 * 60);

  if (wt.prunable) {
    reasons.push('prunable');
  }

  if (wt.branch && isUpstreamGone(wt.branch, cwd)) {
    reasons.push('gone');
  }

  if (wt.head && isMergedIntoMain(wt.head, cwd)) {
    reasons.push('merged');
  }

  if (wt.detached) {
    const epoch = getCommitEpoch(wt.head, cwd);
    if (epoch != null && epoch < cutoffEpoch) {
      reasons.push('detached_old');
    }
  }

  if (wt.branch) {
    const epoch = getCommitEpoch(wt.head, cwd);
    if (epoch != null && epoch < cutoffEpoch) {
      reasons.push('aged');
    }
  }

  return reasons;
}

// ---------------------------------------------------------------------------
// Safety checks
// ---------------------------------------------------------------------------

/**
 * Run safety checks on a worktree. Returns an object describing blockers.
 */
function checkSafety(wt, cwd) {
  const result = {
    uncommittedChanges: false,
    unpushedCommits: false,
    activeSession: false,
    openPR: false,
    lockFile: false,
    details: [],
  };

  // Uncommitted changes
  const status = runCommandBestEffort('git', ['-C', wt.path, 'status', '--porcelain'], { cwd });
  if (status != null && status.trim().length > 0) {
    result.uncommittedChanges = true;
    result.details.push('has uncommitted changes');
  }

  // Unpushed commits (best effort - may fail for detached HEADs or no upstream)
  if (wt.branch) {
    const unpushed = runCommandBestEffort(
      'git',
      ['-C', wt.path, 'log', '@{upstream}..HEAD', '--oneline'],
      { cwd }
    );
    if (unpushed != null && unpushed.trim().length > 0) {
      result.unpushedCommits = true;
      result.details.push('has unpushed commits');
    }
  }

  // Active session check
  if (fs.existsSync(SESSIONS_DIR)) {
    try {
      const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
      const normalizedWtPath = wt.path.replace(/\\/g, '/').toLowerCase();
      for (const file of files) {
        try {
          const manifest = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, file), 'utf8'));
          const wsRoot = (manifest.workspaceRoot || '').replace(/\\/g, '/').toLowerCase();
          if (wsRoot && normalizedWtPath.startsWith(wsRoot)) {
            // Check if session is recent (active within last hour)
            const lastActivity = manifest.lastActivity || manifest.startedAt;
            if (lastActivity) {
              const activityAge = Date.now() - new Date(lastActivity).getTime();
              if (activityAge < 60 * 60 * 1000) { // 1 hour
                result.activeSession = true;
                result.details.push(`active session: ${file}`);
                break;
              }
            }
          }
        } catch {
          // Skip unreadable session files
        }
      }
    } catch {
      // Skip if sessions dir is unreadable
    }
  }

  // Open PR check (best effort - requires gh CLI)
  if (wt.branch) {
    const prRaw = runCommandBestEffort('gh', [
      'pr', 'list', '--head', wt.branch, '--json', 'number', '--limit', '1',
    ], { cwd });
    if (prRaw != null) {
      try {
        const prs = JSON.parse(prRaw);
        if (Array.isArray(prs) && prs.length > 0) {
          result.openPR = true;
          result.details.push(`open PR: #${prs[0].number}`);
        }
      } catch {
        // Ignore JSON parse errors
      }
    }
  }

  // Lock file check
  const lockPath = path.join(wt.path, '.git', 'index.lock');
  if (fs.existsSync(lockPath)) {
    result.lockFile = true;
    result.details.push('has index.lock');
  }

  return result;
}

/**
 * Determine if a worktree is blocked from removal.
 */
function isBlocked(safety, force) {
  if (safety.activeSession) return true;
  if (safety.openPR) return true;
  if (safety.lockFile) return true;
  if (safety.uncommittedChanges && !force) return true;
  if (safety.unpushedCommits && !force) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function logAction(entry) {
  try {
    ensureDir(LOGS_DIR);
    fs.appendFileSync(CLEANUP_LOG, JSON.stringify(entry) + '\n', 'utf8');
  } catch {
    // Never throw from logging
  }
}

// ---------------------------------------------------------------------------
// Cleanup actions
// ---------------------------------------------------------------------------

function removeWorktree(wt, force, dryRun, cwd) {
  const action = {
    timestamp: new Date().toISOString(),
    action: 'remove',
    path: wt.path,
    branch: wt.branch || null,
    reason: wt._reasons ? wt._reasons.join(', ') : 'stale',
    dryRun,
    success: false,
    error: null,
  };

  if (dryRun) {
    action.success = true;
    return action;
  }

  try {
    const args = ['worktree', 'remove', wt.path];
    if (force) args.push('--force');
    runCommand('git', args, { cwd });
    action.success = true;
  } catch (err) {
    action.success = false;
    action.error = err.message || String(err);
  }

  logAction(action);
  return action;
}

function deleteBranch(branch, cwd) {
  const action = {
    timestamp: new Date().toISOString(),
    action: 'branch_delete',
    path: null,
    branch,
    reason: 'stale branch after worktree removal',
    dryRun: false,
    success: false,
    error: null,
  };

  try {
    runCommand('git', ['branch', '-D', branch], { cwd });
    action.success = true;
  } catch (err) {
    action.success = false;
    action.error = err.message || String(err);
  }

  logAction(action);
  return action;
}

function pruneWorktrees(dryRun, cwd) {
  const action = {
    timestamp: new Date().toISOString(),
    action: 'prune',
    path: null,
    branch: null,
    reason: 'git worktree prune',
    dryRun,
    success: false,
    error: null,
  };

  if (dryRun) {
    action.success = true;
    return action;
  }

  try {
    runCommand('git', ['worktree', 'prune'], { cwd });
    action.success = true;
  } catch (err) {
    action.success = false;
    action.error = err.message || String(err);
  }

  logAction(action);
  return action;
}

// ---------------------------------------------------------------------------
// Main orchestration
// ---------------------------------------------------------------------------

function collectWorktreeReport(flags, cwd) {
  // Fetch and prune remote refs when applying (not in dry-run for speed)
  if (flags.apply) {
    runCommandBestEffort('git', ['fetch', '--prune', 'origin'], { cwd });
  }

  // Parse all worktrees
  const raw = runCommand('git', ['worktree', 'list', '--porcelain'], { cwd });
  const worktrees = parseWorktreePorcelain(raw);

  if (worktrees.length === 0) {
    return { worktrees: [], stale: [], actions: [], summary: makeSummary(0, 0, 0, 0, 0, !flags.apply) };
  }

  // Identify root worktree (first entry is always root)
  const rootPath = worktrees[0].path;

  // Classify each non-root worktree
  const stale = [];
  for (let i = 1; i < worktrees.length; i++) {
    const wt = worktrees[i];
    const reasons = classifyWorktree(wt, flags.maxAge, cwd);
    if (reasons.length > 0) {
      wt._reasons = reasons;
      wt._safety = checkSafety(wt, cwd);
      wt._blocked = isBlocked(wt._safety, flags.force);
      stale.push(wt);
    }
  }

  // Perform actions
  const actions = [];

  for (const wt of stale) {
    if (wt._blocked) {
      actions.push({
        timestamp: new Date().toISOString(),
        action: 'skip',
        path: wt.path,
        branch: wt.branch || null,
        reason: `blocked: ${wt._safety.details.join('; ')}`,
        dryRun: !flags.apply,
        success: true,
        error: null,
      });
      continue;
    }

    const removeResult = removeWorktree(wt, flags.force, !flags.apply, cwd);
    actions.push(removeResult);

    // If worktree was removed successfully and branch is merged/gone, delete the branch
    if (removeResult.success && !removeResult.dryRun && wt.branch && !wt._safety.openPR) {
      const reasons = wt._reasons || [];
      if (reasons.includes('merged') || reasons.includes('gone')) {
        const branchResult = deleteBranch(wt.branch, cwd);
        actions.push(branchResult);
      }
    }
  }

  // Run git worktree prune at the end
  const pruneResult = pruneWorktrees(!flags.apply, cwd);
  actions.push(pruneResult);

  const removed = actions.filter(a => a.action === 'remove' && a.success && !a.dryRun).length;
  const skipped = actions.filter(a => a.action === 'skip').length;
  const errors = actions.filter(a => !a.success).length;

  return {
    worktrees: worktrees.map(wt => ({
      path: wt.path,
      head: wt.head,
      branch: wt.branch || null,
      detached: wt.detached,
      prunable: wt.prunable,
      isRoot: wt.path === rootPath,
    })),
    stale: stale.map(wt => ({
      path: wt.path,
      head: wt.head,
      branch: wt.branch || null,
      reasons: wt._reasons,
      blocked: wt._blocked,
      safetyDetails: wt._safety.details,
    })),
    actions,
    summary: makeSummary(worktrees.length, stale.length, removed, skipped, errors, !flags.apply),
  };
}

function makeSummary(total, stale, removed, skipped, errors, dryRun) {
  return { total, stale, removed, skipped, errors, dryRun };
}

// ---------------------------------------------------------------------------
// Output rendering
// ---------------------------------------------------------------------------

function renderHuman(report) {
  const lines = [];
  const { summary } = report;

  if (summary.dryRun) {
    lines.push('=== EVOKORE Worktree Cleanup (DRY RUN) ===');
  } else {
    lines.push('=== EVOKORE Worktree Cleanup ===');
  }

  lines.push(`Total worktrees: ${summary.total}`);
  lines.push(`Stale candidates: ${summary.stale}`);

  if (report.stale.length > 0) {
    lines.push('');
    lines.push('Stale worktrees:');
    for (const wt of report.stale) {
      const status = wt.blocked ? 'BLOCKED' : (summary.dryRun ? 'WOULD REMOVE' : 'REMOVED');
      lines.push(`  ${status}: ${wt.path}`);
      lines.push(`    Branch: ${wt.branch || '(detached)'}`);
      lines.push(`    Reasons: ${wt.reasons.join(', ')}`);
      if (wt.safetyDetails.length > 0) {
        lines.push(`    Safety: ${wt.safetyDetails.join('; ')}`);
      }
    }
  } else {
    lines.push('');
    lines.push('No stale worktrees found.');
  }

  lines.push('');
  if (summary.dryRun) {
    lines.push(`Summary: ${summary.stale} stale, ${summary.stale - summary.skipped} would be removed, ${summary.skipped} blocked`);
    if (summary.stale > 0) {
      lines.push('Run with --apply to execute cleanup.');
    }
  } else {
    lines.push(`Summary: ${summary.removed} removed, ${summary.skipped} skipped, ${summary.errors} errors`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function main() {
  const flags = parseArgs(process.argv);
  const cwd = process.cwd();

  try {
    const report = collectWorktreeReport(flags, cwd);

    if (flags.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    } else {
      process.stdout.write(renderHuman(report) + '\n');
    }

    process.exitCode = report.summary.errors > 0 ? 1 : 0;
  } catch (err) {
    if (flags.json) {
      process.stdout.write(JSON.stringify({ error: err.message }) + '\n');
    } else {
      process.stderr.write(`Error: ${err.message}\n`);
    }
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  classifyWorktree,
  checkSafety,
  isBlocked,
  collectWorktreeReport,
  renderHuman,
  DEFAULT_MAX_AGE_DAYS,
};
