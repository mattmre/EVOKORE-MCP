'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT_PATH = path.resolve(__dirname, 'scripts', 'validate-pr-metadata.js');

function writeEventFile(tempDir, name, payload) {
  const filePath = path.join(tempDir, name);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return filePath;
}

function runValidation(eventPath) {
  return spawnSync('node', [SCRIPT_PATH, '--event', eventPath], {
    cwd: __dirname,
    encoding: 'utf8'
  });
}

function run() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-metadata-validation-'));

  try {
    const validBody = [
      '- **Priority ID(s)**: 1 / 2',
      '- **Dependency Chain (base -> dependent)**: #123 -> #124',
      '- **Chain-head PR? (yes/no)**: yes',
      '- **Required Checks Evidence**: node test-pr-metadata-validation.js (pass)',
      '- **Merge-boundary Revalidation Notes**: Rebased after parent merge and re-ran checks.',
      '- **Release-impact Notes**: none'
    ].join('\n');

    const validEventPath = writeEventFile(tempDir, 'valid-event.json', {
      pull_request: {
        body: validBody
      }
    });
    const validResult = runValidation(validEventPath);
    assert.strictEqual(validResult.status, 0, `Expected success for valid metadata.\n${validResult.stderr}`);
    assert.match(validResult.stdout, /passed/i);

    const placeholderEventPath = writeEventFile(tempDir, 'placeholder-event.json', {
      pull_request: {
        body: [
          '- **Priority ID(s)**: 1',
          '- **Dependency Chain (base -> dependent)**: #123 -> #124',
          '- **Chain-head PR? (yes/no)**: no',
          '- **Required Checks Evidence**: <!-- list exact commands + pass output/links -->',
          '- **Merge-boundary Revalidation Notes**: complete',
          '- **Release-impact Notes**: patch'
        ].join('\n')
      }
    });
    const placeholderResult = runValidation(placeholderEventPath);
    assert.notStrictEqual(placeholderResult.status, 0, 'Expected placeholder field to fail validation.');
    assert.match(placeholderResult.stderr, /Required Checks Evidence/i);

    const invalidChainEventPath = writeEventFile(tempDir, 'invalid-chain-event.json', {
      pull_request: {
        body: [
          '- **Priority ID(s)**: 1',
          '- **Dependency Chain (base -> dependent)**: #123 and #124',
          '- **Chain-head PR? (yes/no)**: no',
          '- **Required Checks Evidence**: command output attached',
          '- **Merge-boundary Revalidation Notes**: complete',
          '- **Release-impact Notes**: patch'
        ].join('\n')
      }
    });
    const invalidChainResult = runValidation(invalidChainEventPath);
    assert.notStrictEqual(invalidChainResult.status, 0, 'Expected invalid dependency chain to fail validation.');
    assert.match(invalidChainResult.stderr, /dependency chain format/i);

    const invalidChainHeadEventPath = writeEventFile(tempDir, 'invalid-chain-head-event.json', {
      pull_request: {
        body: [
          '- **Priority ID(s)**: 1',
          '- **Dependency Chain (base -> dependent)**: standalone',
          '- **Chain-head PR? (yes/no)**: maybe',
          '- **Required Checks Evidence**: command output attached',
          '- **Merge-boundary Revalidation Notes**: complete',
          '- **Release-impact Notes**: patch'
        ].join('\n')
      }
    });
    const invalidChainHeadResult = runValidation(invalidChainHeadEventPath);
    assert.notStrictEqual(invalidChainHeadResult.status, 0, 'Expected invalid chain-head value to fail validation.');
    assert.match(invalidChainHeadResult.stderr, /chain-head value/i);

    console.log('PR metadata validator tests passed.');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

try {
  run();
} catch (error) {
  console.error('PR metadata validator tests failed:', error);
  process.exit(1);
}
