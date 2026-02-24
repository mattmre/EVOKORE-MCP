'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

function stripAnsi(input) {
  return String(input || '').replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

function runNodeScript(scriptPath, payload, options = {}) {
  const absoluteScriptPath = path.resolve(__dirname, '..', '..', scriptPath);
  const result = spawnSync(
    process.execPath,
    [absoluteScriptPath].concat(options.args || []),
    {
      input: payload ? JSON.stringify(payload) : undefined,
      encoding: 'utf8',
      env: Object.assign({}, process.env, options.env || {})
    }
  );

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    cleanStdout: stripAnsi(result.stdout || ''),
    cleanStderr: stripAnsi(result.stderr || '')
  };
}

function makeSessionId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

module.exports = {
  runNodeScript,
  makeSessionId,
  stripAnsi
};
