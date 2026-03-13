'use strict';


const assert = require('assert');
const fs = require('fs');
const path = require('path');

test('CI workflow trigger validation', () => {
  const workflowPath = path.resolve(__dirname, '.github', 'workflows', 'ci.yml');
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /push:\s*\r?\n\s*branches:\s*\[\s*main\s*\]/);
  assert.match(workflow, /pull_request:\s*\r?\n\s*branches:\s*\[\s*main\s*\]/);
  assert.match(workflow, /\btest:\s*\r?\n\s*name:\s*Test Suite/);
  assert.match(workflow, /name:\s*Run tests\s*\r?\n\s*run:\s*npm test\b/);
  assert.match(
    workflow,
    /-\s*name:\s*Validate PR metadata\s*\r?\n\s*if:\s*github\.event_name\s*==\s*['"]pull_request['"]\s*\r?\n\s*run:\s*node scripts\/validate-pr-metadata\.js/
  );
  assert.match(workflow, /\bwindows-runtime:\s*\r?\n[^\n]*\r?\n\s*runs-on:\s*windows-latest\b/);
  assert.match(
    workflow,
    /\s*-\s*run:\s*node test-windows-exec-validation\.js\b/
  );
  assert.match(
    workflow,
    /\s*-\s*run:\s*npx tsx test-windows-command-runtime-validation\.ts\b/
  );
});
