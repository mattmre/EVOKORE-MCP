'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function run() {
  const workflowPath = path.resolve(__dirname, '.github', 'workflows', 'ci.yml');
  const scriptPath = path.resolve(__dirname, 'scripts', 'validate-submodule-cleanliness.js');

  const workflow = fs.readFileSync(workflowPath, 'utf8');
  const script = fs.readFileSync(scriptPath, 'utf8');

  const checkoutWithSubmodules = workflow.match(
    /-\s*uses:\s*actions\/checkout@v[34][\s\S]*?fetch-depth:\s*0[\s\S]*?submodules:\s*recursive/g
  ) || [];
  assert.ok(checkoutWithSubmodules.length >= 2, 'Expected checkout to use recursive submodules in both CI jobs.');

  const guardSteps = workflow.match(/run:\s*node scripts\/validate-submodule-cleanliness\.js/g) || [];
  assert.ok(guardSteps.length >= 2, 'Expected submodule cleanliness guard step in both CI jobs.');

  assert.match(script, /git submodule status --recursive/);
  assert.match(script, /marker === '-'/);
  assert.match(script, /marker === '\+'/);
  assert.match(script, /marker === 'U'/);
  assert.match(script, /status --porcelain/);

  console.log('Submodule commit-order safety guard validation passed.');
}

try {
  run();
} catch (error) {
  console.error('Submodule commit-order safety guard validation failed:', error);
  process.exit(1);
}
