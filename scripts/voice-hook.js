#!/usr/bin/env node

const WebSocket = require('ws');

const PORT = process.env.VOICE_SIDECAR_PORT || 8888;
let input = '';

process.stdin.on('data', (chunk) => input += chunk);
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(input);
    const text = payload?.response?.text || payload?.message || '';
    if (!text) return;

    const ws = new WebSocket(`ws://localhost:${PORT}`);
    ws.on('open', () => {
      ws.send(JSON.stringify({ text, flush: true }));
      ws.close();
    });
    ws.on('error', () => {}); // Silently fail if sidecar not running
  } catch {
    // Silently fail on parse errors
  }
});
