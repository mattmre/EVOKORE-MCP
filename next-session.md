# Next Session Priorities

1. **Merge Pending PRs (Ops)**: Merge all approved open PRs to `main` using the documented runbook flow, then confirm CI completes on merge commits.
2. **Execute Release (Manual/Ops)**: Run the release checklist and publish flow (`docs/RELEASE_FLOW.md`) once merge queue is clear.
3. **Submodule Discipline Enforcement (Ops Hygiene)**: Ensure any future docs/code updates that involve submodules follow `docs/SUBMODULE_WORKFLOW.md` (submodule commit first, parent pointer update second) before merge.
