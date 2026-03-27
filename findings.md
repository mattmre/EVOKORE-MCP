# Findings

## Session 3: Slice S3.4 / S3.5 Review Closure

### PR #209 Review Outcome
- The only actionable finding on the open wrap PR was semantic drift in the handoff docs: `next-session.md` and the new wrap log were written from the "PR still open" perspective and would have become stale immediately after merge.
- That was corrected in commit `4ec7226` before PR `#209` merged as `8dc1ad4`.
- Fresh CI on `#209` went green after the fix, and clean merged-main validation passed locally afterward.

### Post-M3 ARCH-AEP Review Result
- The new review artifact is `docs/research/arch-aep-post-m3-review-2026-03-27.md`.
- Verdict: **PASS with follow-up queue**.
- No blocking contract, privacy, governance, or operational regressions were identified across M3.1 through M3.4.

### Explicit Follow-Up Queue Confirmed By Review
- Prometheus `/metrics` pull endpoint remains a deliberate follow-up to telemetry export, not a hidden regression in M3.
- Dashboard approve-over-WebSocket remains a deliberate follow-up to the live approval-event channel, not a broken approval contract.
- Audit event export remains intentionally separate from aggregate telemetry export.
- Sandbox hardening beyond the landed container isolation (`seccomp`, image pre-pull, per-language limits) remains a queued follow-up, not unfinished M3 scope.

## Session 3: Post-Roadmap Remaining Work

### Current Execution Constraint
- GitHub currently shows `0` open PRs, so the requested "review all open PR comments" workflow cannot run as written.
- The next executable path is to create fresh sequential PR slices for the remaining items captured in `next-session.md`.

### Highest-Priority Remaining Work
- `next-session.md` identifies the post-M2 F1 finding as Priority 0: wire `redactForAudit()` into audit log call sites in `src/index.ts` and `src/HttpServer.ts`, or explicitly document the current sites as known-safe.
- The post-M2 ARCH-AEP review states F1 is the condition for full pass and describes it as a medium-severity gap between documented redaction guarantees and runtime behavior.

### Planning / Documentation Drift
- `next-session.md` says the full M0-M3 roadmap is complete on `main`, with no open PRs and v3.1.0 released on GitHub but npm publish still pending.
- `docs/research/revised-roadmap-2026-03-26.md` still marks M0-M4 as `pending` and uses the older pre-implementation baseline.
- `CLAUDE.md` still contains at least one older continuity note saying HTTP session reattachment is not wired into `HttpServer`, which conflicts with the merged M1.1 implementation summary.
- Result: documentation synchronization is itself a remaining slice after the highest-risk code gap is handled.

### Remaining Queue Shape
- Immediate code slice: F1 audit redaction wiring / safety documentation.
- Immediate ops slice: release closure (`NPM_TOKEN`, rerun preflight, decide publish path).
- Immediate docs/review slice: post-M3 ARCH-AEP artifact + roadmap/handoff/CLAUDE sync.
- Lower-priority follow-ups: Prometheus pull metrics endpoint, approve-over-WebSocket, audit event export, sandbox seccomp/resource hardening.

### Slice S3.1 Research Decision
- A documentation-only closure is not defensible. The current source really does export/test `redactForAudit()` without wiring it into the real audit persistence path.
- The lowest-drift fix is to centralize redaction in `AuditLog.write()` rather than patching each `auditLog.log()` call site separately.
- This covers both current metadata-bearing writes and any future direct `write()` callers.

### Slice S3.1 Validation Notes
- Targeted validation passed for the slice:
  - `npx vitest run tests/integration/internal-telemetry-validation.test.ts`
  - `npm run build`
- PR `#207` also passed all GitHub CI/security checks after push.
- A separate clean-checkout local `npm test` run on merged `origin/main` still fails on `test-worktree-cleanup-validation.js`.
- Result: S3.1 itself is validated and merged, but a separate local-main stabilization slice is still needed before claiming a fully green local baseline.

### Slice S3.1 Final Outcome
- PR `#207` merged to `main` as `03a31b4`.
- There were no actionable PR comments and no blocking code-review findings in the patch.
- GitHub does not allow self-approval, so the review result was recorded as a standard PR comment instead of an approval review.

### New Highest-Priority Stabilization Finding
- Clean `origin/main` still fails full local `npm test` on `test-worktree-cleanup-validation.js`.
- The failure is unrelated to the audit-redaction diff and therefore should be handled as a separate stabilization slice.
- The root dirty checkout already contains an uncommitted edit to that same file, so the next slice must compare current local drift against `main` deliberately rather than overwrite it casually.

