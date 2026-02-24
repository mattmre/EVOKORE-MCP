'use strict';

const assert = require('assert');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { WebSocketServer } = require('ws');

const HOOK_PATH = path.resolve(__dirname, 'scripts', 'voice-hook.js');

function runHook(port, payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [HOOK_PATH], {
      env: { ...process.env, VOICE_SIDECAR_PORT: String(port) },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    child.stdin.end(JSON.stringify(payload));
  });
}

function waitForMessage(server, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for hook payload.')), timeoutMs);
    server.once('connection', (socket) => {
      socket.once('message', (raw) => {
        clearTimeout(timer);
        resolve(JSON.parse(raw.toString()));
      });
    });
  });
}

function getUnusedPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

async function run() {
  // Case 1: Sidecar absent should silently exit.
  const silentPort = await getUnusedPort();
  const absentResult = await runHook(silentPort, { response: { text: 'No server attached.' } });
  assert.strictEqual(absentResult.code, 0, 'voice-hook should exit successfully when sidecar is absent');
  assert.strictEqual(absentResult.stdout, '', 'voice-hook should not write stdout on absent sidecar');
  assert.strictEqual(absentResult.stderr, '', 'voice-hook should not write stderr on absent sidecar');

  // Case 2: Sidecar present should receive text+flush payload.
  const wss = new WebSocketServer({ port: 0 });
  await new Promise((resolve) => wss.once('listening', resolve));
  const serverPort = wss.address().port;
  const messagePromise = waitForMessage(wss, 2000);

  const input = { response: { text: 'Voice E2E payload validation.' } };
  const hookResult = await runHook(serverPort, input);
  const received = await messagePromise;

  await new Promise((resolve) => wss.close(resolve));

  assert.strictEqual(hookResult.code, 0, 'voice-hook should exit successfully when sidecar is present');
  assert.deepStrictEqual(received, { text: input.response.text, flush: true });

  console.log('Voice hook e2e validation passed.');
}

run().catch((error) => {
  console.error('Voice hook e2e validation failed:', error);
  process.exit(1);
});
