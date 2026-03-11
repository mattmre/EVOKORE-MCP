#!/usr/bin/env node

const WebSocket = require('ws');

const HOST = process.env.VOICE_SIDECAR_HOST || '127.0.0.1';
const PORT = process.env.VOICE_SIDECAR_PORT || 8888;
let input = '';

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function resolvePersona(payload) {
  return firstString(
    process.env.VOICE_SIDECAR_PERSONA,
    payload && payload.persona,
    payload && payload.voice_persona,
    payload && payload.metadata && payload.metadata.persona,
    payload && payload.metadata && payload.metadata.voice_persona,
    payload && payload.session && payload.session.persona
  );
}

process.stdin.on('data', (chunk) => input += chunk);
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(input);
    const text = payload?.response?.text || payload?.message || '';
    if (!text) return;

    const message = { text, flush: true };
    const persona = resolvePersona(payload);
    if (persona) {
      message.persona = persona;
    }

    const ws = new WebSocket(`ws://${HOST}:${PORT}`);
    ws.on('open', () => {
      ws.send(JSON.stringify(message), () => ws.close());
    });
    ws.on('error', () => {}); // Silently fail if sidecar not running
  } catch {
    // Silently fail on parse errors
  }
});
