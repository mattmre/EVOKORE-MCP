# ECC Phase 1 Integration Research

**Date:** 2026-04-11
**Session:** Task-05 — feat/ecc-phase-1
**Status:** Research complete → implementation ready

---

## Summary

Phase 1 wires SOUL.md, RULES.md, and steering-modes.json into two existing hooks. Changes are purely additive (enrichment-only) with fail-open behavior. No rule evaluation changes.

---

## Change Surface

### scripts/purpose-gate.js

Add three helpers:
- `loadSoulValues()` — reads SOUL.md, extracts Section 2 (Values Hierarchy) via regex `/## 2\. Values Hierarchy\s*\n([\s\S]*?)\n## 3\./`
- `loadSteeringModes()` — reads scripts/steering-modes.json, parses modes object
- `selectMode(purpose, modes)` — keyword-score function; precedence: security-audit > debug > review > research > dev

Injection points:
- **First prompt** (lines 43–68): append SOUL values hierarchy to contextParts (full ~280 tokens, once only)
- **Second prompt** (lines 69–109): select mode from purpose, persist `mode` + `modeSetAt` in session manifest, append `modes[mode].focus` (~75 tokens)
- **Subsequent prompts** (lines 110–130): read `state.mode` from manifest, append `modes[mode].focus` only (not full values — token budget)

Self-healing: if `state.mode` missing (pre-Phase-1 session), re-run `selectMode(state.purpose)` to backfill.

### scripts/damage-control.js

Add one helper:
- `loadRulesIntent()` — reads RULES.md, extracts 5 section headers + `**Intent:**` paragraphs; returns mapping `{ file_access: string, tool_restrictions: string, commit_policies: string, session_policies: string, escalation_policies: string }`

Usage: enrich `reason` strings in block/ask emissions with `See RULES.md §N` suffix based on rule category mapping:
- `dangerous_commands` → `§2 Tool Restrictions` or `§3 Commit Policies` (by pattern key prefix)
- `zero_access_paths` → `§1 File Access Policies`  
- `read_only_paths` → `§1 File Access Policies`
- `no_delete_paths` → `§1 File Access Policies`
- `scope_boundary` → `§4 Session Policies`

**Critical:** Never change block/ask decisions. Enrichment only.

---

## Key File Details

### purpose-gate.js (scripts/purpose-gate.js)

- Input: JSON stdin `{ session_id, user_message, workspace, tool_input }`
- Output: JSON stdout `{ additionalContext: "<string>" }`
- Three branches: first prompt (ask purpose), second prompt (save purpose), subsequent (remind)
- `contextParts.join(' ')` produces the final additionalContext string
- SESSIONS_DIR from `./session-continuity`
- Path for SOUL.md: `path.resolve(__dirname, '..', 'SOUL.md')`
- Path for steering-modes.json: `path.resolve(__dirname, 'steering-modes.json')` (same dir)

### damage-control.js (scripts/damage-control.js)

- Rules loaded from `damage-control-rules.yaml` via `const YAML = require('yaml')` at lines 122–130
- RULES.md path: `path.resolve(__dirname, '..', 'RULES.md')`
- Fail-open pattern: try { readFileSync } catch { emit('fail_open'); process.exit(0) }
- **Do NOT exit on RULES.md failure** — emit a log event and return empty mapping, continue normally

### steering-modes.json (scripts/steering-modes.json)

JSON shape: `{ modes: { dev: { name, description, focus, tools, skills, damage_control_level, allow_writes }, ... } }`

Mode selection keyword precedence (highest to lowest):
1. `security-audit`: audit, security, vulnerability, HITL, RBAC
2. `debug`: debug, bug, failing, error, reproduce, root cause  
3. `review`: review, PR, pull request, diff, feedback
4. `research`: research, explore, analyze, map, find, understand
5. `dev`: default (implement, build, fix, feature, code, test)

---

## Fail-Open Pattern (every new read must follow this)

```javascript
function loadSoulValues() {
  try {
    const raw = fs.readFileSync(SOUL_PATH, 'utf8');
    const match = raw.match(/## 2\. Values Hierarchy\s*\n([\s\S]*?)\n## 3\./);
    return match ? match[1].trim() : '';
  } catch {
    // Fail open — SOUL.md missing is not a fatal error
    try { writeHookEvent({ hook: 'purpose-gate', event: 'soul_load_failed' }); } catch {}
    return '';
  }
}
```

---

## Tests Required

File: `tests/integration/ecc-phase1-hooks.test.ts`

1. purpose-gate: with SOUL.md present → additionalContext contains "Correctness > Speed"
2. purpose-gate: with SOUL.md absent → still emits baseline purpose prompt (no crash)
3. purpose-gate: mode selected from purpose "review this PR" → `dev`→`review` mode selected, focus injected
4. damage-control: blocked Bash with RULES.md present → reason contains "RULES.md"
5. damage-control: with RULES.md absent → block/ask decisions unchanged (same output as before)

---

## DO NOT modify

- `scripts/hooks/purpose-gate.js` and `scripts/hooks/damage-control.js` — thin fail-safe wrappers
- `.claude/settings.json` — hook wiring unchanged
- `damage-control-rules.yaml` — rule additions are Phase 2+ scope
- Any TypeScript source files
