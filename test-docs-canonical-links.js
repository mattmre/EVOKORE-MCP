'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function run() {
  const docsReadmePath = path.resolve(__dirname, 'docs', 'README.md');
  const submodulePath = path.resolve(__dirname, 'docs', 'SUBMODULE_WORKFLOW.md');
  const readmePath = path.resolve(__dirname, 'README.md');
  const contributingPath = path.resolve(__dirname, 'CONTRIBUTING.md');

  const docsReadme = fs.readFileSync(docsReadmePath, 'utf8');
  const submoduleDoc = fs.readFileSync(submodulePath, 'utf8');
  const readme = fs.readFileSync(readmePath, 'utf8');
  const contributing = fs.readFileSync(contributingPath, 'utf8');

  assert.match(docsReadme, /Usage Guide/);
  assert.match(docsReadme, /Troubleshooting Guide/);
  assert.match(docsReadme, /Submodule Workflow/);
  assert.match(docsReadme, /\/docs\/architecture\.md/);
  assert.match(docsReadme, /\/docs\/workflows\.md/);

  assert.match(submoduleDoc, /git submodule/);
  assert.match(submoduleDoc, /PR Expectations/);

  assert.match(readme, /docs\/README\.md/);
  assert.match(readme, /docs\/SUBMODULE_WORKFLOW\.md/);
  assert.match(contributing, /docs\/README\.md/);
  assert.match(contributing, /docs\/SUBMODULE_WORKFLOW\.md/);

  console.log('Docs canonical link validation passed.');
}

try {
  run();
} catch (error) {
  console.error('Docs canonical link validation failed:', error);
  process.exit(1);
}
