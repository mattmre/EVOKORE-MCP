'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runNodeScript, makeSessionId } = require('./tests/helpers/hook-test-helper');

const sessionsDir = path.join(os.homedir(), '.evokore', 'sessions');
const logsDir = path.join(os.homedir(), '.evokore', 'logs');
const cacheDir = path.join(os.homedir(), '.evokore', 'cache');
const hooksLogPath = path.join(logsDir, 'hooks.jsonl');

function cleanupFile(filePath) {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
  }
}

function run() {
  console.log('Running hook test suite...');
  cleanupFile(hooksLogPath);

  const damageResult = runNodeScript('scripts/damage-control.js', {
    tool_name: 'Bash',
    tool_input: { command: 'rm -rf /tmp/test-folder' }
  });
  assert.strictEqual(damageResult.status, 2, 'damage-control should block dangerous command');
  assert.match(damageResult.cleanStderr, /DAMAGE CONTROL BLOCKED/i);

  const damageAskResult = runNodeScript('scripts/damage-control.js', {
    tool_name: 'Bash',
    tool_input: { command: 'git push origin main --force' }
  });
  assert.strictEqual(damageAskResult.status, 0, 'damage-control ask should return status 0');
  assert.match(damageAskResult.cleanStdout, /"decision":"ask"/i);

  const damageAllowResult = runNodeScript('scripts/damage-control.js', {
    tool_name: 'Bash',
    tool_input: { command: 'echo safe' }
  });
  assert.strictEqual(damageAllowResult.status, 0, 'damage-control should allow safe command');

  const purposeSession = makeSessionId('hook-purpose');
  const purposeStateFile = path.join(sessionsDir, `${purposeSession}.json`);
  cleanupFile(purposeStateFile);

  const purposeFirst = runNodeScript('scripts/purpose-gate.js', {
    session_id: purposeSession,
    user_message: 'hello'
  });
  assert.strictEqual(purposeFirst.status, 0);
  assert.match(purposeFirst.cleanStdout, /new session/i);

  const purposeSecond = runNodeScript('scripts/purpose-gate.js', {
    session_id: purposeSession,
    user_message: 'Implement hook tests'
  });
  assert.strictEqual(purposeSecond.status, 0);
  assert.match(purposeSecond.cleanStdout, /Session purpose recorded/i);

  const purposeThird = runNodeScript('scripts/purpose-gate.js', {
    session_id: purposeSession,
    user_message: 'Continue this session'
  });
  assert.strictEqual(purposeThird.status, 0);
  assert.match(purposeThird.cleanStdout, /Session purpose:/i);
  cleanupFile(purposeStateFile);

  const statusSession = makeSessionId('hook-purpose-status');
  const statusStateFile = path.join(sessionsDir, `${statusSession}.json`);
  const locationCacheFile = path.join(cacheDir, 'location.json');
  const weatherCacheFile = path.join(cacheDir, 'weather.json');
  cleanupFile(statusStateFile);
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(locationCacheFile, JSON.stringify({ city: 'Testville', regionName: 'TS' }));
  fs.writeFileSync(weatherCacheFile, '72F');

  const purposeStatusFirst = runNodeScript(
    'scripts/purpose-gate.js',
    {
      session_id: statusSession,
      user_message: 'hello with status'
    },
    {
      env: { EVOKORE_STATUS_HOOK: 'true' }
    }
  );
  assert.strictEqual(purposeStatusFirst.status, 0);
  assert.match(purposeStatusFirst.cleanStdout, /\[EVOKORE Status\]/i);
  assert.match(purposeStatusFirst.cleanStdout, /Testville, TS/i);
  assert.match(purposeStatusFirst.cleanStdout, /72F/i);
  cleanupFile(statusStateFile);
  cleanupFile(locationCacheFile);
  cleanupFile(weatherCacheFile);

  const replaySession = makeSessionId('hook-replay');
  const replayLogPath = path.join(sessionsDir, `${replaySession}-replay.jsonl`);
  cleanupFile(replayLogPath);

  const replayResult = runNodeScript('scripts/session-replay.js', {
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

  const tilldoneResult = runNodeScript('scripts/tilldone.js', {
    session_id: tilldoneSession
  });
  assert.strictEqual(tilldoneResult.status, 2, 'tilldone should block stop with incomplete tasks');
  assert.match(tilldoneResult.cleanStderr, /incomplete task/i);
  cleanupFile(tilldoneTaskPath);

  const tilldoneAutoResult = runNodeScript(
    'scripts/tilldone.js',
    null,
    {
      args: ['--list', '--session', 'auto'],
      env: { CLAUDE_SESSION_ID: makeSessionId('hook-auto') }
    }
  );
  assert.strictEqual(tilldoneAutoResult.status, 0, '--session auto should resolve from env');

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

  console.log('Hook test suite passed.');
}

try {
  run();
} catch (error) {
  console.error('Hook test suite failed:', error);
  process.exit(1);
}
