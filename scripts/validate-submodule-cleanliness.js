#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');

function runGit(command) {
  return execSync(command, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trimEnd();
}

function run() {
  const statusOutput = runGit('git submodule status --recursive');
  const lines = statusOutput.split(/\r?\n/).filter(Boolean);

  if (lines.length === 0) {
    console.log('Submodule cleanliness validation passed (no submodules configured).');
    return;
  }

  const issues = [];
  const initializedPaths = [];

  for (const line of lines) {
    const match = line.match(/^([ +\-U])([0-9a-f]+)\s+(.+?)(?:\s+\(.*\))?$/);
    if (!match) {
      issues.push(`Unable to parse submodule status line: ${line}`);
      continue;
    }

    const marker = match[1];
    const submodulePath = match[3];

    if (marker === '-') {
      issues.push(`Uninitialized submodule: ${submodulePath}`);
      continue;
    }

    if (marker === '+') {
      issues.push(`Submodule commit mismatch (worktree != gitlink): ${submodulePath}`);
    } else if (marker === 'U') {
      issues.push(`Submodule merge conflict: ${submodulePath}`);
    }

    initializedPaths.push(submodulePath);
  }

  for (const submodulePath of initializedPaths) {
    const dirtyOutput = runGit(`git -C "${submodulePath}" status --porcelain`);
    if (dirtyOutput.trim()) {
      issues.push(`Dirty submodule worktree: ${submodulePath}`);
    }
  }

  if (issues.length > 0) {
    console.error('Submodule cleanliness validation failed:');
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log('Submodule cleanliness validation passed.');
}

try {
  run();
} catch (error) {
  const details = error && error.stderr ? String(error.stderr).trim() : error.message;
  console.error('Submodule cleanliness validation failed:', details);
  process.exit(1);
}
