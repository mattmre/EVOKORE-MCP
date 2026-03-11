# Cross-CLI Sync Canonical Root Follow-Through - 2026-03-11

## Goal

Close `T17` by hardening cross-CLI config sync so generated MCP entries always point at the stable EVOKORE runtime root rather than an ephemeral disposable worktree path.

## Findings

The base cross-CLI sync feature already existed before this slice:

- `scripts/sync-configs.js`
- mode safety (`--dry-run`, `--apply`)
- preserve/force entry policy
- Claude Code, Claude Desktop, Cursor, and Gemini coverage
- dedicated validation and e2e tests

The remaining gap appeared only when the script was run from a disposable worktree:

- `ENTRY_POINT` was derived from the current worktree root
- dry-run/apply output therefore pointed user configs at `.orchestrator/worktrees/.../dist/index.js`
- this path is not the durable runtime target we want users to register across CLIs

## Decision

Resolve the sync entry point from the canonical git common root by default:

- use `git rev-parse --git-common-dir`
- convert the shared `.git` directory back to the primary repo root
- allow `EVOKORE_SYNC_PROJECT_ROOT` to override when needed
- keep current behavior as the fallback outside git/worktree contexts

## Validation

```bash
npm run build
node test-sync-configs-mode-validation.js
node test-sync-configs-preserve-force-validation.js
node test-sync-configs-e2e-validation.js
node test-sync-configs-canonical-root-validation.js
npm test
npm audit --json
```
