#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');

const WARNING_THRESHOLD = 0.80;
const CRITICAL_THRESHOLD = 0.95;
const DEFAULT_OWNER = 'mattmre';

/**
 * Run a command and return stdout, or null on failure.
 */
function runCommand(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15000,
    }).replace(/[\r\n]+$/, '');
  } catch {
    return null;
  }
}

/**
 * Detect the GitHub owner from the current repo remote, or fall back to DEFAULT_OWNER.
 */
function detectOwner() {
  const remote = runCommand('git', ['remote', 'get-url', 'origin']);
  if (remote) {
    // SSH: git@github.com:owner/repo.git
    const sshMatch = remote.match(/github\.com[:/]([^/]+)\//);
    if (sshMatch) return sshMatch[1];
    // HTTPS: https://github.com/owner/repo.git
    const httpsMatch = remote.match(/github\.com\/([^/]+)\//);
    if (httpsMatch) return httpsMatch[1];
  }
  return DEFAULT_OWNER;
}

/**
 * Fetch GitHub Actions billing data for a user via the gh CLI.
 * Tries the user billing endpoint first, then the org endpoint as fallback.
 */
function fetchBillingData(owner) {
  const endpoints = [
    `/users/${owner}/settings/billing/actions`,
    `/orgs/${owner}/settings/billing/actions`,
  ];

  for (const endpoint of endpoints) {
    const raw = runCommand('gh', ['api', endpoint]);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        continue;
      }
    }
  }

  return null;
}

/**
 * Parse the billing API response into a normalized quota report.
 * The API returns:
 *   total_minutes_used: number
 *   total_paid_minutes_used: number (always 0 for free tier)
 *   included_minutes: number
 *   minutes_used_breakdown: { UBUNTU: number, MACOS: number, WINDOWS: number }
 */
function parseBillingData(data) {
  const totalUsed = data.total_minutes_used || 0;
  const included = data.included_minutes || 0;
  const paidUsed = data.total_paid_minutes_used || 0;
  const breakdown = data.minutes_used_breakdown || {};

  const remaining = Math.max(0, included - totalUsed);
  const percentUsed = included > 0 ? totalUsed / included : 0;

  return {
    totalMinutesUsed: totalUsed,
    totalPaidMinutesUsed: paidUsed,
    includedMinutes: included,
    remainingMinutes: remaining,
    percentUsed,
    breakdown,
  };
}

/**
 * Determine the exit code based on usage thresholds.
 * Returns 0 (ok), 1 (warning >= 80%), or 2 (critical >= 95%).
 */
function determineExitCode(percentUsed) {
  if (percentUsed >= CRITICAL_THRESHOLD) return 2;
  if (percentUsed >= WARNING_THRESHOLD) return 1;
  return 0;
}

/**
 * Format a human-readable report string.
 */
function formatReport(report) {
  const lines = [];
  const pctStr = (report.percentUsed * 100).toFixed(1);

  lines.push('GitHub Actions Quota');
  lines.push('====================');
  lines.push(`Minutes used:      ${report.totalMinutesUsed} / ${report.includedMinutes}`);
  lines.push(`Minutes remaining: ${report.remainingMinutes}`);
  lines.push(`Usage:             ${pctStr}%`);

  if (report.totalPaidMinutesUsed > 0) {
    lines.push(`Paid minutes used: ${report.totalPaidMinutesUsed}`);
  }

  const breakdownKeys = Object.keys(report.breakdown).filter(
    (key) => report.breakdown[key] > 0
  );
  if (breakdownKeys.length > 0) {
    lines.push('');
    lines.push('Breakdown by runner:');
    for (const key of breakdownKeys) {
      lines.push(`  ${key}: ${report.breakdown[key]} min`);
    }
  }

  const exitCode = determineExitCode(report.percentUsed);
  if (exitCode === 2) {
    lines.push('');
    lines.push('CRITICAL: Usage exceeds 95%. CI runs may fail. Use local validation: npx vitest run');
  } else if (exitCode === 1) {
    lines.push('');
    lines.push('WARNING: Usage exceeds 80%. Consider batching PRs to conserve minutes.');
  }

  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const jsonFlag = args.includes('--json');
  const quietFlag = args.includes('--quiet');

  const owner = detectOwner();
  const billingData = fetchBillingData(owner);

  if (!billingData) {
    const errorMsg = 'Unable to fetch GitHub Actions billing data. Ensure `gh` CLI is installed and authenticated with sufficient permissions.';
    if (jsonFlag) {
      process.stdout.write(`${JSON.stringify({ error: errorMsg })}\n`);
    } else if (!quietFlag) {
      process.stderr.write(`${errorMsg}\n`);
    }
    process.exit(3);
  }

  const report = parseBillingData(billingData);
  const exitCode = determineExitCode(report.percentUsed);

  if (jsonFlag) {
    process.stdout.write(`${JSON.stringify(Object.assign({ exitCode, owner }, report), null, 2)}\n`);
  } else if (quietFlag) {
    // In quiet mode, only print if warning or critical
    if (exitCode > 0) {
      const pctStr = (report.percentUsed * 100).toFixed(1);
      const level = exitCode === 2 ? 'CRITICAL' : 'WARNING';
      process.stderr.write(`${level}: GitHub Actions quota at ${pctStr}% (${report.remainingMinutes} min remaining)\n`);
    }
  } else {
    process.stdout.write(`${formatReport(report)}\n`);
  }

  process.exit(exitCode);
}

if (require.main === module) {
  main();
}

module.exports = {
  WARNING_THRESHOLD,
  CRITICAL_THRESHOLD,
  detectOwner,
  fetchBillingData,
  parseBillingData,
  determineExitCode,
  formatReport,
};
