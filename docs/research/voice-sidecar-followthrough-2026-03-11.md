# T20 Research: Voice Sidecar Follow-Through

Date: 2026-03-11

## Problem

The standalone VoiceSidecar runtime was already implemented and hardened:

- loopback-only binding
- connection limits
- heartbeat
- input validation
- connect/flush timeouts
- temp cleanup
- artifact capture
- graceful shutdown

That meant `T20` was not a greenfield voice build.

The remaining operator/runtime gap was upstream:

- the bundled `scripts/voice-hook.js` forwarded only `{ text, flush }`
- docs and walkthroughs described persona-aware sidecar usage
- `voices.json` persona mapping existed, but the default Claude hook path had no way to select a persona

## Decision

Treat `T20` as hook-transport follow-through rather than a sidecar rewrite.

Implementation target:

1. Add persona propagation to `scripts/voice-hook.js`
2. Keep the sidecar protocol unchanged (`text`, optional `persona`, optional `flush`)
3. Give operators explicit hook-side control through `VOICE_SIDECAR_PERSONA`
4. Allow payload-carried persona metadata as fallback

## Resolution Order

Persona resolution priority:

1. `VOICE_SIDECAR_PERSONA`
2. payload `persona`
3. payload `voice_persona`
4. payload `metadata.persona`
5. payload `metadata.voice_persona`
6. payload `session.persona`

If none are present, the hook sends no `persona` field and the sidecar falls back to the `default` voice config.

## Additional Follow-Through

- switch the default hook target to explicit loopback host semantics (`127.0.0.1`) with optional `VOICE_SIDECAR_HOST`
- update voice setup/walkthrough/troubleshooting docs to show persona-aware hook configuration
- extend `test-voice-e2e-validation.js` to prove both env-driven and payload-driven persona forwarding

## Validation Plan

- `node test-voice-e2e-validation.js`
- `node test-voice-refinement-validation.js`
- `node test-voice-sidecar-hardening-validation.js`
- `node test-voice-contract-validation.js`
- `node test-ops-docs-validation.js`
- `npm test`
- `npm audit --json`
