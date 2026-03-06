'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function run() {
  const usagePath = path.resolve(__dirname, 'docs', 'USAGE.md');
  const troubleshootingPath = path.resolve(__dirname, 'docs', 'TROUBLESHOOTING.md');
  const voiceCliResearchPath = path.resolve(__dirname, 'docs', 'VOICE_CLI_RESEARCH.md');

  const usage = fs.readFileSync(usagePath, 'utf8');
  const troubleshooting = fs.readFileSync(troubleshootingPath, 'utf8');
  const voiceCliResearch = fs.readFileSync(voiceCliResearchPath, 'utf8');

  assert.match(usage, /VoiceMode/i);
  assert.match(usage, /Windows setup notes \(PowerShell\)/i);
  assert.match(usage, /setx OPENAI_API_KEY/i);
  assert.match(usage, /\$env:OPENAI_API_KEY/i);

  assert.match(troubleshooting, /VoiceMode Fails to Start on Windows/i);
  assert.match(troubleshooting, /setx OPENAI_API_KEY/i);
  assert.match(troubleshooting, /\$env:OPENAI_API_KEY/i);
  assert.match(troubleshooting, /uvx --version/i);

  assert.match(voiceCliResearch, /Windows VoiceMode Bypass/i);
  assert.match(voiceCliResearch, /skip the `uvx voice-mode-install` step as it may fail/i);
  assert.match(voiceCliResearch, /claude mcp add --scope user voicemode -- uvx --refresh voice-mode/i);

  console.log('Voice Windows docs validation passed.');
}

try {
  run();
} catch (error) {
  console.error('Voice Windows docs validation failed:', error);
  process.exit(1);
}
