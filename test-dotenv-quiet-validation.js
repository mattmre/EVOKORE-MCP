'use strict';


const assert = require('assert');
const fs = require('fs');
const path = require('path');

test('dotenv quiet-mode validation', () => {
  const srcIndexPath = path.resolve(__dirname, 'src', 'index.ts');
  const srcVoiceSidecarPath = path.resolve(__dirname, 'src', 'VoiceSidecar.ts');
  const distIndexPath = path.resolve(__dirname, 'dist', 'index.js');
  const distVoiceSidecarPath = path.resolve(__dirname, 'dist', 'VoiceSidecar.js');

  const srcIndex = fs.readFileSync(srcIndexPath, 'utf8');
  const srcVoiceSidecar = fs.readFileSync(srcVoiceSidecarPath, 'utf8');
  const distIndex = fs.readFileSync(distIndexPath, 'utf8');
  const distVoiceSidecar = fs.readFileSync(distVoiceSidecarPath, 'utf8');

  assert.match(srcIndex, /dotenv\.config\(\{ path: path\.resolve\(__dirname, "\.\.\/\.env"\), quiet: true \}\);/);
  assert.match(srcVoiceSidecar, /dotenv\.config\(\{ path: path\.resolve\(__dirname, "\.\.\/\.env"\), quiet: true \}\);/);
  assert.match(distIndex, /dotenv_1\.default\.config\(\{ path: path_1\.default\.resolve\(__dirname, "\.\.\/\.env"\), quiet: true \}\);/);
  assert.match(distVoiceSidecar, /dotenv_1\.default\.config\(\{ path: path_1\.default\.resolve\(__dirname, "\.\.\/\.env"\), quiet: true \}\);/);
});
