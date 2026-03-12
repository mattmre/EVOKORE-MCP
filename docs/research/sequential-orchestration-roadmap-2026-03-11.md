# Sequential Orchestration Roadmap

- **Date:** 2026-03-11
- **Purpose:** Durable execution order for stabilization follow-through and the Agent33 adoption roadmap.
- **Source documents:** `CLAUDE.md`, `next-session.md`, `docs/PRIORITY_STATUS_MATRIX.md`, `docs/research/remaining-items-research.md`, `docs/AGENT33_IMPROVEMENT_INSTRUCTIONS.md`

## Summary

The original EVOKORE 15-item priority matrix is complete and in monitoring posture. The remaining work begins with the stabilization queue documented on 2026-03-10, then moves into an architecture decision on skill indexing, then into a strict dependency-ordered Agent33 adoption roadmap.

## Strict Order

1. Validate repo and branch state.
2. Close or reconcile PR `#81`.
3. Close or reconcile PR `#82`.
4. Close or reconcile PR `#83`.
5. Close or reconcile PR `#84`.
6. Close or reconcile PR `#85`.
7. Run aggregate post-queue verification on `main`.
8. Make and document the EVOKORE skill-indexing architecture decision.
9. Validate/tune skill-indexing performance.
10. Execute Agent33 hooks-system slice.
11. Execute Agent33 fail-safe-design slice.
12. Execute Agent33 HITL-token slice.
13. Execute Agent33 dynamic-tool-discovery slice.
14. Execute Agent33 skills-library-architecture slice.
15. Execute Agent33 multi-server-aggregation slice.
16. Execute Agent33 semantic-skill-resolution slice.
17. Execute Agent33 cross-CLI-sync slice.
18. Execute Agent33 session-continuity slice.
19. Execute Agent33 auto-memory slice.
20. Execute Agent33 voice-sidecar slice.
21. Execute Agent33 live-status-line slice.
22. Perform session-wrap updates.

## Dependency Notes

- Steps 2-6 depend only on current repo sanity and can be processed sequentially.
- Step 8 depends on the stabilization queue being reconciled, especially PR `#83`.
- Step 10 is the foundation for later session-state and UX items.
- Step 11 should immediately follow hooks to harden them before more behavior is layered in.
- Steps 12 and 13 should land before step 15 because governance and discovery shape the proxy/tool surface.
- Step 14 should precede step 16 because semantic resolution depends on a settled skills architecture.
- Step 18 should precede step 19 because auto-memory depends on continuity conventions.
- Step 20 depends on the aggregated MCP/runtime base being stable.
- Step 21 depends on hooks and continuity so it has reliable data to render.

## Execution Rules

- One active slice at a time.
- Full cycle for each slice: research, plan, implement, test, document, prepare PR.
- Update `task_plan.md`, `findings.md`, and `progress.md` after every transition.
- Keep shared trackers on `main` unless the slice specifically owns them.
- Use fresh execution context at each slice boundary to reduce context drift.
