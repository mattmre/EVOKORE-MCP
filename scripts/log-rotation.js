#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Shared log rotation utilities for EVOKORE hook scripts.
 *
 * Two functions:
 *   rotateIfNeeded(filePath, opts) - rotate a single file when it exceeds maxBytes
 *   pruneOldSessions(sessionsDir, opts) - delete stale per-session JSONL files
 *
 * All operations are synchronous and wrapped in try/catch to guarantee
 * fail-safe behaviour (hooks MUST exit 0 on unexpected errors).
 */

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const DEFAULT_MAX_ROTATIONS = 3;
const DEFAULT_MAX_AGE_DAYS = 30;
const DEFAULT_MAX_FILES = 100;

/**
 * Rotate a log file when it exceeds maxBytes.
 * Keeps up to maxRotations numbered copies (.1, .2, ...).
 * Uses synchronous fs operations since this runs in a hook context.
 *
 * @param {string} filePath - Absolute path to the log file
 * @param {object} [opts]
 * @param {number} [opts.maxBytes=5242880] - Rotate when file exceeds this size
 * @param {number} [opts.maxRotations=3] - Number of rotated copies to keep
 */
function rotateIfNeeded(filePath, opts) {
  try {
    if (!filePath) return;

    const maxBytes = (opts && opts.maxBytes != null) ? opts.maxBytes : DEFAULT_MAX_BYTES;
    const maxRotations = (opts && opts.maxRotations != null) ? opts.maxRotations : DEFAULT_MAX_ROTATIONS;

    if (!fs.existsSync(filePath)) return;

    const stat = fs.statSync(filePath);
    if (stat.size < maxBytes) return;

    // Remove the oldest target first so sparse rotation sequences don't retain stale files.
    const oldest = `${filePath}.${maxRotations}`;
    if (fs.existsSync(oldest)) {
      fs.unlinkSync(oldest);
    }

    // Shift existing rotated files: .2 -> .3, .1 -> .2
    for (let i = maxRotations - 1; i >= 1; i--) {
      const older = `${filePath}.${i}`;
      const newer = `${filePath}.${i + 1}`;
      if (fs.existsSync(older)) {
        fs.renameSync(older, newer);
      }
    }

    // Rotate current file to .1
    fs.renameSync(filePath, `${filePath}.1`);
  } catch (err) {
    try {
      process.stderr.write('[EVOKORE] Log rotation error for ' + filePath + ': ' + (err && err.message || String(err)) + '\n');
    } catch { /* final safety net — never throw from rotation path */ }
  }
}

/**
 * Prune old session files (replay/evidence JSONL) from a sessions directory.
 * Deletes files older than maxAgeDays or exceeding maxFiles count (oldest first).
 *
 * @param {string} sessionsDir - Absolute path to the sessions directory
 * @param {object} [opts]
 * @param {number} [opts.maxAgeDays=30] - Delete files older than this many days
 * @param {number} [opts.maxFiles=100] - Keep at most this many session files
 */
function pruneOldSessions(sessionsDir, opts) {
  try {
    if (!sessionsDir) return;
    if (!fs.existsSync(sessionsDir)) return;

    const maxAgeDays = (opts && opts.maxAgeDays != null) ? opts.maxAgeDays : DEFAULT_MAX_AGE_DAYS;
    const maxFiles = (opts && opts.maxFiles != null) ? opts.maxFiles : DEFAULT_MAX_FILES;

    const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);

    // List session-related files (replay and evidence JSONL)
    const entries = fs.readdirSync(sessionsDir)
      .filter(name => /-(replay|evidence)\.jsonl$/.test(name))
      .map(name => {
        const fullPath = path.join(sessionsDir, name);
        try {
          const stat = fs.statSync(fullPath);
          return { name, fullPath, mtimeMs: stat.mtimeMs };
        } catch (err) {
          try {
            process.stderr.write('[EVOKORE] Log rotation error for ' + fullPath + ': ' + (err && err.message || String(err)) + '\n');
          } catch { /* final safety net — never throw from rotation path */ }
          return null;
        }
      })
      .filter(Boolean);

    // Sort oldest first
    entries.sort((a, b) => a.mtimeMs - b.mtimeMs);

    // Pass 1: delete files older than maxAgeDays
    const remaining = [];
    for (const entry of entries) {
      if (entry.mtimeMs < cutoff) {
        try { fs.unlinkSync(entry.fullPath); } catch (err) {
          try {
            process.stderr.write('[EVOKORE] Log rotation error for ' + entry.fullPath + ': ' + (err && err.message || String(err)) + '\n');
          } catch { /* final safety net — never throw from rotation path */ }
        }
      } else {
        remaining.push(entry);
      }
    }

    // Pass 2: if still over maxFiles, delete oldest until within limit
    while (remaining.length > maxFiles) {
      const victim = remaining.shift();
      try { fs.unlinkSync(victim.fullPath); } catch (err) {
        try {
          process.stderr.write('[EVOKORE] Log rotation error for ' + victim.fullPath + ': ' + (err && err.message || String(err)) + '\n');
        } catch { /* final safety net — never throw from rotation path */ }
      }
    }
  } catch (err) {
    try {
      process.stderr.write('[EVOKORE] Log rotation error for ' + sessionsDir + ': ' + (err && err.message || String(err)) + '\n');
    } catch { /* final safety net — never throw from rotation path */ }
  }
}

module.exports = {
  rotateIfNeeded,
  pruneOldSessions,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_ROTATIONS,
  DEFAULT_MAX_AGE_DAYS,
  DEFAULT_MAX_FILES
};
