# Research Decisions Log

Durable log for implementation decisions and context-rot prevention.

## Decision Entry Template

```md
### Decision: <title>
- Date:
- Owner:
- Context:
- Options considered:
- Decision:
- Trade-offs:
- Follow-up:
```

## Decision Review Checklist

- [ ] Decision links to concrete file changes
- [ ] Rejected options are captured briefly
- [ ] Trade-offs and risks are explicit
- [ ] Follow-up action has owner or next step

## Initial Entries (This Execution)

### Decision: Sync config mode defaults to dry-run
- Date: 2026-02-24
- Owner: implementer
- Context: Sync script previously relied on implicit behavior and lacked apply gate.
- Options considered: default apply vs default dry-run.
- Decision: Keep safe default dry-run unless `--apply` is explicitly present.
- Trade-offs: Extra flag for write operations, but lower accidental mutation risk.
- Follow-up: Keep docs/scripts explicit (`npm run sync` now passes `--apply`).

### Decision: Invalid mode combination exits non-zero
- Date: 2026-02-24
- Owner: implementer
- Context: Flags `--dry-run` and `--apply` can conflict and create ambiguous behavior.
- Options considered: precedence rule vs hard failure.
- Decision: Hard fail with clear error message and non-zero exit code.
- Trade-offs: Slightly stricter CLI UX, but predictable automation behavior.
- Follow-up: Validation test covers failure status and message.

### Decision: Implement only confirmed gap items
- Date: 2026-02-24
- Owner: architect
- Context: Existing docs/tests already covered many orchestration controls; broad rewrites risked duplicating stable content.
- Options considered: full documentation rewrite vs targeted gap-only updates.
- Decision: Apply only evidence-backed gap updates (priority matrix, tracker session log, docs index link, brief decision note).
- Trade-offs: Less visible churn, but stronger continuity and lower context rot risk.
- Follow-up: Revisit matrix statuses in subsequent sessions as new evidence lands.

### Decision: Harden sync mode behavior with explicit apply/dry-run contract
- Date: 2026-02-24
- Owner: implementer
- Context: Priority #15 had a real implementation gap; baseline `npm test` surfaced missing coverage when `test-sync-configs-mode-validation.js` was absent.
- Options considered: keep implicit behavior vs enforce explicit mode handling and test it directly.
- Decision: Implement explicit sync mode behavior (safe dry-run default, explicit `--apply`, invalid-combination guard) and add `test-sync-configs-mode-validation.js`.
- Trade-offs: Slightly stricter CLI expectations, but safer cross-CLI behavior and clearer automation semantics.
- Follow-up: Keep sync mode validation in regular test runs and retain docs evidence mapping in priority matrix.

### Decision: Strengthen dist-path validation with runtime dry-run assertion
- Date: 2026-02-24
- Owner: implementer
- Context: Priority #11 evidence needed stronger runtime proof beyond static/doc alignment.
- Options considered: docs-only clarification vs runtime assertion in validation test.
- Decision: Extend `test-dist-path-validation.js` to assert runtime dry-run behavior for dist path resolution.
- Trade-offs: Minor test complexity increase, but materially stronger confidence in packaged/runtime path correctness.
- Follow-up: Preserve targeted validation in regression checks (`node test-dist-path-validation.js`).

### Decision: Tool-prefix collision policy uses first-registration-wins
- Date: 2026-02-24
- Owner: architect
- Context: Multiple proxied servers can expose the same prefixed tool name during registration.
- Options considered: overwrite existing entry vs fail load vs keep-first-and-skip-duplicates.
- Decision: Keep first registration, skip duplicate registrations, and emit warning plus duplicate-skip summary in proxied-tool logs.
- Trade-offs: Later duplicate tools are not exposed, but tool registry behavior stays deterministic and avoids unsafe silent override.
- Follow-up: Maintain guardrail coverage in `test-tool-prefix-collision-validation.js` and `src/ProxyManager.ts` duplicate log assertions.

