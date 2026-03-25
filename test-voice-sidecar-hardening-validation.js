'use strict';


const assert = require('assert');
const fs = require('fs');
const path = require('path');

test('voice sidecar hardening validation', () => {
  const sidecarPath = path.resolve(__dirname, 'src', 'VoiceSidecar.ts');
  const ttsProviderPath = path.resolve(__dirname, 'src', 'tts', 'ElevenLabsTTSProvider.ts');
  const sidecarSource = fs.readFileSync(sidecarPath, 'utf8');
  const ttsProviderSource = fs.readFileSync(ttsProviderPath, 'utf8');

  // 1. Localhost binding
  assert.match(
    sidecarSource,
    /host:\s*"127\.0\.0\.1"/,
    'WebSocketServer must bind to 127.0.0.1'
  );

  // 2. verifyClient with loopback check
  assert.match(
    sidecarSource,
    /verifyClient/,
    'verifyClient must be configured'
  );
  assert.match(
    sidecarSource,
    /LOOPBACK_ADDRESSES\.has\(/,
    'verifyClient must check against loopback addresses'
  );
  assert.match(
    sidecarSource,
    /remoteAddress/,
    'verifyClient must inspect remoteAddress'
  );

  // 3. maxPayload
  assert.match(
    sidecarSource,
    /maxPayload:\s*MAX_PAYLOAD_BYTES/,
    'maxPayload must use MAX_PAYLOAD_BYTES constant'
  );
  assert.match(
    sidecarSource,
    /MAX_PAYLOAD_BYTES\s*=\s*1\s*\*\s*1024\s*\*\s*1024/,
    'MAX_PAYLOAD_BYTES must be 1 MB'
  );

  // 4. Connection limit
  assert.match(
    sidecarSource,
    /MAX_CONNECTIONS\s*=\s*parseInt\(process\.env\.VOICE_SIDECAR_MAX_CONNECTIONS/,
    'MAX_CONNECTIONS must be env-configurable'
  );
  assert.match(
    sidecarSource,
    /wss\.clients\.size\s*>\s*MAX_CONNECTIONS/,
    'Connection count must be checked against MAX_CONNECTIONS'
  );
  assert.match(
    sidecarSource,
    /client\.close\(1013/,
    'Must reject with close code 1013 (Try Again Later)'
  );

  // 5. Heartbeat ping/pong
  assert.match(
    sidecarSource,
    /setInterval\(/,
    'Heartbeat interval must be set up'
  );
  assert.match(
    sidecarSource,
    /__alive\s*===\s*false/,
    'Heartbeat must track __alive state'
  );
  assert.match(
    sidecarSource,
    /client\.ping\(\)/,
    'Must send ping to clients'
  );
  assert.match(
    sidecarSource,
    /client\.terminate\(\)/,
    'Must terminate unresponsive clients'
  );
  assert.match(
    sidecarSource,
    /on\("pong"/,
    'Must listen for pong responses'
  );

  // 6. Input validation: text type and length
  assert.match(
    sidecarSource,
    /typeof msg\.text !== "string"/,
    'Must validate text is a string'
  );
  assert.match(
    sidecarSource,
    /MAX_TEXT_LENGTH/,
    'Must have MAX_TEXT_LENGTH constant'
  );
  assert.match(
    sidecarSource,
    /msg\.text\.length > MAX_TEXT_LENGTH/,
    'Must check text length against MAX_TEXT_LENGTH'
  );

  // 7. Input validation: persona type
  assert.match(
    sidecarSource,
    /typeof msg\.persona !== "string"/,
    'Must validate persona is a string'
  );

  // 8. Health check
  assert.match(
    sidecarSource,
    /msg\.text === "__health"/,
    'Must handle __health message'
  );
  assert.match(
    sidecarSource,
    /type:\s*"health"/,
    'Health response must include type: health'
  );
  assert.match(
    sidecarSource,
    /connections:\s*wss\.clients\.size/,
    'Health response must include connection count'
  );
  assert.match(
    sidecarSource,
    /uptime:/,
    'Health response must include uptime'
  );

  // 9. ElevenLabs connect timeout (now in extracted TTS provider)
  assert.match(
    ttsProviderSource,
    /CONNECT_TIMEOUT_MS\s*=\s*10000/,
    'Connect timeout must be 10 seconds'
  );
  assert.match(
    ttsProviderSource,
    /connectTimer/,
    'Must use a timer for connect timeout'
  );

  // 10. Connect retry with backoff (now in extracted TTS provider)
  assert.match(
    ttsProviderSource,
    /CONNECT_MAX_RETRIES\s*=\s*2/,
    'Must allow max 2 retries'
  );
  assert.match(
    ttsProviderSource,
    /Math\.pow\(2,\s*attempt\)/,
    'Must use exponential backoff'
  );
  assert.match(
    ttsProviderSource,
    /attemptConnect/,
    'Must have attemptConnect method for retry logic'
  );

  // 11. Flush timeout (now in extracted TTS provider)
  assert.match(
    ttsProviderSource,
    /FLUSH_TIMEOUT_MS\s*=\s*30000/,
    'Flush timeout must be 30 seconds'
  );
  assert.match(
    ttsProviderSource,
    /flushTimer/,
    'Must use a timer for flush timeout'
  );

  // 12. Startup temp file cleanup
  assert.match(
    sidecarSource,
    /cleanupStaleTempFiles/,
    'Must have cleanupStaleTempFiles function'
  );
  assert.match(
    sidecarSource,
    /evokore-voice-/,
    'Must scan for evokore-voice-* temp files'
  );

  // 13. Graceful shutdown
  assert.match(
    sidecarSource,
    /client\.close\(1001/,
    'Must close clients with code 1001 (Going Away)'
  );
  assert.match(
    sidecarSource,
    /SHUTDOWN_DRAIN_MS/,
    'Must have a shutdown drain period'
  );
  assert.match(
    sidecarSource,
    /gracefulShutdown/,
    'Must have gracefulShutdown function'
  );
  assert.match(
    sidecarSource,
    /clearInterval\(heartbeatInterval\)/,
    'Must clear heartbeat interval on shutdown'
  );
});
