#!/usr/bin/env node
'use strict';

/**
 * validate-tdd-evidence.js
 *
 * Advisory validator for the TDD red-commit-hash evidence rule (Wave 4
 * uplift of `orch-tdd`). Scans a session evidence JSONL for
 * `tdd-red-green` records and warns when a GREEN commit lacks a
 * matching RED commit reference.
 *
 * The validator is intentionally **advisory** (WARN-only):
 *   - exit 0 when there are no `tdd-red-green` rows (nothing to check)
 *   - exit 0 when every GREEN row has a non-empty `red_sha` (40-hex)
 *   - exit 0 with WARN lines on stderr when gaps are found
 *
 * It never exits non-zero. Hard-blocking on this would be too noisy
 * for the current corpus of sessions; the rule is meant to be
 * tightened later once adoption is steady. See
 * SKILLS/ORCHESTRATION FRAMEWORK/commands/orch-tdd/SKILL.md
 * ("Red-commit-hash evidence rule").
 *
 * Usage:
 *   node scripts/validate-tdd-evidence.js --session <id>
 *   node scripts/validate-tdd-evidence.js --file <path-to-evidence-jsonl>
 *   node scripts/validate-tdd-evidence.js --latest
 *   node scripts/validate-tdd-evidence.js --json
 *
 * `--json` prints a machine-readable summary on stdout. Otherwise
 * human-readable WARN lines are written to stderr.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const SESSIONS_DIR = path.join(os.homedir(), '.evokore', 'sessions');
const HEX40 = /^[0-9a-fA-F]{40}$/;

function parseArgs(argv) {
  const opts = { session: null, file: null, latest: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--session') opts.session = argv[++i];
    else if (a.startsWith('--session=')) opts.session = a.slice('--session='.length);
    else if (a === '--file') opts.file = argv[++i];
    else if (a.startsWith('--file=')) opts.file = a.slice('--file='.length);
    else if (a === '--latest') opts.latest = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--help' || a === '-h') {
      process.stdout.write(
        'Usage: validate-tdd-evidence.js [--session <id> | --file <path> | --latest] [--json]\n'
      );
      process.exit(0);
    }
  }
  return opts;
}

function resolveEvidenceFile(opts) {
  if (opts.file) return opts.file;
  if (opts.session) {
    return path.join(SESSIONS_DIR, `${opts.session}-evidence.jsonl`);
  }
  if (opts.latest) {
    if (!fs.existsSync(SESSIONS_DIR)) return null;
    const candidates = fs
      .readdirSync(SESSIONS_DIR)
      .filter((n) => n.endsWith('-evidence.jsonl'))
      .map((n) => ({
        name: n,
        mtime: fs.statSync(path.join(SESSIONS_DIR, n)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);
    if (candidates.length === 0) return null;
    return path.join(SESSIONS_DIR, candidates[0].name);
  }
  return null;
}

/**
 * Scan a stream of evidence rows and emit warnings for GREEN commits
 * missing a RED reference. Rows that are not type `tdd-red-green` are
 * ignored.
 *
 * Expected row shape:
 *   { type: "tdd-red-green", slice_id, red_sha, green_sha, test_path, ts }
 *
 * Validation rules (advisory):
 *   - row.type === 'tdd-red-green'
 *   - row.green_sha matches /^[0-9a-fA-F]{40}$/
 *   - row.red_sha matches /^[0-9a-fA-F]{40}$/
 *   - row.slice_id is a non-empty string
 *
 * Returns { totalRows, tddRows, warnings: [{row, reason}] }.
 */
function validateRows(rows) {
  const result = { totalRows: rows.length, tddRows: 0, warnings: [] };
  for (const row of rows) {
    if (!row || row.type !== 'tdd-red-green') continue;
    result.tddRows++;
    const reasons = [];
    if (!row.slice_id || typeof row.slice_id !== 'string') {
      reasons.push('missing slice_id');
    }
    if (!row.green_sha || !HEX40.test(row.green_sha)) {
      reasons.push('green_sha missing or not 40-hex');
    }
    if (!row.red_sha || !HEX40.test(row.red_sha)) {
      reasons.push('red_sha missing or not 40-hex (GREEN commit lacks matching RED)');
    }
    if (reasons.length > 0) {
      result.warnings.push({ row, reason: reasons.join('; ') });
    }
  }
  return result;
}

function readRows(filePath) {
  const rows = [];
  if (!filePath || !fs.existsSync(filePath)) return rows;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch {
      // Skip malformed JSONL lines silently — evidence files are
      // append-only and may briefly contain partial writes.
    }
  }
  return rows;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const filePath = resolveEvidenceFile(opts);

  if (!filePath || !fs.existsSync(filePath)) {
    if (opts.json) {
      process.stdout.write(
        JSON.stringify({
          ok: true,
          file: filePath || null,
          totalRows: 0,
          tddRows: 0,
          warnings: [],
          note: 'no evidence file found',
        }) + '\n'
      );
    } else {
      process.stderr.write(
        '[validate-tdd-evidence] No evidence file found (session has no recorded evidence yet). Skipping.\n'
      );
    }
    process.exit(0);
  }

  const rows = readRows(filePath);
  const result = validateRows(rows);

  if (opts.json) {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        file: filePath,
        totalRows: result.totalRows,
        tddRows: result.tddRows,
        warnings: result.warnings,
      }) + '\n'
    );
    process.exit(0);
  }

  if (result.tddRows === 0) {
    process.stderr.write(
      `[validate-tdd-evidence] ${filePath}: no tdd-red-green rows found. Nothing to validate.\n`
    );
    process.exit(0);
  }

  if (result.warnings.length === 0) {
    process.stderr.write(
      `[validate-tdd-evidence] ${filePath}: ${result.tddRows} tdd-red-green row(s) checked; all carry a valid red_sha.\n`
    );
    process.exit(0);
  }

  process.stderr.write(
    `[validate-tdd-evidence] WARN: ${result.warnings.length} of ${result.tddRows} tdd-red-green row(s) are missing a valid RED reference.\n`
  );
  for (const w of result.warnings) {
    const sliceId = (w.row && w.row.slice_id) || '<unknown>';
    process.stderr.write(`  - slice_id=${sliceId}: ${w.reason}\n`);
  }
  process.stderr.write(
    '[validate-tdd-evidence] This is advisory; the validator never exits non-zero. See orch-tdd "Red-commit-hash evidence rule".\n'
  );
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { validateRows, readRows, resolveEvidenceFile, HEX40 };
