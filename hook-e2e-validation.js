'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runNodeScript, makeSessionId } = require('./tests/helpers/hook-test-helper');

const CANONICAL_HOOKS = {
  damageControl: 'scripts/hooks/damage-control.js',
  purposeGate: 'scripts/hooks/purpose-gate.js',
  sessionReplay: 'scripts/hooks/session-replay.js',
  evidenceCapture: 'scripts/hooks/evidence-capture.js',
  tilldone: 'scripts/hooks/tilldone.js'
};

function run() {
  console.log('Starting hook E2E validation...');
  const logsDir = path.join(os.homedir(), '.evokore', 'logs');
  const hooksLogPath = path.join(logsDir, 'hooks.jsonl');
  if (fs.existsSync(hooksLogPath)) fs.rmSync(hooksLogPath, { force: true });

  const settingsPath = path.resolve(__dirname, '.claude', 'settings.json');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const hooks = settings.hooks || {};

  const preToolCommand = hooks.PreToolUse && hooks.PreToolUse[0] && hooks.PreToolUse[0].hooks[0] && hooks.PreToolUse[0].hooks[0].command;
  const promptCommand = hooks.UserPromptSubmit && hooks.UserPromptSubmit[0] && hooks.UserPromptSubmit[0].hooks[0] && hooks.UserPromptSubmit[0].hooks[0].command;
  const postToolCommand = hooks.PostToolUse && hooks.PostToolUse[0] && hooks.PostToolUse[0].hooks[0] && hooks.PostToolUse[0].hooks[0].command;
  const evidenceCommand = hooks.PostToolUse && hooks.PostToolUse[0] && hooks.PostToolUse[0].hooks[1] && hooks.PostToolUse[0].hooks[1].command;
  const stopCommand = hooks.Stop && hooks.Stop[0] && hooks.Stop[0].hooks[0] && hooks.Stop[0].hooks[0].command;

  assert.strictEqual(preToolCommand, 'node scripts/hooks/damage-control.js');
  assert.strictEqual(promptCommand, 'node scripts/hooks/purpose-gate.js');
  assert.strictEqual(postToolCommand, 'node scripts/hooks/session-replay.js');
  assert.strictEqual(evidenceCommand, 'node scripts/hooks/evidence-capture.js');
  assert.strictEqual(stopCommand, 'node scripts/hooks/tilldone.js');

  const safeDamageResult = runNodeScript(CANONICAL_HOOKS.damageControl, {
    tool_name: 'Bash',
    tool_input: { command: 'echo safe' }
  });
  assert.strictEqual(safeDamageResult.status, 0);

  const sessionsDir = path.join(os.homedir(), '.evokore', 'sessions');

  const purposeSession = makeSessionId('hook-e2e-purpose');
  const purposeStateFile = path.join(sessionsDir, `${purposeSession}.json`);
  const purposeInitResult = runNodeScript(CANONICAL_HOOKS.purposeGate, {
    session_id: purposeSession,
    user_message: 'Test hook flow'
  });
  assert.strictEqual(purposeInitResult.status, 0);
  assert.match(purposeInitResult.cleanStdout, /EVOKORE Purpose Gate/i);
  const purposeRecordedResult = runNodeScript(CANONICAL_HOOKS.purposeGate, {
    session_id: purposeSession,
    user_message: 'Validate E2E hook flow'
  });
  assert.strictEqual(purposeRecordedResult.status, 0);
  const purposeReminderResult = runNodeScript(CANONICAL_HOOKS.purposeGate, {
    session_id: purposeSession,
    user_message: 'Proceed'
  });
  assert.strictEqual(purposeReminderResult.status, 0);
  if (fs.existsSync(purposeStateFile)) fs.rmSync(purposeStateFile, { force: true });

  const replaySession = makeSessionId('hook-e2e-replay');
  const replayPath = path.join(sessionsDir, `${replaySession}-replay.jsonl`);
  const evidencePath = path.join(sessionsDir, `${replaySession}-evidence.jsonl`);
  const replayResult = runNodeScript(CANONICAL_HOOKS.sessionReplay, {
    session_id: replaySession,
    tool_name: 'Read',
    tool_input: { file_path: 'README.md' }
  });
  assert.strictEqual(replayResult.status, 0);
  const evidenceResult = runNodeScript(CANONICAL_HOOKS.evidenceCapture, {
    session_id: replaySession,
    tool_name: 'Bash',
    tool_input: { command: 'npm test' }
  });
  assert.strictEqual(evidenceResult.status, 0);
  assert.ok(fs.existsSync(evidencePath), 'evidence-capture should write evidence log');
  if (fs.existsSync(replayPath)) fs.rmSync(replayPath, { force: true });
  if (fs.existsSync(evidencePath)) fs.rmSync(evidencePath, { force: true });

  const tilldoneSession = makeSessionId('hook-e2e-tilldone');
  const tilldoneTaskPath = path.join(sessionsDir, `${tilldoneSession}-tasks.json`);
  if (fs.existsSync(tilldoneTaskPath)) fs.rmSync(tilldoneTaskPath, { force: true });
  const tilldoneResult = runNodeScript(CANONICAL_HOOKS.tilldone, { session_id: tilldoneSession });
  assert.strictEqual(tilldoneResult.status, 0);

  const tilldoneCliResult = runNodeScript(
    CANONICAL_HOOKS.tilldone,
    null,
    { args: ['--list', '--session', tilldoneSession] }
  );
  assert.strictEqual(tilldoneCliResult.status, 0);

  assert.ok(fs.existsSync(hooksLogPath), 'hook observability should create hooks.jsonl');
  const hookEvents = fs.readFileSync(hooksLogPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  function hasEvent(hook, event) {
    return hookEvents.some((entry) => entry.hook === hook && entry.event === event);
  }

  assert.ok(hasEvent('damage-control', 'allow'), 'E2E should log damage-control allow event');
  assert.ok(hasEvent('purpose-gate', 'state_initialized'), 'E2E should log purpose initialization');
  assert.ok(hasEvent('purpose-gate', 'purpose_recorded'), 'E2E should log purpose recorded event');
  assert.ok(hasEvent('purpose-gate', 'purpose_reminder'), 'E2E should log purpose reminder event');
  assert.ok(hasEvent('session-replay', 'replay_entry_written'), 'E2E should log replay entry write');
  assert.ok(hasEvent('evidence-capture', 'evidence_captured'), 'E2E should log evidence capture');
  assert.ok(hasEvent('tilldone', 'hook_mode_allow'), 'E2E should log tilldone hook-mode allow');
  assert.ok(hasEvent('tilldone', 'cli_action'), 'E2E should log tilldone CLI action');

  console.log('Hook E2E validation passed.');
}

try {
  run();
} catch (error) {
  console.error('Hook E2E validation failed:', error);
  process.exit(1);
}
