'use strict';


const assert = require('assert');
const fs = require('fs');
const path = require('path');

test('voice refinement validation', () => {
  const sidecarPath = path.resolve(__dirname, 'src', 'VoiceSidecar.ts');
  const ttsProviderPath = path.resolve(__dirname, 'src', 'tts', 'ElevenLabsTTSProvider.ts');
  const voicesPath = path.resolve(__dirname, 'voices.json');

  const sidecarSource = fs.readFileSync(sidecarPath, 'utf8');
  const ttsProviderSource = fs.readFileSync(ttsProviderPath, 'utf8');
  const voices = JSON.parse(fs.readFileSync(voicesPath, 'utf8'));

  // Persona merge should preserve defaults while allowing persona overrides.
  assert.match(sidecarSource, /return \{ \.\.\.config\.default, \.\.\.config\.personas\[role\] \};/);

  // API-level speed should be passed in voice settings (now in extracted TTS provider).
  assert.match(ttsProviderSource, /speed: this\.voice\.speed,/);

  // ffmpeg gating + chained atempo processing should exist.
  assert.match(sidecarSource, /where ffmpeg/);
  assert.match(sidecarSource, /which ffmpeg/);
  assert.match(sidecarSource, /while \(remaining > 2\.0\)/);
  assert.match(sidecarSource, /filters\.push\("atempo=2\.0"\)/);
  assert.match(sidecarSource, /postProcessSpeed\(tmpFile, processedFile, voice\.postProcessTempo\)/);

  // Hardening: verifyClient loopback check must exist.
  assert.match(sidecarSource, /verifyClient/, 'verifyClient callback must be present');
  assert.match(sidecarSource, /LOOPBACK_ADDRESSES/, 'loopback address check must be present');

  // Hardening: maxPayload must be configured.
  assert.match(sidecarSource, /maxPayload/, 'maxPayload must be configured on WebSocketServer');

  // Hardening: heartbeat ping/pong must exist.
  assert.match(sidecarSource, /client\.ping\(\)/, 'heartbeat ping must be present');
  assert.match(sidecarSource, /client\.on\("pong"/, 'pong handler must be present');

  // Hardening: host binding to 127.0.0.1.
  assert.match(sidecarSource, /host:\s*"127\.0\.0\.1"/, 'server must bind to 127.0.0.1');

  // Hardening: connection limit with close code 1013.
  assert.match(sidecarSource, /MAX_CONNECTIONS/, 'MAX_CONNECTIONS must be defined');
  assert.match(sidecarSource, /close\(1013/, 'connection limit must use close code 1013');

  // Voice config shape/range checks.
  assert.ok(voices.default, 'voices.json must include a default profile');
  assert.ok(voices.personas && typeof voices.personas === 'object', 'voices.json must include personas');

  const defaultSpeed = voices.default.speed;
  assert.ok(defaultSpeed >= 0.5 && defaultSpeed <= 2.0, 'default.speed must be within 0.5-2.0');

  for (const [name, persona] of Object.entries(voices.personas)) {
    if (persona.speed !== undefined) {
      assert.ok(persona.speed >= 0.5 && persona.speed <= 2.0, `${name}.speed must be within 0.5-2.0`);
    }
    if (persona.postProcessTempo !== undefined) {
      assert.ok(
        persona.postProcessTempo >= 1.0 && persona.postProcessTempo <= 4.0,
        `${name}.postProcessTempo must be within 1.0-4.0`
      );
    }
  }
});
