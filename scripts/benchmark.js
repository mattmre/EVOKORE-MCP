'use strict';

/**
 * Test suite benchmark runner.
 *
 * Runs vitest with JSON reporter, parses the output, and prints a
 * formatted summary including total duration, per-file timing, and
 * the top 10 slowest test files.
 *
 * Usage:
 *   node scripts/benchmark.js
 *   npm run bench
 */

const { execSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function run() {
  console.log('Running vitest with JSON reporter...\n');

  let rawOutput;
  try {
    rawOutput = execSync('npx vitest run --reporter=json', {
      cwd: ROOT,
      encoding: 'utf8',
      // vitest may return non-zero on test failures; we still want the JSON
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 600_000, // 10 minute cap
    });
  } catch (err) {
    // execSync throws on non-zero exit; stdout still has JSON
    rawOutput = err.stdout || '';
    if (!rawOutput) {
      console.error('Failed to capture vitest output.');
      if (err.stderr) console.error(err.stderr);
      process.exit(1);
    }
  }

  // vitest may emit non-JSON preamble lines (e.g. build output).
  // Find the first line that starts with '{' to locate the JSON blob.
  const lines = rawOutput.split('\n');
  let jsonStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimStart().startsWith('{')) {
      jsonStart = i;
      break;
    }
  }

  if (jsonStart === -1) {
    console.error('Could not find JSON output from vitest.');
    console.error('Raw output (first 2000 chars):', rawOutput.slice(0, 2000));
    process.exit(1);
  }

  const jsonString = lines.slice(jsonStart).join('\n');

  let report;
  try {
    report = JSON.parse(jsonString);
  } catch (parseErr) {
    console.error('Failed to parse JSON output from vitest.');
    console.error('Parse error:', parseErr.message);
    console.error('JSON string (first 1000 chars):', jsonString.slice(0, 1000));
    process.exit(1);
  }

  // Extract file-level timing
  const testFiles = (report.testResults || []).map((file) => {
    const relPath = path.relative(ROOT, file.name || file.assertionResults?.[0]?.ancestorTitles?.[0] || 'unknown');
    const durationMs = typeof file.duration === 'number'
      ? file.duration
      : (file.endTime || 0) - (file.startTime || 0);
    const testCount = (file.assertionResults || []).length;
    const passed = (file.assertionResults || []).filter((t) => t.status === 'passed').length;
    const failed = (file.assertionResults || []).filter((t) => t.status === 'failed').length;
    return { name: relPath, durationMs, testCount, passed, failed };
  });

  // Sort by duration descending
  testFiles.sort((a, b) => b.durationMs - a.durationMs);

  // Calculate totals
  const totalDurationMs = testFiles.reduce((sum, f) => sum + f.durationMs, 0);
  const totalTests = testFiles.reduce((sum, f) => sum + f.testCount, 0);
  const totalPassed = testFiles.reduce((sum, f) => sum + f.passed, 0);
  const totalFailed = testFiles.reduce((sum, f) => sum + f.failed, 0);
  const totalFiles = testFiles.length;

  // Wall-clock time from the report if available
  const wallClockMs = report.startTime && report.endTime
    ? report.endTime - report.startTime
    : totalDurationMs;

  // --- Output ---
  console.log('='.repeat(80));
  console.log('  VITEST BENCHMARK RESULTS');
  console.log('='.repeat(80));
  console.log();
  console.log(`  Total wall-clock time : ${formatMs(wallClockMs)}`);
  console.log(`  Total file time (sum) : ${formatMs(totalDurationMs)}`);
  console.log(`  Test files            : ${totalFiles}`);
  console.log(`  Total tests           : ${totalTests}`);
  console.log(`  Passed                : ${totalPassed}`);
  console.log(`  Failed                : ${totalFailed}`);
  console.log();

  // Top 10 slowest files
  const top10 = testFiles.slice(0, 10);
  console.log('-'.repeat(80));
  console.log('  TOP 10 SLOWEST TEST FILES');
  console.log('-'.repeat(80));
  console.log();

  const nameWidth = Math.min(
    55,
    Math.max(20, ...top10.map((f) => f.name.length))
  );

  console.log(
    `  ${'File'.padEnd(nameWidth)}  ${'Duration'.padStart(10)}  ${'Tests'.padStart(6)}  Status`
  );
  console.log(`  ${''.padEnd(nameWidth, '-')}  ${''.padEnd(10, '-')}  ${''.padEnd(6, '-')}  ------`);

  for (const file of top10) {
    const displayName = file.name.length > nameWidth
      ? '...' + file.name.slice(file.name.length - nameWidth + 3)
      : file.name;
    const status = file.failed > 0 ? 'FAIL' : 'PASS';
    console.log(
      `  ${displayName.padEnd(nameWidth)}  ${formatMs(file.durationMs).padStart(10)}  ${String(file.testCount).padStart(6)}  ${status}`
    );
  }

  console.log();
  console.log('='.repeat(80));

  // Exit with failure if any tests failed
  if (totalFailed > 0) {
    process.exit(1);
  }
}

function formatMs(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = ((ms % 60_000) / 1000).toFixed(1);
  return `${mins}m ${secs}s`;
}

run();
