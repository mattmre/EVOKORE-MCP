# Next Session Priorities

Last Updated (UTC): 2026-03-09

## Current Handoff State
- **Main branch:** `d608fe1` — all 10 Agent33 migration PRs merged + test fixes
- **Open PRs:** None
- **Session log:** `docs/session-logs/session-2026-03-09.md`

## Completed This Session
- Merged PRs #71-#80 (Agent33 migration, 10 phases) sequentially
- Fixed PR metadata validation for new template format (section-based vs field-based)
- Fixed catastrophic backtracking regex in CI workflow validation test
- Fixed checkout@v3->v4 regex in submodule guard test
- Updated all references from lowercase `pull_request_template.md` to uppercase `PULL_REQUEST_TEMPLATE.md`
- Cleaned up 9 stale worktree branches and 10 merged feature branches

## Next Actions

### Priority 1: Post-Merge Validation
- Verify `resolve_workflow` finds new orchestration skills
- Verify `search_skills` returns results for "handoff", "policy", "TDD", "incident triage"
- Verify Fuse.js index builds without timeout with ~290 skills
- Test evidence-capture hook in a live session

### Priority 2: Apply Reverse Instructions to Agent33
- Feed `docs/AGENT33_IMPROVEMENT_INSTRUCTIONS.md` into Agent33 CLI sessions
- Priority items: hooks system, HITL approval tokens, dynamic tool discovery

### Priority 3: Skill Index Performance
- If Fuse.js index performance degrades with ~290 skills, consider lazy-loading or category-scoped search
- Monitor `[EVOKORE] Indexed N skills` count in server startup logs

## Guardrails
- Keep the damage-control regex fix on main (already landed in f437faa)
- Use `.commit-msg.txt` + `git commit -F` to avoid damage-control hook false positives