### Decision: Voice sidecar smoke test stays runtime-only and provider-independent
- Date: 2026-02-24
- Owner: researcher
- Context: Sidecar validation needed startup/connect/shutdown confidence without brittle external API dependence.
- Options considered: integration test with live ElevenLabs dependency vs local runtime smoke over WebSocket lifecycle only.
- Decision: Validate sidecar runtime startup, socket connect, basic send/flush, and clean shutdown with no external ElevenLabs network dependency.
- Trade-offs: Does not validate live provider synthesis behavior, but improves reliability/speed and keeps CI deterministic.
- Follow-up: Keep smoke coverage anchored in `test-voice-sidecar-smoke-validation.js` and reserve live-provider checks for explicit manual verification.

### Decision: Run CI tests on `push` to `main` in addition to PRs
- Date: 2026-02-24
- Owner: implementer
- Context: PR-only CI left a post-merge verification gap for direct `main` updates.
- Options considered: PR-only trigger vs PR + push-to-main trigger.
- Decision: Keep CI active for both `pull_request` and `push` on `main`.
- Trade-offs: Extra CI runs, but immediate visibility on post-merge regressions.
- Follow-up: Keep trigger contract validated via `test-ci-workflow-validation.js`.

### Decision: Gate releases by `origin/main` ancestry
- Date: 2026-02-24
- Owner: implementer
- Context: Tag-driven release runs can originate from non-main history unless ancestry is checked explicitly.
- Options considered: trust tag source vs enforce ancestry gate in workflow.
- Decision: Add `git merge-base --is-ancestor "$GITHUB_SHA" origin/main` gate in release workflow.
- Trade-offs: Stricter release precondition, but blocks accidental off-branch publication attempts.
- Follow-up: Keep release workflow/docs assertions in `test-npm-release-flow-validation.js`.

### Decision: Fail fast on unresolved env placeholders for child servers
- Date: 2026-02-24
- Owner: implementer
- Context: Silent passthrough of unresolved `${VAR}` values made child-server boot failures harder to diagnose.
- Options considered: best-effort substitution vs explicit fail-fast on missing env keys.
- Decision: Detect unresolved placeholders and throw with server/key-specific diagnostics.
- Trade-offs: Startup fails earlier, but error handling is deterministic and actionable.
- Follow-up: Preserve validation in `test-unresolved-env-placeholder-validation.js` and troubleshooting docs.

### Decision: Support preserve/force entry policy in sync apply mode
- Date: 2026-02-24
- Owner: implementer
- Context: Operators needed explicit control over whether existing MCP config entries are retained or overwritten.
- Options considered: always overwrite vs preserve default with explicit force override.
- Decision: Preserve existing entries by default, allow overwrite via `--force`, and reject conflicting entry flags.
- Trade-offs: More explicit flags, but safer default behavior and clearer operator intent.
- Follow-up: Keep regression coverage in `test-sync-configs-preserve-force-validation.js`.

### Decision: Enforce submodule cleanliness as a CI guardrail
- Date: 2026-02-24
- Owner: implementer
- Context: Submodule pointer drift/dirty states can break reproducibility after merges.
- Options considered: manual checks only vs CI-enforced cleanliness check in both build/test jobs.
- Decision: Run `scripts/validate-submodule-cleanliness.js` in CI jobs with recursive submodule checkout.
- Trade-offs: CI fails earlier on repo hygiene issues, but prevents ambiguous submodule state from landing.
- Follow-up: Keep workflow/script assertions in `test-submodule-commit-order-guard-validation.js`.

### Decision: Manual release dispatch requires explicit dependency-chain confirmation
- Date: 2026-02-24
- Owner: implementer
- Context: Manual `workflow_dispatch` releases can bypass normal merge sequencing unless operator intent is explicitly gated.
- Options considered: allow manual dispatch without guard vs require a dedicated completion input.
- Decision: Add `chain_complete` boolean gate and block manual release unless `chain_complete=true`.
- Trade-offs: One extra manual confirmation step, but significantly lower risk of releasing before dependent PR chain completion.
- Follow-up: Preserve assertions in `.github/workflows/release.yml` and `test-npm-release-flow-validation.js`.

