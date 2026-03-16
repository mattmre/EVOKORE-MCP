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
  // Sharded test run: npx vitest run --shard=N/3
  assert.match(workflow, /name:\s*Run tests \(shard/);
  assert.match(workflow, /run:\s*npx vitest run --shard=\$\{\{ matrix\.shard \}\}\/3/);
  // Matrix strategy with 3 shards
  assert.match(workflow, /matrix:\s*\r?\n\s*shard:\s*\[1,\s*2,\s*3\]/);
  assert.match(
    workflow,
    /-\s*name:\s*Validate PR metadata\s*\r?\n\s*if:\s*github\.event_name\s*==\s*['"]pull_request['"]/
  );
  assert.match(workflow, /run:\s*node scripts\/validate-pr-metadata\.js/);
  assert.match(workflow, /\bwindows-runtime:\s*\r?\n[^\n]*\r?\n\s*runs-on:\s*windows-latest\b/);
  assert.match(
    workflow,
    /\s*-\s*(?:name:\s*Run Windows-specific tests\s*\r?\n\s*run:\s*npx vitest run test-windows-exec-validation\.js test-windows-command-runtime-validation\.ts|run:\s*node test-windows-exec-validation\.js)\b/
  );
});
