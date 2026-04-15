#!/usr/bin/env node
'use strict';

/**
 * security_scan worker -- minimal pattern grep over `src/` for known bad
 * patterns. This is a smoke check, not a real SAST tool. Results feed the
 * purpose-gate "security" auto-trigger so the model sees what was found.
 */

const fs = require('fs');
const path = require('path');

function send(msg) {
  if (typeof process.send === 'function') {
    try { process.send(msg); } catch { /* ignore */ }
  }
}

function parseOptions() {
  try { return JSON.parse(process.env.WORKER_OPTIONS || '{}'); } catch { return {}; }
}

const PATTERNS = [
  { id: 'eval_call', regex: /\beval\s*\(/, severity: 'high' },
  { id: 'process_exit_zero', regex: /process\.exit\s*\(\s*0\s*\)/, severity: 'low' },
  { id: 'hardcoded_token', regex: /(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"][A-Za-z0-9._-]{16,}['"]/i, severity: 'high' },
  { id: 'aws_access_key', regex: /AKIA[0-9A-Z]{16}/, severity: 'high' },
  { id: 'private_key_block', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, severity: 'high' },
];

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.next']);

function* walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      yield* walk(full);
    } else if (e.isFile() && /\.(ts|tsx|js|mjs|cjs)$/.test(e.name)) {
      yield full;
    }
  }
}

(function main() {
  send({ type: 'start', workerId: process.env.WORKER_ID });

  const opts = parseOptions();
  const root = opts.root || path.join(process.cwd(), 'src');

  const findings = [];
  let scannedFiles = 0;

  try {
    if (fs.existsSync(root)) {
      for (const file of walk(root)) {
        scannedFiles++;
        let content;
        try { content = fs.readFileSync(file, 'utf8'); } catch { continue; }
        const lines = content.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          for (const pat of PATTERNS) {
            if (pat.regex.test(line)) {
              findings.push({
                id: pat.id,
                severity: pat.severity,
                file,
                line: i + 1,
                snippet: line.trim().slice(0, 200),
              });
            }
          }
        }
      }
    }
  } catch (err) {
    send({ type: 'error', error: err && err.message ? err.message : String(err) });
    process.exit(1);
    return;
  }

  send({
    type: 'complete',
    result: {
      root,
      scannedFiles,
      findingCount: findings.length,
      findings: findings.slice(0, 50),
    },
  });
  process.exit(0);
})();
