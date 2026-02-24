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
