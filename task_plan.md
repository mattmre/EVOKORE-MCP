# Task Plan — Full Roadmap Execution

## Session 3 Goal
Execute the remaining post-roadmap work sequentially with fresh branches/agents per slice:
1. close the post-M2 F1 audit-redaction gap
2. complete release closure tasks that are still open
3. stabilize and synchronize planning/docs state
4. run the missing M4/post-M3 review loop
5. queue lower-priority expansion follow-ups as separate PR-sized slices

## Current Phase
Phase S3.6 implementation: the Prometheus `/metrics` slice is under local validation/publication, and the next executable engineering work after it lands is S3.7.

## Current Repo / PR State
- Open PRs on merged `main`: none
- Local branch: `feat/prometheus-metrics-endpoint`
- Existing root-checkout drift: planning files plus `test-worktree-cleanup-validation.js`; new slices continue from fresh disposable worktrees instead of the dirty root checkout
- Constraint: release closure remains operator-gated on `NPM_TOKEN`, so S3.6 is the current executable engineering slice while S3.3 waits on operator action.

## Remaining Execution Queue

| # | Slice | Type | Status | PR | Notes |
|---|---|---|---|---|---|
| S3.1 | F1 redactForAudit wiring / known-safe decision | code + docs | done | #207 | Merged as `03a31b4`; no blocking review findings; PR CI green |
| S3.2 | Post-merge stabilization: Windows-local worktree cleanup validation failure | test stabilization | done | #208 | Merged as `2a84de2`; local full suite now green again |
| S3.3 | Release closure follow-up | ops + docs | blocked | TBD | GitHub release/tag exist; npm package absent; `NPM_TOKEN` not visible in repo secrets |
| S3.4 | Planning/doc sync stabilization | docs/control-plane | done | #209 | Merged as `8dc1ad4`; wrap handoff preserved and validated on merged `main` |
| S3.5 | Post-M3 ARCH-AEP + M4 loop evidence | research/review | done | #210 | Merged as `ce1a75f`; follow-up queue confirmed |
| S3.6 | Expansion candidate: Prometheus `/metrics` pull endpoint | feature | in progress | TBD | Implemented locally with targeted validation passing; preparing sequential PR |
| S3.7 | Expansion candidate: dashboard approve-over-WebSocket | feature | pending | TBD | Current WS flow is deny/push-oriented |
| S3.8 | Expansion candidate: audit event export | feature | pending | TBD | Separate from telemetry metrics export |
| S3.9 | Expansion candidate: container sandbox seccomp/resource hardening | feature | pending | TBD | Could split into more than one PR |

## Goal
Execute the complete EVOKORE-MCP roadmap from PR #191 through M3.4, following the milestone-based execution plan. Each phase goes through: Align → Research → Architecture → Implement → Prove → ARCH-AEP Review → Code Review → Merge + Stabilize.

## Master Sequence

| # | Task | Milestone | Status | PR | Notes |
|---|---|---|---|---|---|
| 1 | Review, fix, and merge PR #191 | Pre-work | done | #191 | Docs-only roadmap refresh |
| 2 | NPM_TOKEN + release preflight command | M0 | done | #192 | 14 tests, 9 preflight checks |
| 3 | ARCH-AEP pre-M1 checkpoint | Gate | done | #193 | Architecture doc with 18 acceptance criteria |
| 4 | Session contract + HTTP reattachment | M1.1 | done | #194 | 21 new tests, session reattachment wired |
| 5 | Auto-memory event trigger | M1.2 | done | #195 | tilldone.js Stop hook sync |
| 6 | Dashboard session-filter alignment | M1.3 | done | #196 | Dual-directory scanning, schema normalization |
| 7 | Post-M1 ARCH-AEP review | Gate | done | #197 | PASS |
| 8 | Dashboard auth/authz hardening | M2.1 | done | #198 | Bearer token, RBAC, rate limiting, 47 tests |
| 9 | Internal telemetry + auditability | M2.2 | done | #199 | AuditLog.ts, TelemetryManager v2, 21 tests |
| 10 | Supabase live validation | M2.3 | done | #200 | 36 tests, credential-gated pattern |
| 11 | Container sandbox isolation | M2.4 | done | #201 | ContainerSandbox.ts, 64 tests |
| 12 | Post-M2 ARCH-AEP review | Gate | done | #202 | CONDITIONAL PASS (F1: redactForAudit wiring) |
| 13 | Redis SessionStore adapter | M3.1 | done | #205 | ioredis optional dep, dynamic import |
| 14 | External telemetry export | M3.2 | done | #204 | TelemetryExporter.ts, HMAC signing |
| 15 | WebSocket HITL approvals | M3.3 | done | #206 | WS transport on HttpServer, SecurityManager callbacks |
| 16 | Worktree cleanup automation | M3.4 | done | #203 | Standalone script, dry-run default |

