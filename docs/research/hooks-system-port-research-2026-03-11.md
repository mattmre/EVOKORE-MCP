# Hooks System Port Research

## Date
- 2026-03-11

## Objective
- Close `T10` by aligning EVOKORE with the Agent33 canonical `scripts/hooks/` hook layout while preserving the already-stable hook implementations and CLI workflows.

## Current-State Findings
- EVOKORE already shipped the four required hooks on `main`:
  - `damage-control`
  - `purpose-gate`
  - `session-replay`
  - `tilldone`
- The remaining mismatch was structural, not behavioral:
  - `.claude/settings.json` still pointed at top-level `scripts/*.js`.
  - Agent33's documented target layout expects `scripts/hooks/*.js`.
  - Existing docs and operator habits still reference the top-level entrypoints, especially `node scripts/tilldone.js`.

## Decision
- Add canonical `scripts/hooks/*.js` entrypoints and wire `.claude/settings.json` to those paths.
- Preserve the top-level `scripts/*.js` files as stable legacy entrypoints for backward compatibility.
- Validate both surfaces:
  - canonical paths become the primary test target
  - legacy entrypoints receive smoke coverage so older workflows do not regress

## Rationale
- This lands the Agent33 lifecycle contract with minimal regression risk.
- It avoids rewriting hook logic during the same slice that changes runtime wiring.
- It leaves a clean next step for `T11`, which can focus on fail-safe policy rather than path migration.

## Follow-On Impact
- `T11` can standardize fail-safe behavior against one canonical runtime path.
- `T18` session continuity work can target `scripts/hooks/` as the durable lifecycle surface.
- `T21` live status work can build on the same canonical prompt hook entrypoint already used by settings.
