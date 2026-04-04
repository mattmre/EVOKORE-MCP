# Phase 4C Implementation Plan — CI & Observability
**Date:** 2026-04-03  
**Source:** `docs/research/repo-review-2026-04-03.md` (8-panel expert review)  
**Branch:** `fix/phase-4c-ci-observability` from `main @ 4f0ddec`

---

## Items In Scope

| ID | Severity | File(s) | Summary |
|----|----------|---------|---------|
| BUG-15 | HIGH | `.github/workflows/security-scan.yml` | Trivy cache key = run_id → always misses |
| BUG-16 | HIGH | `.github/workflows/release.yml` | actions/checkout@v3 EOL |
| BUG-17 | HIGH | `.github/workflows/ci.yml`, `tests/global-setup.ts` | Parallel tsc race across shards |
| BUG-18 | HIGH | `scripts/hooks/session-replay.js` | Never logs tool_response outputs |
| BUG-19 | HIGH | `scripts/hooks/evidence-capture.js` | Never records test pass/fail |
| IMP-01 | HIGH | hooks, `src/AuditLog.ts` | No invocation correlation ID |
| BUG-20 | HIGH | `damage-control-rules.yaml`, `scripts/hooks/damage-control.js` | DC-01 too narrow, no rule_id in logs |
| BUG-21 | HIGH | `scripts/hooks/damage-control.js` | Scope boundary alert storm |
| IMP-15 | — | `vitest.config.ts` | Zero coverage configuration |
| IMP-18 | — | `scripts/hooks/purpose-gate.js` | Any short string = valid purpose |
| IMP-19 | — | `scripts/hooks/repo-audit-hook-runtime.js` | Errors silently swallowed |
| BUG-09 | HIGH | `src/SkillManager.ts:685-701` | extractCodeBlocks regex ReDoS |

---

## Group 1 — CI Workflows (BUG-15, BUG-16, BUG-17)

### BUG-15: Trivy cache key fix
**File:** `.github/workflows/security-scan.yml`  
**Problem:** Cache key is `trivy-db-${{ github.run_id }}` — unique per run, so the cache is NEVER restored. Appears in 4 identical blocks (one per job: trivy-fs, trivy-config, trivy-secrets, trivy-sarif).

**Fix:** Before each cache step, add a step to get the ISO week:
```yaml
- name: Get date for cache key
  id: date
  run: echo "week=$(date +%Y-%V)" >> $GITHUB_OUTPUT
```
Then change the cache key:
```yaml
# OLD:
key: trivy-db-${{ github.run_id }}
restore-keys: trivy-db-
# NEW:
key: trivy-db-${{ steps.date.outputs.week }}
restore-keys: trivy-db-
```
Apply to all 4 jobs.

---

### BUG-16: release.yml checkout@v3 EOL
**File:** `.github/workflows/release.yml`  
**Problem:** `actions/checkout@v3` is EOL; all other workflows use `@v4`.  
**Note:** Step-level permissions are NOT supported in regular GitHub Actions jobs (only in reusable/composite workflows). Keep `contents: write` at job level but document why.

**Fix:**
- Line 24: `uses: actions/checkout@v3` → `uses: actions/checkout@v4`
- Add comment on the permissions block explaining why `contents: write` must be job-level

---

### BUG-17: CI shard tsc race
**Files:** `.github/workflows/ci.yml`, `tests/global-setup.ts`

**Problem:** `global-setup.ts` calls `execSync('npx tsc')` which runs in all 3 shards simultaneously, racing on filesystem writes. The `build` job in ci.yml already runs `npx tsc` but does NOT upload `dist/` as an artifact. The `test` matrix job has no `needs: [build]`.

**Fix in `ci.yml`:**
1. In the `build` job, after `npx tsc`, add:
```yaml
- name: Upload dist artifact
  uses: actions/upload-artifact@v4
  with:
    name: dist
    path: dist/
    retention-days: 1
```
2. In the `test` job, add `needs: [build]` and insert after checkout:
```yaml
- name: Download dist artifact
  uses: actions/download-artifact@v4
  with:
    name: dist
    path: dist/
```

**Fix in `tests/global-setup.ts`:**
Remove the `execSync('npx tsc', { stdio: 'inherit' })` call entirely (dist/ is now pre-built). If the file becomes empty, keep an empty export or delete if `globalSetup` in vitest.config.ts can be removed.

---

## Group 2 — Hook Observability (BUG-18, BUG-19, IMP-01)

### BUG-18: session-replay.js — add tool_response capture
**File:** `scripts/hooks/session-replay.js`

