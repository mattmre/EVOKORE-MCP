---
name: pr-merge-platform-wiring-findings
description: Findings and decisions from the PR merge and platform wiring sprint.
---

# Findings & Decisions

## Session: 2026-03-15 — PR Merge & Platform Wiring Sprint

### PR #134 Code Review Findings
- **HMAC timing attack**: No `timingSafeEqual` helper provided for webhook signature verification. Fixed with `verifySignature()` static method.
- **Argument leakage**: Tool arguments (including approval tokens, credentials) were sent unredacted to external webhook endpoints. Fixed with `redactSensitiveArgs()`.
- **Secret exposure**: `getWebhooks()` returned raw webhook secrets. Fixed to return `hasSecret: boolean`.
- **URL validation**: No scheme validation — ftp://, file:// URLs accepted. Fixed to HTTP/HTTPS only.
- **Double-resolve**: Promise in `deliver` method could resolve twice. Fixed with `settled` guard.
- **Event semantics**: `tool_call` fired after success, not on invocation. Fixed to emit before execution.

### Architecture Decisions
| Decision | Rationale |
|----------|-----------|
| Sequential PR merges | User requested minimal drift between PRs |
| Fresh agent per phase | Prevents context rot across boundaries |
| Research before implementation | Each phase gets dedicated research agent |
| Session-scoped everything | HTTP mode needs isolation: state, auth, RBAC, rate limits |
| Optional parameters for backward compat | All new params default to undefined, falling back to global behavior |
| No middleware framework | Raw `handleRequest` dispatch is sufficient for auth + MCP |
| Emit-only plugin webhooks | Plugins can emit events via `emitWebhook()` but not subscribe (deferred) |
| LRU eviction for sessions | Max 100 sessions with oldest-access eviction, matching prior limit |
| Dual-bucket rate limiting | Session counters override when available, global fallback for stdio |

### Technical Debt Identified
1. Three webhook event types never emitted: `session_end`, `approval_requested`, `approval_granted`
2. OAuthProvider is static-token only — no JWT/JWKS despite CLAUDE.md mention
3. No end-to-end test across the full wired pipeline (HTTP + auth + session + RBAC + rate limit)
4. SkillManager internal calls bypass session context (acceptable but worth noting)
5. No periodic cleanup timer for session counters themselves (only session objects are cleaned)

## Resources
- Session log: `docs/session-logs/session-2026-03-15-pr-merge-platform-wiring.md`
- 5 new research docs in `docs/research/` (dated 2026-03-15)

---

## Session: 2026-03-15 (Part 2) — v3.0.0 Hardening Sprint

### PR #146 Code Review Findings
- **Test isolation**: E2E tests shared server state between cases, causing flaky failures on repeated runs. Fixed with per-test server lifecycle.
- **Assertion accuracy**: Some assertions checked for response existence rather than specific expected values. Tightened to exact match.
- **Cleanup ordering**: Transport teardown occurred before server shutdown, leaving dangling connections. Reordered to server-first.
- **Timeout handling**: Missing timeout configuration on HTTP requests caused tests to hang on failure. Added explicit timeouts.
- **Transport teardown**: Incomplete cleanup of SSE connections in error paths. Added finally blocks.
- **Error message matching**: Assertions used substring matching that could pass on unrelated errors. Switched to exact error code checks.

### SkillManager RBAC Bypass
- Internal tool calls from `docs_architect` and `skill_creator` native tools delegated to SkillManager without passing session role context.
- This meant skill execution from these tools bypassed RBAC permission checks entirely.
- Fix: Session context (including role) now flows through to SkillManager on all internal call paths.
- Impact: Low (only affects HTTP multi-tenant mode where RBAC is active), but a correctness gap.

