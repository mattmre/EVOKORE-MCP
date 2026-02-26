'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function run() {
  console.log('Running hook observability hardening validation...');

  // 1. Validate rotation logic exists in hook-observability.js
  const observabilityPath = path.resolve(__dirname, 'scripts', 'hook-observability.js');
  assert.ok(fs.existsSync(observabilityPath), 'scripts/hook-observability.js must exist');

  const observabilitySrc = fs.readFileSync(observabilityPath, 'utf8');

  assert.match(observabilitySrc, /MAX_LOG_SIZE/, 'hook-observability.js must define MAX_LOG_SIZE');
  assert.match(observabilitySrc, /MAX_ROTATED_FILES/, 'hook-observability.js must define MAX_ROTATED_FILES');
  assert.match(observabilitySrc, /5\s*\*\s*1024\s*\*\s*1024/, 'MAX_LOG_SIZE must be 5 MB');
  assert.match(observabilitySrc, /rotateIfNeeded/, 'hook-observability.js must implement rotateIfNeeded');
  assert.match(observabilitySrc, /renameSync/, 'rotation must use synchronous fs.renameSync');
  assert.match(observabilitySrc, /\.statSync/, 'rotation must check file size with statSync');

  // Verify rotateIfNeeded is called before write
  const writeBody = observabilitySrc.slice(observabilitySrc.indexOf('function writeHookEvent'));
  const rotateCallIndex = writeBody.indexOf('rotateIfNeeded()');
  const appendCallIndex = writeBody.indexOf('appendFileSync');
  assert.ok(rotateCallIndex > 0, 'writeHookEvent must call rotateIfNeeded');
  assert.ok(rotateCallIndex < appendCallIndex, 'rotateIfNeeded must run before appendFileSync');

  // Verify rotation is wrapped in try/catch (fail-safe)
  const rotateBody = observabilitySrc.slice(
    observabilitySrc.indexOf('function rotateIfNeeded'),
    observabilitySrc.indexOf('function writeHookEvent')
  );
  assert.match(rotateBody, /try\s*\{/, 'rotateIfNeeded must have try/catch for fail-safe');
  assert.match(rotateBody, /catch/, 'rotateIfNeeded must have catch block');

  // Verify exports include rotation helpers
  assert.match(observabilitySrc, /rotateIfNeeded/, 'rotateIfNeeded should be exported');
  assert.match(observabilitySrc, /HOOK_LOG_PATH/, 'HOOK_LOG_PATH should be exported');

  console.log('  [PASS] hook-observability.js has log rotation logic');

  // 2. Validate hook-log-view.js exists with required features
  const viewerPath = path.resolve(__dirname, 'scripts', 'hook-log-view.js');
  assert.ok(fs.existsSync(viewerPath), 'scripts/hook-log-view.js must exist');

  const viewerSrc = fs.readFileSync(viewerPath, 'utf8');

  assert.match(viewerSrc, /--hook/, 'viewer must support --hook filter');
  assert.match(viewerSrc, /--since/, 'viewer must support --since filter');
  assert.match(viewerSrc, /--session/, 'viewer must support --session filter');
  assert.match(viewerSrc, /--json/, 'viewer must support --json output mode');
  assert.match(viewerSrc, /--tail/, 'viewer must support --tail option');
  assert.match(viewerSrc, /hooks\.jsonl/, 'viewer must read hooks.jsonl');
  assert.match(viewerSrc, /Summary/, 'viewer must print summary stats');

  console.log('  [PASS] hook-log-view.js exists with filter and output support');

  // 3. Validate package.json has hooks:view script
  const pkgPath = path.resolve(__dirname, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  assert.ok(pkg.scripts['hooks:view'], 'package.json must have hooks:view script');
  assert.match(
    pkg.scripts['hooks:view'],
    /hook-log-view/,
    'hooks:view script must reference hook-log-view.js'
  );

  console.log('  [PASS] package.json has hooks:view script');

  // 4. Validate USAGE.md documents rotation and viewer
  const usagePath = path.resolve(__dirname, 'docs', 'USAGE.md');
  const usageSrc = fs.readFileSync(usagePath, 'utf8');

  assert.match(usageSrc, /[Rr]otat(e|ion)/, 'USAGE.md must document log rotation');
  assert.match(usageSrc, /5\s*MB/, 'USAGE.md must document 5 MB threshold');
  assert.match(usageSrc, /hooks:view/, 'USAGE.md must document hooks:view command');

  console.log('  [PASS] USAGE.md documents rotation and viewer');

  console.log('Hook observability hardening validation passed.');
}

try {
  run();
} catch (error) {
  console.error('Hook observability hardening validation failed:', error);
  process.exit(1);
}
