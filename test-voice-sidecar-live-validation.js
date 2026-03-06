'use strict';

const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const dotenv = require('dotenv');
const WebSocket = require('ws');

// Match the sidecar's runtime contract so a key provided in .env satisfies the live gate.
dotenv.config({ path: path.resolve(__dirname, '.env'), quiet: true });

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function sendJson(ws, payload) {
  return new Promise((resolve, reject) => {
    ws.send(JSON.stringify(payload), (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
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

function waitForArtifact(artifactDir, timeoutMs) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const interval = setInterval(() => {
      const files = fs.existsSync(artifactDir)
        ? fs.readdirSync(artifactDir).filter((file) => file.endsWith('.mp3'))
        : [];

      if (files.length > 0) {
        const artifactPath = path.join(artifactDir, files[0]);
        const stat = fs.statSync(artifactPath);
        if (stat.size > 0) {
          clearInterval(interval);
          clearTimeout(timer);
          resolve({ artifactPath, size: stat.size });
        }
      }
    }, 100);

    const timer = setTimeout(() => {
      clearInterval(interval);
      reject(new Error(`Timed out waiting for non-empty mp3 artifact in ${artifactDir}`));
    }, timeoutMs);
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
  if (process.env.EVOKORE_RUN_LIVE_VOICE_TEST !== '1') {
    console.log('Skipping live VoiceSidecar validation. Set EVOKORE_RUN_LIVE_VOICE_TEST=1 to enable.');
    return;
  }

  if (!process.env.ELEVENLABS_API_KEY) {
    console.error('EVOKORE_RUN_LIVE_VOICE_TEST=1 requires ELEVENLABS_API_KEY to be set.');
    process.exit(1);
  }

  const sidecarPath = path.resolve(__dirname, 'dist', 'VoiceSidecar.js');
  assert.ok(fs.existsSync(sidecarPath), 'dist/VoiceSidecar.js must exist for live validation');

  const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokore-voice-live-'));
  const port = await getUnusedPort();
  const child = spawn(process.execPath, [sidecarPath], {
    env: {
      ...process.env,
      VOICE_SIDECAR_PORT: String(port),
      VOICE_SIDECAR_DISABLE_PLAYBACK: '1',
      VOICE_SIDECAR_ARTIFACT_DIR: artifactDir
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
    await waitForLogMatch(child, () => stderr, new RegExp(`Listening on ws://localhost:${port}`), 15000, 'sidecar startup log');
    await waitForSocketReady(wsUrl, 15000);

    const ws = await openSocket(wsUrl, 5000);
    await sendJson(ws, {
      text: 'Live validation audio artifact.',
      flush: true
    });
    await closeSocket(ws);

    const artifact = await waitForArtifact(artifactDir, 30000);
    assert.ok(artifact.size > 0, 'Live voice validation should save a non-empty mp3 artifact.');
    assert.match(stderr, /Playback disabled by VOICE_SIDECAR_DISABLE_PLAYBACK=1/, 'Sidecar should log disabled playback during live validation.');
    assert.match(stderr, /Saved audio artifact:/, 'Sidecar should log the saved artifact path during live validation.');

    const result = await shutdownChild(child, 'SIGINT', 5000);
    assert.ok(
      result.code === 0 || result.signal === 'SIGINT',
      `VoiceSidecar should exit cleanly on SIGINT (code 0 or SIGINT signal). stderr:\n${stderr}`
    );
    assert.ok(
      stdout.trim() === '' || /dotenv@/i.test(stdout),
      `Unexpected stdout from live VoiceSidecar test:\n${stdout}`
    );
  } finally {
    await ensureChildStopped(child);
    fs.rmSync(artifactDir, { recursive: true, force: true });
  }

  console.log('Voice sidecar live validation passed.');
}

run().catch((error) => {
  console.error('Voice sidecar live validation failed:', error);
  process.exit(1);
});
