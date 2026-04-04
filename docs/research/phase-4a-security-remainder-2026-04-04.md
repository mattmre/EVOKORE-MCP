# Phase 4A Security Remainder — Pre-Implementation Research
**Date:** 2026-04-04  
**Source:** Panel code review (docs/research/repo-review-2026-04-03.md), researcher agent analysis  
**Branch:** fix/phase-4a-security-remainder (to be cut from main @ 0b0b203)

## Summary
9 security bugs remaining from Phase 4A. BUG-01 through BUG-04 were fixed in PR #221.
This document covers BUG-23, BUG-24, BUG-25, BUG-29, BUG-34, BUG-35, BUG-36, BUG-41, BUG-42.

---

## BUG-34: Default "allow" for unknown tools (should be "deny")

**File:** `src/SecurityManager.ts:110`
```typescript
const rule = this.rules[toolName];
if (!rule) return "allow"; // Default permissive if not explicitly ruled
```

**Fix:** Change `return "allow"` → `return "deny"`.

**Impact:** Breaking change for any deployment relying on implicit allow. The existing test at
`tests/integration/rbac-roles.test.ts` asserts unknown tools return `'allow'` — must be updated to `'deny'`.

**No env var escape hatch needed** — this is deliberate security posture hardening. Document in `.env.example` / CLAUDE.md.

---

## BUG-35: SSRF via RFC-1918 private addresses in webhook targets

**File:** `src/WebhookManager.ts:282-293` — `isValidWebhookConfig()`

Current code only checks protocol (`http:`/`https:`). No hostname validation.

**Fix:** After protocol check, add:
```typescript
const hostname = u.hostname.toLowerCase();
const privatePatterns = [
  /^127\./,           // loopback
  /^10\./,            // RFC-1918
  /^172\.(1[6-9]|2\d|3[01])\./,  // RFC-1918
  /^192\.168\./,      // RFC-1918
  /^169\.254\./,      // link-local
  /^0\.0\.0\.0/,      // unspecified
  /^::1$/,            // IPv6 loopback
  /^fc00:/,           // IPv6 ULA
  /^fe80:/,           // IPv6 link-local
];
const isLoopbackName = hostname === 'localhost';
if (isLoopbackName || privatePatterns.some(p => p.test(hostname))) {
  // Allow bypass via env var for local development/testing
  if (process.env.EVOKORE_WEBHOOKS_ALLOW_PRIVATE !== 'true') return false;
}
```

**Test impact:** All webhook tests use `127.0.0.1`. Tests must set `EVOKORE_WEBHOOKS_ALLOW_PRIVATE=true` OR mock validation. Recommend: in `webhook-events.test.ts` `beforeAll`, set `process.env.EVOKORE_WEBHOOKS_ALLOW_PRIVATE = 'true'` and restore in `afterAll`.

**New env var:** `EVOKORE_WEBHOOKS_ALLOW_PRIVATE=true` must be added to `.env.example`.

---

## BUG-36: AuditLog disabled by default (inverted security posture)

**File:** `src/AuditLog.ts:73`
```typescript
this.enabled = options?.enabled ?? process.env.EVOKORE_AUDIT_LOG === "true";
```

**Fix:** Change to `process.env.EVOKORE_AUDIT_LOG !== "false"` (enabled by default, opt-out with `=false`).
Update comment on line 52 and `.env.example`.

**Test impact:** Tests construct `AuditLog` with `{ enabled: true }` explicitly — unaffected.

---

## BUG-23: Missing `--cap-drop=ALL` in ContainerSandbox

**File:** `src/ContainerSandbox.ts` — `buildSecurityArgs()` function (around line 274-295)

**Fix:** Add `"--cap-drop=ALL"` to the `args` array, before `--security-opt=no-new-privileges`.

**Test update:** `tests/integration/container-sandbox-validation.test.ts` has per-flag assertions — add:
```typescript
expect(args).toContain('--cap-drop=ALL');
```

---

## BUG-24: `walkDirectory` follows symlinks → path traversal

**File:** `src/SkillManager.ts:182` and `src/SkillManager.ts:283`

Both use `fs.stat()` which follows symlinks.

