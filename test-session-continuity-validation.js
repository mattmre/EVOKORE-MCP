'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { runNodeScript, makeSessionId } = require('./tests/helpers/hook-test-helper');
const { getSessionPaths, readSessionState } = require('./scripts/session-continuity');

function cleanup(paths) {
  for (const filePath of paths) {
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true });
    }
  }
}

function run() {
  console.log('Running session continuity validation...');

  const sessionId = makeSessionId('session-continuity');
  const paths = getSessionPaths(sessionId);
  cleanup([paths.sessionStatePath, paths.replayLogPath, paths.evidenceLogPath, paths.tasksPath]);

  const firstPrompt = runNodeScript('scripts/hooks/purpose-gate.js', {
    session_id: sessionId,
    user_message: 'hello'
  });
  assert.strictEqual(firstPrompt.status, 0);

  let state = readSessionState(sessionId);
  assert.ok(state, 'session state should be created on first prompt');
  assert.strictEqual(state.sessionId, sessionId);
  assert.strictEqual(state.status, 'awaiting-purpose');
  assert.strictEqual(state.purpose, null);
  assert.strictEqual(state.metrics.replayEntries, 0);
  assert.strictEqual(state.metrics.evidenceEntries, 0);
  assert.strictEqual(state.metrics.totalTasks, 0);

  const secondPrompt = runNodeScript('scripts/hooks/purpose-gate.js', {
    session_id: sessionId,
    user_message: 'Implement continuity architecture'
  });
  assert.strictEqual(secondPrompt.status, 0);

  state = readSessionState(sessionId);
  assert.strictEqual(state.status, 'active');
  assert.strictEqual(state.purpose, 'Implement continuity architecture');
  assert.ok(state.purposeSetAt, 'purpose should record purposeSetAt');

  const replayResult = runNodeScript('scripts/hooks/session-replay.js', {
    session_id: sessionId,
    tool_name: 'Bash',
    tool_input: { command: 'echo continuity' }
  });
  assert.strictEqual(replayResult.status, 0);

  state = readSessionState(sessionId);
  assert.strictEqual(state.metrics.replayEntries, 1);
  assert.strictEqual(state.lastToolName, 'Bash');
  assert.ok(state.lastReplayAt, 'replay should update lastReplayAt');

  const evidenceResult = runNodeScript('scripts/hooks/evidence-capture.js', {
    session_id: sessionId,
    tool_name: 'Bash',
    tool_input: { command: 'npm test' }
  });
  assert.strictEqual(evidenceResult.status, 0);

  state = readSessionState(sessionId);
  assert.strictEqual(state.metrics.evidenceEntries, 1);
  assert.strictEqual(state.lastEvidenceId, 'E-001');
  assert.strictEqual(state.lastEvidenceType, 'test-result');
  assert.ok(state.artifacts.evidenceLogPath.endsWith(`${sessionId}-evidence.jsonl`));

  const addTaskResult = runNodeScript(
    'scripts/hooks/tilldone.js',
    null,
    { args: ['--add', 'Document continuity', '--session', sessionId] }
  );
  assert.strictEqual(addTaskResult.status, 0);

  state = readSessionState(sessionId);
  assert.strictEqual(state.metrics.totalTasks, 1);
  assert.strictEqual(state.metrics.incompleteTasks, 1);
  assert.strictEqual(state.lastTaskAction, 'add');

  const listTasksResult = runNodeScript(
    'scripts/hooks/tilldone.js',
    null,
    { args: ['--list', '--session', sessionId] }
  );
  assert.strictEqual(listTasksResult.status, 0);

  state = readSessionState(sessionId);
  assert.strictEqual(state.lastTaskAction, 'list');

  const doneTaskResult = runNodeScript(
    'scripts/hooks/tilldone.js',
    null,
    { args: ['--done', '1', '--session', sessionId] }
  );
  assert.strictEqual(doneTaskResult.status, 0);

  state = readSessionState(sessionId);
  assert.strictEqual(state.metrics.totalTasks, 1);
  assert.strictEqual(state.metrics.incompleteTasks, 0);
  assert.strictEqual(state.lastTaskAction, 'done');

  const stopHookResult = runNodeScript('scripts/hooks/tilldone.js', { session_id: sessionId });
  assert.strictEqual(stopHookResult.status, 0);

  state = readSessionState(sessionId);
  assert.strictEqual(state.lastStopCheckResult, 'clear');
  assert.ok(state.lastStopCheckAt, 'stop check should update session state');

  cleanup([paths.sessionStatePath, paths.replayLogPath, paths.evidenceLogPath, paths.tasksPath]);
  console.log('Session continuity validation passed.');
}

try {
  run();
} catch (error) {
  console.error('Session continuity validation failed:', error);
  process.exit(1);
}