### Damage Control Regex Analysis
- 29 rules validated with both positive match and negative (should-not-match) cases.
- Fork bomb regex was previously fixed (from `:(\\){0}){2,}` to `:\(\)\s*\{`), now covered by dedicated tests.
- **DC-21 risk**: Rule matching `chmod.*777` could false-positive on documentation strings mentioning the pattern. Acceptable trade-off for security.
- **DC-12 risk**: Rule matching `curl.*\|.*sh` could catch legitimate curl-to-file piped through shell inspection. Low practical risk in MCP context.

### Plugin Webhook Subscriptions
- Previous model was emit-only: plugins could fire events via `emitWebhook()` but could not listen.
- Extended with `subscribe(eventType, handler)` and `unsubscribe(eventType, handler)` on PluginContext.
- Handlers receive the same payload shape as external webhook endpoints (minus HMAC signature).
- Design decision: subscriptions are in-process callbacks, not HTTP. This avoids plugins needing to run their own HTTP servers.

### Repo Audit Hook Default Enablement
- Previously opt-in via `EVOKORE_REPO_AUDIT_HOOK=true` environment variable.
- Changed to enabled-by-default: runs unless `EVOKORE_REPO_AUDIT_HOOK=false` is explicitly set.
- Rationale: The hook catches branch drift and stale worktrees early. The cost of a false negative (missing drift) outweighs the cost of one extra check per session.

### Architecture Decisions (Session 2)
| Decision | Rationale |
|----------|-----------|
| In-process plugin subscriptions | Avoid HTTP overhead; plugins are already loaded in-process |
| Repo audit hook default-on | Drift detection value exceeds startup cost |
| Session context passthrough | RBAC must apply uniformly regardless of call origin |
| Boundary tests for log rotation | Edge cases (exact size, off-by-one) are where rotation bugs hide |

### Technical Debt Remaining
1. npm publish v3.0.0 not yet executed (tag + push pending)
2. STT voice input implementation deferred to v3.1.0
3. Live Supabase integration test not yet written
4. No performance benchmarks for the full wired HTTP pipeline

## Resources
- Session log: `docs/session-logs/session-2026-03-15-v3-hardening-sprint-2.md`

---

## Session: 2026-03-19 — Release Validation Entry Points

### Queue and Workflow State
- Live GitHub check on `2026-03-19` still shows `0` open PRs, so the requested PR-review/fix/merge loop is blocked by workflow state rather than access/tooling.
- The next actionable work is release-readiness hardening, not PR comment triage.

### Concrete Defects Found
- `npm run release:check` was broken because `package.json` ran `test-npm-release-flow-validation.js` with plain `node` even though that file uses Vitest globals (`test(...)`).
- `node test-docs-canonical-links.js` and `node test-ops-docs-validation.js` fail for the same reason, so active docs/runbooks were still pointing operators at invalid commands.
- `.github/workflows/release.yml` still used `actions/setup-node@v3` with `18.x`, while `package.json` requires `node >=20` and CI already runs on Node 20.

### Execution Constraints
- `OPENAI_API_KEY`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `EVOKORE_DASHBOARD_USER`, and `EVOKORE_DASHBOARD_PASS` are all absent in the current shell, so the production validations listed in `next-session.md` remain credential-gated.
- `v3.0.0` publish is still an operator action, not a PR slice: it depends on verifying `NPM_TOKEN` and then pushing a tag or running the release workflow manually.

### Decisions
- Normalize release/docs validations behind package-level entrypoints (`npm run release:check`, `npm run docs:check`) rather than relying on raw direct invocation of individual test files.
- Treat Node-version alignment in the release workflow as part of the same slice because it directly affects publish safety and should be covered by the release validator.

### New Research Artifact
- `docs/research/release-validation-entrypoints-2026-03-19.md`

---

## Session: 2026-03-19 (Part 2) — Sequential Backlog Re-entry

### Queue and Branch State
- GitHub still reports `0` open PRs, so there are no live PR comments to review or respond to.
- The working branch `fix/release-validation-entrypoints-20260319` is stale rather than pending: its two commits correspond to already-landed `origin/main` commits `91e1d83` (`#172`) and `e2b8356` (`#173`).
- Result: do not spend more review/fix/merge effort on the stale branch; start the next sequential slice from fresh `main`.