### Decision: Standardize hook observability via JSONL telemetry stream
- Date: 2026-02-24
- Owner: implementer
- Context: Hook behavior needed durable, append-only operational telemetry for triage without coupling to hook execution success paths.
- Options considered: console-only logs vs file-based structured telemetry.
- Decision: Write sanitized hook events to `~/.evokore/logs/hooks.jsonl` through `scripts/hook-observability.js`.
- Trade-offs: Additional local log footprint, but strong post-run diagnostics and replayability across hook phases.
- Follow-up: Maintain coverage in `hook-test-suite.js` and `hook-e2e-validation.js` for event creation and stability.

### Decision: Enforce next-session freshness guard in baseline validation
- Date: 2026-02-25
- Owner: architect
- Context: `next-session.md` can become stale and degrade handoff quality during orchestration continuation.
- Options considered: manual freshness checks vs automated age validation in test suite.
- Decision: Treat `test-next-session-freshness-validation.js` as required freshness guard evidence for orchestration docs continuity.
- Trade-offs: Requires timely date maintenance, but prevents stale session-handoff state from persisting unnoticed.
- Follow-up: Keep freshness guard listed in docs validation anchors and orchestration evidence.

### Decision: Validate tracker evidence paths as repo-relative, in-repo, and existing files
- Date: 2026-02-25
- Owner: implementer
- Context: Priority matrix evidence drift or invalid paths can silently break tracker reliability.
- Options considered: ID/status-only tracker checks vs deep evidence-token path validation.
- Decision: Keep evidence-path integrity checks in `scripts/validate-tracker-consistency.js` and failure coverage in `test-tracker-consistency-validation.js`.
- Trade-offs: Slightly stricter docs maintenance, but deterministic detection of broken/escaped/missing evidence paths.
- Follow-up: Preserve evidence-path summary/failure assertions in tracker consistency test flow.

### Decision: Use docs-wide internal markdown link crawl as canonical docs integrity guard
- Date: 2026-02-25
- Owner: researcher
- Context: Point checks on selected docs miss broken links introduced in less-touched markdown files.
- Options considered: validate only docs index links vs recursively crawl internal markdown links across docs/readme/contributing.
- Decision: Rely on `test-docs-canonical-links.js` recursive crawl and canonical alias mapping as docs-wide integrity evidence.
- Trade-offs: Broader crawl can surface more failures, but catches regressions earlier and improves docs durability.
- Follow-up: Keep docs link guard in default `npm test` chain and matrix evidence notes.

### Decision: Add targeted Windows CI runtime confidence job
- Date: 2026-02-25
- Owner: architect
- Context: Linux-only CI cannot prove runtime command invocation behavior specific to Windows.
- Options considered: rely on static/unit docs checks vs add dedicated Windows CI runtime job.
- Decision: Maintain `.github/workflows/ci.yml` `windows-runtime` job running `test-windows-exec-validation.js` and `test-windows-command-runtime-validation.ts`.
- Trade-offs: Additional CI runtime/cost, but materially higher confidence in Windows command resolution behavior.
- Follow-up: Keep p11 evidence and notes explicitly anchored to the Windows job and runtime tests.

### Decision: Make active PR chain continuity explicit in handoff docs
- Date: 2026-02-25
- Owner: documentation-agent
- Context: p15 context-rot risk increases when continuation handoffs imply PR ordering instead of stating it directly.
- Options considered: keep chain continuity implicit in scattered references vs state the active chain explicitly in handoff-facing docs.
- Decision: Use explicit dual-chain notation: p-chain `#30 -> #31 -> #32 -> #33` and context-rot chain `#34 -> #35 -> #36 -> #37 -> #38`, with heads `#33` and `#38` respectively.
- Trade-offs: Slight duplication across docs, but lower ambiguity and safer multi-session orchestration continuity.
- Follow-up: Keep next-session/tracker/matrix/session-log chain references synchronized on future follow-up passes.

