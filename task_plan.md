# Task Plan — Remaining Roadmap Execution

## Session Purpose (2026-04-17)
Re-enter the repo from a clean `main`, confirm whether any open PR review work exists, and rebuild a crash-resumable execution plan for the actual remaining items so new slices can be shipped sequentially with minimal drift.

## Discovery Summary
- `gh pr list --repo mattmre/EVOKORE-MCP --state open` returned `[]`
- Local repo is clean on `main`
- Current `HEAD` is `7ba93ef` (`Expand CLI sync to Copilot and Codex (#277)`)
- `next-session.md` is stale: it still lists Waves 4/7/8/9 as pending even though PRs `#270`-`#276` already landed
- `task_plan.md`, `progress.md`, and session logs have not been refreshed since the post-Phase-4 wave
- `scripts/check-vector-trigger.js` does not exist, but `next-session.md` and `docs/adr/0004-vector-memory-trigger.md` reference it
- Multiple integration tests still carry `TODO(BUG-28)` source-scraping markers

---

## Actual Remaining Queue

| Stage | Slice | Goal | Status |
|-------|-------|------|--------|
| 0 | Control-plane sync | Refresh `next-session.md`, `task_plan.md`, session log, and research so the repo reflects post-`#277` reality | in progress |
| 1 | Security A | Fix approval-token exposure / pending-approval surface drift | pending |
| 2 | Security B | Add shared SSRF protection to `httpUtils` and align telemetry export URL validation | pending |
| 3 | Reliability | Fix `HttpServer` lifecycle/cleanup races and blocking reconnect behavior | pending |
| 4 | Test hardening | Convert remaining `BUG-28` source-scraping integration tests to behavioral coverage | pending |
| 5 | Vector gate instrumentation | Add `scripts/check-vector-trigger.js` and document/measure the gating inputs only | pending |
| 6 | Release closure | Complete npm publication follow-up after operator verifies `NPM_TOKEN` | blocked |

---

## Phase Plans

### Stage 0 — Control-Plane Sync
- Create a dated research note that captures the real remaining queue
- Add a new session log for this planning/re-entry pass
- Rewrite `next-session.md` to remove already-landed items and show the true priority order
- Keep this docs-only slice separate from code fixes

### Stage 1 — Security A
- Source: `docs/research/repo-review-2026-04-04.md`
- Target findings:
  - `SEC-01` pending approval token exposure
  - `DX-05` pending-approval JSDoc mismatch
  - optionally `SEC-02` if the write surface stays narrow
- Deliverables:
  - research note
  - targeted code/tests
  - one focused PR

### Stage 2 — Security B
- Source: `docs/research/repo-review-2026-04-04.md`
- Target findings:
  - `SEC-03` SSRF protection missing in shared `httpUtils.ts`
  - `SEC-04` telemetry export URL validation weaker than webhook posture
- Deliverables:
  - shared private-address blocking logic
  - redirect-hop validation tests
  - one focused PR

### Stage 3 — Reliability
- Source: `docs/research/repo-review-2026-04-04.md`
- Target findings:
  - `REL-01`, `REL-02`
  - `REL-03`
  - `OPS-01`, `OPS-05`
- Deliverables:
  - `HttpServer` lifecycle fixes
  - reconnect behavior hardening
  - targeted integration coverage

### Stage 4 — Test Hardening
- Convert remaining `TODO(BUG-28)` files from source-scraping to behavioral assertions
- Known files currently marked:
  - `tests/integration/file-session-store-validation.test.ts`
  - `tests/integration/container-sandbox-validation.test.ts`
  - `tests/integration/oauth-jwt-validation.test.ts`
  - `tests/integration/redis-session-store-validation.test.ts`
  - `tests/integration/session-store.test.ts`
  - `tests/integration/skill-fetch.test.ts`
  - `tests/integration/skill-registry.test.ts`
  - `tests/integration/skill-watcher-stability.test.ts`
  - `tests/integration/stt-whisper-validation.test.ts`
- Break this into multiple PRs if the write surface becomes too wide

### Stage 5 — Vector Gate Instrumentation
- Do not implement vector memory
- Add the missing gate script and only the measurement/reporting path needed by `docs/adr/0004-vector-memory-trigger.md`
- Confirm:
  - corpus-count definition
  - `resolve_workflow` latency source for p50 over last 1,000 calls
  - current gate status

### Stage 6 — Release Closure
- Operator-gated
- After `NPM_TOKEN` is verified:
  - rerun `npm run release:preflight`
  - publish/verify `evokore-mcp@3.1.0`
  - record closure in docs/session log

---

## Sequential Execution Rules
1. Research first, then implement.
2. One primary architectural question per slice.
3. One PR per slice unless the write surface must split.
4. Merge sequentially onto fresh `main`; revalidate after every merge.
5. Refresh control-plane docs after each merged slice.

## Validation Baseline Per Slice
- Targeted `npx vitest run ...`
- `npm run build`
- Additional lint/docs checks only when the touched surface requires them

## Current Recommendation
1. Finish Stage 0 as a docs-only control-plane PR.
2. Execute Stage 1 (`SEC-01`) next from fresh `main`.
3. Keep Stage 2 (`SEC-03` / `SEC-04`) separate to isolate network-hardening risk.
