'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function run() {
  const docsPath = path.resolve(__dirname, 'docs', 'RELEASE_FLOW.md');
  const docs = fs.readFileSync(docsPath, 'utf8');

  assert.match(docs, /^## Current State Verification$/m);
  assert.match(docs, /Do not rely on static values/i);

  assert.match(docs, /git ls-remote --tags origin "v\*"/);
  assert.match(docs, /gh release list --limit 1/);
  assert.match(docs, /gh run list --workflow release\.yml --limit 5/);

  assert.doesNotMatch(docs, /^## Current Release State$/m);
  assert.doesNotMatch(docs, /Latest merged release preparation:/i);
  assert.doesNotMatch(docs, /Latest release workflow execution:/i);
  assert.doesNotMatch(docs, /via PR #\d+/i);

  console.log('Release doc freshness validation passed.');
}

try {
  run();
} catch (error) {
  console.error('Release doc freshness validation failed:', error);
  process.exit(1);
}