**Problem:** PostToolUse handler logs `tool_name` and `tool_input` but never reads `payload.tool_response`. Replay is call-log only, not true replay.

**Fix:** In the entry object, add:
```js
outcome: payload.tool_response?.is_error ? 'error' : 'ok',
output: (payload.tool_response?.content?.[0]?.text || '').slice(0, 300),
```

---

### BUG-19: evidence-capture.js — add pass/fail
**File:** `scripts/hooks/evidence-capture.js`

**Problem:** Evidence entries never include exit code or pass/fail status. `classifyBashCommand` and the main handler do not read `payload.tool_response`.

**Fix:** In the evidence entry construction (wherever `evidence_id` is set), add:
```js
exit_code: payload.tool_response?.metadata?.exit_code ?? null,
passed: payload.tool_response?.is_error !== true,
```

---

### IMP-01: Invocation correlation ID
**Files:** `scripts/hooks/damage-control.js`, `src/AuditLog.ts`

**Problem:** No shared ID links hook events to server-side telemetry/audit entries.

**Note:** Hooks and the MCP server are separate processes. True cross-process correlation requires a shared identifier from Claude Code's payload. Since Claude Code does not currently expose a stable per-invocation ID across PreToolUse→PostToolUse, the pragmatic approach is:
1. Generate `invocation_id` in PreToolUse (damage-control hook) and write it into a per-session side file keyed by `{session_id}:{tool_name}:{timestamp_ms}`.
2. In PostToolUse hooks (session-replay, evidence-capture), read the most recent invocation_id for the matching session+tool.

Simpler alternative (implement this): each hook event independently includes a `session_id + tool_name + iso_timestamp`. This allows post-hoc correlation by joining on session+tool+time window without requiring inter-process state.

**Fix for AuditLog.ts:** Add optional `invocationId?: string` to `AuditEntry` interface. In hook events, include `invocation_ts: new Date().toISOString()` alongside session_id and tool_name.

**New env var:** `EVOKORE_INVOCATION_ID` is generated per hook invocation (not operator-configured). Does NOT need `.env.example` entry.

---

## Group 3 — Damage Control (BUG-20, BUG-21)

### BUG-20: DC-01 too narrow + no rule_id in logs
**Files:** `damage-control-rules.yaml`, `scripts/hooks/damage-control.js`