## Final Validation
- Test files: 135 passed
- Tests: 2461 passed, 24 skipped
- Build: clean
- PRs merged this session: #191 through #206 (16 PRs)

## Standard Phase Loop (per task)
1. Align / architecture question
2. Research / dependency check
3. Architecture / PR slicing
4. Implementation
5. Prove / validation
6. ARCH-AEP review and analysis
7. Code review / hardening
8. Sequential merge + stabilization

## Errors Encountered
| Error | Attempt | Resolution |
|---|---|---|
| PR #205 CI: Install dependencies failed | ioredis in optionalDependencies but package-lock.json not committed | Pushed lockfile fix commit |
| test-worktree-cleanup-validation.js: new Function() syntax check | Node.js require() not valid in Function constructor | Replaced with node --check |
| `gh pr review --approve` on PR #207 | GitHub blocks self-approval | Recorded the review result as a normal PR comment instead |
| Clean verify worktree lacked dependencies initially | `npm test` / `npm run build` failed before install | Ran `npm ci` in `D:/GITHUB/EVOKORE-MCP-verify` before final validation |

## Session Log
- Session started: 2026-03-26
- PR #191 review + fix: merged
- M0 Release Closure: PR #192 merged
- ARCH-AEP pre-M1: PR #193 merged
- M1.1 Session reattachment: PR #194 merged
- M1.2 Auto-memory trigger: PR #195 merged
- M1.3 Dashboard session filter: PR #196 merged
- ARCH-AEP post-M1: PR #197 merged
- M2.1 Dashboard auth: PR #198 merged
- M2.2 Internal telemetry: PR #199 merged
- M2.3 Supabase validation: PR #200 merged
- M2.4 Container sandbox: PR #201 merged
- ARCH-AEP post-M2: PR #202 merged
- M3.4 Worktree cleanup: PR #203 merged
- M3.2 Telemetry export: PR #204 merged
- M3.1 Redis SessionStore: PR #205 merged
- M3.3 WebSocket HITL: PR #206 merged
- Final validation: 135 files, 2461 tests, build clean
- Session 3 planning started: 2026-03-26
- Confirmed there are no open PRs to review/comment on; work reframed to the next sequential remaining slices
- Began Slice S3.1 planning for the post-M2 F1 audit-redaction gap
- Slice S3.1 merged: PR #207 `Fix audit metadata redaction`
- Post-merge validation:
  - PR #207 local targeted validation passed
  - PR #207 GitHub CI/security checks all passed
  - clean `origin/main` local `npm run build` passed
  - the initial clean local `npm test` failure on `test-worktree-cleanup-validation.js` was isolated into S3.2
- Slice S3.2 merged: PR #208 `fix: restore node --check cleanup validation`
- Post-S3.2 validation:
  - `npx vitest run test-worktree-cleanup-validation.js` passed locally
  - `npm run build` passed locally
  - full local `npm test` passed: 135 files, 2462 tests, 24 skipped
  - next slice returns to release/doc follow-up work rather than test stabilization
- Slice S3.3 release-closure research completed:
  - clean preflight passes except for existing `v3.1.0` tag and missing `NPM_TOKEN`
  - GitHub release `v3.1.0` exists and is published
  - npm registry lookup for `evokore-mcp` returns `404 Not Found`
  - release closure is therefore operator-gated, not blocked on code
- Slice S3.5 merged: PR `#210` `docs: add post-M3 ARCH-AEP review`
- Slice S3.6 implementation started in fresh worktree `D:/GITHUB/EVOKORE-MCP-s3-6` on branch `feat/prometheus-metrics-endpoint`
- S3.6 implementation decisions:
  - `/metrics` is layered on top of the existing telemetry model instead of changing the M3.2 export contract
  - `/metrics` stays behind the normal auth middleware when auth is enabled; only `/health` remains public
  - `/metrics` returns `503` when `EVOKORE_TELEMETRY` is disabled instead of silently enabling collection
- S3.6 targeted local validation passed:
  - `npx vitest run tests/integration/telemetry-manager.test.ts tests/integration/http-server-transport.test.ts tests/integration/oauth-authentication.test.ts tests/integration/oauth-httpserver-middleware.test.ts`
  - `npm run build`
- Built isolated worktree `D:/GITHUB/EVOKORE-MCP-s3-1` on branch `fix/audit-redaction-wiring-20260326`
- Implemented centralized audit metadata redaction in `AuditLog.write()`
- Added runtime persistence coverage for audit redaction and a dated research note for F1 closure
- Full-suite validation exposed unrelated baseline blockers on current `main` lineage (`test-worktree-cleanup-validation.js`, then `test-release-preflight-validation.js` timeout under full-suite contention)
