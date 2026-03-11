#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');

const CONTROL_PLANE_PATTERNS = [
  /^CLAUDE\.md$/,
  /^next-session\.md$/,
  /^task_plan\.md$/,
  /^findings\.md$/,
  /^progress\.md$/,
  /^docs\/session-logs\//,
];

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

function parseTrack(track) {
  const value = String(track || '').trim();
  const cleaned = value.replace(/^\[|\]$/g, '');
  const result = {
    raw: value,
    gone: cleaned.includes('gone'),
    ahead: 0,
    behind: 0,
  };

  const aheadMatch = cleaned.match(/ahead\s+(\d+)/);
  const behindMatch = cleaned.match(/behind\s+(\d+)/);
  if (aheadMatch) result.ahead = Number(aheadMatch[1]);
  if (behindMatch) result.behind = Number(behindMatch[1]);
  return result;
}

function parseWorktreePorcelain(output) {
  const lines = String(output || '').split(/\r?\n/);
  const worktrees = [];
  let current = null;

  for (const line of lines) {
    if (!line.trim()) {
      if (current) worktrees.push(current);
      current = null;
      continue;
    }

    const [key, ...rest] = line.split(' ');
    const value = rest.join(' ');
    if (key === 'worktree') {
      if (current) worktrees.push(current);
      current = { path: value, head: '', branch: '', detached: false, prunable: false };
      continue;
    }

    if (!current) continue;
    if (key === 'HEAD') current.head = value;
    else if (key === 'branch') current.branch = value.replace(/^refs\/heads\//, '');
    else if (key === 'detached') current.detached = true;
    else if (key === 'prunable') current.prunable = true;
  }

  if (current) worktrees.push(current);
  return worktrees;
}

function parseStatus(output) {
  return String(output || '')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.{2})\s+(.+)$/);
      const xy = match ? match[1] : line.slice(0, 2);
      const path = match ? match[2].trim() : line.slice(3).trim();
      return { xy, path };
    });
}

function isControlPlanePath(filePath) {
  return CONTROL_PLANE_PATTERNS.some((pattern) => pattern.test(filePath));
}

function classifyControlPlane(entries) {
  return {
    modified: entries.filter((entry) => !entry.xy.startsWith('??') && isControlPlanePath(entry.path)).map((entry) => entry.path),
    untracked: entries.filter((entry) => entry.xy.startsWith('??') && isControlPlanePath(entry.path)).map((entry) => entry.path),
  };
}

function parseLocalBranches(output, mergedIntoMain) {
  return String(output || '')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [name, upstream, track, sha, headFlag, subject] = line.split('|');
      const parsedTrack = parseTrack(track);
      return {
        name,
        upstream: upstream || '',
        track: parsedTrack,
        sha,
        current: headFlag === '*',
        subject: subject || '',
        mergedIntoMain: mergedIntoMain.has(name),
      };
    });
}

function parseRemoteBranchNames(output) {
  return new Set(
    String(output || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.includes('->'))
      .map((line) => line.replace(/^\*\s*/, ''))
  );
}

function getOpenPullRequests(cwd) {
  const raw = runCommandBestEffort('gh', [
    'pr',
    'list',
    '--state',
    'open',
    '--json',
    'number,headRefName,baseRefName,title,url',
  ], { cwd });

  if (!raw) {
    return { available: false, items: [] };
  }

  try {
    return { available: true, items: JSON.parse(raw) };
  } catch {
    return { available: false, items: [] };
  }
}

