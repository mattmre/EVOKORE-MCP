'use strict';


const assert = require('assert');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { WebSocketServer } = require('ws');

const HOOK_PATH = path.resolve(__dirname, 'scripts', 'voice-hook.js');

function runHook(port, payload, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [HOOK_PATH], {
      env: { ...process.env, VOICE_SIDECAR_PORT: String(port), ...extraEnv },
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

test('voice hook E2E validation', async () => {
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

  // Case 3: Explicit hook persona env should be forwarded.
  const personaServer = new WebSocketServer({ port: 0 });
  await new Promise((resolve) => personaServer.once('listening', resolve));
  const personaPort = personaServer.address().port;
  const personaMessagePromise = waitForMessage(personaServer, 2000);

  const personaResult = await runHook(
    personaPort,
    { response: { text: 'Persona via env.' } },
    { VOICE_SIDECAR_PERSONA: 'orchestrator', VOICE_SIDECAR_HOST: '127.0.0.1' }
  );
  const personaReceived = await personaMessagePromise;

  await new Promise((resolve) => personaServer.close(resolve));

  assert.strictEqual(personaResult.code, 0, 'voice-hook should exit successfully with explicit persona env');
  assert.deepStrictEqual(personaReceived, { text: 'Persona via env.', persona: 'orchestrator', flush: true });

  // Case 4: Payload metadata persona should be forwarded when env is unset.
  const payloadPersonaServer = new WebSocketServer({ port: 0 });
  await new Promise((resolve) => payloadPersonaServer.once('listening', resolve));
  const payloadPersonaPort = payloadPersonaServer.address().port;
  const payloadPersonaPromise = waitForMessage(payloadPersonaServer, 2000);

  const payloadPersonaResult = await runHook(payloadPersonaPort, {
    response: { text: 'Persona via payload.' },
    metadata: { persona: 'tester' }
  });
  const payloadPersonaReceived = await payloadPersonaPromise;

  await new Promise((resolve) => payloadPersonaServer.close(resolve));

  assert.strictEqual(payloadPersonaResult.code, 0, 'voice-hook should exit successfully with payload persona');
  assert.deepStrictEqual(payloadPersonaReceived, { text: 'Persona via payload.', persona: 'tester', flush: true });
});
