'use strict';


const assert = require('assert');
const fs = require('fs');
const path = require('path');

test('NPM release flow validation', () => {
  const workflowPath = path.resolve(__dirname, '.github', 'workflows', 'release.yml');
  const docsPath = path.resolve(__dirname, 'docs', 'RELEASE_FLOW.md');
  const pkgPath = path.resolve(__dirname, 'package.json');

  const workflow = fs.readFileSync(workflowPath, 'utf8');
  const docs = fs.readFileSync(docsPath, 'utf8');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  // package.json publish readiness
  assert.strictEqual(pkg.main, 'dist/index.js', 'main must point to dist/index.js');
  assert.ok(Array.isArray(pkg.files) && pkg.files.length > 0, 'files field must be a non-empty array');
  assert.ok(pkg.files.includes('dist/'), 'files must include dist/');
  assert.ok(pkg.publishConfig && pkg.publishConfig.access === 'public', 'publishConfig.access must be public');
  assert.ok(pkg.repository && pkg.repository.url, 'repository.url must be set');
  assert.ok(pkg.engines && pkg.engines.node, 'engines.node must be set');

  // workflow assertions
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
  assert.match(workflow, /contents:\s*write/, 'workflow must have contents: write permission');
  assert.match(workflow, /Create GitHub Release/, 'workflow must have GitHub Release creation step');
  assert.match(workflow, /softprops\/action-gh-release/, 'workflow must use softprops/action-gh-release');

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
  assert.match(docs, /GitHub Release/i, 'docs must mention GitHub Release creation');
  assert.match(docs, /softprops\/action-gh-release/, 'docs must reference the GH Release action');
  assert.match(docs, /workflow_dispatch.*does not.*create.*release/is, 'docs must note workflow_dispatch does not create releases');
});
