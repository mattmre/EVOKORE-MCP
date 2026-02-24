'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function run() {
  const workflowPath = path.resolve(__dirname, '.github', 'workflows', 'ci.yml');
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /push:\s*\r?\n\s*branches:\s*\[\s*main\s*\]/);
  assert.match(workflow, /pull_request:\s*\r?\n\s*branches:\s*\[\s*main\s*\]/);
  assert.match(
    workflow,
    /jobs:\s*\r?\n(?:[^\n]*\r?\n)*?\s{2,}test:\s*\r?\n(?:[^\n]*\r?\n)*?\s*-\s*name:\s*Run tests\s*\r?\n\s*run:\s*npm test\b/
  );
  assert.doesNotMatch(workflow, /(?:^|\r?\n)\s*if:\s*github\.event_name\s*==\s*['"]pull_request['"]/);

  console.log('CI workflow trigger validation passed.');
}

try {
  run();
} catch (error) {
  console.error('CI workflow trigger validation failed:', error);
  process.exit(1);
}
