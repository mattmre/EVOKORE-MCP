---
name: v3-release-and-hardening-sprint
description: Sequential execution plan for v3.0.0 release, webhook completion, E2E testing, documentation, and operational hardening.
---

# Task Plan: v3.0.0 Release & Hardening Sprint

## Goal
Ship v3.0.0 to npm, close technical debt from platform wiring sprint, add missing webhook events, create E2E integration tests, write documentation guides, and harden operations.

## Current Phase
All implementation phases complete -- ready for v3.0.0 tag.

## Baseline State (session start)
- **Main branch:** `09c8b6d` -- PRs #142-#145 merged
- **Open PRs:** #146 (E2E wired pipeline test)
- **Version:** 3.0.0
- **Test suite:** ~97 files, ~937+ tests via vitest

## Final State (session end)
- **Main branch:** `15bd495` -- PRs #142-#156 merged
- **Open PRs:** none
- **Version:** 3.0.0
- **Test suite:** 106 files, 1224 tests via vitest

## Phases

### Phase 1: CHANGELOG.md & Release Prep
- [x] Generate CHANGELOG.md covering PRs #71-#141
- [x] Review package.json metadata
- [x] Verify npm publish --dry-run
- [x] PR #142, reviewed, merged
- **Then:** Tag v3.0.0 and push tag to trigger release workflow

### Phase 2: Emit Missing Webhook Events
- [x] Research current webhook emission points
- [x] Implement `session_end` event on graceful shutdown
- [x] Implement `approval_requested` event from SecurityManager.generateToken
- [x] Implement `approval_granted` event from SecurityManager.validateToken
- [x] Tests & lint
- [x] PR #143, reviewed, merged

### Phase 3: OAuthProvider JWT/JWKS Support
- [x] Research current OAuthProvider (static-token only)
- [x] Architect JWT validation with JWKS key rotation
- [x] Implement JWKS fetching and caching
- [x] Implement JWT signature verification
- [x] Tests & lint
- [x] PR #144, reviewed, merged

### Phase 4: Session Counter Cleanup
- [x] Research current rate limit counter lifecycle
- [x] Implement periodic cleanup for expired session counters
- [x] Tests & lint
- [x] PR #145, reviewed, merged

### Phase 5: E2E Integration Test -- Full Wired Pipeline
- [x] Research all wired modules (HTTP + OAuth + Session + RBAC + Rate Limit)
- [x] Architect E2E test harness
- [x] Implement E2E test covering full request lifecycle
- [x] Live HTTP transport test with real child server (if feasible)
- [x] Tests & lint
- [x] PR #146, reviewed (6 fixes applied), merged

### Phase 6: Documentation Suite
- [x] Plugin authoring guide — PR #147, merged
- [x] Webhook configuration guide — PR #148, merged
- [x] OAuth setup guide — PR #149, merged
- [x] HTTP deployment guide — PR #150, merged
- [x] Update USAGE.md + README.md for v3.0 — PR #151, merged

### Phase 7: SkillManager Session Context
- [x] Research current SkillManager internal call paths
- [x] Architect session context passthrough
- [x] Implement session-aware skill execution (RBAC bypass fix)
- [x] Tests & lint
- [x] PR #153, reviewed, merged

### Phase 8: Plugin Webhook Subscriptions
- [x] Research current emit-only model
- [x] Architect subscription API for plugins
- [x] Implement plugin event subscriptions (subscribe/unsubscribe)
- [x] Tests & lint
- [x] PR #155, reviewed, merged

### Phase 9: Operational Hardening
- [x] Damage control regex coverage tests — PR #152, merged
- [x] GitHub Actions quota monitoring script — PR #154, merged
- [x] Log rotation boundary tests — PR #156, merged
- [x] Repo audit hook default enablement — PR #156, merged

### Phase 10: Session Wrap & Handoff
- [x] Update next-session.md
- [x] Update progress.md
- [x] Update findings.md
- [x] Create session log
- [x] Final commit

### Phase 11: npm Publish v3.0.0 -- NOT STARTED
- [ ] Verify NPM_TOKEN is configured in repo secrets
- [ ] Tag v3.0.0 on main
- [ ] Push tag to trigger release workflow
- [ ] Verify npm publish succeeds
- [ ] Confirm package available on npmjs.com