### Decision: Require workflow run-id evidence in release handoffs
- Date: 2026-02-25
- Owner: implementer
- Context: Release handoffs that cite only "successful dispatch" can drift or become ambiguous across multiple runs on the same workflow.
- Options considered: keep narrative-only release status vs require immutable run evidence (`run_id` + URL).
- Decision: Require release handoff entries to include workflow run ID and HTML URL as primary evidence for guarded release execution.
- Trade-offs: Slightly more handoff bookkeeping, but materially stronger traceability and lower context-rot risk.
- Follow-up: Keep run evidence captured in `next-session.md` and release session logs for each manual dispatch.

### Decision: Normalize cooldown keys from tool name plus arguments
- Date: 2026-03-06
- Owner: implementer
- Context: Proxy cooldown behavior needed to distinguish repeated failures for the same logical invocation without over-collapsing unrelated tool calls.
- Options considered: tool-name-only cooldown keys vs normalized tool+args keys with repeated-failure state.
- Decision: Track cooldown state using normalized tool name plus stable arguments so repeated identical failures share state while different invocations remain independent.
- Trade-offs: Slightly more state bookkeeping, but better retry isolation and more accurate cooldown enforcement.
- Follow-up: Preserve regression coverage in `test-proxy-cooldown.js` and `test-proxy-server-errors.js`.

### Decision: Keep dynamic discovery legacy-by-default with exact-name compatibility
- Date: 2026-03-06
- Owner: architect
- Context: Dynamic tool discovery reduces prompt/tool payload size, but an immediate global switch risked surprising existing clients and breaking direct exact-name flows.
- Options considered: force dynamic mode globally vs legacy-by-default rollout with opt-in dynamic behavior.
- Decision: Keep legacy listing as the default posture, introduce dynamic discovery as an MVP path, and preserve exact-name compatibility so hidden proxied tools remain callable directly after lookup.
- Trade-offs: Discovery gains are not universal on day one, but rollout risk stays low and compatibility remains high.
- Follow-up: Keep validation anchored in `src/ToolCatalogIndex.ts`, `test-tool-discovery-validation.js`, and `tests/helpers/mock-tool-discovery-server.js`.

### Decision: Make benchmark artifacts deterministic and require `--output` parity
- Date: 2026-03-06
- Owner: implementer
- Context: Discovery benchmarking needed a durable artifact contract suitable for docs, regressions, and repeated local comparisons.
- Options considered: timing-only console output vs deterministic JSON artifact with optional saved output.
- Decision: Emit deterministic JSON (including stable `generatedAt`) to stdout, support `--output`, and require saved artifact content to match stdout exactly.
- Trade-offs: Slightly less real-time metadata realism, but significantly better reproducibility and artifact-based validation.
- Follow-up: Maintain contract checks in `scripts/benchmark-tool-discovery.js` and `test-tool-discovery-benchmark-validation.js`.

### Decision: Keep live voice validation opt-in with playback disabled artifact capture
- Date: 2026-03-06
- Owner: researcher
- Context: Live provider coverage was useful for maintenance confidence, but unconditional execution would make default validation depend on external credentials/audio playback.
- Options considered: always-on live provider validation vs explicit opt-in live validation with safe runtime flags.
- Decision: Gate live voice validation behind `EVOKORE_RUN_LIVE_VOICE_TEST=1`, disable playback with `VOICE_SIDECAR_DISABLE_PLAYBACK=1`, and capture artifacts through `VOICE_SIDECAR_ARTIFACT_DIR`.
- Trade-offs: Default runs do not prove provider availability, but the suite remains deterministic and operators still have a repeatable live-validation path when credentials are available.
- Follow-up: Keep manual/opt-in coverage in `package.json` (`test:voice:live`) and `test-voice-sidecar-live-validation.js`.
