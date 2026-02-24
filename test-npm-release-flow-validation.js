'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function run() {
  const workflowPath = path.resolve(__dirname, '.github', 'workflows', 'release.yml');
  const docsPath = path.resolve(__dirname, 'docs', 'RELEASE_FLOW.md');

  const workflow = fs.readFileSync(workflowPath, 'utf8');
  const docs = fs.readFileSync(docsPath, 'utf8');

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /chain_complete:/);
  assert.match(workflow, /type:\s*boolean/);
  assert.match(workflow, /required:\s*true/);
  assert.match(workflow, /tags:\s*\[\s*'v\*\.\*\.\*'\s*\]/);
  assert.match(workflow, /Require completed dependency chain for manual release/);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch' && github\.event\.inputs\.chain_complete != 'true'/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /npm publish/);
  assert.match(workflow, /fetch-depth:\s*0/);
  assert.match(workflow, /Verify release commit is on origin\/main/);
  assert.match(workflow, /git fetch --no-tags origin main:refs\/remotes\/origin\/main/);
  assert.match(workflow, /git merge-base --is-ancestor "\$GITHUB_SHA" origin\/main/);
  assert.match(workflow, /NPM_TOKEN/);
  assert.match(workflow, /env\.NPM_TOKEN/);

  assert.match(docs, /Git tag/i);
  assert.match(docs, /workflow_dispatch/i);
  assert.match(docs, /dependency chain/i);
  assert.match(docs, /chain_complete=true/i);
  assert.match(docs, /NPM_TOKEN/);
  assert.match(docs, /npm ci/i);
  assert.match(docs, /npm test/i);
  assert.match(docs, /npm run build/i);
  assert.match(docs, /npm publish/i);
  assert.match(docs, /ancestor of `origin\/main`/i);

  console.log('NPM release flow validation passed.');
}

try {
  run();
} catch (error) {
  console.error('NPM release flow validation failed:', error);
  process.exit(1);
}
