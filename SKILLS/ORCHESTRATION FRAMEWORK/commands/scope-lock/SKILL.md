---
name: scope-lock
description: "Use when you want to lock the session to a specific scope description, injecting it into purpose-gate context and optionally blocking out-of-scope tool calls."
aliases: [lock-scope, focus-lock, scope]
category: orchestration
tags: [scope, focus, purpose-gate, session-management, guardrail]
archetype: AGT-018
version: 1.0.0
---

# /scope-lock — Lock Session Scope

Writes a scope constraint to the session manifest and injects it into purpose-gate's `additionalContext` on every subsequent prompt. Optionally adds a temporary damage-control rule blocking out-of-scope file types.

## Usage

```
/scope-lock "Implement TrustLedger only — no other src/ files"
/scope-lock "Fix failing tests in tests/integration/ only"
```

## What it does

1. Writes the scope description to the session manifest as `scopeLock: { description, lockedAt }`
2. On the next prompt, purpose-gate reads the scope lock and prepends it to `additionalContext`
3. Optionally: creates a temporary damage-control rule scoped to this session

## Scope Lock Format in Manifest

```json
{
  "scopeLock": {
    "description": "Implement TrustLedger only — no other src/ files",
    "lockedAt": "2026-04-15T03:00:00Z",
    "sessionId": "sess-abc123"
  }
}
```

## How to set scope manually

Until this skill is fully wired into the purpose-gate hook, set scope by adding to session manifest:

```javascript
// In purpose-gate.js subsequent-prompt branch, after loadPolicyBundle():
const manifestPath = path.join(SESSIONS_DIR, sessionId + '.json');
let scopeLock = null;
try {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  scopeLock = manifest.scopeLock || null;
} catch {}

if (scopeLock) {
  contextParts.push('## Scope Lock\n' + scopeLock.description + '\n(locked at ' + scopeLock.lockedAt + ')');
}
```

## Clearing scope lock

To clear a scope lock:
```javascript
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
delete manifest.scopeLock;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
```

Or start a new session with `/session-checkpoint` + new session ID.

## Integration

- Works with purpose-gate.js ContinueGate: scope lock overrides the keyword alignment check
- Works with AGT-018 (Governance Gate): scope lock is included in PolicyBundle fingerprint
- Pairs with `/session-checkpoint` to save state before locking scope
