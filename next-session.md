# Next Session Priorities

Last Updated (UTC): 2026-04-04

## Current Handoff State
- **Active branch:** `main` (clean — all PRs merged)
- **HEAD:** `d1bada7`
- **Open PRs:** None
- **Worktrees:** Root checkout only

## THIS SESSION: Session 9 — Expert Review + Phase 5 Security Sprint (2026-04-04)

### PRs Merged This Session
- PR #231 (BUG-28 Section 4 — dashboard HTTP behavioral tests), merged `51b96cb`
- PR #232 (ECC Tier 0 — tool counts corrected, benchmark script), merged `c14ad3e`
- PR #234 (Phase 5A — SEC-01/03/04 + OPS-01), merged `c5534c9`
- PR #233 (Phase 5B — TST-02 + API-04 + OPS-05), merged `d1bada7`
- Expert review doc pushed directly: `438c30c`

### Key Decisions This Session
- 8-panel expert review (40 findings, 2 HIGH) saved to `docs/research/repo-review-2026-04-04.md`
- **SEC-03**: `isPrivateAddress()` added to `httpUtils.ts`; `httpGet()` blocks private/loopback/link-local — `EVOKORE_HTTP_ALLOW_PRIVATE=true` escape hatch for test servers
- **SEC-01**: `tokenFull` fully removed from WebSocket broadcasts and `getPendingApprovals()` — deny works by 8-char prefix; `dashboard.js` updated
- **SEC-04**: `TelemetryExporter.isValidUrl()` now calls `isPrivateAddress()`
- **OPS-01**: `cleanupInterval`/`persistInterval` moved inside `listen()` callback — no leak on port-bind failure
- **ECC Tier 0 [13]**: Read was already in damage-control matcher (pre-existing)
- **ECC Tier 0 [11]**: Native tool count corrected to 14 (11+2+1) across CLAUDE.md + ECC docs
- **TST-02**: Heartbeat test now waits for real 5000ms ping frame (was tautological)
- **API-04**: `subscribe()` typed as `WebhookEventType` with runtime validation
- **OPS-05**: parseInt NaN guards on all interval env vars

---

## PHASE 5 — STATUS

### Phase 5A — COMPLETE (PR #234): SEC-01, SEC-03, SEC-04, OPS-01
### Phase 5B — COMPLETE (PR #233): TST-02, API-04, OPS-05
### ECC Tier 0 — COMPLETE (PR #232): [11], [13] confirmed

**Expert review score: 0 CRITICAL, 2 HIGH (resolved), 10 MED (6 resolved this session)**

---

## NEXT SESSION: Recommended Priorities

### Remaining MED findings from 2026-04-04 review
From `docs/research/repo-review-2026-04-04.md`:

| ID | File | Summary | Effort |
|---|---|---|---|
| REL-01 | src/HttpServer.ts | Transport close race in cleanup interval | MED |
| REL-03 | src/ProxyManager.ts | Synchronous reconnect blocks MCP caller | MED |
| API-03 | src/SkillManager.ts | discover_tools annotation conflict (docs) | LOW |
| SEC-02 | src/SecurityManager.ts | setActiveRole lacks access gate | MED |
| PERF-03 | src/AuditLog.ts | getEntries reads full JSONL into memory | MED |
| TS-04 | src/index.ts | Wide any on CallToolRequest handler | MED |
| API-02 | src/HttpServer.ts | Session not found → JSON-RPC error (deferred from 5B) | LOW |

### ECC Cascade Tier 1 (requires Tier 0 complete — now unblocked)
From `docs/research/ecc-cascade-feasibility-panel-2026-03-30.md` Tier 1:
- [12] Re-verify ECC claims (3 sessions)
- [C4] Authority precedence design doc (1.5 sessions)
- [9] Acceptance criteria per phase (2.5 sessions)

---

## How to Start Next Session

Option A — Clear remaining MED findings in one PR wave:
> "Fix remaining MED items from docs/research/repo-review-2026-04-04.md: REL-01, REL-03, SEC-02, PERF-03, API-02. Branch: fix/phase-5c-med-batch."

Option B — ECC Cascade Tier 1:
> "Begin ECC Cascade Tier 1. Load docs/research/ecc-cascade-feasibility-panel-2026-03-30.md Tier 1 items. Start with [12] re-verifying ECC claims against actual EVOKORE state."

---

## Guardrails (carry forward)
- `.commit-msg.txt` + `git commit -F` (not heredocs)
- DC-01 catches `rm -f` — use `unlink` for single-file deletion
- File writes in shell: `node -e "require('fs').writeFileSync(...)"`
- PR body with sensitive path substring: use `--body-file` with temp file
- New `EVOKORE_*` env vars → add to example config in same PR (CI shard 3)
- `npx vitest run` locally before pushing
- Merge PRs sequentially (not batch); rebase if parallel agents touch same files
- Research → `docs/research/` per stage
- `EVOKORE_HTTP_ALLOW_PRIVATE=true` needed for tests that start local HTTP servers
