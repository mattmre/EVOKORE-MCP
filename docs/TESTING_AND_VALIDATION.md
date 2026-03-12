# Testing and Validation

EVOKORE has a broad validation surface covering runtime behavior, docs integrity, voice/hook paths, Windows command handling, release flow, and governance continuity.

## Validation philosophy

The repo uses targeted script-based validations instead of a single hidden test harness. That makes it easier to run a narrow check for one subsystem while still keeping `npm test` as the broad regression gate.

## Main entrypoints

| Command | Purpose |
|---|---|
| `npm run build` | compile TypeScript to `dist/` |
| `npm test` | broad regression pass across runtime, docs, hooks, discovery, release, and governance checks |
| `npm run benchmark:tool-discovery` | benchmark discovery/listing contract |
| `npm run test:voice:live` | opt-in live ElevenLabs validation |

## Test surface by subsystem

### Router, proxying, and runtime contracts

Representative checks:

- `e2e-test.js`
- `test-hitl.js`
- `test-hitl-hardening.js`
- `test-proxy-cooldown.js`
- `test-proxy-server-errors.js`
- `test-tool-prefix-collision-validation.js`
- `test-env-sync-validation.js`
- `test-unresolved-env-placeholder-validation.js`
- `test-version-contract-consistency.js`
- `test-damage-control-validation.js`

What they cover:

- proxied tool routing
- HITL security behavior
- cooldown handling
- duplicate prefix safety
- env interpolation failures
- README/runtime/version contract consistency
- expanded shell/path safety coverage in `damage-control-rules.yaml`

### Skill and workflow surface

- `test-skill-manager.js`
- `test-regex-frontmatter-standardization.js`

What they cover:

- skill indexing
- frontmatter parsing robustness
- workflow retrieval assumptions

### Tool discovery and benchmark surface

- `test-tool-discovery-validation.js`
- `test-tool-discovery-benchmark-validation.js`
- `test-skill-indexing-validation.js`
- `test-skill-perf-monitoring.js`

What they cover:

- `legacy` vs `dynamic` listing behavior
- session activation expectations
- exact-name compatibility
- recursive skill indexing coverage
- performance telemetry and search envelope checks
- deterministic benchmark JSON output
- `--output` artifact parity
- optional `--live-timings` behavior

### Operator continuity and repo hygiene surface

- `test-session-continuity-validation.js`
- `test-auto-memory-validation.js`
- `test-status-line-validation.js`
- `test-repo-state-audit-validation.js`

What they cover:

- canonical session manifest behavior
- managed Claude memory sync
- continuity-backed status rendering
- repo-state audit parsing and report shape

### Voice and hook surface

- `hook-test-suite.js`
- `hook-e2e-validation.js`
- `test-hook-observability-hardening.js`
- `test-voice-e2e-validation.js`
- `test-voice-refinement-validation.js`
- `test-voice-sidecar-smoke-validation.js`
- `test-voice-sidecar-hotreload-validation.js`
- `test-voice-sidecar-live-validation.js`
- `test-voice-contract-validation.js`
- `test-voice-windows-docs-validation.js`

What they cover:

- hook observability JSONL behavior
- voice-hook forwarding expectations
- VoiceSidecar runtime startup/shutdown
- hot-reload behavior for `voices.json`
- live provider validation gate
- Windows voice documentation contract

### Docs, governance, and continuity surface

- `test-docs-canonical-links.js`
- `test-ops-docs-validation.js`
- `test-hitl-token-docs-validation.js`
- `test-next-session-freshness-validation.js`
- `test-tracker-consistency-validation.js`
- `test-pr-metadata-validation.js`
- `test-release-doc-freshness-validation.js`
- `test-submodule-doc-workflow.js`

What they cover:

- internal doc links
- required docs references
- HITL guidance wording
- freshness of `next-session.md`
- tracker evidence integrity
- PR metadata expectations
- release doc freshness
- submodule workflow documentation

