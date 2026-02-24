'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function run() {
  const usagePath = path.resolve(__dirname, 'docs', 'USAGE.md');
  const usage = fs.readFileSync(usagePath, 'utf8');

  assert.match(usage, /Protocol contract \(for custom integrations\):/i);
  assert.match(usage, /`text` \(`string`\): Text chunk to append to the current utterance buffer/i);
  assert.match(usage, /`persona` \(`string`, optional\): Persona key from `voices\.json`/i);
  assert.match(usage, /`flush` \(`boolean`, optional\): When `true`, finalize buffered chunks/i);
  assert.match(usage, /`ws:\/\/localhost:<VOICE_SIDECAR_PORT>` endpoint is the standalone sidecar protocol endpoint/i);
  assert.match(usage, /re-reads `voices\.json` on each new WebSocket connection \(hot-reload\)/i);

  console.log('Voice contract docs validation passed.');
}

try {
  run();
} catch (error) {
  console.error('Voice contract docs validation failed:', error);
  process.exit(1);
}
