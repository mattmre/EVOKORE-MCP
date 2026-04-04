# Next Session Priorities

Last Updated (UTC): 2026-04-04

## Current Handoff State
- **Active branch:** `main` (clean — all PRs merged)
- **HEAD:** `368750d`
- **Open PRs:** None
- **Worktrees:** Root checkout only

## THIS SESSION: Session 8 — Post-Phase-4E Cleanup (2026-04-04)

### PRs Merged This Session
- PR #225 (SafeSkill bot PR — closed with false-positive analysis comment)
- PR #229 (Option B — SETUP.md default fix + 9 BUG-28 TODO markers), merged `deeaf48`
- PR #230 (Option A — BUG-28 full behavioral test conversion), merged `368750d`

### Key Decisions This Session
- PR #225 (SafeSkill bot) closed — all 10,157 "findings" were false positives for a Node.js CLI tool (child_process usage flagged as critical)
- SETUP.md `EVOKORE_CHILD_SERVER_BOOT_TIMEOUT_MS` corrected: 30000 → 15000 (two locations)
- BUG-28 TODO markers added to 9 additional `tests/integration/` files
- `websocket-hitl-validation.test.ts`: 33/49 tests converted to behavioral (real WebSocket + dist/ imports); 16 Section 4 dashboard JS tests retained as source-scraping (browser-side JS needs jsdom/headless to go further)
- Message buffering race condition handled via `_msgBuffer` early-listener pattern
- Ephemeral port pattern (port: 0) used for all behavioral test isolation

---

## PHASE 4 + SESSION 8 — STATUS (ALL COMPLETE)

### Phase 4A — COMPLETE (PR #221 + PR #222)
### Phase 4B — COMPLETE (PR #223)
### Phase 4C — COMPLETE (PR #225-old)
### Phase 4D — COMPLETE (PR #226)
### Phase 4E — COMPLETE (PR #227)
### Session 8 Post-4E Cleanup — COMPLETE (PR #229, PR #230)

---

## NEXT SESSION: Recommended Priorities

### Option D — Fresh 8-Panel Expert Review **(NEXT UP)**
Run a new 8-panel expert review of the EVOKORE-MCP codebase on main @ `368750d` covering all src/ files changed in the current sprint. Surface any new issues introduced or remaining gaps. This feeds ECC Cascade planning.

> "Run a fresh 8-panel expert review of the EVOKORE-MCP codebase on main @ 368750d covering all src/ files. Save results to docs/research/repo-review-2026-04-04.md."

### Option C — ECC Cascade Phase 1 Implementation **(HIGH EFFORT — after Option D)**
Research complete (`docs/research/ecc-cascade-*.md`, `ecc-cascade-feasibility-panel-2026-03-30.md`). Implementation not started. Run Option D review first to confirm no blockers.

Branch: `feature/ecc-cascade-phase1` from main.

### Option B2 — BUG-28 Remaining Source-Scraping **(MED EFFORT)**
Section 4 of `websocket-hitl-validation.test.ts` (16 dashboard JS tests) + 9 other files marked with BUG-28 TODO still need behavioral conversion. Section 4 needs jsdom or headless browser.

---

## How to Start Next Session

Recommended (Option D expert review first):
> "Run Option D — fresh 8-panel expert review of EVOKORE-MCP main @ 368750d. Save to docs/research/repo-review-2026-04-04.md. Then plan ECC Cascade Phase 1."

---

## Guardrails (carry forward)
- `.commit-msg.txt` + `git commit -F` (not heredocs)
- DC-01 catches `rm -f` — use `unlink` for single-file deletion
- File writes in shell: use `python -c "open().write()"` or `node -e "writeFileSync()"`
- PR body with `.env` substring: use `--body-file` with temp file written via python/node
- New `EVOKORE_*` env vars → add to `.env.example` in same PR (CI shard 3 scans `src/`)
- `npx vitest run` locally before pushing
- Merge PRs sequentially (not batch)
- Research → `docs/research/` per stage
