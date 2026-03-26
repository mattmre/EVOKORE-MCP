# Session Log: Roadmap Reframe (2026-03-26)

## Objective

Replace the flat remaining-items backlog with a milestone-based roadmap that reduces scope drift, clarifies dependencies, and formalizes review loops.

## Why the Reframe Was Needed

- The post-Phase-5 plan was still expressed mostly as a flat feature list
- Multiple remaining items depend on the same continuity/session contract
- ARCH-AEP review and post-implementation code-analysis loops were not explicit phase gates
- The roadmap needed a smaller-context execution shape with clearer PR boundaries

## Key Decisions

1. Reframe the remaining work into milestones instead of a flat backlog
2. Make runtime continuity the architectural spine before scale features
3. Pull review loops into the roadmap itself:
   - Align / Architecture
   - Implementation
   - Prove / Validation
   - ARCH-AEP review and analysis
   - Code review / hardening
   - Merge / stabilization
4. Treat security/governance as a cross-cutting milestone before distributed/runtime expansion

## New Milestone Structure

| Milestone | Theme |
|---|---|
| M0 | Release Closure |
| M1 | Runtime Continuity Platform |
| M2 | Secure Operator Platform |
| M3 | Scale and Real-Time Runtime |
| M4 | Continuous Improvement Loop |

## Dependency Conclusions

- HTTP session reattachment comes before Auto-Memory, dashboard filtering, and Redis session storage
- Dashboard auth comes before real-time WebSocket HITL approvals
- Internal telemetry and auditability should precede external telemetry export
- Container sandbox isolation should land before broader trust expansion

## Artifacts Updated

- `docs/research/revised-roadmap-2026-03-26.md`
- `next-session.md`

## Outcome

The roadmap now has:

- explicit dependency ordering
- standard phase instructions
- ARCH-AEP and code-review loops as built-in gates
- clearer milestone boundaries for lower-context execution
