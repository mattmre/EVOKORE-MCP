# BUG-28 Slice Audit — session-store runtime cleanup (2026-04-17)

## Why this slice
- `tests/integration/session-store.test.ts` was already almost entirely behavioral
- The only remaining BUG-28 residue was the final pair of source-scraping assertions against `src/SessionIsolation.ts`
- That makes this the lowest-risk next cleanup after the `skill-fetch` and `skill-registry` slices

## Coverage ownership after cleanup
- `tests/integration/session-store.test.ts`
  - runtime CRUD behavior for `MemorySessionStore` and `FileSessionStore`
  - serialization/deserialization helpers
  - `SessionIsolation` default-store behavior
  - `SessionIsolation` with injected `FileSessionStore`
  - backward-compatibility and runtime session-shape coverage
- `tests/integration/file-session-store-validation.test.ts`
  - broader file-store integration and wiring coverage that remains outside this narrow slice

## Scope guardrails
- Do not widen this PR into the larger file-store validation suite
- Replace the remaining source checks with a runtime state-shape assertion only
- Keep the write surface to:
  - `tests/integration/session-store.test.ts`
  - this research note
  - task-plan tracking only
