'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function run() {
  const usagePath = path.resolve(__dirname, 'docs', 'USAGE.md');
  const troubleshootingPath = path.resolve(__dirname, 'docs', 'TROUBLESHOOTING.md');

  const usage = fs.readFileSync(usagePath, 'utf8');
  const troubleshooting = fs.readFileSync(troubleshootingPath, 'utf8');

  // Operator-facing usage guidance
  assert.match(usage, /_evokore_approval_token/);
  assert.match(usage, /one-time use|one-time/i);
  assert.match(usage, /exact same tool arguments|exact same arguments/i);
  assert.match(usage, /short-lived|about 5 minutes|expire/i);
  assert.match(usage, /ask for explicit approval/i);
  assert.match(usage, /rerun the same tool call|retry/i);

  // Troubleshooting retry workflow
  assert.match(troubleshooting, /HITL Token Retry Keeps Failing/i);
  assert.match(troubleshooting, /Use the token only once/i);
  assert.match(troubleshooting, /exact same arguments/i);
  assert.match(troubleshooting, /short-lived|around 5 minutes|expire/i);
  assert.match(troubleshooting, /get a fresh token/i);

  console.log('HITL token docs validation passed.');
}

try {
  run();
} catch (error) {
  console.error('HITL token docs validation failed:', error);
  process.exit(1);
}