**Problem 1 (DC-01 pattern):** Current regex: `'rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+|--force\s+).*(/|\\)'` — requires `/` or `\` after filename, so `rm -f myfile.txt` passes unblocked.

**Fix:** Remove the trailing `(/|\\)` requirement:
```yaml
# OLD pattern:
pattern: 'rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+|--force\s+).*(/|\\)'
# NEW pattern:
pattern: 'rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+|--force\s+)\S+'
```
This matches `rm -f anything` while still requiring at least one non-whitespace character after the flag (avoids matching bare `rm -f`).

**Problem 2 (DC-26 gap):** Research confirms DC-26 already exists (eval rule). No tombstone needed.

**Problem 3 (no rule_id in logs):** `logViolation` calls in damage-control.js do not include `rule_id`.

**Fix:** Update `logViolation` call sites to include the matching rule's ID:
```js
// Example:
logViolation({ type: 'dangerous_command', rule_id: rule.id, tool: toolName, command: cmd.slice(0, 200), reason })
```
The `rule` object from YAML already has an `id` field (e.g., `DC-01`). Pass it through.

---

### BUG-21: Scope boundary alert storm
**File:** `scripts/hooks/damage-control.js` (scope boundary section, approx lines 204-245)

**Problem:** Fires `ask` event for every file whose path doesn't contain purpose keywords. 3-char minimum catches noise. No rate limit. All in-repo file accesses trigger it.

**Fix:**
1. Increase minimum keyword length from 3 to 5 characters.
2. Require at least 2 keyword matches (not just 1) before considering a path "out of scope".
3. Only fire for paths whose project root directory differs from `process.cwd()` (cross-project access check).
4. Add per-session rate limit: read/write a counter via `readSessionState`/`writeSessionState`. If `scope_boundary_asks >= 3`, suppress further scope boundary asks for this session.

---

## Group 4 — Tooling (IMP-15, IMP-18, IMP-19, BUG-09)

### IMP-15: Coverage configuration
**File:** `vitest.config.ts`  
**Prerequisite:** `npm install --save-dev @vitest/coverage-v8`

**Fix:** Add `coverage` block to vitest config:
```ts
coverage: {
  provider: 'v8',
  reporter: ['text', 'html', 'lcov'],
  thresholds: {
    branches: 65,
    functions: 70,
    lines: 70,
    statements: 70,
  },
  exclude: ['dist/**', 'tests/**', 'scripts/**', '*.config.*'],
},
```
Use conservative thresholds (65-70%) to not immediately break CI.

---

### IMP-18: Purpose-gate minimum length
**File:** `scripts/hooks/purpose-gate.js`

**Problem:** Any string (even "ok" or "y") becomes the permanent session purpose.

**Fix:** Before saving purpose, validate minimum length of 10 characters. If too short, return a `ask` response prompting the user to provide more detail:
```js
if (purpose.trim().length < 10) {
  return { action: 'ask', content: 'Session purpose is too short. Please describe your goal in at least 10 characters (e.g., "fix auth bug in login flow").' };
}
```

---

### IMP-19: repo-audit-hook-runtime.js silent errors
**File:** `scripts/hooks/repo-audit-hook-runtime.js`

**Problem:** Main execution block has bare `catch {}` — errors are silently swallowed, operators cannot tell why the hook failed.

**Fix:** Replace bare `catch {}` with structured error logging:
```js
} catch (err) {
  process.stderr.write(JSON.stringify({
    hook: 'repo-audit-hook',
    event: 'hook_error',
    error: err?.message || String(err),
    ts: new Date().toISOString(),
  }) + '\n');
}
```
Note: `writeHookEvent` is not imported in this file. Use `process.stderr.write` directly for simplicity and to avoid adding a new import.

---

### BUG-09: extractCodeBlocks ReDoS
**File:** `src/SkillManager.ts`, method `extractCodeBlocks` at lines 685-701

**Problem:** Regex `` /```(\w*)\n([\s\S]*?)```/g `` — lazy `[\s\S]*?` causes O(n²) backtracking when a skill file contains an unclosed triple-backtick fence.

**Fix:** Replace regex with a stateful line-by-line fence parser:
```ts
private extractCodeBlocks(content: string): Array<{ language: string; code: string }> {
  const blocks: Array<{ language: string; code: string }> = [];
  const lines = content.split(/\r?\n/);
  let inFence = false;
  let language = '';
  let codeLines: string[] = [];

  for (const line of lines) {
    if (!inFence) {
      const fenceMatch = line.match(/^```(\w*)$/);
      if (fenceMatch) {
        inFence = true;
        language = fenceMatch[1] || '';
        codeLines = [];
      }
    } else {
      if (line === '```') {
        blocks.push({ language, code: codeLines.join('\n') });
        inFence = false;
        language = '';
        codeLines = [];
      } else {
        codeLines.push(line);
      }
    }
  }
  // Unclosed fence: discard (no catastrophic backtracking possible)
  return blocks;
}
```
This is O(n) with no backtracking. Handles Windows line endings via `split(/\r?\n/)`. Discards unclosed fences safely.

---

## Implementation Order

```
1. BUG-15  security-scan.yml Trivy cache key
2. BUG-16  release.yml checkout@v4
3. BUG-17  ci.yml artifact upload/download + global-setup.ts
4. BUG-18  session-replay.js tool_response
5. BUG-19  evidence-capture.js pass/fail
6. IMP-01  AuditLog.ts invocationId field + hook ts correlation
7. BUG-20  damage-control-rules.yaml + damage-control.js rule_id
8. BUG-21  damage-control.js scope boundary rewrite
9. IMP-15  vitest.config.ts coverage + npm install @vitest/coverage-v8
10. IMP-18 purpose-gate.js minimum length
11. IMP-19 repo-audit-hook-runtime.js structured error catch
12. BUG-09 SkillManager.ts extractCodeBlocks line parser
```

---

## New Env Vars for .env.example

None required. `EVOKORE_INVOCATION_ID` is internally generated by hooks, not an operator config key.

---

## Risks & Edge Cases

| Risk | Mitigation |
|------|-----------|
| BUG-16: step-level permissions not supported in regular jobs | Keep `contents: write` at job level, add explanatory comment |
| BUG-17: test shards fail if build job fails | Intentional — do not work around |
| BUG-18/19: tool_response payload shape | Optional chaining guards prevent crashes; null values acceptable |
| BUG-21: scope rate-limit state file | Use existing `writeSessionState` mechanism |
| IMP-15: coverage thresholds may fail CI | Use conservative 65-70% thresholds |
| BUG-09: fence parser edge cases | Handles `\r\n`, language tags, unclosed fences; discards unclosed safely |
| Commit messages | Use `.commit-msg.txt` + `git commit -F` per CLAUDE.md |
