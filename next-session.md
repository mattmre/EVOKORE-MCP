# Next Session Priorities

Last Updated (UTC): 2026-03-09

## Current Handoff State
- **Main branch:** `3e4d87e` — includes migration planning docs and fork bomb regex fix
- **Open PRs:** #71 through #80 (Agent33 migration, 10 phases)
- **Session log:** `docs/session-logs/session-2026-03-09.md`
- **New artifacts:** `docs/AGENT33_MIGRATION_PLAN.md`, `docs/AGENT33_IMPROVEMENT_INSTRUCTIONS.md`

## Next Actions

### Priority 1: Merge Agent33 Migration PRs
Merge sequentially (order matters — later phases reference earlier content):
1. #71 — Core Orchestration Framework (foundation, merge first)
2. #72 — Command Skills
3. #73 — Workflow Templates
4. #74 — Agent Archetypes
5. #75 — Tool Governance
6. #76 — AEP Framework
7. #77 — Skills Merge (modifies existing skills)
8. #78 — CI/CD Pipelines
9. #79 — Hook Enhancement (modifies damage-control.js, adds evidence-capture.js)
10. #80 — Templates & Reference Docs

After each merge, run `npm test` to verify skill indexing still works.

### Priority 2: Post-Merge Validation
- Verify `resolve_workflow` finds new orchestration skills
- Verify `search_skills` returns results for "handoff", "policy", "TDD", "incident triage"
- Verify Fuse.js index builds without timeout with ~290 skills
- Test evidence-capture hook in a live session

### Priority 3: Apply Reverse Instructions to Agent33
- Feed `docs/AGENT33_IMPROVEMENT_INSTRUCTIONS.md` into Agent33 CLI sessions
- Priority items: hooks system, HITL approval tokens, dynamic tool discovery

## Guardrails
- Merge PRs one at a time — resolve any conflicts before proceeding to next
- Do not squash-merge; these are large content additions that benefit from full commit history
- Keep the damage-control regex fix on main (already landed in f437faa)
- If Fuse.js index performance degrades with ~290 skills, consider lazy-loading or category-scoped search
