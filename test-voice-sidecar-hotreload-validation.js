'use strict';

const assert = require('assert');
const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');

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

function waitForLogMatch(child, readBuffer, matcher, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      const output = readBuffer();
      if (matcher.test(output)) {
        clearInterval(interval);
        clearTimeout(timer);
        resolve(output);
      }
    }, 25);

    const timer = setTimeout(() => {
      clearInterval(interval);
      reject(new Error(`Timed out waiting for ${label}. stderr:\n${readBuffer()}`));
    }, timeoutMs);

    child.once('close', (code) => {
      clearInterval(interval);
      clearTimeout(timer);
      reject(new Error(`VoiceSidecar exited before ${label} (code ${code}). stderr:\n${readBuffer()}`));
    });
  });
}

function openSocket(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error('Timed out connecting to VoiceSidecar WebSocket server.'));
    }, timeoutMs);

    ws.once('open', () => {
      clearTimeout(timer);
      resolve(ws);
    });

    ws.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function closeSocket(ws) {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    ws.once('close', () => resolve());
    ws.close();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSocketReady(url, timeoutMs) {
  const started = Date.now();
  let lastError = null;

  while (Date.now() - started < timeoutMs) {
    try {
      const ws = await openSocket(url, 750);
      await closeSocket(ws);
      return;
    } catch (error) {
      lastError = error;
      await sleep(100);
    }
  }

  throw new Error(`Timed out waiting for VoiceSidecar socket readiness: ${lastError ? lastError.message : 'unknown error'}`);
}

function shutdownChild(child, signal, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for VoiceSidecar shutdown.')), timeoutMs);

    child.once('close', (code, closeSignal) => {
      clearTimeout(timer);
      resolve({ code, signal: closeSignal });
    });

    child.kill(signal);
  });
}

async function ensureChildStopped(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  try {
    await shutdownChild(child, 'SIGTERM', 3000);
  } catch {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
  }
}

async function run() {
  const sidecarPath = path.resolve(__dirname, 'dist', 'VoiceSidecar.js');
  const voicesPath = path.resolve(__dirname, 'voices.json');
  assert.ok(fs.existsSync(sidecarPath), 'dist/VoiceSidecar.js must exist for hot-reload validation');
  assert.ok(fs.existsSync(voicesPath), 'voices.json must exist for hot-reload validation');

  const voicesOriginalRaw = fs.readFileSync(voicesPath, 'utf8');
  const voicesOriginal = JSON.parse(voicesOriginalRaw);
  const personaName = Object.keys(voicesOriginal.personas || {})[0];
  assert.ok(personaName, 'voices.json must include at least one persona');

  const originalVoiceName = voicesOriginal.personas[personaName].voiceName || voicesOriginal.default.voiceName;
  const updatedVoiceName = `${originalVoiceName}__hotreload_test`;
  assert.notStrictEqual(updatedVoiceName, originalVoiceName, 'Updated voiceName must differ from original voiceName');

  const port = await getUnusedPort();
  const child = spawn(process.execPath, [sidecarPath], {
    env: {
      ...process.env,
      ELEVENLABS_API_KEY: 'hotreload-test-key',
      VOICE_SIDECAR_PORT: String(port)
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  try {
    const wsUrl = `ws://127.0.0.1:${port}`;
    await waitForLogMatch(child, () => stderr, new RegExp(`Listening on ws://127\\.0\\.0\\.1:${port}`), 10000, 'sidecar startup log');
    await waitForSocketReady(wsUrl, 12000);

    const originalPersonaLog = `Persona: ${personaName} → ${originalVoiceName}`;
    const ws1 = await openSocket(wsUrl, 3000);
    ws1.send(JSON.stringify({ text: 'Hot reload validation first connection.', persona: personaName }));
    await waitForLogMatch(
      child,
      () => stderr,
      new RegExp(originalPersonaLog.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      10000,
      'original persona->voice mapping log'
    );
    await closeSocket(ws1);

    const voicesUpdated = JSON.parse(voicesOriginalRaw);
    voicesUpdated.personas[personaName] = {
      ...(voicesUpdated.personas[personaName] || {}),
      voiceName: updatedVoiceName
    };
    fs.writeFileSync(voicesPath, `${JSON.stringify(voicesUpdated, null, 2)}\n`, 'utf8');

    const updatedPersonaLog = `Persona: ${personaName} → ${updatedVoiceName}`;
    const ws2 = await openSocket(wsUrl, 3000);
    ws2.send(JSON.stringify({ text: 'Hot reload validation second connection.', persona: personaName }));
    await waitForLogMatch(
      child,
      () => stderr,
      new RegExp(updatedPersonaLog.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      10000,
      'updated persona->voice mapping log'
    );
    await closeSocket(ws2);

    const result = await shutdownChild(child, 'SIGINT', 5000);
    assert.ok(
      result.code === 0 || result.signal === 'SIGINT',
      `VoiceSidecar should exit cleanly on SIGINT (code 0 or SIGINT signal). stderr:\n${stderr}`
    );
    assert.ok(
      stdout.trim() === '' || /dotenv@/i.test(stdout),
      `Unexpected stdout from VoiceSidecar hot-reload test:\n${stdout}`
    );
  } finally {
    fs.writeFileSync(voicesPath, voicesOriginalRaw, 'utf8');
    await ensureChildStopped(child);
  }

  console.log('Voice sidecar hot-reload validation passed.');
}

run().catch((error) => {
  console.error('Voice sidecar hot-reload validation failed:', error);
  process.exit(1);
});
