'use strict';


const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runNodeScript, makeSessionId } = require('./tests/helpers/hook-test-helper');

const sessionsDir = path.join(os.homedir(), '.evokore', 'sessions');
const logsDir = path.join(os.homedir(), '.evokore', 'logs');
const hooksLogPath = path.join(logsDir, 'hooks.jsonl');
const CANONICAL_HOOKS = {
  damageControl: 'scripts/hooks/damage-control.js',
  purposeGate: 'scripts/hooks/purpose-gate.js',
  sessionReplay: 'scripts/hooks/session-replay.js',
  tilldone: 'scripts/hooks/tilldone.js'
};
const LEGACY_ENTRYPOINTS = {
  damageControl: 'scripts/damage-control.js',
  purposeGate: 'scripts/purpose-gate.js',
  sessionReplay: 'scripts/session-replay.js',
  tilldone: 'scripts/tilldone.js'
};

function cleanupFile(filePath) {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
  }
}

test('hook test suite', () => {
  console.log('Running hook test suite...');
  cleanupFile(hooksLogPath);

  const damageResult = runNodeScript(CANONICAL_HOOKS.damageControl, {
    tool_name: 'Bash',
    tool_input: { command: 'rm -rf /tmp/test-folder' }
  });
  assert.strictEqual(damageResult.status, 2, 'damage-control should block dangerous command');
  assert.match(damageResult.cleanStderr, /DAMAGE CONTROL BLOCKED/i);

  const damageAskResult = runNodeScript(CANONICAL_HOOKS.damageControl, {
    tool_name: 'Bash',
    tool_input: { command: 'git push origin main --force' }
  });
  assert.strictEqual(damageAskResult.status, 0, 'damage-control ask should return status 0');
  assert.match(damageAskResult.cleanStdout, /"decision":"ask"/i);

  const damageAllowResult = runNodeScript(CANONICAL_HOOKS.damageControl, {
    tool_name: 'Bash',
    tool_input: { command: 'echo safe' }
  });
  assert.strictEqual(damageAllowResult.status, 0, 'damage-control should allow safe command');

  const purposeSession = makeSessionId('hook-purpose');
  const purposeStateFile = path.join(sessionsDir, `${purposeSession}.json`);
  cleanupFile(purposeStateFile);

  const purposeFirst = runNodeScript(CANONICAL_HOOKS.purposeGate, {
    session_id: purposeSession,
    user_message: 'hello'
  });
  assert.strictEqual(purposeFirst.status, 0);
  assert.match(purposeFirst.cleanStdout, /new session/i);

  const purposeSecond = runNodeScript(CANONICAL_HOOKS.purposeGate, {
    session_id: purposeSession,
    user_message: 'Implement hook tests'
  });
  assert.strictEqual(purposeSecond.status, 0);
  assert.match(purposeSecond.cleanStdout, /Session purpose recorded/i);

  const purposeThird = runNodeScript(CANONICAL_HOOKS.purposeGate, {
    session_id: purposeSession,
    user_message: 'Continue this session'
  });
  assert.strictEqual(purposeThird.status, 0);
  assert.match(purposeThird.cleanStdout, /Session purpose:/i);
  cleanupFile(purposeStateFile);

  const statusSession = makeSessionId('hook-purpose-status');
  const statusStateFile = path.join(sessionsDir, `${statusSession}.json`);
  const statusTaskFile = path.join(sessionsDir, `${statusSession}-tasks.json`);
  cleanupFile(statusStateFile);
  cleanupFile(statusTaskFile);
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.writeFileSync(statusTaskFile, JSON.stringify([{ text: 'Open task', done: false }], null, 2));

  const purposeStatusFirst = runNodeScript(
    CANONICAL_HOOKS.purposeGate,
    {
      session_id: statusSession,
      user_message: 'hello with status'
    },
    {
      env: { EVOKORE_STATUS_HOOK: 'true' }
    }
  );
  assert.strictEqual(purposeStatusFirst.status, 0);
  assert.match(purposeStatusFirst.cleanStdout, /ctx \d+%/i);
  assert.match(purposeStatusFirst.cleanStdout, /tasks 1\/1 open/i);
  assert.match(purposeStatusFirst.cleanStdout, /continuity awaiting-purpose/i);
  cleanupFile(statusStateFile);
  cleanupFile(statusTaskFile);

  const replaySession = makeSessionId('hook-replay');
  const replayLogPath = path.join(sessionsDir, `${replaySession}-replay.jsonl`);
  cleanupFile(replayLogPath);

  const replayResult = runNodeScript(CANONICAL_HOOKS.sessionReplay, {
    session_id: replaySession,
    tool_name: 'Bash',
    tool_input: { command: 'echo hello' }
  });
  assert.strictEqual(replayResult.status, 0);
  assert.ok(fs.existsSync(replayLogPath), 'session-replay should write replay log');
  const replayContent = fs.readFileSync(replayLogPath, 'utf8');
  assert.match(replayContent, /"tool":"Bash"/);
  cleanupFile(replayLogPath);

  const tilldoneSession = makeSessionId('hook-tilldone');
  const tilldoneTaskPath = path.join(sessionsDir, `${tilldoneSession}-tasks.json`);
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.writeFileSync(tilldoneTaskPath, JSON.stringify([{ text: 'Open task', done: false }], null, 2));

  const tilldoneResult = runNodeScript(CANONICAL_HOOKS.tilldone, {
    session_id: tilldoneSession
  });
  assert.strictEqual(tilldoneResult.status, 2, 'tilldone should block stop with incomplete tasks');
  assert.match(tilldoneResult.cleanStderr, /incomplete task/i);
  cleanupFile(tilldoneTaskPath);

  const tilldoneAutoResult = runNodeScript(
    CANONICAL_HOOKS.tilldone,
    null,
    {
      args: ['--list', '--session', 'auto'],
      env: { CLAUDE_SESSION_ID: makeSessionId('hook-auto') }
    }
  );
  assert.strictEqual(tilldoneAutoResult.status, 0, '--session auto should resolve from env');

  const legacyDamageAllow = runNodeScript(LEGACY_ENTRYPOINTS.damageControl, {
    tool_name: 'Bash',
    tool_input: { command: 'echo legacy-safe' }
  });
  assert.strictEqual(legacyDamageAllow.status, 0, 'legacy damage-control entrypoint should remain compatible');

  const legacyPurposeSession = makeSessionId('hook-purpose-legacy');
  const legacyPurposeStateFile = path.join(sessionsDir, `${legacyPurposeSession}.json`);
  cleanupFile(legacyPurposeStateFile);
  const legacyPurposeResult = runNodeScript(LEGACY_ENTRYPOINTS.purposeGate, {
    session_id: legacyPurposeSession,
    user_message: 'legacy entrypoint check'
  });
  assert.strictEqual(legacyPurposeResult.status, 0, 'legacy purpose-gate entrypoint should remain compatible');
  cleanupFile(legacyPurposeStateFile);

  const legacyReplaySession = makeSessionId('hook-replay-legacy');
  const legacyReplayLogPath = path.join(sessionsDir, `${legacyReplaySession}-replay.jsonl`);
  cleanupFile(legacyReplayLogPath);
  const legacyReplayResult = runNodeScript(LEGACY_ENTRYPOINTS.sessionReplay, {
    session_id: legacyReplaySession,
    tool_name: 'Read',
    tool_input: { file_path: 'README.md' }
  });
  assert.strictEqual(legacyReplayResult.status, 0, 'legacy session-replay entrypoint should remain compatible');
  cleanupFile(legacyReplayLogPath);

  const legacyTilldoneResult = runNodeScript(
    LEGACY_ENTRYPOINTS.tilldone,
    null,
    { args: ['--list', '--session', makeSessionId('hook-tilldone-legacy')] }
  );
  assert.strictEqual(legacyTilldoneResult.status, 0, 'legacy tilldone entrypoint should preserve CLI mode');

  assert.ok(fs.existsSync(hooksLogPath), 'hook observability should create hooks.jsonl');
  const hookEvents = fs.readFileSync(hooksLogPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  function hasEvent(hook, event) {
    return hookEvents.some((entry) => entry.hook === hook && entry.event === event);
  }

  assert.ok(hasEvent('damage-control', 'block'), 'should log damage-control block');
  assert.ok(hasEvent('damage-control', 'ask'), 'should log damage-control ask');
  assert.ok(hasEvent('damage-control', 'allow'), 'should log damage-control allow');
  assert.ok(hasEvent('purpose-gate', 'state_initialized'), 'should log purpose state initialization');
  assert.ok(hasEvent('purpose-gate', 'purpose_recorded'), 'should log purpose recording');
  assert.ok(hasEvent('purpose-gate', 'purpose_reminder'), 'should log purpose reminder');
  assert.ok(hasEvent('session-replay', 'replay_entry_written'), 'should log replay entry write');
  assert.ok(hasEvent('tilldone', 'hook_mode_block'), 'should log tilldone hook block');
  assert.ok(hasEvent('tilldone', 'cli_action'), 'should log tilldone cli action');
});
