'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runNodeScript, makeSessionId } = require('./tests/helpers/hook-test-helper');

const sessionsDir = path.join(os.homedir(), '.evokore', 'sessions');

function cleanupFile(filePath) {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
  }
}

function run() {
  console.log('Running hook test suite...');

  const damageResult = runNodeScript('scripts/damage-control.js', {
    tool_name: 'Bash',
    tool_input: { command: 'rm -rf /tmp/test-folder' }
  });
  assert.strictEqual(damageResult.status, 2, 'damage-control should block dangerous command');
  assert.match(damageResult.cleanStderr, /DAMAGE CONTROL BLOCKED/i);

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
  cleanupFile(purposeStateFile);

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

  console.log('Hook test suite passed.');
}

try {
  run();
} catch (error) {
  console.error('Hook test suite failed:', error);
  process.exit(1);
}
