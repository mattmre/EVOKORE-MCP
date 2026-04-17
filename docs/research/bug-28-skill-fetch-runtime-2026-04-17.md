# BUG-28 Slice Audit — skill-fetch runtime conversion (2026-04-17)

## Why this slice
- `tests/integration/skill-fetch.test.ts` was still dominated by source-scraping assertions against `src/SkillManager.ts`, `src/httpUtils.ts`, and `src/index.ts`
- The actual runtime surface is narrower and directly testable through `dist/SkillManager.js`
- `tests/integration/skill-registry-runtime.test.ts` already covers the runtime `list_registry` path, so `skill-fetch` is the cleaner first BUG-28 conversion target

## Audit outcome before implementation
- `SEC-01` approval-token exposure appears already fixed on current `main`
- `SEC-03` / `SEC-04` SSRF hardening appears already fixed on current `main`
- `REL-01` / `REL-02` / `REL-03` and `OPS-01` / `OPS-05` appear already fixed on current `main`
- The next clearly open queue item is remaining `BUG-28` source-scraping coverage

## Selected replacement coverage
- keep runtime schema assertions from `getTools()`
- validate `handleToolCall('fetch_skill', ...)` structured error behavior
- use a local HTTP fixture with `EVOKORE_HTTP_ALLOW_PRIVATE=true`
- verify real file install under `SKILLS/<category>/<name>/SKILL.md`
- verify duplicate-without-overwrite and update-with-overwrite behavior
- verify checksum success/failure
- verify traversal-like overrides still resolve inside `SKILLS/`

## Scope guardrails
- Do not expand this slice into top-level `index.ts` boot or auto-refresh behavior
- Do not combine this with `skill-registry` cleanup in the same PR
- Keep the write surface to:
  - `tests/integration/skill-fetch.test.ts`
  - this research note
  - task-plan tracking only if needed for handoff clarity