### Next Executable Slice
- The next credential-free slice is registry validation, matching the tracked follow-on order in `task_plan.md`.
- Current coverage is heavily source/schema oriented:
  - `tests/integration/registry-manager.test.ts`
  - `tests/integration/skill-registry.test.ts`
  - legacy `test-remote-skill-registry-validation.js`
- Missing coverage is behavioral: local registry config + HTTP fetch + parsed results + formatting/caching through a realistic execution path.

### Concrete Registry Gap Identified
- `SkillManager.handleToolCall('list_registry', ...)` uses `RegistryManager.fetchRegistry()`, which supports flat arrays, `skills`, and canonical `{ entries: [...] }` indexes.
- `SkillManager.listRegistrySkills()` does **not** share that parsing path. It only handles flat arrays or `{ skills: [...] }`, so canonical `{ entries: [...] }` registries are silently dropped in that public method.
- A local/mock-registry validation slice should unify that behavior and add end-to-end tests so future registry format drift is caught.

---

## Session: 2026-03-19 (Part 3) — Registry Validation Harness

### Runtime Findings
- `SkillManager` now honors `EVOKORE_MCP_CONFIG_PATH`, matching `ProxyManager`, so temp-config tests and runtime overrides resolve the same config source.
- `listRegistrySkills()` no longer reimplements registry fetching/parsing; it uses the same `RegistryManager`-backed path as the `list_registry` tool.
- Relative registry entry URLs are normalized before user-facing output, which prevents relative URLs from leaking into `list_registry` results.
- Canonical registry indexes using `{ entries: [...] }` are now supported consistently across both listing surfaces.

### Docs Findings
- Active docs had drifted to showing `skillRegistries` as a string array of URLs.
- Runtime actually expects registry objects with `name`, `baseUrl`, and `index`.
- `docs/USAGE.md`, `docs/SETUP.md`, and `docs/MIGRATION_V2_TO_V3.md` were updated to match the real schema.

### Validation Findings
- Targeted registry suite after implementation: `91` passing tests across 3 files.
- Full suite after implementation: `115` files, `1629` passing tests, `3` skipped (`1632` total).
- Post-merge validation on `main` passed for:
  - `npm run build`
  - targeted registry suite
  - `npm run docs:check`

### PR / Merge Outcome
- PR `#174` opened from `fix/registry-validation-harness-20260319`
- Self-review found one worthwhile residual risk: base URLs with path prefixes were not yet covered in runtime tests
- Follow-up commit `aea250a` added that coverage before merge
- PR `#174` merged to `main` as `32bee20`

---

## Session: 2026-03-20 — PR Manager Re-entry

### Live Queue Findings
- GitHub still reports `0` open PRs on `2026-03-20`, so there are no live PR comments to review, no open PRs to fully review, and no active PR branches to patch/push.
- The requested PR-manager workflow is therefore blocked by repo state rather than by repository access or GitHub tooling.

### Repo State Findings
- The root worktree is still on stale branch `fix/registry-validation-harness-20260319...origin/fix/registry-validation-harness-20260319 [gone]`.
- The current dirty state is concentrated in control-plane tracker docs (`CLAUDE.md`, `next-session.md`, `task_plan.md`, `findings.md`, `progress.md`) plus untracked historical research/session-log artifacts.
- Because shared trackers should stay out of feature-branch commits, implementation should not start from this stale dirty branch without first isolating the next code slice onto fresh `main`-based history or an equivalent clean worktree.

### Execution Decision
- The first executable remaining item is still the credential-free `FileSessionStore` restart smoke / operator evidence slice from `next-session.md`.
- Open-PR review/fix/merge work should be resumed only if new PRs are opened after that slice or if the historical PR-review audit leads to a deliberate retroactive comment pass.

