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

function waitForLogMatch(child, readBuffer, matcher, timeoutMs) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      const output = readBuffer();
      if (matcher.test(output)) {
        clearInterval(interval);
        clearTimeout(timer);
        resolve(output);
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        clearTimeout(timer);
        reject(new Error(`Timed out waiting for sidecar startup log. stderr:\n${output}`));
      }
    }, 25);

    const timer = setTimeout(() => {
      clearInterval(interval);
      reject(new Error(`Timed out waiting for sidecar startup log. stderr:\n${readBuffer()}`));
    }, timeoutMs);

    child.once('close', (code) => {
      clearInterval(interval);
      clearTimeout(timer);
      reject(new Error(`VoiceSidecar exited before startup log was seen (code ${code}). stderr:\n${readBuffer()}`));
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
  if (child.exitCode !== null || child.signalCode !== null) {
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
  assert.ok(fs.existsSync(sidecarPath), 'dist/VoiceSidecar.js must exist for runtime smoke validation');

  const port = await getUnusedPort();
  const child = spawn(process.execPath, [sidecarPath], {
    env: {
      ...process.env,
      ELEVENLABS_API_KEY: 'smoke-test-key',
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
    await waitForLogMatch(child, () => stderr, new RegExp(`Listening on ws://127\\.0\\.0\\.1:${port}`), 10000).catch(() => undefined);
    await waitForSocketReady(wsUrl, 12000);

    const ws = await openSocket(wsUrl, 3000);
    ws.send(JSON.stringify({ text: '', flush: true }));
    await closeSocket(ws);

    const result = await shutdownChild(child, 'SIGINT', 5000);
    assert.ok(
      result.code === 0 || result.signal === 'SIGINT',
      `VoiceSidecar should exit cleanly on SIGINT (code 0 or SIGINT signal). stderr:\n${stderr}`
    );
    assert.ok(
      stdout.trim() === '' || /dotenv@/i.test(stdout),
      `Unexpected stdout from VoiceSidecar smoke test:\n${stdout}`
    );
  } catch (error) {
    await ensureChildStopped(child);
    throw error;
  }

  console.log('Voice sidecar smoke validation passed.');
}

run().catch((error) => {
  console.error('Voice sidecar smoke validation failed:', error);
  process.exit(1);
});
