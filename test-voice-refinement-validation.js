'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function run() {
  const sidecarPath = path.resolve(__dirname, 'src', 'VoiceSidecar.ts');
  const voicesPath = path.resolve(__dirname, 'voices.json');

  const sidecarSource = fs.readFileSync(sidecarPath, 'utf8');
  const voices = JSON.parse(fs.readFileSync(voicesPath, 'utf8'));

  // Persona merge should preserve defaults while allowing persona overrides.
  assert.match(sidecarSource, /return \{ \.\.\.config\.default, \.\.\.config\.personas\[role\] \};/);

  // API-level speed should be passed in voice settings.
  assert.match(sidecarSource, /speed: this\.voice\.speed,/);

  // ffmpeg gating + chained atempo processing should exist.
  assert.match(sidecarSource, /where ffmpeg/);
  assert.match(sidecarSource, /which ffmpeg/);
  assert.match(sidecarSource, /while \(remaining > 2\.0\)/);
  assert.match(sidecarSource, /filters\.push\("atempo=2\.0"\)/);
  assert.match(sidecarSource, /postProcessSpeed\(tmpFile, processedFile, this\.voice\.postProcessTempo\)/);

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

  console.log('Voice refinement validation passed.');
}

try {
  run();
} catch (error) {
  console.error('Voice refinement validation failed:', error);
  process.exit(1);
}