## Session 3: Slice S3.2 Outcome

### PR Outcome
- Slice S3.2 was handled on PR `#208`.
- The effective diff against current `main` was the single-file `node --check` fix in `test-worktree-cleanup-validation.js`, even though the PR thread still referenced the earlier F1 context from the recycled branch.
- PR `#208` merged successfully as `2a84de2`.

### Review Outcome
- No blocking findings: `node --check` is the correct syntax-validation model for the CommonJS/shebang CLI script under test.
- Targeted local validation passed:
  - `npx vitest run test-worktree-cleanup-validation.js`
  - `npm run build`
- PR `#208` also had green CI/security checks before merge.

### Baseline Validation Result
- After S3.2 landed, full local `npm test` passed in the clean slice worktree.
- Result: the local baseline is green again, so the next sequential work can move back to release closure and docs/review follow-up rather than firefighting test stability.

## Session 3: Slice S3.3 Release Status

### Release-State Findings
- `npm run release:preflight` passes on clean `origin/main` except for:
  - blocking: git tag `v3.1.0` already exists
  - warning: `NPM_TOKEN` not found in GitHub secrets
- `gh release view v3.1.0` confirms the GitHub release already exists and was published on `2026-03-26`.
- `npm view evokore-mcp version` returns `404 Not Found`, so the package is not published on npm.

### Decision
- S3.3 is operator-gated, not code-gated.
- The next executable engineering slice should therefore move to docs/control-plane synchronization while release publication waits on secret verification/operator action.

## Current Repo State
- Local checkout is on `main` tracking `origin/main`; only the local planning files (`task_plan.md`, `progress.md`, `findings.md`) are modified and intentionally uncommitted.
- All previously open implementation PRs `#186` through `#190` are now merged; the only open PR is the control-plane/session-wrap handoff PR `#209`.
- No previous-session catchup artifact was available from the `planning-with-files` script path referenced by the skill; using local planning files directly.

## Initial Sequencing Decision
- Handle feature PRs before the session-wrap PR.
- Preserve `next-session.md` and session-log updates until feature PR outcomes are known to avoid control-plane drift and tracker conflicts.

## Guardrails
- Use sequential handling to minimize PR drift between related validation PRs.
- Prefer fresh sub-agents per PR as requested; dispose of each after its scoped task is complete.
- Re-run validation after rebases/merges where shared surfaces change.

## Open PR Review Inventory
- `#186` has 3 actionable review comments in [tests/integration/tts-openai-compat-validation.test.ts](/D:/GITHUB/EVOKORE-MCP/tests/integration/tts-openai-compat-validation.test.ts): hoist repeated `require`, tighten a broad env-var regex, and replace two broad assertions with one precise console-error regex.
- `#187` has 2 actionable review comments in [tests/integration/voice-sidecar-playback-queue-validation.test.ts](/D:/GITHUB/EVOKORE-MCP/tests/integration/voice-sidecar-playback-queue-validation.test.ts): avoid fixed-length source slicing and relax a brittle `try/catch` regex assertion.
- `#188` has 4 actionable review comments in [tests/integration/stt-whisper-validation.test.ts](/D:/GITHUB/EVOKORE-MCP/tests/integration/stt-whisper-validation.test.ts): add `vi.resetModules()` in env-sensitive suites, remove/adjust a misleading unreachable-output-file assertion, and strengthen the `execFileSync` vs `execSync` security check.
- `#189` has 3 actionable review comments in [tests/integration/file-session-store-validation.test.ts](/D:/GITHUB/EVOKORE-MCP/tests/integration/file-session-store-validation.test.ts): add a sanitized-`list()` behavior test, replace fixed `setTimeout` waits with polling, and type `createTestSessionState` with `SessionState`.
- `#190` has 2 review comments plus a failing CI shard. The file comments are doc clarity fixes in [docs/session-logs/session-2026-03-26-v31-roadmap-implementation.md](/D:/GITHUB/EVOKORE-MCP/docs/session-logs/session-2026-03-26-v31-roadmap-implementation.md) and [next-session.md](/D:/GITHUB/EVOKORE-MCP/next-session.md). The failing CI cause is PR metadata validation: missing `Evidence` section in the PR body, not a code failure.

## Merge Risk Notes
- `#190` had to remain last because it documented the feature PR wave and merge order.
- GitHub Actions reruns on `pull_request` reused the original event payload for `#190`, so a PR-body-only repair did not clear metadata validation until a new commit triggered a fresh event.
- Squash merging the five PRs was the lowest-risk option because each PR represented a bounded validation/doc slice and did not need its intermediate review-fix commits preserved on `main`.