### FileSessionStore Slice Scoping
- `FileSessionStore` persistence and `SessionIsolation.loadSession()` already exist, but runtime HTTP request handling does not reattach unknown sessions after restart.
- `src/HttpServer.ts` currently rejects unknown `mcp-session-id` values with `404`, and the new slice should not silently broaden that runtime contract.
- The smallest safe PR-sized change is therefore restart smoke and operator evidence at the store/isolation layer only, not live HTTP restart recovery.

### PR / Merge Outcome
- PR `#175` opened from `fix/file-session-store-restart-smoke-20260320`
- No blocking findings were identified in local review of the narrow-scope test/docs diff
- All GitHub checks passed on `#175`
- PR `#175` merged to `main` as `a3d05b0`

### Durable Learning
- `FileSessionStore` restart evidence now exists at the storage/isolation layer, but `loadSession()` is still not wired into `HttpServer`.
- Future work must not overstate this slice as runtime session recovery; after process restart, unknown HTTP `mcp-session-id` values still return `404`.

### Historical Review Coverage Recommendation
- Decision: treat the current audit artifact as sufficient historical coverage.
- Rationale: all `117` PRs in scope already have at least one PR comment, there are `0` open PRs left to act on, and backfilling retroactive comments across `88` already-merged/closed PRs would create high review noise with little corrective value unless a policy or stakeholder explicitly requires formal post-hoc review artifacts.

### Release Readiness Findings
- `git tag --list v3.0.0` returned no existing release tag.
- `gh secret list` returned no repository secrets in the current environment, so `NPM_TOKEN` could not be verified and should be treated as missing/unconfirmed for the publish workflow.
- Result: the next release step is blocked on operator-side secret verification and tag creation rather than on any remaining implementation work.

---

## Session: 2026-03-20 (Part 2) — Repo Hygiene Cleanup

### Cleanup Findings
- The dirty root handoff worktree was safely moved off obsolete branch `fix/registry-validation-harness-20260319` onto fresh `origin/main`-based branch `chore/control-plane-wrap-20260320`.
- The raw root Stitch import (`mcp.config.json` edits plus `SKILLS/Stitch Skills/`) was duplicate state, not the branch of record. The cleaned version already lives on PR `#176`, so the root copy was removed instead of cherry-picked.
- Confirmed already-landed local branches were deleted safely after branch ancestry / merged-state verification. The local branch set is now down to `main`, the active Stitch PR branch, and the new control-plane branch.
- Post-cleanup `npm run repo:audit` reports no stale local branch candidates and only intentional control-plane drift.

### Live PR Finding
- PR `#176` is open and mergeable, but it is not merge-ready yet: GitHub reports failing `Test Suite (shard 2/3)` and `Test Suite (shard 3/3)` checks.
- That makes PR `#176` the next real execution target before release publish work.
- The control-plane preservation branch was published separately as PR `#177` so tracker/session-log history can be reviewed and merged without mixing it into the Stitch feature branch.
- PR `#177` fails the same shard-2 CI job, which shows the blocker is on current `main` lineage rather than in either PR diff.

### CI Root Cause Captured
- `gh run view 23358331871 --log-failed` for PR `#177` shows the failing test is `tests/integration/session-store.test.ts > restart smoke restores persisted state through a fresh store and isolation instance`.
- The concrete error is Linux `ENOENT` on rename:
  - `restart-smoke.json.tmp` -> `restart-smoke.json`
  - thrown from `FileSessionStore.set` via `SessionIsolation.persistSession`
- Because the same failure appears on both PR `#176` and PR `#177`, the next fix should be a dedicated `main`-based slice for `FileSessionStore` atomic write behavior or test hardening, not an ad hoc change inside either existing PR.

### Durable Learning
- When the root control plane contains only tracker/research/session-log drift, preserve it on a dedicated `chore/control-plane-*` branch or PR before deleting stale branches.
- If a copied skill pack or sidecar integration has already been normalized into a clean feature PR, remove the duplicate raw root copy during repo cleanup instead of trying to carry both versions forward.