function collectAudit(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const repoRoot = runCommand('git', ['rev-parse', '--show-toplevel'], { cwd });
  const currentBranch = runCommand('git', ['branch', '--show-current'], { cwd }) || 'detached';
  const currentHead = runCommand('git', ['rev-parse', 'HEAD'], { cwd });
  const mainHead = runCommand('git', ['rev-parse', 'main'], { cwd });
  const originMainHead = runCommandBestEffort('git', ['rev-parse', 'origin/main'], { cwd });
  const [behindMain, aheadMain] = runCommand('git', ['rev-list', '--left-right', '--count', 'main...HEAD'], { cwd })
    .split(/\s+/)
    .map((value) => Number(value));

  const statusEntries = parseStatus(runCommandBestEffort('git', ['status', '--short'], { cwd }) || '');
  const controlPlane = classifyControlPlane(statusEntries);
  const worktrees = parseWorktreePorcelain(runCommand('git', ['worktree', 'list', '--porcelain'], { cwd }));

  const mergedLocal = new Set(
    String(runCommandBestEffort('git', ['for-each-ref', '--merged=origin/main', 'refs/heads', '--format=%(refname:short)'], { cwd }) || '')
      .split(/\r?\n/)
      .filter(Boolean)
  );

  const localBranches = parseLocalBranches(
    runCommand('git', [
      'for-each-ref',
      'refs/heads',
      '--format=%(refname:short)|%(upstream:short)|%(upstream:track)|%(objectname:short)|%(HEAD)|%(contents:subject)',
    ], { cwd }),
    mergedLocal
  );

  const mergedRemote = parseRemoteBranchNames(runCommandBestEffort('git', ['branch', '-r', '--merged', 'origin/main'], { cwd }) || '');
  const openPullRequests = getOpenPullRequests(cwd);
  const openHeadRefs = new Set(openPullRequests.items.map((item) => `origin/${item.headRefName}`));

  const staleLocalBranches = localBranches.filter((branch) =>
    !branch.current &&
    branch.name !== 'main' &&
    (branch.track.gone || branch.mergedIntoMain)
  );

  const staleRemoteBranches = [...mergedRemote]
    .filter((name) => name !== 'origin/main' && name !== 'origin/HEAD')
    .filter((name) => !openHeadRefs.has(name))
    .sort();

  const warnings = [];
  if (currentBranch !== 'main' && behindMain > 0) {
    warnings.push(`Current branch "${currentBranch}" is behind main by ${behindMain} commit(s).`);
  }
  if (controlPlane.modified.length || controlPlane.untracked.length) {
    warnings.push('Control-plane handoff files have local drift.');
  }
  if (staleLocalBranches.length) {
    warnings.push(`Found ${staleLocalBranches.length} stale local branch candidate(s).`);
  }
  if (staleRemoteBranches.length) {
    warnings.push(`Found ${staleRemoteBranches.length} merged remote branch candidate(s) without open PRs.`);
  }

  return {
    repoRoot,
    currentBranch,
    currentHead,
    mainHead,
    originMainHead,
    divergenceFromMain: {
      behind: behindMain,
      ahead: aheadMain,
    },
    worktrees,
    statusEntries,
    controlPlane,
    localBranches,
    staleLocalBranches,
    openPullRequests,
    staleRemoteBranches,
    warnings,
  };
}

function renderHuman(report) {
  const lines = [];
  lines.push('EVOKORE Repo State Audit');
  lines.push(`Repo root: ${report.repoRoot}`);
  lines.push(`Current branch: ${report.currentBranch} (behind main ${report.divergenceFromMain.behind}, ahead ${report.divergenceFromMain.ahead})`);
  lines.push(`Worktrees: ${report.worktrees.length}`);
  lines.push(`Open PRs: ${report.openPullRequests.available ? report.openPullRequests.items.length : 'unavailable'}`);

  if (report.controlPlane.modified.length || report.controlPlane.untracked.length) {
    lines.push('Control-plane drift:');
    for (const file of report.controlPlane.modified) lines.push(`- modified: ${file}`);
    for (const file of report.controlPlane.untracked) lines.push(`- untracked: ${file}`);
  } else {
    lines.push('Control-plane drift: none');
  }

  if (report.staleLocalBranches.length) {
    lines.push('Stale local branch candidates:');
    for (const branch of report.staleLocalBranches) {
      const reason = branch.track.gone ? 'upstream gone' : 'merged into origin/main';
      lines.push(`- ${branch.name} (${reason})`);
    }
  } else {
    lines.push('Stale local branch candidates: none');
  }

  if (report.staleRemoteBranches.length) {
    lines.push('Merged remote branch candidates:');
    for (const branch of report.staleRemoteBranches.slice(0, 20)) {
      lines.push(`- ${branch}`);
    }
    if (report.staleRemoteBranches.length > 20) {
      lines.push(`- ... ${report.staleRemoteBranches.length - 20} more`);
    }
  } else {
    lines.push('Merged remote branch candidates: none');
  }

  if (report.warnings.length) {
    lines.push('Warnings:');
    for (const warning of report.warnings) lines.push(`- ${warning}`);
  }

  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const report = collectAudit({ cwd: process.cwd() });
  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${renderHuman(report)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  CONTROL_PLANE_PATTERNS,
  classifyControlPlane,
  collectAudit,
  parseStatus,
  parseTrack,
  parseWorktreePorcelain,
  renderHuman,
};
