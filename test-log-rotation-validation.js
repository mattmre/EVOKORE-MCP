'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

function run() {
  console.log('Running log rotation validation...');

  // ─── 1. Validate scripts/log-rotation.js exists and exports correctly ───
  const modulePath = path.resolve(__dirname, 'scripts', 'log-rotation.js');
  assert.ok(fs.existsSync(modulePath), 'scripts/log-rotation.js must exist');

  const mod = require(modulePath);
  assert.strictEqual(typeof mod.rotateIfNeeded, 'function', 'rotateIfNeeded must be exported as a function');
  assert.strictEqual(typeof mod.pruneOldSessions, 'function', 'pruneOldSessions must be exported as a function');
  assert.strictEqual(mod.DEFAULT_MAX_BYTES, 5 * 1024 * 1024, 'DEFAULT_MAX_BYTES must be 5 MB');
  assert.strictEqual(mod.DEFAULT_MAX_ROTATIONS, 3, 'DEFAULT_MAX_ROTATIONS must be 3');
  assert.strictEqual(mod.DEFAULT_MAX_AGE_DAYS, 30, 'DEFAULT_MAX_AGE_DAYS must be 30');
  assert.strictEqual(mod.DEFAULT_MAX_FILES, 100, 'DEFAULT_MAX_FILES must be 100');

  console.log('  [PASS] log-rotation.js exists with correct exports');

  // ─── 2. rotateIfNeeded: correctly rotates files over the size limit ───
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-logrot-'));

  try {
    const logFile = path.join(tmpDir, 'test.log');

    // Create a file that exceeds maxBytes (use small threshold for testing)
    fs.writeFileSync(logFile, 'x'.repeat(200));

    mod.rotateIfNeeded(logFile, { maxBytes: 100, maxRotations: 3 });

    assert.ok(!fs.existsSync(logFile), 'original file must be renamed after rotation');
    assert.ok(fs.existsSync(`${logFile}.1`), 'file must rotate to .1');
    assert.strictEqual(fs.readFileSync(`${logFile}.1`, 'utf8'), 'x'.repeat(200), '.1 must contain original data');

    // Rotate again with a new file
    fs.writeFileSync(logFile, 'y'.repeat(200));
    mod.rotateIfNeeded(logFile, { maxBytes: 100, maxRotations: 3 });

    assert.ok(fs.existsSync(`${logFile}.1`), '.1 must exist after second rotation');
    assert.ok(fs.existsSync(`${logFile}.2`), '.2 must exist after second rotation');
    assert.strictEqual(fs.readFileSync(`${logFile}.1`, 'utf8'), 'y'.repeat(200), '.1 must be newest');
    assert.strictEqual(fs.readFileSync(`${logFile}.2`, 'utf8'), 'x'.repeat(200), '.2 must be older');

    // Rotate three more times to test maxRotations=3 eviction
    fs.writeFileSync(logFile, 'a'.repeat(200));
    mod.rotateIfNeeded(logFile, { maxBytes: 100, maxRotations: 3 });

    fs.writeFileSync(logFile, 'b'.repeat(200));
    mod.rotateIfNeeded(logFile, { maxBytes: 100, maxRotations: 3 });

    // .3 should be the oldest kept, .4 should not exist
    assert.ok(fs.existsSync(`${logFile}.3`), '.3 must exist at maxRotations');
    assert.ok(!fs.existsSync(`${logFile}.4`), '.4 must NOT exist (beyond maxRotations)');

    console.log('  [PASS] rotateIfNeeded correctly rotates files over the size limit');

    // ─── 3. rotateIfNeeded: does NOT rotate if under size limit ───
    const smallFile = path.join(tmpDir, 'small.log');
    fs.writeFileSync(smallFile, 'tiny');
    mod.rotateIfNeeded(smallFile, { maxBytes: 1000, maxRotations: 3 });
    assert.ok(fs.existsSync(smallFile), 'file under maxBytes must NOT be rotated');
    assert.ok(!fs.existsSync(`${smallFile}.1`), 'no .1 file for small file');

    console.log('  [PASS] rotateIfNeeded skips files under the size limit');

    // ─── 4. rotateIfNeeded: handles missing files gracefully ───
    const nonExistent = path.join(tmpDir, 'does-not-exist.log');
    mod.rotateIfNeeded(nonExistent, { maxBytes: 100, maxRotations: 3 });
    // Should not throw
    mod.rotateIfNeeded(null);
    mod.rotateIfNeeded('');

    console.log('  [PASS] rotateIfNeeded handles missing files gracefully');

    // ─── 5. pruneOldSessions: removes old files ───
    const sessDir = path.join(tmpDir, 'sessions');
    fs.mkdirSync(sessDir);

    // Create session files with old timestamps
    const oldFile = path.join(sessDir, 'old-session-replay.jsonl');
    const recentFile = path.join(sessDir, 'recent-session-replay.jsonl');
    const evidenceFile = path.join(sessDir, 'old-session-evidence.jsonl');
    const nonSessionFile = path.join(sessDir, 'session-state.json');

    fs.writeFileSync(oldFile, '{"ts":"2020-01-01"}\n');
    fs.writeFileSync(recentFile, '{"ts":"2026-03-10"}\n');
    fs.writeFileSync(evidenceFile, '{"ts":"2020-01-01"}\n');
    fs.writeFileSync(nonSessionFile, '{}');

    // Set old mtimes (60 days ago)
    const oldTime = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    fs.utimesSync(oldFile, oldTime, oldTime);
    fs.utimesSync(evidenceFile, oldTime, oldTime);

    mod.pruneOldSessions(sessDir, { maxAgeDays: 30, maxFiles: 100 });

    assert.ok(!fs.existsSync(oldFile), 'old replay file must be pruned');
    assert.ok(!fs.existsSync(evidenceFile), 'old evidence file must be pruned');
    assert.ok(fs.existsSync(recentFile), 'recent file must be kept');
    assert.ok(fs.existsSync(nonSessionFile), 'non-session files must not be touched');

    console.log('  [PASS] pruneOldSessions removes old files');

    // ─── 6. pruneOldSessions: respects maxFiles limit ───
    const sessDir2 = path.join(tmpDir, 'sessions2');
    fs.mkdirSync(sessDir2);

    for (let i = 0; i < 10; i++) {
      const f = path.join(sessDir2, `session-${String(i).padStart(3, '0')}-replay.jsonl`);
      fs.writeFileSync(f, `entry ${i}\n`);
      // Stagger mtimes so oldest-first ordering works
      const t = new Date(Date.now() - (10 - i) * 1000);
      fs.utimesSync(f, t, t);
    }

    mod.pruneOldSessions(sessDir2, { maxAgeDays: 365, maxFiles: 5 });

    const remaining = fs.readdirSync(sessDir2).filter(n => n.endsWith('.jsonl'));
    assert.ok(remaining.length <= 5, `maxFiles=5 must leave at most 5 files, found ${remaining.length}`);

    console.log('  [PASS] pruneOldSessions respects maxFiles limit');

    // ─── 7. pruneOldSessions: handles missing/empty directory gracefully ───
    mod.pruneOldSessions(path.join(tmpDir, 'nonexistent'));
    mod.pruneOldSessions(null);
    mod.pruneOldSessions('');

    const emptyDir = path.join(tmpDir, 'empty-sessions');
    fs.mkdirSync(emptyDir);
    mod.pruneOldSessions(emptyDir);

    console.log('  [PASS] pruneOldSessions handles missing/empty directory gracefully');

    // ─── 8. Validate hook scripts import and use log-rotation ───
    const hookScripts = [
      { name: 'hook-observability.js', expectRotate: true, expectPrune: false },
      { name: 'damage-control.js', expectRotate: true, expectPrune: false },
      { name: 'session-replay.js', expectRotate: false, expectPrune: true },
      { name: 'evidence-capture.js', expectRotate: false, expectPrune: true },
      { name: 'validate-tracker-consistency.js', expectRotate: true, expectPrune: false }
    ];

    for (const { name, expectRotate, expectPrune } of hookScripts) {
      const scriptPath = path.resolve(__dirname, 'scripts', name);
      assert.ok(fs.existsSync(scriptPath), `${name} must exist`);
      const src = fs.readFileSync(scriptPath, 'utf8');

      assert.match(src, /require\(['"]\.\/log-rotation['"]\)/, `${name} must import log-rotation`);

      if (expectRotate) {
        assert.match(src, /rotateIfNeeded/, `${name} must call rotateIfNeeded`);
      }
      if (expectPrune) {
        assert.match(src, /pruneOldSessions/, `${name} must call pruneOldSessions`);
      }
    }

    console.log('  [PASS] All hook scripts import and call log-rotation');

    // ─── 9. Validate hook-observability.js still exports backward-compatible API ───
    const obsSrc = fs.readFileSync(path.resolve(__dirname, 'scripts', 'hook-observability.js'), 'utf8');
    assert.match(obsSrc, /module\.exports\s*=/, 'hook-observability.js must have module.exports');
    assert.match(obsSrc, /rotateIfNeeded/, 'hook-observability.js must still export rotateIfNeeded');
    assert.match(obsSrc, /writeHookEvent/, 'hook-observability.js must still export writeHookEvent');
    assert.match(obsSrc, /HOOK_LOG_PATH/, 'hook-observability.js must still export HOOK_LOG_PATH');
    assert.match(obsSrc, /MAX_LOG_SIZE/, 'hook-observability.js must still export MAX_LOG_SIZE');
    assert.match(obsSrc, /MAX_ROTATED_FILES/, 'hook-observability.js must still export MAX_ROTATED_FILES');

    console.log('  [PASS] hook-observability.js maintains backward-compatible API');

  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log('Log rotation validation passed.');
}

try {
  run();
} catch (error) {
  console.error('Log rotation validation failed:', error);
  process.exit(1);
}