## PR #186 Outcome
- Hoisting `OpenAICompatTTSProvider` to the top of the main `describe` is safe because the provider reads env vars in its constructor, not during module evaluation.
- The `#186` patch stayed strictly within the test file and did not alter coverage intent.
- Local validation passed after the patch: targeted Vitest + full TypeScript build.

## PR #187 Outcome
- The review comments pointed at two lines, but the real maintenance risk was broader: the file used many arbitrary `src.slice(... + N)` windows around function bodies.
- Replacing those windows with `extractBlockFromMarker()` materially reduces false negatives when `VoiceSidecar.ts` grows or formatting changes.
- The cleanup assertion is safer as structural ordering (`try` before unlink, `catch` after unlink) than as a whitespace-sensitive regex over the exact `try/catch` text.

## PR #188 Outcome
- The STT branch already had three of the four requested review fixes present locally before this pass; only the earlier `execFileSync` assertion still lagged behind the stronger security expectation.
- Using `vi.resetModules()` in the env-sensitive suites is the right fix because these tests instantiate runtime modules after changing `process.env`.
- The `tmpOutputTxt` existence check was removed from the test suite, which avoids turning a likely unreachable fallback path into a documented contract.

## PR #189 Outcome
- A polling helper is a better fix than simply increasing `setTimeout` values because it keeps the tests deterministic while still surfacing real persistence failures within a bounded timeout.
- Typing `createTestSessionState()` with `SessionState` gives the large validation file compile-time coverage against future interface drift.
- The new sanitized-`list()` assertion documents current runtime behavior without changing production code, which is the right scope for this PR.

## PR #190 Outcome
- The review comments on `#190` were correct, but the actual merge blocker was the GitHub PR body, not the branch files.
- The accurate wording is "no application source code changes," because the merged wave added several new `.ts` test files.
- `scripts/validate-pr-metadata.js` reads the pull request body from the event payload. A rerun of an existing failed job kept using the stale payload, so the fix required a fresh `pull_request` event after the PR body was updated.

## Final Outcome
- Merge order executed as planned: `#186` → `#187` → `#188` → `#189` → `#190`.
- Final integrated validation on merged `main` passed with `121` test files and `2053` passing tests.
- No additional code-review findings remain for this PR wave beyond the GitHub Actions Node 20 deprecation warnings emitted by CI.

## Session 2: Full Roadmap Execution Findings

### M3.1 Redis SessionStore
- `ioredis` as an `optionalDependencies` entry requires `package-lock.json` to be committed — CI uses `npm ci` which enforces lockfile consistency
- Dynamic `await import('ioredis')` keeps the dependency truly optional at runtime

### M3.2 External Telemetry Export
- JSON push with HMAC signing reuses the WebhookManager pattern without adding dependencies
- Double opt-in (EVOKORE_TELEMETRY=true AND EVOKORE_TELEMETRY_EXPORT=true) is the right model for external data emission
- Metrics-only scope (no audit events) avoids PII export concerns

### M3.3 WebSocket HITL
- `ws` library with `noServer: true` integrates cleanly on the existing HTTP server via upgrade handling
- Browser WebSocket clients cannot set custom headers — token in query parameter is the standard workaround
- SecurityManager callback mechanism is cleaner than EventEmitter for the approval bridge
- File-based IPC must remain operational for backward compatibility

### M3.4 Worktree Cleanup
- `new Function(source)` cannot validate Node.js scripts with `require()` — use `node --check` instead
- Default dry-run for destructive operations is critical for safety

### CI Learnings
- PR #205: Adding `optionalDependencies` in package.json without committing the updated lockfile breaks `npm ci` on all CI shards
- PR #206: All 12 checks green on first try when all shared files (index.ts, HttpServer.ts) are on the latest main before branching

## Revised Roadmap Findings
- The remaining backlog was too flat. The correct execution model after Phase 5 is milestone-based, with runtime continuity as the architectural spine.
- Hard dependency chain:
  - HTTP session reattachment before Auto-Memory and dashboard session filtering
  - dashboard auth before real-time WebSocket HITL approvals
  - internal telemetry before external telemetry export
  - canonical session contract before Redis `SessionStore`
- Scope-label correction:
  - dashboard work should be framed as validation/hardening of a partially landed surface, not purely new implementation
  - telemetry export should extend the existing local telemetry and webhook event model, not create a second telemetry concept
- Review-process correction:
  - ARCH-AEP should be a live gate before and after milestone waves, not a retroactive audit habit
  - post-implementation code analysis/review needs to be explicit in the roadmap, not implied