### Windows and platform-specific runtime checks

- `test-windows-exec-validation.js`
- `test-windows-command-runtime-validation.ts`

What they cover:

- `npx` -> `npx.cmd` remapping on Windows
- no automatic remap for `uv` / `uvx`
- runtime path-resolution expectations

## Targeted commands by task

| Task | Suggested command |
|---|---|
| Validate dynamic discovery | `node test-tool-discovery-validation.js` |
| Validate benchmark contract | `node test-tool-discovery-benchmark-validation.js` |
| Validate docs links | `node test-docs-canonical-links.js` |
| Validate HITL doc wording | `node test-hitl-token-docs-validation.js` |
| Validate hook observability | `node hook-e2e-validation.js` |
| Validate VoiceSidecar smoke path | `node test-voice-sidecar-smoke-validation.js` |
| Validate Windows command behavior | `node test-windows-exec-validation.js` |
| Validate version/runtime/doc consistency | `node test-version-contract-consistency.js` |
| Validate damage-control policy expansion | `node test-damage-control-validation.js` |
| Validate PR metadata/runbook contract | `node test-pr-metadata-validation.js` |
| Validate submodule cleanliness guardrails | `node test-submodule-commit-order-guard-validation.js` |
| Audit live repo state before a session | `npm run repo:audit` |

## CI and release validations

### CI

The repository includes CI coverage for:

- regular build/test execution
- PR metadata validation
- submodule cleanliness validation
- Windows runtime checks

Recent governance hardening reflected in docs and validation includes:

- PR metadata validation
- tracker consistency validation
- next-session freshness validation
- docs link validation
- submodule cleanliness guardrails

### Release flow

Release-related checks include:

- `node test-npm-release-flow-validation.js`
- `node test-release-doc-freshness-validation.js`

Current release expectations include:

- release workflow must remain aligned with docs
- manual release dispatch requires `chain_complete=true`
- release commit must be on `origin/main`
- publish requires `NPM_TOKEN`

See [RELEASE_FLOW.md](./RELEASE_FLOW.md) for the operator runbook.

## Benchmark and artifact validations

For discovery benchmarking:

```bash
npm run benchmark:tool-discovery
node scripts/benchmark-tool-discovery.js --output artifacts/tool-discovery-benchmark.json
node scripts/benchmark-tool-discovery.js --live-timings
```

Interpretation:

- default output is the durable artifact contract
- `--output` is for saving that same artifact
- `--live-timings` is for manual/local diagnostics, not stable artifact comparison

## Live validation gates

Some checks are intentionally opt-in.

### Live voice provider validation

```bash
EVOKORE_RUN_LIVE_VOICE_TEST=1 ELEVENLABS_API_KEY=your_key_here npm run test:voice:live
```

Why gated:

- avoids requiring external credentials in default runs
- avoids unexpected local playback during normal regression passes
- keeps default CI/local runs deterministic

## Documentation-aware validation

Several tests assert wording or link presence, so doc changes should preserve required operator contracts.

Be especially careful with:

- `README.md` top-level heading
- HITL token guidance in `USAGE.md` and `TROUBLESHOOTING.md`
- VoiceMode Windows guidance
- docs portal references in `docs/README.md`
- legacy canonical mapping references for `/docs/architecture.md` and `/docs/workflows.md`

## Recommended maintainer flow

1. Make the change.
2. Run `npm run build`.
3. Run the smallest targeted validation for the touched subsystem.
4. If the change is broad, run `npm test`.
5. Update docs and continuity artifacts when behavior changes.

## Related docs

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [SETUP.md](./SETUP.md)
- [TOOLS_AND_DISCOVERY.md](./TOOLS_AND_DISCOVERY.md)
- [VOICE_AND_HOOKS.md](./VOICE_AND_HOOKS.md)
- [RESEARCH_AND_HANDOFFS.md](./RESEARCH_AND_HANDOFFS.md)
