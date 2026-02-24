'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function run() {
  const workflowPath = path.resolve(__dirname, 'docs', 'SUBMODULE_WORKFLOW.md');
  const content = fs.readFileSync(workflowPath, 'utf8');

  assert.match(content, /git submodule add/);
  assert.match(content, /git submodule update --init --recursive/);
  assert.match(content, /git submodule status/);
  assert.match(content, /commit inside the submodule first/i);
  assert.match(content, /updated submodule pointer/i);
  assert.match(content, /PR Expectations/);

  console.log('Submodule documentation workflow validation passed.');
}

try {
  run();
} catch (error) {
  console.error('Submodule documentation workflow validation failed:', error);
  process.exit(1);
}