**Fix:** Replace `fs.stat()` with `fs.lstat()` at both locations. After getting lstat, add:
```typescript
if (entryStat.isSymbolicLink()) continue; // skip symlinks
```

No new test file needed for this fix (private method, hardening only).

---

## BUG-25: Null byte in env var value → silent data loss

**File:** `src/ContainerSandbox.ts:388-395` — env var injection loop

**Fix:** Add validation before pushing env args:
```typescript
for (const [key, value] of Object.entries(options.env)) {
  if (key === "PATH") continue;
  // Validate key: must be safe identifier
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) continue;
  // Strip null bytes from value (silent data loss protection)
  const safeValue = String(value).replace(/\0/g, '');
  runArgs.push("-e", `${key}=${safeValue}`);
}
```

---

## BUG-41: Missing damage-control rules for eval(), exec(), git remote set-url

**File:** `damage-control-rules.yaml`

**Rule format:**
```yaml
- id: DC-XX
  pattern: 'regex_pattern'
  reason: 'Human readable description'
  ask: true|false
```

**New rules to add:**
- **DC-26** (fills gap): `\beval\s*\(` — `eval() call detected` — `ask: true`
- **DC-31**: `\bexec\s*\(` — `exec() call detected` — `ask: true`  
- **DC-32**: `git\s+remote\s+set-url` — `Git remote URL modification` — `ask: false`

**Test update:** `tests/integration/damage-control-regex.test.ts` — add test cases for these 3 patterns.

---

## BUG-42: `redactForAudit()` is shallow (nested secrets not redacted)

**File:** `src/AuditLog.ts:311-329` — `redactForAudit()` function

**Current:** Only processes top-level keys. `{ nested: { token: "secret" } }` leaks the token.

**Fix:** Make recursive with depth limit:
```typescript
export function redactForAudit(
  obj: Record<string, unknown> | undefined,
  depth = 0
): Record<string, unknown> | undefined {
  if (!obj || depth > 5) return obj;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      result[key] = "[REDACTED]";
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = redactForAudit(value as Record<string, unknown>, depth + 1);
    } else if (Array.isArray(value)) {
      result[key] = value.map(item =>
        item !== null && typeof item === 'object' && !Array.isArray(item)
          ? redactForAudit(item as Record<string, unknown>, depth + 1)
          : item
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}
```

**Test update:** Add nested redaction test to `tests/integration/internal-telemetry-validation.test.ts`.

---

## BUG-29: Full webhook URL (with credentials in query params) logged on retry

**File:** `src/WebhookManager.ts:160` and `src/WebhookManager.ts:314`

**Fix:** Before both log statements, create a sanitized URL string:
```typescript
const safeUrl = (() => { try { const u = new URL(webhook.url); return `${u.origin}${u.pathname}`; } catch { return '[invalid-url]'; } })();
```
Then use `safeUrl` in the log messages instead of `webhook.url`.

---

## Files Changed Summary

| File | Bugs |
|------|------|
| `src/SecurityManager.ts` | BUG-34 |
| `src/WebhookManager.ts` | BUG-35, BUG-29 |
| `src/AuditLog.ts` | BUG-36, BUG-42 |
| `src/ContainerSandbox.ts` | BUG-23, BUG-25 |
| `src/SkillManager.ts` | BUG-24 |
| `damage-control-rules.yaml` | BUG-41 |
| `.env.example` | BUG-35 (EVOKORE_WEBHOOKS_ALLOW_PRIVATE) |
| `tests/integration/rbac-roles.test.ts` | BUG-34 (update assertion) |
| `tests/integration/container-sandbox-validation.test.ts` | BUG-23 (add cap-drop assertion) |
| `tests/integration/damage-control-regex.test.ts` | BUG-41 (add 3 test cases) |
| `tests/integration/internal-telemetry-validation.test.ts` | BUG-42 (add nested redaction test) |
| `tests/integration/webhook-events.test.ts` | BUG-35 (add EVOKORE_WEBHOOKS_ALLOW_PRIVATE bypass in beforeAll) |

## New env vars to document in .env.example
- `EVOKORE_WEBHOOKS_ALLOW_PRIVATE` — allow private/loopback webhook targets (for local dev/testing only)
- `EVOKORE_AUDIT_LOG` — now `=false` to disable (was `=true` to enable)
