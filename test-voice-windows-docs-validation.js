'use strict';


const assert = require('assert');
const fs = require('fs');
const path = require('path');

test('voice Windows docs validation', () => {
  const usagePath = path.resolve(__dirname, 'docs', 'USAGE.md');
  const troubleshootingPath = path.resolve(__dirname, 'docs', 'TROUBLESHOOTING.md');

  const usage = fs.readFileSync(usagePath, 'utf8');
  const troubleshooting = fs.readFileSync(troubleshootingPath, 'utf8');

  assert.match(usage, /VoiceMode/i);
  assert.match(usage, /Windows setup notes \(PowerShell\)/i);
  assert.match(usage, /setx OPENAI_API_KEY/i);
  assert.match(usage, /\$env:OPENAI_API_KEY/i);

  assert.match(troubleshooting, /VoiceMode Fails to Start on Windows/i);
  assert.match(troubleshooting, /setx OPENAI_API_KEY/i);
  assert.match(troubleshooting, /\$env:OPENAI_API_KEY/i);
  assert.match(troubleshooting, /uvx --version/i);
});
