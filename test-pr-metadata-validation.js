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
      '## Description',
      '',
      'This PR adds a new feature.',
      '',
      '## Type of Change',
      '',
      '- [x] New feature',
      '',
      '## Testing',
      '',
      '- [x] npm test passes',
      '',
      '## Evidence',
      '',
      'npm run build output attached'
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
          '## Description',
          '',
          'This PR adds a feature.',
          '',
          '## Type of Change',
          '',
          '- [x] Bug fix',
          '',
          '## Testing',
          '',
          'TBD',
          '',
          '## Evidence',
          '',
          'output attached'
        ].join('\n')
      }
    });
    const placeholderResult = runValidation(placeholderEventPath);
    assert.notStrictEqual(placeholderResult.status, 0, 'Expected placeholder section to fail validation.');
    assert.match(placeholderResult.stderr, /Testing/i);

    const missingSectionEventPath = writeEventFile(tempDir, 'missing-section-event.json', {
      pull_request: {
        body: [
          '## Description',
          '',
          'This PR fixes a bug.',
          '',
          '## Type of Change',
          '',
          '- [x] Bug fix'
        ].join('\n')
      }
    });
    const missingSectionResult = runValidation(missingSectionEventPath);
    assert.notStrictEqual(missingSectionResult.status, 0, 'Expected missing sections to fail validation.');
    assert.match(missingSectionResult.stderr, /Missing section/i);

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
