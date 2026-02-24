'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runNodeScript, makeSessionId } = require('./tests/helpers/hook-test-helper');

function run() {
  console.log('Starting hook E2E validation...');

  const settingsPath = path.resolve(__dirname, '.claude', 'settings.json');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const hooks = settings.hooks || {};

  const preToolCommand = hooks.PreToolUse && hooks.PreToolUse[0] && hooks.PreToolUse[0].hooks[0] && hooks.PreToolUse[0].hooks[0].command;
  const promptCommand = hooks.UserPromptSubmit && hooks.UserPromptSubmit[0] && hooks.UserPromptSubmit[0].hooks[0] && hooks.UserPromptSubmit[0].hooks[0].command;
  const postToolCommand = hooks.PostToolUse && hooks.PostToolUse[0] && hooks.PostToolUse[0].hooks[0] && hooks.PostToolUse[0].hooks[0].command;
  const stopCommand = hooks.Stop && hooks.Stop[0] && hooks.Stop[0].hooks[0] && hooks.Stop[0].hooks[0].command;

  assert.strictEqual(preToolCommand, 'node scripts/damage-control.js');
  assert.strictEqual(promptCommand, 'node scripts/purpose-gate.js');
  assert.strictEqual(postToolCommand, 'node scripts/session-replay.js');
  assert.strictEqual(stopCommand, 'node scripts/tilldone.js');

  const safeDamageResult = runNodeScript('scripts/damage-control.js', {
    tool_name: 'Bash',
    tool_input: { command: 'echo safe' }
  });
  assert.strictEqual(safeDamageResult.status, 0);

  const sessionsDir = path.join(os.homedir(), '.evokore', 'sessions');

  const purposeSession = makeSessionId('hook-e2e-purpose');
  const purposeStateFile = path.join(sessionsDir, `${purposeSession}.json`);
  const purposeResult = runNodeScript('scripts/purpose-gate.js', {
    session_id: purposeSession,
    user_message: 'Test hook flow'
  });
  assert.strictEqual(purposeResult.status, 0);
  assert.match(purposeResult.cleanStdout, /EVOKORE Purpose Gate/i);
  if (fs.existsSync(purposeStateFile)) fs.rmSync(purposeStateFile, { force: true });

  const replaySession = makeSessionId('hook-e2e-replay');
  const replayPath = path.join(sessionsDir, `${replaySession}-replay.jsonl`);
  const replayResult = runNodeScript('scripts/session-replay.js', {
    session_id: replaySession,
    tool_name: 'Read',
    tool_input: { file_path: 'README.md' }
  });
  assert.strictEqual(replayResult.status, 0);
  if (fs.existsSync(replayPath)) fs.rmSync(replayPath, { force: true });

  const tilldoneSession = makeSessionId('hook-e2e-tilldone');
  const tilldoneTaskPath = path.join(sessionsDir, `${tilldoneSession}-tasks.json`);
  if (fs.existsSync(tilldoneTaskPath)) fs.rmSync(tilldoneTaskPath, { force: true });
  const tilldoneResult = runNodeScript('scripts/tilldone.js', { session_id: tilldoneSession });
  assert.strictEqual(tilldoneResult.status, 0);

  console.log('Hook E2E validation passed.');
}

try {
  run();
} catch (error) {
  console.error('Hook E2E validation failed:', error);
  process.exit(1);
}
