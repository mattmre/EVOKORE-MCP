#!/usr/bin/env node
'use strict';

const { buildStatusSnapshot, renderStatusLine } = require('./status-runtime');

let input = '';
process.stdin.on('data', (chunk) => {
  input += chunk;
});

process.stdin.on('end', () => {
  try {
    const payload = input.trim() ? JSON.parse(input) : {};
    const snapshot = buildStatusSnapshot(payload, { cwd: process.cwd() });
    const line = renderStatusLine(snapshot, {
      ansi: process.stdout.isTTY !== false,
      width: process.stdout.columns || 100
    });
    process.stdout.write(`${line}\n`);
  } catch {
    // Fail quiet in status-line mode; a broken status helper should not damage the session.
  }
});

process.stdin.resume();
